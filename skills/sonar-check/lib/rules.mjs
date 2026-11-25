#!/usr/bin/env node
/**
 * Describe reglas de Sonar (`php:S1192`, `typescript:S6859`, `Web:S7927`…) con los analizadores de la extensión instalada.
 * Uso: node rules.mjs <regla> [<regla>…]  →  JSON con tipo, severidad y título de cada una.
 * Lee los .jar con Node (sin `unzip`), así que corre igual en Linux, macOS y Windows.
 */

import { closeSync, existsSync, fstatSync, openSync, readdirSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

/** Carpetas de extensiones de VS Code que se buscan, en orden. */
const EXTENSION_DIRS = [".vscode", ".vscode-server", ".vscode-insiders"].map((dir) => join(homedir(), dir, "extensions"));

/** Repositorios de reglas que comparten carpeta con otro dentro del analizador. */
const ALIASES = { typescript: "javascript", jssecurity: "javascript", tssecurity: "javascript" };

/** Nombre en español de cada tipo de regla. */
const TYPES = {
	BUG: "Bug",
	VULNERABILITY: "Vulnerabilidad",
	SECURITY_HOTSPOT: "Punto crítico de seguridad",
	CODE_SMELL: "Code smell",
};

/** Firmas y tamaños fijos del formato zip que se usan al leer un .jar. */
const ZIP = { endSignature: 0x06054b50, entrySignature: 0x02014b50, localSignature: 0x04034b50, endSize: 22, maxComment: 0xffff };

/** Lee `length` bytes del archivo abierto desde `position`. */
function readAt(fd, position, length) {
	const buffer = Buffer.alloc(length);
	readSync(fd, buffer, 0, length, position);

	return buffer;
}

/** Ubica el directorio central del zip a partir del registro final; los zip64 no se soportan. */
function centralDirectory(fd) {
	const size = fstatSync(fd).size;
	const tailLength = Math.min(size, ZIP.endSize + ZIP.maxComment);
	const tail = readAt(fd, size - tailLength, tailLength);
	const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	if (end < 0 || tail.readUInt32LE(end) !== ZIP.endSignature) throw new Error("El archivo no es un zip válido.");

	const offset = tail.readUInt32LE(end + 16);
	if (offset === 0xffffffff) throw new Error("Zip64 no soportado.");

	return readAt(fd, offset, tail.readUInt32LE(end + 12));
}

/**
 * Entradas del .jar con lo necesario para leerlas después.
 * @param {string} path - Ruta del .jar.
 * @returns {Map<string, {method: number, compressedSize: number, localOffset: number}>} Entradas por nombre.
 */
export function listEntries(path) {
	const fd = openSync(path, "r");
	try {
		const directory = centralDirectory(fd);
		const entries = new Map();
		for (let position = 0; position + 46 <= directory.length && directory.readUInt32LE(position) === ZIP.entrySignature;) {
			const nameLength = directory.readUInt16LE(position + 28);
			const name = directory.toString("utf8", position + 46, position + 46 + nameLength);
			entries.set(name, {
				method: directory.readUInt16LE(position + 10),
				compressedSize: directory.readUInt32LE(position + 20),
				localOffset: directory.readUInt32LE(position + 42),
			});
			position += 46 + nameLength + directory.readUInt16LE(position + 30) + directory.readUInt16LE(position + 32);
		}

		return entries;
	}
	finally {
		closeSync(fd);
	}
}

/**
 * Contenido de una entrada del .jar como texto.
 * @param {string} path - Ruta del .jar.
 * @param {{method: number, compressedSize: number, localOffset: number}} entry - Entrada devuelta por `listEntries`.
 * @returns {string} Contenido en UTF-8.
 */
export function readEntry(path, entry) {
	const fd = openSync(path, "r");
	try {
		const header = readAt(fd, entry.localOffset, 30);
		if (header.readUInt32LE(0) !== ZIP.localSignature) throw new Error(`Entrada dañada en ${path}.`);

		const dataStart = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
		const data = readAt(fd, dataStart, entry.compressedSize);
		if (entry.method === 0) return data.toString("utf8");
		if (entry.method === 8) return inflateRawSync(data).toString("utf8");

		throw new Error(`Compresión ${entry.method} no soportada en ${path}.`);
	}
	finally {
		closeSync(fd);
	}
}

/** Carpeta `analyzers` de la versión más reciente instalada de SonarQube for IDE. */
function analyzersDir() {
	const installed = EXTENSION_DIRS.filter((dir) => existsSync(dir)).flatMap((dir) =>
		readdirSync(dir)
			.filter((name) => name.startsWith("sonarsource.sonarlint-vscode-"))
			.map((name) => ({ dir, name })),
	);
	installed.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
	const latest = installed.at(-1);
	if (!latest) throw new Error("No está instalada la extensión SonarQube for IDE en VS Code.");

	return join(latest.dir, latest.name, "analyzers");
}

/**
 * Índice `repositorio:regla` → `{ jar, entry }` de todos los analizadores de la carpeta.
 * @param {string} dir - Carpeta con los .jar.
 * @returns {Map<string, {jar: string, entry: object}>} Índice de reglas.
 */
export function indexRules(dir) {
	const index = new Map();
	for (const jar of readdirSync(dir).filter((name) => name.endsWith(".jar"))) {
		const path = join(dir, jar);
		for (const [name, entry] of listEntries(path)) {
			const match = /\/rules\/([^/]+)\/([^/]+)\.json$/.exec(name);
			if (match && !match[2].endsWith("_profile")) index.set(`${match[1]}:${match[2]}`, { jar: path, entry });
		}
	}

	return index;
}

/**
 * Metadatos de una regla, o `found: false` si el analizador no la trae.
 * @param {Map<string, {jar: string, entry: object}>} index - Índice de `indexRules`.
 * @param {string} rule - Regla con la forma `repositorio:clave`.
 * @returns {object} Tipo, severidad, impactos y título de la regla.
 */
export function describe(index, rule) {
	const [repository, key] = rule.split(":");
	const location = index.get(`${ALIASES[repository] ?? repository}:${key}`) ?? index.get(rule);
	if (!location) return { rule, found: false };

	const data = JSON.parse(readEntry(location.jar, location.entry));

	return {
		rule,
		found: true,
		type: TYPES[data.type] ?? data.type,
		severity: data.defaultSeverity,
		impacts: data.code?.impacts ?? {},
		title: data.title,
	};
}

/** Uso por línea de comandos: imprime la descripción de cada regla. */
function main() {
	const rules = process.argv.slice(2);
	if (rules.length === 0) {
		process.stderr.write("Uso: node rules.mjs <regla> [<regla>…]  (ej. php:S1192 typescript:S6859)\n");
		process.exit(2);
	}

	const index = indexRules(analyzersDir());
	process.stdout.write(`${JSON.stringify(rules.map((rule) => describe(index, rule)), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
