#!/usr/bin/env node
/**
 * Funciones que la rama declaró o cambió con más parámetros de los permitidos (reglas del equipo: máximo 3).
 * Uso: node max-params.mjs --base <ref> [--max 3] <archivo> [<archivo>…]  ·  sale 0 sin hallazgos, 1 con hallazgos, 2 por uso o base inválida.
 */

import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { analyze } from "../../sonar-check/lib/changed-lines.mjs";

/** Los constructores no cuentan: reciben las dependencias inyectadas. */
const CONSTRUCTORS = new Set(["__construct", "constructor"]);

/** Palabras que van antes de un paréntesis sin ser una función. */
const NOT_FUNCTIONS = new Set(["if", "for", "foreach", "while", "switch", "catch", "return", "function", "match", "fn", "elseif", "array", "isset", "empty", "list", "new", "await", "typeof"]);

/** Extensiones que se revisan. */
const EXTENSIONS = [".php", ".ts", ".js", ".mjs", ".vue", ".tsx", ".jsx"];

const OPENERS = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set([")", "]", "}"]);

/** Posición de la comilla que cierra el texto que empieza en `start`. */
function stringEnd(text, start) {
	const quote = text[start];
	for (let i = start + 1; i < text.length; i++) {
		if (text[i] === "\\") i++;
		else if (text[i] === quote) return i;
	}

	return text.length;
}

/** Posición del paréntesis que cierra al que abre en `start`, saltando textos entre comillas; -1 si no cierra. */
function closingParen(text, start) {
	let depth = 0;
	for (let i = start; i < text.length; i++) {
		const char = text[i];
		if (char === "'" || char === '"' || char === "`") {
			i = stringEnd(text, i);
			continue;
		}
		if (char === "(") depth++;
		if (char === ")" && --depth === 0) return i;
	}

	return -1;
}

/** Cantidad de parámetros de una lista: comas al primer nivel, sin contar una coma final. */
function countParams(list, withGenerics) {
	const clean = list.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").trim();
	if (!clean) return 0;

	let depth = 0;
	let parts = 1;
	for (let i = 0; i < clean.length; i++) {
		const char = clean[i];
		if (char === "'" || char === '"' || char === "`") i = stringEnd(clean, i);
		else if (OPENERS[char] || (withGenerics && char === "<")) depth++;
		else if (CLOSERS.has(char) || (withGenerics && char === ">" && clean[i - 1] !== "=")) depth--;
		else if (char === "," && depth === 0) parts++;
	}

	return /,\s*$/.test(clean) ? parts - 1 : parts;
}

/** Declaraciones de función del texto: nombre, primera y última línea de la firma, y cantidad de parámetros. */
function declarations(text, isPhp) {
	const patterns = isPhp
		? [/\bfunction\s+&?(\w+)\s*\(/g]
		: [
			/\bfunction\s*\*?\s*(\w*)\s*\(/g,
			/\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/g,
			/^[ \t]*(?:(?:public|private|protected|static|async|readonly|override)\s+)*(\w+)\s*(?:<[^>()]*>)?\s*\(/gm,
			/\b(\w+)\s*:\s*(?:async\s*)?(?:function\s*)?\(/g,
			/[{,]\s*(?:async\s+)?(\w+)\s*\(/g,
		];
	const found = new Map();

	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) {
			const name = match[1] || "(anónima)";
			const open = match.index + match[0].length - 1;
			const close = closingParen(text, open);
			if (close < 0 || NOT_FUNCTIONS.has(name) || CONSTRUCTORS.has(name)) continue;

			const after = text.slice(close + 1, close + 300);
			const isDeclaration = isPhp || /^\s*(?::[^;]*?)?\s*(?:\{|=>)/s.test(after);
			if (!isDeclaration || found.has(open)) continue;

			found.set(open, {
				name,
				line: text.slice(0, match.index + match[0].indexOf(match[1] || "(")).split("\n").length,
				until: text.slice(0, close).split("\n").length,
				params: countParams(text.slice(open + 1, close), !isPhp),
			});
		}
	}

	return [...found.values()];
}

/** Funciones del archivo, tocadas por la rama, que pasan del máximo; lanza si la base no se resuelve. */
function check(file, base, max) {
	const path = resolve(file);
	const extension = extname(path).toLowerCase();
	if (!EXTENSIONS.includes(extension)) return [];

	const lines = analyze(path, base);
	if (lines.error) throw new Error(`${file}: ${lines.error}`);
	const touched = (from, to) => lines.ranges === "all" || lines.ranges.some(([start, end]) => from <= end && to >= start);

	return declarations(readFileSync(path, "utf8"), extension === ".php")
		.filter((fn) => fn.params > max && touched(fn.line, fn.until))
		.map((fn) => ({ file, line: fn.line, function: fn.name, params: fn.params }));
}

const args = process.argv.slice(2);
const take = (flag) => {
	const position = args.indexOf(flag);

	return position >= 0 ? args.splice(position, 2)[1] : null;
};
const base = take("--base");
const max = Number(take("--max") ?? 3);

if (!base || args.length === 0 || !Number.isInteger(max)) {
	process.stderr.write("Uso: node max-params.mjs --base origin/<rama base> [--max 3] <archivo> [<archivo>…]\n");
	process.exit(2);
}

try {
	const findings = args.flatMap((file) => check(file, base, max));
	process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
	process.exit(findings.length > 0 ? 1 : 0);
}
catch (error) {
	process.stderr.write(`${error.message}\n`);
	process.exit(2);
}
