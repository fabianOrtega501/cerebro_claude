/**
 * Localiza el perfil de manual del proyecto desde el que se está trabajando.
 *
 * La skill es transversal, así que lo primero que necesita saber es *en qué proyecto está*.
 * Lo deduce del repo actual buscándolo en `~/.claude/brain/projects.json`, y de ahí llega a
 * `brain/projects/<proyecto>/manual/`.
 *
 * Ejecutable directamente para diagnosticar: `node profile.mjs`
 *
 * @typedef {object} Profile
 * @property {string} key - Identificador del proyecto, igual que en `projects.json`
 * @property {string} label - Nombre legible
 * @property {string} manualRootSetting - Variable que apunta al repo del manual
 * @property {string} manualRepoName - Nombre del repo del manual, para mensajes de error
 * @property {string[]} imagesPath - Carpeta de imágenes dentro del manual, en segmentos
 * @property {string} imagesPublicPath - Cómo se referencian esas imágenes desde los `.md`
 * @property {string} session - Ruta del adaptador de la app, relativa a la carpeta del perfil
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { findRepoRoot } from "../../../brain/lib/upstream.mjs";

const BRAIN = join(homedir(), ".claude", "brain");

/**
 * Proyecto del cerebro al que pertenece un repo.
 *
 * @param {string} [fromDir] - Directorio desde el que buscar; por defecto el actual
 * @returns {string|null} La clave del proyecto, o `null` si el repo no está registrado en
 *   `projects.json` (o no se está dentro de un repo git)
 */
export function currentProject(fromDir = process.cwd()) {
	const repo = findRepoRoot(fromDir);

	if (!repo) return null;

	const { projects } = JSON.parse(readFileSync(join(BRAIN, "projects.json"), "utf8"));

	for (const [key, config] of Object.entries(projects)) {
		if (config.repos?.includes(repo)) return key;
	}

	return null;
}

/**
 * Carga el perfil de manual del proyecto actual.
 *
 * @param {string} [fromDir] - Directorio desde el que buscar; por defecto el actual
 * @returns {Promise<{profile: Profile, dir: string}>} El perfil y la carpeta que lo contiene
 *   (útil para resolver `session` y `modules/`). **Si el proyecto no tiene perfil de manual, no
 *   devuelve: termina el proceso** explicando qué falta, porque seguir sin él solo produce un
 *   error más confuso unas líneas después
 */
export async function loadProfile(fromDir = process.cwd()) {
	const project = currentProject(fromDir);

	if (!project) {
		console.error("Este repo no está registrado en ~/.claude/brain/projects.json.\nAgrégalo y corre: node ~/.claude/brain/lib/plug.mjs");
		process.exit(1);
	}

	const dir = join(BRAIN, "projects", project, "manual");
	const file = join(dir, "profile.mjs");

	if (!existsSync(file)) {
		console.error(`El proyecto "${project}" no tiene flujo de manual todavía.\nFaltaría crear ${file} y su adaptador.`);
		process.exit(1);
	}

	return { profile: (await import(file)).PROFILE, dir };
}

// Ejecutado directamente: diagnóstico de dónde está parado.
if (import.meta.url === `file://${process.argv[1]}`) {
	const project = currentProject();

	console.log(`repo actual : ${findRepoRoot(process.cwd()) ?? "(no es un repo git)"}`);
	console.log(`proyecto    : ${project ?? "(no registrado en projects.json)"}`);

	if (project) {
		const dir = join(BRAIN, "projects", project, "manual");

		console.log(`perfil      : ${existsSync(join(dir, "profile.mjs")) ? dir : "(este proyecto no tiene flujo de manual)"}`);
	}
}
