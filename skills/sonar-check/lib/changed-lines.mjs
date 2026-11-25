#!/usr/bin/env node
/**
 * Líneas que la rama agregó o cambió en cada archivo contra su punto de salida de la base, incluido lo no commiteado.
 * Uso: node changed-lines.mjs --base <ref> <archivo> [<archivo>…]  →  JSON con los rangos de líneas propias.
 */

import { execFileSync } from "node:child_process";
import { dirname, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

/** Ejecuta git en el repo y devuelve la salida, o null si falla. */
function git(repo, args) {
	try {
		return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).trim();
	}
	catch {
		return null;
	}
}

/** Rangos `[inicio, fin]` de líneas agregadas según los encabezados de `git diff -U0`. */
function addedRanges(diff) {
	const ranges = [];
	for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
		const start = Number(match[1]);
		const count = match[2] === undefined ? 1 : Number(match[2]);
		if (count > 0) ranges.push([start, start + count - 1]);
	}

	return ranges;
}

/**
 * Ruta absoluta del sistema; en Windows convierte la forma de Git Bash (`/c/Users/…`) a `C:/Users/…`.
 * @param {string} file - Ruta como la escribió quien llama.
 * @param {string} platform - Plataforma; por defecto la actual.
 * @returns {string} Ruta absoluta.
 */
export function nativePath(file, platform = process.platform) {
	if (platform !== "win32") return resolve(file);

	const gitBash = /^\/([a-zA-Z])(\/.*)?$/.exec(file);

	return win32.resolve(gitBash ? `${gitBash[1].toUpperCase()}:${gitBash[2] ?? "/"}` : file);
}

/** Describe qué líneas del archivo son de la rama; lo usan también otros scripts del plugin. */
export function analyze(file, base) {
	const path = nativePath(file);
	const repo = git(dirname(path), ["rev-parse", "--show-toplevel"]);
	if (!repo) return { file: path, error: "No está dentro de un repositorio git." };

	const tracked = git(repo, ["ls-files", "--error-unmatch", path]) !== null;
	if (!tracked) return { file: path, repo, new: true, ranges: "all" };

	const forkPoint = git(repo, ["merge-base", "HEAD", base]);
	if (!forkPoint) return { file: path, repo, error: `No se encontró la base ${base} en el repo: haz fetch o revisa el nombre.` };

	const diff = git(repo, ["diff", "-U0", "--no-color", forkPoint, "--", path]) ?? "";

	return { file: path, repo, base: forkPoint.slice(0, 10), new: false, ranges: addedRanges(diff) };
}

/** Uso por línea de comandos: imprime el análisis de cada archivo. */
function main() {
	const args = process.argv.slice(2);
	const basePosition = args.indexOf("--base");
	const base = basePosition >= 0 ? args.splice(basePosition, 2)[1] : null;

	if (!base || args.length === 0) {
		process.stderr.write("Uso: node changed-lines.mjs --base origin/<rama base> <archivo> [<archivo>…]\n");
		process.exit(2);
	}

	process.stdout.write(`${JSON.stringify(args.map((file) => analyze(file, base)), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
