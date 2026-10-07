/**
 * Hook de Stop: avisa cuando el cerebro tiene trabajo sin commitear o sin respaldar.
 *
 * El cerebro se edita desde cualquier repo —absorber algo con `sync-brain` estando en aio-app
 * escribe en `~/.claude`, no en aio-app—, asi que el `git status` que uno mira mientras trabaja
 * nunca lo delata. Sin este aviso, lo aprendido se queda en el disco de una sola maquina.
 *
 * Mira los dos destinos: `backup` (protege de borrar ~/.claude) y `github` (protege de perder el
 * disco). Usa las refs locales, sin `fetch`: un hook que sale en cada respuesta no puede salir a
 * la red, y para saber si TU tienes commits sin subir la ref local basta.
 *
 * Solo avisa cuando el estado cambia. Repetir lo mismo cada turno es la forma mas rapida de que
 * se deje de leer.
 *
 * No bloquea nunca: termina en 0 pase lo que pase.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BRAIN = join(homedir(), ".claude");

// Fuera de la lista blanca del .gitignore: es estado local, no cerebro.
const STATE = join(BRAIN, ".brain-push-state.json");

/** Sale sin decir nada: el caso normal. */
function quiet() {
	process.exit(0);
}

/** Corre git en el cerebro. `null` si falla. */
function git(args) {
	try {
		return execFileSync("git", ["-C", BRAIN, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	}
	catch {
		return null;
	}
}

if (!existsSync(join(BRAIN, ".git"))) quiet();

const branch = git(["branch", "--show-current"]);

if (!branch) quiet();

const dirty = (git(["status", "--porcelain"]) ?? "").split("\n").filter(Boolean);

/** Commits de la rama que ese remoto todavia no tiene. `null` si el remoto no esta configurado. */
function pending(remote) {
	if (!git(["rev-parse", "--verify", "--quiet", `${remote}/${branch}`])) return null;

	const count = git(["rev-list", "--count", `${remote}/${branch}..${branch}`]);

	return count === null ? null : Number(count);
}

const remotes = ["backup", "github"].map(name => ({ name, count: pending(name) })).filter(r => r.count !== null);
const unpushed = remotes.filter(r => r.count > 0);

if (!dirty.length && !unpushed.length) {
	// Todo al dia: se limpia el estado para que el proximo cambio vuelva a avisar.
	try {
		writeFileSync(STATE, JSON.stringify({ signature: "clean" }));
	}
	catch { /* el aviso no depende de poder escribir esto */ }

	quiet();
}

// La firma incluye el HEAD: un commit nuevo cambia el estado aunque el numero de pendientes no.
const signature = `${git(["rev-parse", "HEAD"])}|${dirty.length}|${unpushed.map(r => `${r.name}:${r.count}`).join(",")}`;

try {
	if (JSON.parse(readFileSync(STATE, "utf8")).signature === signature) quiet();
}
catch { /* sin estado previo se avisa, que es lo prudente */ }

/**
 * Text of the last assistant message in the session transcript. Fallback only: the transcript is
 * written asynchronously and can lag behind `last_assistant_message`.
 * @param {string} path - `transcript_path` from the Stop event (JSONL).
 * @returns {string} Empty string when the transcript can't be read.
 */
function lastReply(path) {
	try {
		const lines = readFileSync(path, "utf8").trimEnd().split("\n");

		for (let i = lines.length - 1; i >= 0; i--) {
			const entry = JSON.parse(lines[i]);
			const blocks = entry.type === "assistant" && Array.isArray(entry.message?.content) ? entry.message.content : [];
			const text = blocks.filter(b => b.type === "text").map(b => b.text).join("\n");

			if (text)
				return text;
		}
	}
	catch { /* sin transcript se avisa, que es lo prudente */ }

	return "";
}

let event = {};

try {
	event = JSON.parse(readFileSync(0, "utf8") || "{}");
}
catch { /* idem */ }

const reply = event.last_assistant_message ?? lastReply(event.transcript_path ?? "");

if (/\b(commit|push)/i.test(reply) && /(cerebro|~\/\.claude|\bbackup\b)/i.test(reply)) {
	try {
		writeFileSync(STATE, JSON.stringify({ signature }));
	}
	catch { /* idem */ }

	quiet();
}

const lines = [];

if (dirty.length) {
	const shown = dirty.slice(0, 5).map(l => `  ${l}`).join("\n");

	lines.push(`El cerebro tiene ${dirty.length} archivo(s) sin commitear:\n${shown}${dirty.length > 5 ? `\n  ...y ${dirty.length - 5} mas` : ""}`);
}

for (const remote of unpushed)
	lines.push(`${remote.count} commit(s) sin subir a \`${remote.name}\`:  git -C ~/.claude push ${remote.name} ${branch}`);

try {
	writeFileSync(STATE, JSON.stringify({ signature }));
}
catch { /* idem */ }

process.stdout.write(`${JSON.stringify({
	systemMessage: `Cerebro con cambios sin respaldar${dirty.length ? ` (${dirty.length} sin commitear)` : ""}.`,
	hookSpecificOutput: {
		hookEventName: "Stop",
		additionalContext: [
			"El cerebro (~/.claude) tiene trabajo sin asegurar:",
			"",
			lines.join("\n"),
			"",
			"Dilo en una linea al final de tu respuesta y ofrece hacerlo. Si el usuario dice que no,",
			"no vuelvas a insistir: el hook avisara solo cuando el estado cambie.",
		].join("\n"),
	},
})}\n`);
