/**
 * Resuelve y presenta el proyecto sobre el que se va a trabajar un ticket full-stack.
 *
 * La skill es transversal, así que **lo primero es saber en qué proyecto está**. El usuario lo
 * indica al invocarla (`/fullstack-ticket aio`); si no lo dice, se deduce del repo actual.
 *
 * Lo que imprime no es decorativo: es el contexto con el que se trabaja el resto de la sesión.
 * Sin él, la skill escribiría código a ciegas sobre rutas que puede no tener permitido tocar.
 *
 * Uso:
 *   `node stack.mjs`         deduce el proyecto del directorio actual
 *   `node stack.mjs aio`     fuerza un proyecto
 *   `node stack.mjs --list`  qué proyectos tienen stack definido
 *   `node stack.mjs aio --json`  salida procesable
 *   `node stack.mjs aio --from /ruta/al/repo`  raíz de sesión explícita
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { projectOf } from "../../../brain/lib/projects.mjs";

const BRAIN = join(homedir(), ".claude", "brain");

/** Corre un comando y devuelve su salida limpia, o `null` si falla. Nunca lanza. */
function run(command, args) {
	try {
		return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	}
	catch {
		return null;
	}
}

/** Lee un JSON tolerando que no exista o esté mal formado. */
function readJson(path, fallback = {}) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	}
	catch {
		return fallback;
	}
}

/** Proyectos que tienen un `stack/stack.json` definido, excluyendo la plantilla. */
function projectsWithStack() {
	const dir = join(BRAIN, "projects");

	if (!existsSync(dir)) return [];

	return readdirSync(dir)
		.filter(name => name !== "_template" && existsSync(join(dir, name, "stack", "stack.json")))
		.sort();
}

/**
 * Directorios que esta sesión de Claude puede **escribir**, además de su raíz.
 *
 * Importa porque un repo que existe en disco no es necesariamente un repo que se pueda tocar:
 * `additionalDirectories` es lo que decide eso, y si falta, el trabajo se queda a medias
 * habiendo escrito ya la mitad. Se lee de la configuración y no del sistema de archivos porque
 * es un permiso de Claude Code, no un permiso del sistema operativo.
 *
 * @param {string} [from] - Raíz de la sesión, si se conoce (`--from`). Sin ella se deduce del
 *   directorio actual, que es lo correcto cuando la skill se corre desde el repo de trabajo.
 * @returns {string[]|null} Rutas absolutas, o **`null` si no se pudo determinar la raíz de la
 *   sesión**. Ese caso hay que distinguirlo de "no es escribible": afirmar un bloqueante que no
 *   se comprobó manda al usuario a arreglar algo que no está roto.
 */
function writableDirs(from) {
	const sessionRepo = from ?? process.env.CLAUDE_PROJECT_DIR ?? run("git", ["rev-parse", "--show-toplevel"]);

	if (!sessionRepo) return null;

	const dirs = [sessionRepo];

	for (const file of ["settings.local.json", "settings.json"]) {
		const settings = readJson(join(sessionRepo, ".claude", file));

		dirs.push(...(settings.additionalDirectories ?? settings.permissions?.additionalDirectories ?? []));
	}

	const user = readJson(join(homedir(), ".claude", "settings.json"));

	dirs.push(...(user.additionalDirectories ?? user.permissions?.additionalDirectories ?? []));

	return dirs;
}

/**
 * ¿Está `path` dentro de alguno de los directorios escribibles?
 *
 * @returns `true`, `false`, o `null` si no se pudo comprobar (raíz de sesión desconocida).
 */
