/**
 * Enchufa el cerebro a los repos de trabajo registrados en `projects.json`.
 *
 * El cerebro tiene dos clases de skill y cada una necesita un mecanismo distinto:
 *
 * - **Transversales** (`~/.claude/skills/`): Claude las ve en cualquier proyecto sin hacer nada.
 *   Control de cambios, manual web, sync-brain. No pasan por aqui.
 * - **De un proyecto** (`~/.claude/brain/projects/<proyecto>/skills/local-*`): solo deben
 *   existir dentro de los repos de ese proyecto. Como las skills tienen que vivir fisicamente
 *   en `<repo>/.claude/skills/`, se enchufan con un **symlink**.
 *
 * El symlink apunta al cerebro, asi que se edita en un solo sitio y se versiona en un solo
 * sitio. Y como se llama `local-*`, cae en la exclusion que este script escribe en
 * `.git/info/exclude` —que es local y no versionado, para no ensuciarle el `.gitignore` al
 * equipo—, o sea que no hay forma de commitearlo al repo por accidente.
 *
 * Es **idempotente**: correrlo dos veces no hace dano. Correrlo despues de clonar un repo
 * nuevo es lo que lo deja listo.
 *
 * Uso:
 *   `node plug.mjs`            enchufa todo lo registrado
 *   `node plug.mjs <proyecto>` solo ese proyecto
 *   `node plug.mjs --status`   no toca nada, solo reporta como esta cada repo
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { BRAIN_DIR, currentTree, inspect, markReviewed } from "./upstream.mjs";
import { syncDirectories } from "./sync-directories.mjs";

/** Prefijo obligatorio de toda skill privada. Es lo que la hace invisible para git. */
const PRIVATE_PREFIX = "local-";

/** Marca para no duplicar el bloque en `.git/info/exclude` al re-ejecutar. */
const EXCLUDE_MARK = "# --- cerebro propio (~/.claude) ---";

const EXCLUDE_BLOCK = `
${EXCLUDE_MARK}
# Exclusiones LOCALES, no versionadas. Todo lo que empieza por "local-" es privado
# (normalmente un symlink al cerebro) y nunca debe llegar a un commit del equipo.
.claude/skills/local-*/
.claude/skills/local-*
.claude/hooks/local-*
.claude/local/
`;

const registry = JSON.parse(readFileSync(join(BRAIN_DIR, "projects.json"), "utf8")).projects;
const args = process.argv.slice(2);
const statusOnly = args.includes("--status");
const only = args.find(a => !a.startsWith("--"));

/** Skills privadas definidas para un proyecto en el cerebro. */
function projectSkills(project) {
  const dir = join(BRAIN_DIR, "projects", project, "skills");

  if (!existsSync(dir))
    return [];

  return readdirSync(dir).filter(name => name.startsWith(PRIVATE_PREFIX));
}

/**
 * Asegura el bloque de exclusiones locales del repo.
 *
 * @returns `true` si lo escribio, `false` si ya estaba.
 */
function ensureExclude(repo) {
  const path = join(repo, ".git", "info", "exclude");
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";

  if (current.includes(EXCLUDE_MARK))
    return false;

  mkdirSync(join(repo, ".git", "info"), { recursive: true });
  appendFileSync(path, EXCLUDE_BLOCK);

  return true;
}

/**
 * Crea o corrige el symlink de una skill privada dentro de un repo.
 *
 * Si ya existe apuntando a otro sitio (el cerebro se movio, o quedo un directorio real de una
 * version anterior) lo reemplaza. Solo se niega a tocar algo que no sea symlink y tenga
 * contenido propio, porque eso seria trabajo del usuario sin versionar.
 *
 * @returns `"linked"`, `"ok"` (ya estaba bien) o `"conflict"` (hay algo real estorbando).
 */
function linkSkill(repo, project, skill) {
  const target = join(BRAIN_DIR, "projects", project, "skills", skill);
  const link = join(repo, ".claude", "skills", skill);

  mkdirSync(join(repo, ".claude", "skills"), { recursive: true });

  if (existsSync(link) || isBrokenLink(link)) {
    if (!lstatSync(link).isSymbolicLink())
      return "conflict";

    if (readlinkSync(link) === target)
      return "ok";

    rmSync(link);
  }

  symlinkSync(target, link);

  return "linked";
}

/**
 * Enlaza las memorias que el repo publica para su equipo en la carpeta que lee el mecanismo nativo.
 *
 * La fuente de verdad es el repo: ahi las ve el equipo y viajan en el MR. El cerebro no copia, solo
 * apunta, para que no existan dos versiones del mismo hecho. Las memorias personales y las que solo
 * valen en esta maquina conviven al lado como archivos reales y no se tocan.
 *
 * @param {string} repo Ruta del repo
 * @returns {{linked:number, removed:number, conflicts:string[]}} Que se enlazo, limpio o choca
 */
