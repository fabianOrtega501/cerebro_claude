/** Estado del cerebro que comparten las revisiones de Doctor: rutas, archivos versionados y ayudas. */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readProjects } from "../projects.mjs";

export const ROOT = join(homedir(), ".claude");

/**
 * Un hallazgo de Doctor.
 *
 * @param {"error"|"aviso"|"info"} level - error rompe algo hoy; aviso se va a degradar; info es contexto
 * @param {string} area - Modulo que lo encontro
 * @param {string} message - Que esta mal, concreto
 * @param {string} [fix] - Como se corrige; Doctor nunca lo aplica
 * @returns {{level: string, area: string, message: string, fix?: string}}
 */
export function finding(level, area, message, fix) {
	return fix ? { level, area, message, fix } : { level, area, message };
}

/** Salida de git en el cerebro, o `null` si fallo. */
export function git(args) {
	const r = spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

	return r.status === 0 ? r.stdout : null;
}

/** Contenido de un archivo como texto, o `null` si no existe o no se puede leer. */
export function read(path) {
	try {
		return readFileSync(path, "utf8");
	}
	catch {
		return null;
	}
}

/** Campos de primer nivel y de `metadata:` del frontmatter YAML de un `.md`. `{}` si no tiene. */
export function frontmatter(text) {
	const block = text?.match(/^---\n([\s\S]*?)\n---/);
	const out = {};

	for (const line of block?.[1].split("\n") ?? []) {
		const m = line.match(/^\s*([\w-]+):\s*(.*)$/);

		if (m && m[2] && m[2] !== ">-" && m[2] !== "|")
			out[m[1]] = m[2].trim();
		else if (m && (m[2] === ">-" || m[2] === "|"))
			out[m[1]] = "(bloque)";
	}

	return out;
}

/** Nombres de las entradas de un directorio; vacio si no existe. */
export function list(dir) {
	try {
		return readdirSync(dir);
	}
	catch {
		return [];
	}
}

/** Si el comando existe en el PATH. */
export function has(command) {
	try {
		execFileSync("which", [command], { stdio: "ignore" });
		return true;
	}
	catch {
		return false;
	}
}

/** Contexto que reciben todas las revisiones. */
export function buildContext() {
	const settingsText = read(join(ROOT, "settings.json"));
	let settings = null;

	try {
		settings = JSON.parse(settingsText);
	}
	catch {
		settings = null;
	}

	return {
		root: ROOT,
		settings,
		settingsText,
		projects: readProjects(),
		tracked: (git(["ls-files", "-z"]) ?? "").split("\0").filter(Boolean),
		exists: path => existsSync(path),
		isFile: path => existsSync(path) && statSync(path).isFile(),
	};
}
