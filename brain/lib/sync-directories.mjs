/**
 * Reescribe `permissions.additionalDirectories` de `settings.json` con los repos de `projects.json`.
 *
 * Sin esto la lista vive en dos sitios: `projects.json`, que es donde se registran los proyectos,
 * y `settings.json`, que es lo que el harness lee para dejar entrar a un directorio sin
 * preguntar. Agregar un proyecto en uno y olvidar el otro no falla con un error: simplemente
 * vuelve a pedir aprobacion en cada salida de directorio, y nadie relaciona una cosa con la otra.
 *
 * Las rutas van absolutas porque `additionalDirectories` no expande variables de entorno.
 *
 * Uso:
 *   node sync-directories.mjs           reescribe si hace falta
 *   node sync-directories.mjs --check   no escribe; sale 1 si esta desincronizado
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRAIN_DIR } from "./upstream.mjs";

const SETTINGS = join(BRAIN_DIR, "..", "settings.json");

/** Repos de todos los proyectos registrados, en el orden en que estan declarados. */
export function declaredRepos() {
	const registry = JSON.parse(readFileSync(join(BRAIN_DIR, "projects.json"), "utf8")).projects;

	return Object.values(registry).flatMap(project => project.repos);
}

/**
 * Deja `settings.json` al dia. Devuelve que cambio, sin escribir si `check` es `true`.
 * `changed` es `false` cuando ya estaba sincronizado.
 */
export function syncDirectories({ check = false } = {}) {
	const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
	const current = settings.permissions?.additionalDirectories ?? [];
	const wanted = declaredRepos();

	const added = wanted.filter(r => !current.includes(r));
	const removed = current.filter(r => !wanted.includes(r));
	const changed = added.length > 0 || removed.length > 0 || current.join("\n") !== wanted.join("\n");

	if (changed && !check) {
		settings.permissions ??= {};
		settings.permissions.additionalDirectories = wanted;
		writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
	}

	return { changed, added, removed, total: wanted.length };
}

// Como script suelto reporta; importado desde `plug.mjs` solo devuelve el resultado.
if (import.meta.url === `file://${process.argv[1]}`) {
	const check = process.argv.includes("--check");
	const result = syncDirectories({ check });

	if (!result.changed) console.log(`additionalDirectories al dia (${result.total} repos).`);
	else if (check) console.log(`DESINCRONIZADO: sobran ${result.removed.length}, faltan ${result.added.length}. Corre sync-directories.mjs.`);
	else console.log(`settings.json actualizado: ${result.total} repos (+${result.added.length} / -${result.removed.length}).`);

	process.exit(check && result.changed ? 1 : 0);
}
