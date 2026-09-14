#!/usr/bin/env node
/**
 * Hook de traducciones: impide que una clave nueva quede intercalada o repita un texto que ya existe.
 *
 * El reparto de siempre es "el hook detecta, la skill ejecuta", pero aqui el hook ademas DENIEGA, y
 * es a proposito: las dos reglas que vigila no se arreglan avisando. Una clave intercalada ya cambio
 * el contexto de lineas que nadie toco, y un duplicado ya entro al archivo. Para cuando el aviso se
 * lee, el dano esta hecho.
 *
 * Que revisa:
 *   PreToolUse  1. Clave nueva que no quedo al final de su bloque  -> deniega (regla del CLAUDE.md).
 *               2. Clave nueva cuyo texto ya existe bajo otra clave -> deniega y lista las candidatas.
 *               3. Si pasa, recuerda la politica de traducciones.
 *   PostToolUse 4. JSON invalido o claves repetidas -> avisa.
 *               5. Claves que faltan en los locales hermanos vivos -> avisa, nunca bloquea.
 *
 * Deniega solo lo mecanico. La paridad avisa porque quien escribe el ticket no siempre es quien
 * traduce, y bloquear por una clave que falta en ingles detiene el trabajo por algo que va despues.
 */

import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { readdirSync } from "node:fs";

/** Locales de los proyectos del cerebro: `src/plugins/i18n/locales/`, `src/libs/i18n/locales/` y el `resources/lang/` de Laravel. */
const LOCALE_RE = /(?:i18n\/locales|resources\/lang)\/[A-Za-z][A-Za-z_-]{1,7}\.json$/;

/** Un hermano que comparte menos de esto con el archivo editado es una sobra de la plantilla, no un idioma vivo. */
const LIVE_OVERLAP = 0.1;

const POLICY = [
  "Politica de traducciones:",
  "1) Antes de crear una clave, mira si ya existe una equivalente y REUTILIZALA.",
  "2) Si no existe, va SIEMPRE al final del archivo (o al final de su bloque, si el locale es anidado).",
  "3) Nombre generico y reutilizable por otro modulo, no atado al ticket de hoy.",
  "4) Paridad: la clave nueva va en todos los locales vivos del proyecto.",
].join(" ");

/** Aplana un locale a un mapa `ruta.con.puntos` -> texto. Ignora lo que no sea cadena. */
function flatten(node, prefix = "", out = new Map()) {
	for (const [key, value] of Object.entries(node ?? {})) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, path, out);
		else if (typeof value === "string") out.set(path, value);
	}

	return out;
}

/** Contenido del archivo ya parseado, o `null` si no existe o no es JSON valido. */
function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

/** Texto que quedaria en el archivo si la edicion se aplicara. `null` si la herramienta no se reconoce. */
function resultingText(input) {
	const tool = input.tool_name;
	const ti = input.tool_input ?? {};

	if (tool === "Write") return ti.content ?? null;

	let text;
	try {
		text = readFileSync(ti.file_path, "utf8");
	} catch {
		return null;
	}

	const apply = (source, oldText, newText, all) => {
		if (!oldText) return source;

		return all ? source.split(oldText).join(newText) : source.replace(oldText, newText);
	};

	if (tool === "Edit") return apply(text, ti.old_string, ti.new_string ?? "", ti.replace_all);

	if (tool === "MultiEdit") {
		for (const edit of ti.edits ?? []) text = apply(text, edit.old_string, edit.new_string ?? "", edit.replace_all);

		return text;
	}

	return null;
}

/** Devuelve el objeto padre de una ruta con puntos, o `null` si el camino no existe. */
function parentOf(root, path) {
	const parts = path.split(".");
	let node = root;
	for (const part of parts.slice(0, -1)) {
		if (!node || typeof node !== "object") return null;
		node = node[part];
	}

	return node && typeof node === "object" ? node : null;
}

/** Claves nuevas que la edicion agrega, y el objeto resultante. `added` vacio si no hay nada que revisar. */
function analyze(input) {
	const filePath = input?.tool_input?.file_path ?? "";
	const before = flatten(readJson(filePath) ?? {});
	const text = resultingText(input);
	if (text === null) return { added: [], after: null, before };

	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { added: [], after: null, before };
	}

	const after = flatten(parsed);
	const added = [...after.keys()].filter(key => !before.has(key));

	return { added, after, before, parsed };
}

/** Claves agregadas que no quedaron al final de su bloque, con el nombre de la que las precede mal. */
function misplaced(parsed, added) {
	const out = [];
	for (const path of added) {
		const parent = parentOf(parsed, path);
		if (!parent) continue;
		const siblings = Object.keys(parent);
		const leaf = path.split(".").pop();
		const index = siblings.indexOf(leaf);
		const after = siblings.slice(index + 1).filter(name => {
			const sibPath = path.split(".").slice(0, -1).concat(name).join(".");

			return !added.includes(sibPath);
		});
		if (after.length) out.push({ path, followedBy: after.length });
	}

	return out;
}

/** Para cada clave agregada, las claves ya existentes que tienen exactamente su mismo texto. */
function duplicates(before, after, added) {
	const byValue = new Map();
	for (const [key, value] of before) {
		const norm = value.trim();
		if (!byValue.has(norm)) byValue.set(norm, []);
		byValue.get(norm).push(key);
	}

	const out = [];
	for (const path of added) {
		const value = (after.get(path) ?? "").trim();
		if (!value) continue;
		const reuse = byValue.get(value);
		if (reuse?.length) out.push({ path, value, reuse });
	}

	return out;
}

