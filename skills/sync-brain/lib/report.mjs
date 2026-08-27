/**
 * Genera el informe crudo de que trae el `.claude/` de un repo frente al cerebro propio.
 *
 * El script **no juzga ni mezcla**: solo reune los hechos (que archivos entraron, cuales
 * cambiaron, cuales ya tienen una version propia que los reemplaza) y los imprime como JSON.
 * La clasificacion en "vale la pena / no vale la pena" la hace Claude leyendo esto, porque
 * requiere entender el contenido, no solo compararlo.
 *
 * Uso: `node report.mjs [ruta-del-repo]`  (por defecto, el directorio actual)
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import { changedFiles, findRepoRoot, inspect, upstreamPaths } from "../../../brain/lib/upstream.mjs";

/** Skills del cerebro propio. Son las que tienen prioridad sobre las del repo. */
const BRAIN_SKILLS = join(homedir(), ".claude", "skills");

/** Ruido que nunca se compara: es local por definicion y no se versiona. */
const IGNORED = ["settings.local.json", "node_modules", ".DS_Store"];

/** Lista recursiva de archivos de una carpeta, en rutas relativas a ella. */
function listFiles(root) {
  if (!existsSync(root))
    return [];

  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (IGNORED.some(bad => entry.includes(bad)))
        continue;

      const full = join(dir, entry);

      statSync(full).isDirectory() ? walk(full) : out.push(relative(root, full));
    }
  };

  walk(root);

  return out.sort();
}

/** Lee un archivo, o cadena vacia si no existe. Evita ramificar en cada comparacion. */
function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * Extrae el nombre de la skill del repo a la que pertenece un archivo.
 *
 * @returns El nombre de la skill (`skills/<nombre>/...`), o `null` si el archivo no vive
 *   dentro de una skill (un hook, el settings.json, un script suelto).
 */
function skillOf(relPath) {
  const match = relPath.match(/^skills\/([^/]+)\//);

  return match ? match[1] : null;
}

const repoRoot = findRepoRoot(process.argv[2] ?? process.cwd());

if (!repoRoot) {
  console.error("No estas dentro de un repositorio git.");
  process.exit(1);
}

const { snapshot } = upstreamPaths(repoRoot);
const live = join(repoRoot, ".claude");
const { status, since } = inspect(repoRoot);

const seen = new Set([...listFiles(live), ...listFiles(snapshot)]);
const entries = [];

for (const file of [...seen].sort()) {
  const now = read(join(live, file));
  const before = read(join(snapshot, file));

  if (now === before)
    continue;

  const skill = skillOf(file);

  entries.push({
    file,
    // "added" incluye el primer registro del repo: sin foto previa, todo se ve como nuevo.
    change: !before ? "added" : !now ? "removed" : "modified",
    skill,
    // Si el cerebro ya tiene una skill con ese nombre, lo del repo es un competidor, no un
    // regalo: hay que mirar si aporta algo o si duplica lo que ya resolviste a tu manera.
    overridden_by_brain: Boolean(skill && existsSync(join(BRAIN_SKILLS, skill))),
    bytes_now: Buffer.byteLength(now),
    bytes_before: Buffer.byteLength(before),
  });
}

console.log(JSON.stringify({
  repo: repoRoot,
  status,
  reviewed_since: since,
  has_snapshot: existsSync(snapshot),
  git_changes: changedFiles(repoRoot, since),
  entries,
}, null, 2));