function linkMemories(repo) {
  const source = join(repo, ".claude", "memory");
  const dest = join(BRAIN_DIR, "..", "projects", repo.split("/").join("-"), "memory");
  const out = { linked: 0, removed: 0, conflicts: [] };

  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(dest)) {
    const link = join(dest, entry);
    if (!isBrokenLink(link) || !lstatSync(link).isSymbolicLink()) continue;
    if (existsSync(link)) continue;
    rmSync(link);
    out.removed++;
  }

  if (!existsSync(source)) return out;

  for (const file of readdirSync(source)) {
    if (!file.endsWith(".md") || file === "MEMORY.md") continue;

    const target = join(source, file);
    const link = join(dest, file);

    if (existsSync(link) || isBrokenLink(link)) {
      if (!lstatSync(link).isSymbolicLink()) {
        out.conflicts.push(file);
        continue;
      }
      if (readlinkSync(link) === target) continue;
      rmSync(link);
    }

    symlinkSync(target, link);
    out.linked++;
  }

  return out;
}

/** `existsSync` devuelve false en un symlink roto, y ese caso tambien hay que limpiarlo. */
function isBrokenLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  }
  catch {
    return false;
  }
}

const entries = Object.entries(registry).filter(([name]) => !only || name === only);

if (!entries.length) {
  console.error(`No hay ningun proyecto llamado "${only}" en projects.json.`);
  process.exit(1);
}

for (const [project, config] of entries) {
  console.log(`\n${config.label ?? project}  (${project})`);

  const skills = projectSkills(project);

  for (const repo of config.repos) {
    if (!existsSync(join(repo, ".git"))) {
      console.log(`  - ${repo}\n      sin clonar o no es repo git; se omite`);
      continue;
    }

    const notes = [];

    if (!statusOnly && ensureExclude(repo))
      notes.push("exclusiones locales escritas");

    for (const skill of skills) {
      if (statusOnly) {
        const link = join(repo, ".claude", "skills", skill);

        notes.push(`${skill}: ${isBrokenLink(link) ? "enchufada" : "SIN enchufar"}`);
        continue;
      }

      const result = linkSkill(repo, project, skill);

      if (result === "conflict")
        notes.push(`${skill}: CONFLICTO, hay un directorio real ahi; revisalo a mano`);
      else if (result === "linked")
        notes.push(`${skill}: enchufada`);
    }

    // Un repo sin `.claude/` versionado no tiene upstream que vigilar; registrarlo solo
    // llenaria el cerebro de fotos vacias.
    if (!statusOnly && currentTree(repo) && inspect(repo).status === "unwatched") {
      markReviewed(repo);
      notes.push("linea base de upstream fijada");
    }

    if (!statusOnly) {
      const mem = linkMemories(repo);
      if (mem.linked) notes.push(`${mem.linked} memoria(s) del repo enlazadas`);
      if (mem.removed) notes.push(`${mem.removed} enlace(s) de memoria rotos, limpiados`);
      for (const c of mem.conflicts)
        notes.push(`memoria ${c}: CONFLICTO, hay un archivo propio con ese nombre; resuelvelo a mano`);
    }

    const watched = currentTree(repo) ? inspect(repo).status : "sin .claude versionado";

    console.log(`  - ${repo}`);
    console.log(`      upstream: ${watched}${notes.length ? `\n      ${notes.join("\n      ")}` : ""}`);
  }

  if (!skills.length)
    console.log("      (sin skills propias de proyecto todavia)");
}

console.log("\nSkills transversales activas en todos los proyectos:");
for (const skill of readdirSync(join(BRAIN_DIR, "..", "skills")))
  console.log(`  - ${skill}`);

// Registrar un proyecto y no poder entrar a su repo sin aprobarlo es el mismo descuido en dos
// archivos. Se hace aqui para que registrar y poder trabajar sean un solo paso.
const dirs = syncDirectories({ check: statusOnly });

console.log("\nDirectorios permitidos (settings.json):");
if (!dirs.changed)
  console.log(`  al dia con projects.json (${dirs.total} repos)`);
else if (statusOnly)
  console.log(`  DESINCRONIZADO: faltan ${dirs.added.length}, sobran ${dirs.removed.length}. Corre plug.mjs sin --status.`);
else
  console.log(`  actualizados: ${dirs.total} repos (+${dirs.added.length} / -${dirs.removed.length})`);
