/**
 * Hook de PostToolUse sobre Bash: al hacer push, avisa si la documentacion quedo atras.
 *
 * Reparto de siempre: el hook detecta, la skill ejecuta. Aqui no se escribe documentacion
 * —eso exige entender que cambio y por que, y lo hace `update-tech-docs` o `update-manual`—
 * pero sin este aviso nadie se acuerda, y el estandar del backend pide la doc en el MISMO MR.
 *
 * Cubre las dos documentaciones, que son cosas distintas:
 *   - Backend: reglas de negocio en `docs/modulos/` del propio repo.
 *   - Front:   lo que el usuario ve, en el manual web (repo aparte).
 *
 * No bloquea nunca: termina en 0 pase lo que pase. Un push que falla por un aviso de
 * documentacion seria peor que la documentacion atrasada.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { projectOf, readProjects } from "../brain/lib/projects.mjs";

const BRAIN = join(homedir(), ".claude", "brain");

/** Sale sin decir nada: el caso normal. */
function quiet() {
	process.exit(0);
}

/** Corre un comando y devuelve su salida, o null si falla. */
function run(command, args, options = {}) {
	try {
		return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...options }).trim();
	}
	catch (error) {
		// check-docs sale 1 cuando SI hay pendientes: eso no es un fallo, es el resultado.
		return error.stdout?.toString().trim() || null;
	}
}

/** Lee el JSON que Claude Code entrega por stdin. Null si no llega nada parseable. */
async function readPayload() {
	const chunks = [];

	for await (const chunk of process.stdin) chunks.push(chunk);

	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	}
	catch {
		return null;
	}
}

const payload = await readPayload();

if (!payload || payload.tool_name !== "Bash") quiet();

const command = payload.tool_input?.command ?? "";

if (!/\bgit\s+push\b/.test(command) || /--dry-run/.test(command)) quiet();

const project = projectOf(payload.cwd ?? process.cwd());

if (!project) quiet();

const avisos = [];

// --- Backend: reglas de negocio sin documentar ---
if (existsSync(join(BRAIN, "projects", project, "docs", "profile.json"))) {
	const out = run("node", [join(homedir(), ".claude", "skills", "update-tech-docs", "lib", "check-docs.mjs"), "--project", project, "--json"]);

	try {
		const result = JSON.parse(out ?? "{}");

		if (result.pending?.length) {
			const detalle = result.report
				.filter(r => !r.documented)
				.map(r => `  - ${r.module}: ${r.files.length} archivo(s) de negocio, ${r.dir}${r.exists ? "" : " (no existe)"}`)
				.join("\n");

			avisos.push(`Documentacion tecnica del backend sin actualizar en ${result.branch}:\n${detalle}\n\nEl estandar del repo (${result.standard}) la pide en el MISMO MR que el codigo.\nInvoca la skill \`update-tech-docs\` para redactarla.`);
		}
	}
	catch {
		// Sin reporte parseable no hay nada que avisar.
	}
}

// --- Front: pantallas cambiadas sin reflejar en el manual ---
const manualProfile = join(BRAIN, "projects", project, "manual", "profile.mjs");

if (existsSync(manualProfile)) {
	try {
		const { PROFILE } = await import(manualProfile);

		if (PROFILE.uiRepo && existsSync(PROFILE.uiRepo)) {
			const branch = run("git", ["-C", PROFILE.uiRepo, "branch", "--show-current"]);
			const base = branch?.match(/origin([A-Z][a-z]+)/)?.[1]?.toLowerCase() ?? "desa";
			const fork = run("git", ["-C", PROFILE.uiRepo, "merge-base", base, "HEAD"]);
			const changed = fork ? (run("git", ["-C", PROFILE.uiRepo, "diff", "--name-only", fork, "HEAD"]) ?? "").split("\n").filter(Boolean) : [];
			const ui = changed.filter(f => (PROFILE.uiGlobs ?? []).some(glob => f.startsWith(`${glob}/`)));

			if (ui.length) {
				const lista = ui.slice(0, 4).map(f => `  - ${f}`).join("\n");

				avisos.push(`Cambiaron ${ui.length} pantalla(s) del front en ${branch}:\n${lista}${ui.length > 4 ? `\n  ...y ${ui.length - 4} mas` : ""}\n\nOfrece actualizar el manual de usuario con la skill \`update-manual\`. Requiere el dev server y el backend arriba, y las capturas hay que revisarlas: no es automatico.`);
			}
		}
	}
	catch {
		// Perfil de manual roto o incompleto: no es motivo para molestar en un push.
	}
}

if (!avisos.length) quiet();

const nombres = Object.entries(readProjects()).find(([key]) => key === project)?.[1]?.label ?? project;

process.stdout.write(`${JSON.stringify({
	systemMessage: `Push hecho. Hay documentacion pendiente en ${nombres}.`,
	hookSpecificOutput: {
		hookEventName: "PostToolUse",
		additionalContext: `${avisos.join("\n\n")}\n\nPreguntale al usuario si quiere hacerlo ahora. Si dice que no, no insistas.`,
	},
})}\n`);
