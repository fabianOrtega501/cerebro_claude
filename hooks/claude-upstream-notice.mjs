/**
 * Hook de `PostToolUse` sobre Bash: detecta cuando un pull trajo cambios en el `.claude/` del repo.
 *
 * El cerebro propio vive en `~/.claude` y es el que manda. Pero los repos de trabajo tambien
 * traen su propio `.claude/`, y ahi el equipo va agregando skills y hooks que a veces valen la
 * pena. Nadie se acuerda de ir a mirar. Este hook cierra ese hueco.
 *
 * Solo detecta y avisa; **no mezcla nada**. Quien decide y ejecuta es la skill `sync-brain`.
 * Mismo reparto que el hook del manual en aio-app: el hook detecta, la skill ejecuta.
 *
 * Comportamiento:
 *
 * - **No bloquea nunca.** Siempre termina con codigo 0. Un fallo aqui no puede dejar al usuario
 *   sin poder trabajar.
 * - **Solo reacciona a comandos que integran historia** (`pull`, `merge`, `rebase`). Un
 *   `git log` o un `git diff` no disparan nada.
 * - **Avisa una sola vez por version.** Mientras el `.claude/` del repo siga igual, no repite.
 *   Volver a avisar en cada turno es la forma mas rapida de que el aviso se vuelva invisible.
 * - **Emite `additionalContext`**, no solo `systemMessage`: la decision del usuario fue que
 *   el analisis se haga en ese mismo turno, no que quede pendiente.
 *
 * Se registra en `~/.claude/settings.json`, en `PostToolUse` con matcher `Bash`.
 */

import { changedFiles, findRepoRoot, inspect } from "../brain/lib/upstream.mjs";

/** Cuantos archivos se nombran en el aviso antes de resumir con "y N mas". */
const FILES_TO_LIST = 8;

/** Sale sin decir nada. El caso normal: la enorme mayoria de comandos Bash no interesan. */
function quiet() {
  process.exit(0);
}

/** Lee el JSON que Claude Code entrega por stdin. */
async function readPayload() {
  const chunks = [];

  for await (const chunk of process.stdin)
    chunks.push(chunk);

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  catch {
    return null;
  }
}

/**
 * Decide si un comando de shell integro historia nueva en el working tree.
 *
 * Se descartan los ensayos (`--dry-run`) y los subcomandos que solo *consultan* pero contienen
 * la palabra clave (`merge-base`, `log --merges`), que si no darian falsos positivos constantes.
 */
function integratesHistory(command) {
  if (!/\bgit\b/.test(command))
    return false;

  if (/--dry-run|\bmerge-base\b|\bls-files\b/.test(command))
    return false;

  return /\bgit\s+(pull|merge|rebase)\b/.test(command) || /\bgit\s+checkout\s+\S/.test(command);
}

const payload = await readPayload();

if (!payload || payload.tool_name !== "Bash")
  quiet();

const command = payload.tool_input?.command ?? "";

if (!integratesHistory(command))
  quiet();

const repoRoot = findRepoRoot(payload.cwd ?? process.cwd());

if (!repoRoot)
  quiet();

const { status, since } = inspect(repoRoot);

if (status !== "changed")
  quiet();

const files = changedFiles(repoRoot, since);

if (!files.length)
  quiet();

const shown = files.slice(0, FILES_TO_LIST).map(line => `  ${line}`).join("\n");
const rest = files.length > FILES_TO_LIST ? `\n  ...y ${files.length - FILES_TO_LIST} archivo(s) mas` : "";

const context = [
  `El comando que acabas de correr trajo cambios en el \`.claude/\` de ${repoRoot}`,
  "que todavia no se han contrastado contra el cerebro propio (~/.claude).",
  "",
  "Archivos afectados desde la ultima revision:",
  shown + rest,
  "",
  "Invoca ahora la skill `sync-brain` y sigue su procedimiento: clasifica cada cambio,",
  "recomienda que vale la pena absorber al cerebro y espera la decision del usuario.",
  "No mezcles nada por tu cuenta. El cerebro propio siempre tiene prioridad sobre el repo.",
].join("\n");

process.stdout.write(`${JSON.stringify({
  systemMessage: `El .claude/ de ${repoRoot.split("/").pop()} cambio (${files.length} archivo(s)). Revisando contra tu cerebro...`,
  hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context },
})}\n`);