function isWritable(path, dirs) {
	if (dirs === null) return null;

	return dirs.some(dir => path === dir || path.startsWith(`${dir}/`));
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const wanted = args.find(a => !a.startsWith("--"));

if (args.includes("--list")) {
	const available = projectsWithStack();

	console.log(available.length ? `Proyectos con stack definido:\n${available.map(p => `  ${p}`).join("\n")}` : "Ninguno tiene stack definido todavía.");
	process.exit(0);
}

const project = wanted ?? projectOf();

if (!project) {
	console.error(`No se indicó proyecto y el repo actual no está registrado.\nÚsala así: /fullstack-ticket <proyecto>\nDisponibles: ${projectsWithStack().join(", ") || "(ninguno)"}`);
	process.exit(1);
}

const stackFile = join(BRAIN, "projects", project, "stack", "stack.json");

if (!existsSync(stackFile)) {
	console.error(
		`El proyecto "${project}" no tiene stack definido.\n`
		+ `Para agregarlo: copia ${join(BRAIN, "projects", "_template", "stack", "stack.json")}\n`
		+ `a ${stackFile} y llénalo.\n`
		+ `Con stack definido: ${projectsWithStack().join(", ") || "(ninguno)"}`,
	);
	process.exit(1);
}

const stack = readJson(stackFile);
const stackDir = join(BRAIN, "projects", project, "stack");
const fromIndex = args.indexOf("--from");
const dirs = writableDirs(fromIndex >= 0 ? args[fromIndex + 1] : undefined);
const containersUp = (run("docker", ["ps", "--format", "{{.Names}}"]) ?? "").split("\n").filter(Boolean);

const repos = (stack.repos ?? []).map((repo) => {
	const exists = existsSync(repo.path);

	return {
		...repo,
		exists,
		writable: exists && isWritable(repo.path, dirs),
		branch: exists ? run("git", ["-C", repo.path, "branch", "--show-current"]) : null,
		dirty: exists ? (run("git", ["-C", repo.path, "status", "--short"]) ?? "").split("\n").filter(Boolean).length : 0,
	};
});

if (asJson) {
	console.log(JSON.stringify({ project, stackDir, ...stack, repos, containersUp }, null, 2));
	process.exit(0);
}

console.log(`Proyecto: ${stack.label ?? project}  (${project})`);
console.log(`Config:   ${stackDir}\n`);

for (const repo of repos) {
	const problems = [];

	if (!repo.exists) problems.push("NO EXISTE en disco");
	else if (repo.writable === false) problems.push("NO ESCRIBIBLE desde esta sesión: falta en additionalDirectories");

	if (repo.branch && (stack.protectedBranches ?? []).includes(repo.branch))
		problems.push(`está en la rama protegida "${repo.branch}"`);

	console.log(`  ${(repo.role ?? "?").padEnd(6)} ${repo.path}`);
	console.log(`         ${repo.stack ?? ""}`);
	console.log(`         rama: ${repo.branch ?? "?"}${repo.dirty ? `  (${repo.dirty} archivo(s) sin commitear)` : "  (limpio)"}`);

	if (repo.checks?.length) console.log(`         calidad: ${repo.checks.join(" && ")}`);
	if (problems.length) console.log(`         >>> ${problems.join("\n         >>> ")}`);

	console.log();
}

if (stack.contract) {
	const copies = repos.filter(r => r.exists && existsSync(join(r.path, stack.contract)));

	console.log(`Contrato: ${stack.contract} (${copies.length} copia(s): ${copies.map(r => r.role).join(", ") || "ninguna"})`);
}

if (stack.verifier)
	console.log(`Verificador: ${existsSync(join(stackDir, stack.verifier)) ? join(stackDir, stack.verifier) : `FALTA (${stack.verifier})`}`);

const containers = Object.keys(stack.containers ?? {});

if (containers.length) {
	const resolved = containers.map((variable) => {
		const name = process.env[variable];

		return `${variable}=${name ?? "(sin definir)"} ${name ? (containersUp.includes(name) ? "arriba" : "ABAJO") : ""}`;
	});

	console.log(`Contenedores:\n  ${resolved.join("\n  ")}`);
}

if (dirs === null) {
	console.log("\nNo se pudo determinar la raíz de la sesión, así que no se comprobó el acceso de");
	console.log("escritura. Corre esto desde el repo en el que estás trabajando, o pasa --from <ruta>.");
}

const blocked = repos.filter(r => !r.exists || r.writable === false);

if (blocked.length) {
	console.log(`\nBLOQUEANTE: ${blocked.length} repo(s) sin acceso de escritura. Regístralos en brain/projects.json,`);
	console.log(`corre node ~/.claude/brain/lib/plug.mjs para regenerar "additionalDirectories" y reinicia la sesión.`);
	process.exit(2);
}
