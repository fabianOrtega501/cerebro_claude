/**
 * Motor de seguimiento del `.claude/` de los repos ("upstream") frente al cerebro propio.
 *
 * El problema que resuelve: cuando bajas cambios de `desa`, el `.claude/` del repo puede
 * traer skills o hooks nuevos. Sin memoria de "que habiamos visto la ultima vez", cada pull
 * se veria como si todo fuera nuevo y el aviso se volveria ruido que se aprende a ignorar.
 *
 * Por eso el cerebro guarda, por cada repo, una **foto de la ultima version revisada** de su
 * `.claude/`, junto con el sha del arbol de git correspondiente. Comparar el sha actual contra
 * el guardado responde "hay algo nuevo?" en una sola llamada a git, sin recorrer archivos.
 *
 * Direccion del flujo: **siempre repo -> cerebro, nunca al reves**. Nada de lo que hay aqui
 * escribe dentro de un repo de trabajo.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";

/** Raiz del cerebro. Todo lo que esta funcion escribe vive debajo de aqui. */
export const BRAIN_DIR = join(homedir(), ".claude", "brain");

/** Donde se guardan las fotos de cada repo vigilado. */
const UPSTREAM_DIR = join(BRAIN_DIR, "upstream");

/** Subcarpeta del repo que se vigila. Es la unica que interesa. */
const WATCHED_DIR = ".claude";

/**
 * Corre git en un repo y devuelve la salida limpia.
 *
 * @returns La salida sin espacios al borde, o `null` si git falla por cualquier motivo
 *   (no es repo, la referencia no existe, `.claude/` no esta versionado). Nunca lanza:
 *   quien llama esta casi siempre en un hook, donde reventar seria peor que no avisar.
 */
