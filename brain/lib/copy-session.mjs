/**
 * Copia una transcripcion de Claude Code de un proyecto a otro, para poder abrirla desde alli.
 *
 * Claude Code guarda cada conversacion en `~/.claude/projects/<ruta-codificada>/<sessionId>.jsonl`
 * y solo lista las que encuentra en la carpeta del directorio donde se le arranca. Una sesion
 * util que ocurrio en el repo equivocado se vuelve invisible donde de verdad hace falta; esto la
 * lleva alli.
 *
 * Por defecto **cambia el sessionId**: el nombre del archivo es el id, y dejar el mismo en dos
 * proyectos crea dos conversaciones que dicen ser la misma. Con `--keep-id` se conserva.
 *
 * Uso:
 *   node copy-session.mjs --to ~/.claude                    la ultima sesion del repo actual
 *   node copy-session.mjs --from /datos/proyectos/AIO/aio-app --to ~/.claude
 *   node copy-session.mjs --session 526ea95e-... --to ~/.claude
 *   node copy-session.mjs --to ~/.claude --dry-run
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

const PROJECTS = join(homedir(), ".claude", "projects");

/** Nombre de carpeta que Claude Code le da a una ruta: todo lo que no sea alfanumerico pasa a `-`. */
function encodePath(path) {
	return resolve(path.replace(/^~/, homedir())).replace(/[^a-zA-Z0-9]/g, "-");
}

/** Transcripcion mas reciente de un proyecto. `null` si esa carpeta no tiene ninguna. */
function latestSession(dir) {
	if (!existsSync(dir)) return null;

	const files = readdirSync(dir)
		.filter(f => f.endsWith(".jsonl"))
		.map(f => ({ file: f, mtime: statSync(join(dir, f)).mtimeMs }))
		.sort((a, b) => b.mtime - a.mtime);

	return files.length ? files[0].file : null;
}

const args = process.argv.slice(2);
const arg = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const from = arg("--from", process.cwd());
const to = arg("--to");

if (!to) {
	console.error("Falta --to con la ruta del proyecto destino. Ejemplo: --to ~/.claude");
	process.exit(2);
}

const sourceDir = join(PROJECTS, encodePath(from));
const session = arg("--session");
const file = session ? `${session.replace(/\.jsonl$/, "")}.jsonl` : latestSession(sourceDir);

if (!file) {
	console.error(`No hay transcripciones en ${sourceDir}.`);
	process.exit(1);
}

const sourceFile = join(sourceDir, file);

if (!existsSync(sourceFile)) {
	console.error(`No existe ${sourceFile}.`);
	process.exit(1);
}

const targetDir = join(PROJECTS, encodePath(to));
const newId = args.includes("--keep-id") ? file.replace(/\.jsonl$/, "") : randomUUID();
const targetFile = join(targetDir, `${newId}.jsonl`);

const lines = readFileSync(sourceFile, "utf8").split("\n").filter(Boolean);

if (args.includes("--dry-run")) {
	console.log(JSON.stringify({ dryRun: true, sourceFile, targetFile, lines: lines.length, newSessionId: newId }, null, 2));
	process.exit(0);
}

mkdirSync(targetDir, { recursive: true });

// Se reescribe linea por linea: el `sessionId` aparece en casi todas y debe quedar coherente
// con el nombre del archivo, que es lo que Claude Code usa para identificar la conversacion.
const rewritten = lines.map((line) => {
	try {
		const entry = JSON.parse(line);

		if (entry.sessionId) entry.sessionId = newId;

		return JSON.stringify(entry);
	}
	catch {
		return line;
	}
});

writeFileSync(targetFile, `${rewritten.join("\n")}\n`, { mode: 0o600 });

console.log(JSON.stringify({
	ok: true,
	copiado: targetFile,
	lineas: rewritten.length,
	nuevoSessionId: newId,
	comoVerla: `Abre Claude Code en ${to} y usa /resume; la conversacion aparece por su fecha.`,
}, null, 2));
