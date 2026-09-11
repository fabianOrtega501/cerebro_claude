/**
 * Línea de estado de Claude Code: modelo, proyecto, rama y contexto consumido.
 *
 * El dato que motivó esto es **el modelo**: saber en cuál estás sin escribir `/status`. Cambiar
 * de modelo a mitad de sesión es barato, pero solo si ves en qué estás; si no, se olvida y
 * terminas usando el más pesado para tareas mecánicas.
 *
 * Claude Code entrega un JSON por stdin y pinta en pantalla lo que salga por stdout. Todos los
 * campos se leen a la defensiva: el formato ha cambiado entre versiones y una statusline que
 * revienta deja la terminal sin información en vez de con información parcial.
 */

import { execFileSync } from "node:child_process";

/** Colores ANSI. La statusline se pinta en una terminal, no en markdown. */
const dim = t => `\x1b[2m${t}\x1b[0m`;
const cyan = t => `\x1b[36m${t}\x1b[0m`;
const yellow = t => `\x1b[33m${t}\x1b[0m`;
const green = t => `\x1b[32m${t}\x1b[0m`;
const red = t => `\x1b[31m${t}\x1b[0m`;

/** Lee todo stdin. Devuelve `{}` si no llega nada parseable. */
async function readPayload() {
	const chunks = [];

	for await (const chunk of process.stdin) chunks.push(chunk);

	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	}
	catch {
		return {};
	}
}

const data = await readPayload();
const dir = data.workspace?.current_dir ?? data.cwd ?? process.cwd();

/** Rama actual del repo donde está la sesión. Vacío si no es un repo. */
function branch() {
	try {
		return execFileSync("git", ["-C", dir, "branch", "--show-current"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	}
	catch {
		return "";
	}
}

/**
 * Nombre corto del modelo.
 *
 * Se prefiere `display_name` porque es lo que el usuario reconoce ("Opus 5"); el id crudo
 * (`claude-opus-5[1m]`) solo aparece si no hay nada mejor.
 */
const model = data.model?.display_name ?? data.model?.id ?? "?";

// Un modelo pesado en verde y uno ligero en amarillo seria al reves de lo intuitivo: aqui el
// color no dice "bueno/malo", dice "caro/barato". Opus en amarillo es un recordatorio suave.
const heavy = /opus/i.test(model);
const parts = [heavy ? yellow(`◆ ${model}`) : green(`◆ ${model}`)];

const project = dir.split("/").filter(Boolean).pop();

if (project) parts.push(cyan(project));

const current = branch();

if (current) {
	const protectedBranch = ["desa", "qa", "prod", "main", "master"].includes(current);

	parts.push(protectedBranch ? red(` ${current}`) : ` ${current}`);
}

// El aviso de contexto solo aparece cuando importa: una statusline llena de numeros deja de
// leerse.
if (data.exceeds_200k_tokens) parts.push(dim("contexto >200k"));

process.stdout.write(parts.join(dim(" │ ")));
