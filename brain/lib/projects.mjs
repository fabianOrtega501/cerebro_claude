/**
 * Lectura del registro de proyectos del cerebro (`brain/projects.json`).
 *
 * Es la única fuente de verdad sobre qué proyectos existen y qué repos los componen. Vive aquí
 * y no en cada skill porque ya se estaba copiando en tres sitios, y una lista de proyectos que
 * difiere según quién la lea es peor que no tenerla.
 *
 * Ejecutable para diagnosticar: `node projects.mjs`
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const REGISTRY = join(homedir(), ".claude", "brain", "projects.json");

/**
 * Todos los proyectos registrados.
 *
 * @returns {Record<string, {label?: string, repos: string[]}>} Vacío si el registro no existe o
 *   está mal formado: quien llame decide si eso es un error, porque en algunos flujos no lo es.
 */
export function readProjects() {
	try {
		return JSON.parse(readFileSync(REGISTRY, "utf8")).projects ?? {};
	}
	catch {
		return {};
	}
}

/**
 * Repos de un proyecto que existen en disco.
 *
 * @param {string} key - Clave del proyecto, tal como está en `projects.json`
 * @returns {string[]} Rutas absolutas. Vacío si el proyecto no existe o ninguno está clonado.
 */
export function reposOf(key) {
	return (readProjects()[key]?.repos ?? []).filter(existsSync);
}

/**
 * Proyecto al que pertenece un repo.
 *
 * @param {string} [fromDir] - Directorio desde el que buscar; por defecto el actual
 * @returns {string|null} La clave del proyecto, o `null` si el repo no está registrado o no se
 *   está dentro de un repo git. **Sirve para sugerir, no para decidir**: dar por hecho el
 *   proyecto a partir del directorio es cómo se acaba trabajando sobre el equivocado.
 */
export function projectOf(fromDir = process.cwd()) {
	let root;

	try {
		root = execFileSync("git", ["-C", fromDir, "rev-parse", "--show-toplevel"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	}
	catch {
		return null;
	}

	return Object.entries(readProjects()).find(([, config]) => config.repos?.includes(root))?.[0] ?? null;
}

/** Ruta del registro, para poder decirle al usuario dónde agregar un proyecto que falte. */
export const REGISTRY_PATH = REGISTRY;

if (import.meta.url === `file://${process.argv[1]}`) {
	const projects = readProjects();
	const here = projectOf();

	if (process.argv.includes("--json")) {
		console.log(JSON.stringify({ projects, currentProject: here }, null, 2));
	}
	else {
		for (const [key, config] of Object.entries(projects)) {
			const clonados = (config.repos ?? []).filter(existsSync).length;

			console.log(`${key}${key === here ? "  <- el repo actual" : ""}`);
			console.log(`  ${config.label ?? ""}`);
			console.log(`  ${clonados} de ${(config.repos ?? []).length} repo(s) en disco`);
		}
	}
}