/** Claves con nombre y texto que aparecen en un fragmento de JSON suelto, sin exigir que parsee. */
function keysInText(text) {
	const out = new Set();
	for (const match of (text ?? "").matchAll(/"([^"\\]+)"\s*:\s*"(?:[^"\\]|\\.)*"/g)) out.add(match[1]);

	return out;
}

/** Claves que la edicion escribio, leidas del payload. En `PostToolUse` el disco ya cambio y no sirve de referencia. */
function touchedKeys(input) {
	const tool = input.tool_name;
	const ti = input.tool_input ?? {};
	if (tool === "Write") return keysInText(ti.content);
	if (tool === "Edit") return new Set([...keysInText(ti.new_string)].filter(key => !keysInText(ti.old_string).has(key)));

	if (tool === "MultiEdit") {
		const out = new Set();
		for (const edit of ti.edits ?? []) {
			const old = keysInText(edit.old_string);
			for (const key of keysInText(edit.new_string)) if (!old.has(key)) out.add(key);
		}

		return out;
	}

	return new Set();
}

/** Locales hermanos que de verdad se mantienen: los que comparten claves con el que se esta editando. */
function liveSiblings(filePath, before) {
	if (!before.size) return [];
	const dir = dirname(filePath);
	const self = basename(filePath);
	let names;
	try {
		names = readdirSync(dir).filter(name => name.endsWith(".json") && name !== self);
	} catch {
		return [];
	}

	const out = [];
	for (const name of names) {
		const keys = flatten(readJson(join(dir, name)) ?? {});
		if (!keys.size) continue;
		let shared = 0;
		for (const key of keys.keys()) if (before.has(key)) shared++;
		if (shared / before.size >= LIVE_OVERLAP) out.push({ name, keys });
	}

	return out;
}

const emit = payload => process.stdout.write(JSON.stringify(payload));

/** Deniega la edicion explicando por que; es lo unico que Claude recibe en `PreToolUse`. */
const deny = reason =>
	emit({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });

const context = (event, additionalContext) => emit({ hookSpecificOutput: { hookEventName: event, additionalContext } });

let input;
try {
	input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
	process.exit(0);
}

const filePath = input?.tool_input?.file_path ?? "";
if (!LOCALE_RE.test(filePath)) process.exit(0);

const event = input.hook_event_name ?? "";
const { added, after, before, parsed } = analyze(input);

if (event === "PreToolUse") {
	if (!added.length) {
		context("PreToolUse", POLICY);
		process.exit(0);
	}

	const dups = duplicates(before, after, added);
	if (dups.length) {
		const lines = dups.map(d => `  - "${d.value}" ya existe como ${d.reuse.map(k => `'${k}'`).join(", ")}. Reutiliza una en el componente en vez de crear '${d.path}'.`);
		deny([
			"Traduccion duplicada: no crees una clave nueva con un texto que ya existe.",
			...lines,
			"Si de verdad hacen falta dos claves con el mismo texto porque van a divergir, dilo explicitamente y se agrega.",
		].join("\n"));
		process.exit(0);
	}

	const bad = misplaced(parsed, added);
	if (bad.length) {
		const lines = bad.map(b => `  - '${b.path}' quedo con ${b.followedBy} clave(s) despues.`);
		deny([
			"Clave intercalada: las claves de traduccion nuevas van al FINAL del archivo, nunca junto a las de su mismo tema.",
			...lines,
			"Insertar en medio cambia el contexto de lineas que nadie toco y provoca conflictos cuando dos ramas agregan claves en la misma zona.",
			"Muevela al final del archivo (o al final de su bloque, si el locale es anidado) y vuelve a intentar.",
		].join("\n"));
		process.exit(0);
	}

	context("PreToolUse", POLICY);
	process.exit(0);
}

if (event === "PostToolUse") {
	const name = basename(filePath);
	let text;
	try {
		text = readFileSync(filePath, "utf8");
	} catch {
		process.exit(0);
	}

	try {
		JSON.parse(text);
	} catch (error) {
		context("PostToolUse", `Revision i18n — ${name}: JSON invalido (${error.message}). Corrigelo antes de seguir.`);
		process.exit(0);
	}

	const warnings = [];
	const counts = new Map();
	for (const match of text.matchAll(/^\s*"([^"]+)"\s*:/gm)) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
	const repeated = [...counts].filter(([, n]) => n > 1).map(([key]) => key);
	if (repeated.length) warnings.push(`claves repetidas: ${repeated.join(", ")}`);

	const onDisk = flatten(readJson(filePath) ?? {});
	const touched = [...touchedKeys(input)].filter(key => [...onDisk.keys()].some(path => path === key || path.endsWith(`.${key}`)));
	if (touched.length) {
		const faltan = liveSiblings(filePath, onDisk)
			.map(sib => ({ name: sib.name, missing: touched.filter(key => ![...sib.keys.keys()].some(path => path === key || path.endsWith(`.${key}`))) }))
			.filter(sib => sib.missing.length);
		for (const sib of faltan) warnings.push(`falta en ${sib.name}: ${sib.missing.join(", ")}`);
	}

	if (warnings.length) context("PostToolUse", `Revision i18n — ${name}: ${warnings.join("; ")}.`);
	process.exit(0);
}

process.exit(0);