function git(repoPath, args) {
  try {
    return execFileSync("git", ["-C", repoPath, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  }
  catch {
    return null;
  }
}

/**
 * Sube desde un directorio cualquiera hasta la raiz del repo que lo contiene.
 *
 * @returns Ruta absoluta de la raiz, o `null` si no esta dentro de un repo git.
 */
export function findRepoRoot(startDir) {
  return git(startDir, ["rev-parse", "--show-toplevel"]);
}

/**
 * Identificador estable de un repo dentro del cerebro.
 *
 * Es el nombre de la carpeta mas un trozo de hash de la ruta absoluta. El nombre solo no basta:
 * dos clones del mismo proyecto en rutas distintas se pisarian la foto entre ellos.
 *
 * @returns Algo como `aio-app-3f9c1a2b`.
 */
export function repoKey(repoRoot) {
  const hash = createHash("sha1").update(repoRoot).digest("hex").slice(0, 8);

  return `${basename(repoRoot)}-${hash}`;
}

/** Rutas de la foto y el estado de un repo dentro del cerebro. */
export function upstreamPaths(repoRoot) {
  const dir = join(UPSTREAM_DIR, repoKey(repoRoot));

  return { dir, snapshot: join(dir, "snapshot"), state: join(dir, "state.json") };
}

/**
 * Sha del arbol de git de `.claude/` en el HEAD actual.
 *
 * Cambia si y solo si cambia el contenido versionado de esa carpeta, asi que sirve como
 * huella exacta y baratisima de "esta igual que la ultima vez?".
 *
 * @returns El sha, o `null` si `.claude/` no esta versionado en ese repo.
 */
export function currentTree(repoRoot) {
  return git(repoRoot, ["rev-parse", `HEAD:${WATCHED_DIR}`]);
}

/** Sha del commit en HEAD, para poder pedirle a git el diff contra la ultima revision. */
export function currentCommit(repoRoot) {
  return git(repoRoot, ["rev-parse", "HEAD"]);
}

/**
 * Lee el estado guardado de un repo.
 *
 * @returns El estado, o un objeto vacio si el repo todavia no se ha registrado o el archivo
 *   quedo corrupto. Nunca lanza, para que un JSON malo no rompa el hook.
 */
export function readState(repoRoot) {
  const { state } = upstreamPaths(repoRoot);

  if (!existsSync(state))
    return {};

  try {
    return JSON.parse(readFileSync(state, "utf8"));
  }
  catch {
    return {};
  }
}

/** Guarda el estado de un repo, fusionando con lo que ya hubiera. */
export function writeState(repoRoot, patch) {
  const { dir, state } = upstreamPaths(repoRoot);

  mkdirSync(dir, { recursive: true });
  writeFileSync(state, `${JSON.stringify({ ...readState(repoRoot), ...patch }, null, 2)}\n`);
}

/**
 * Decide si hay cambios de upstream sin revisar.
 *
 * Distingue tres situaciones que hay que tratar distinto: nunca se registro el repo, el arbol
 * cambio y esta sin revisar, o el usuario ya dijo que no le interesaba esa version concreta.
 *
 * @returns `{ status, tree, since }` donde `status` es:
 *   - `"unwatched"`: el repo no tiene `.claude/` versionado, o no hay foto previa. No avisar.
 *   - `"clean"`: identico a la ultima revision.
 *   - `"dismissed"`: cambio, pero es exactamente la version que ya se descarto.
 *   - `"changed"`: hay algo nuevo que revisar.
 *   `since` es el commit de la ultima revision (puede venir `null`).
 */
export function inspect(repoRoot) {
  const tree = currentTree(repoRoot);

  if (!tree)
    return { status: "unwatched", tree: null, since: null };

  const state = readState(repoRoot);

  if (!state.reviewed_tree)
    return { status: "unwatched", tree, since: null };

  if (state.reviewed_tree === tree)
    return { status: "clean", tree, since: state.reviewed_commit ?? null };

  if (state.dismissed_tree === tree)
    return { status: "dismissed", tree, since: state.reviewed_commit ?? null };

  return { status: "changed", tree, since: state.reviewed_commit ?? null };
}

/**
 * Lista que archivos de `.claude/` cambiaron desde la ultima revision.
 *
 * @param since Commit de la ultima revision. Si es `null` o ya no existe (rebase, historia
 *   reescrita), se cae a listar todo el contenido actual en vez de fallar.
 * @returns Lineas tipo `A\tarchivo` / `M\tarchivo` / `D\tarchivo`. Vacio si no hay nada.
 */
export function changedFiles(repoRoot, since) {
  if (since) {
    const diff = git(repoRoot, ["diff", "--name-status", since, "HEAD", "--", WATCHED_DIR]);

    if (diff !== null)
      return diff ? diff.split("\n") : [];
  }

  const all = git(repoRoot, ["ls-tree", "-r", "--name-only", "HEAD", WATCHED_DIR]);

  return all ? all.split("\n").map(f => `?\t${f}`) : [];
}

/**
 * Congela el `.claude/` actual del repo como "ya revisado".
 *
 * Reemplaza la foto anterior por completo (la borra antes de copiar) para que no queden
 * archivos fantasma de versiones viejas. Llamar solo despues de que el usuario haya decidido
 * que hacer con los cambios: a partir de aqui dejan de anunciarse.
 */
export function markReviewed(repoRoot) {
  const { snapshot } = upstreamPaths(repoRoot);
  const source = join(repoRoot, WATCHED_DIR);

  rmSync(snapshot, { recursive: true, force: true });
  mkdirSync(snapshot, { recursive: true });

  if (existsSync(source))
    cpSync(source, snapshot, { recursive: true, filter: src => !src.includes("settings.local.json") });

  writeState(repoRoot, {
    repo_path: repoRoot,
    reviewed_tree: currentTree(repoRoot),
    reviewed_commit: currentCommit(repoRoot),
    reviewed_at: new Date().toISOString(),
    dismissed_tree: null,
  });
}

/**
 * Marca la version actual como "vista y descartada" sin actualizar la foto.
 *
 * Se usa cuando no quieres absorber nada pero tampoco que el aviso vuelva a salir. La foto
 * queda intacta a proposito: si en el proximo pull llegan cambios encima, el diff se seguira
 * calculando contra la ultima version que si revisaste de verdad.
 */
export function markDismissed(repoRoot) {
  writeState(repoRoot, { repo_path: repoRoot, dismissed_tree: currentTree(repoRoot) });
}
