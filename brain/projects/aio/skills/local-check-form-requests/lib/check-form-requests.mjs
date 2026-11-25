#!/usr/bin/env node
/**
 * Revisa FormRequest de Laravel contra el request común del repo (en aio-backend, `CommonFormRequest`): reglas a mano que ya existen y mensajes faltantes.
 * Uso: node check-form-requests.mjs --base <ref> [--common <ruta>] <request.php> […]  ·  sale 0 limpio, 1 con hallazgos en líneas de la rama, 2 por uso o base inválida.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Reglas que no necesitan mensaje propio. */
const NO_MESSAGE = new Set(["nullable", "sometimes", "bail", "exclude"]);

/** Ruta del request común en aio-backend, relativa a la raíz del repo. */
const DEFAULT_COMMON = "app/Http/Requests/Common/CommonFormRequest.php";

/** Ejecuta git en un repositorio y devuelve la salida, o null si falla. */
function git(repo, args) {
	try {
		return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).trim();
	}
	catch {
		return null;
	}
}

/** Rangos `[inicio, fin]` de líneas agregadas por la rama, o `all` si el archivo es nuevo; lanza si la base no existe. */
function branchRanges(path, repo, base) {
	const forkPoint = git(repo, ["merge-base", "HEAD", base]);
	if (!forkPoint) throw new Error(`No se encontró la base ${base} en el repo: haz fetch o revisa el nombre.`);
	if (git(repo, ["cat-file", "-e", `${forkPoint}:${path.slice(repo.length + 1)}`]) === null) return "all";

	const diff = git(repo, ["diff", "-U0", "--no-color", forkPoint, "--", path]) ?? "";
	const ranges = [];
	for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
		const start = Number(match[1]);
		const count = match[2] === undefined ? 1 : Number(match[2]);
		if (count > 0) ranges.push([start, start + count - 1]);
	}

	return ranges;
}

/** Posición de la comilla que cierra el texto que empieza en `start`. */
function stringEnd(text, start) {
	const quote = text[start];
	for (let i = start + 1; i < text.length; i++) {
		if (text[i] === "\\") i++;
		else if (text[i] === quote) return i;
	}

	return text.length;
}

/** Posición del cierre que corresponde a la apertura en `start` (`(` o `[`), saltando textos. */
function closingOf(text, start) {
	const open = text[start];
	const close = open === "(" ? ")" : "]";
	let depth = 0;
	for (let i = start; i < text.length; i++) {
		if (text[i] === "'" || text[i] === '"') i = stringEnd(text, i);
		else if (text[i] === open) depth++;
		else if (text[i] === close && --depth === 0) return i;
	}

	return -1;
}

/** Parte un texto por comas de primer nivel; cada parte con su posición dentro del texto. */
function splitByCommas(text) {
	const parts = [];
	let depth = 0;
	let from = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === "'" || char === '"') i = stringEnd(text, i);
		else if ("([{".includes(char)) depth++;
		else if (")]}".includes(char)) depth--;
		else if (char === "," && depth === 0) {
			parts.push({ text: text.slice(from, i), position: from });
			from = i + 1;
		}
	}
	parts.push({ text: text.slice(from), position: from });

	return parts.filter((part) => part.text.trim());
}

/** Textos entre comillas de una expresión, sin las comillas. */
function strings(expression) {
	return [...expression.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1] ?? match[2]);
}

/** Nombre de la regla sin sus valores: `max:100` pasa a `max`. */
const ruleName = (rule) => rule.trim().split(":")[0].trim();

/** Contenido del arreglo que devuelve un método (`rules`, `messages`) con su posición en el archivo; null si no está. */
function methodArray(code, method) {
	const declaration = new RegExp(`function\\s+${method}\\s*\\(`).exec(code);
	if (!declaration) return null;

	const returnAt = code.indexOf("return", declaration.index);
	const open = code.indexOf("[", returnAt);
	const close = open >= 0 ? closingOf(code, open) : -1;
	if (returnAt < 0 || close < 0) return null;

	return { text: code.slice(open + 1, close), position: open + 1 };
}

/** Propiedades con reglas (`protected $requiredInteger = 'required|integer';`) y ayudantes que devuelven reglas. */
function readCommon(code) {
	const properties = {};
	for (const match of code.matchAll(/(?:protected|public)\s+(?:string\s+)?\$(\w+)\s*=\s*(['"])(.*?)\2\s*;/g)) {
		properties[match[1]] = match[3];
	}

	const helpers = {};
	for (const match of code.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*:\s*array\s*\{/g)) {
		const body = code.slice(match.index, code.indexOf("\n    }", match.index));
		const returned = /return\s*\[([\s\S]*?)\];/.exec(body);
		if (!returned) continue;

		const params = splitByCommas(match[2]).map(({ text }) => {
			const [, name, fallback] = /\$(\w+)\s*(?:=\s*(.+))?$/.exec(text.trim()) ?? [];

			return { name, fallback: fallback ? strings(fallback)[0] ?? fallback.trim() : undefined };
		});
		helpers[match[1]] = { params, items: splitByCommas(returned[1]).map(({ text }) => text.trim()) };
	}

	return { properties, helpers };
}

/** Valor de un argumento de llamada: texto literal o `$this->propiedad`. */
function argumentValue(argument, properties) {
	const property = /\$this->(\w+)/.exec(argument);
	if (property) return properties[property[1]] ?? property[1];

	return strings(argument)[0] ?? argument.trim();
}

/** Reglas que produce una llamada a un ayudante del request común. */
function helperRules(helper, args, properties) {
	return helper.items.flatMap((item) => {
		const variable = /^\$(\w+)$/.exec(item);
		if (!variable) return strings(item).flatMap((rule) => rule.split("|"));

		const position = helper.params.findIndex((param) => param.name === variable[1]);
		const value = args[position] !== undefined ? argumentValue(args[position], properties) : helper.params[position]?.fallback;

		return String(value ?? "").split("|");
	});
}

/** Reglas de la expresión de un campo y si se escribió a mano (sin propiedades ni ayudantes). */
function expressionRules(expression, common) {
	const rules = [];
	let byHand = true;

	for (const match of expression.matchAll(/\$this->(\w+)\s*(\()?/g)) {
		byHand = false;
		if (match[2]) {
			const open = match.index + match[0].length - 1;
			const args = splitByCommas(expression.slice(open + 1, closingOf(expression, open))).map(({ text }) => text);
			const helper = common.helpers[match[1]];
			if (helper) rules.push(...helperRules(helper, args, common.properties));
		}
		else if (common.properties[match[1]]) rules.push(...common.properties[match[1]].split("|"));
	}

	const withoutCalls = expression.replace(/\$this->\w+\s*\([^)]*\)/g, "").replace(/\$this->\w+/g, "");
	rules.push(...strings(withoutCalls).flatMap((text) => text.split("|")));
	for (const match of expression.matchAll(/Rule::(\w+)/g)) rules.push(match[1]);
	if (/new\s+\w+/.test(expression)) rules.push("(regla propia)");

	return { names: rules.map(ruleName).filter(Boolean), written: rules.filter(Boolean), byHand };
}

/** Propiedad o ayudante del request común que ya resuelve unas reglas escritas a mano. */
function commonSuggestion(written, common) {
	const normalize = (list) => [...list].map((rule) => rule.trim()).sort().join("|");
	const names = (list) => [...new Set(list.map(ruleName))].sort().join("|");
	const target = normalize(written);

	const property = Object.entries(common.properties).find(([, value]) => normalize(value.split("|")) === target);
	if (property) return `$this->${property[0]}`;

	const optional = (rule) => ["required", "nullable"].includes(ruleName(rule));
	const targetNames = names(written.filter((rule) => !optional(rule)));
	const helper = Object.entries(common.helpers).find(([, data]) => {
		const own = data.items.flatMap((item) => strings(item)).filter((rule) => !optional(rule));

		return own.length > 0 && names(own) === targetNames;
	});

	return helper ? `$this->${helper[0]}(…)` : null;
}

/** Revisa un request. */
function check(file, base, commonPath) {
	const path = resolve(file);
	const repo = git(dirname(path), ["rev-parse", "--show-toplevel"]) ?? dirname(path);
	const commonFile = commonPath ?? join(repo, DEFAULT_COMMON);
	const code = readFileSync(path, "utf8");
	const common = readCommon(existsSync(commonFile) ? readFileSync(commonFile, "utf8") + code : code);
	const ranges = branchRanges(path, repo, base);
	const lineOf = (position) => code.slice(0, position).split("\n").length;
	const inBranch = (line) => ranges === "all" || ranges.some(([start, end]) => line >= start && line <= end);

	const rules = methodArray(code, "rules");
	if (!rules) return { file, notice: "Sin rules() con un return [ … ] legible: revisar a mano." };

	const messages = methodArray(code, "messages");
	const keys = new Set(messages ? splitByCommas(messages.text).map(({ text }) => strings(text.split("=>")[0])[0]).filter(Boolean) : []);

	const unusedHelpers = [];
	const missingMessages = [];
	for (const entry of splitByCommas(rules.text)) {
		const [key, ...rest] = entry.text.split("=>");
		const field = strings(key)[0];
		if (!field || rest.length === 0) continue;

		const line = lineOf(rules.position + entry.position + entry.text.search(/\S/));
		const { names, written, byHand } = expressionRules(rest.join("=>"), common);
		const suggestion = byHand ? commonSuggestion(written, common) : null;
		if (suggestion) unusedHelpers.push({ field, line, inBranch: inBranch(line), written: written.join("|"), use: suggestion });

		const missing = [...new Set(names)].filter((rule) => !NO_MESSAGE.has(rule) && rule !== "(regla propia)" && !keys.has(`${field}.${rule}`) && !keys.has(rule));
		if (missing.length) missingMessages.push({ field, line, inBranch: inBranch(line), missing: missing.map((rule) => `${field}.${rule}`) });
	}

	return {
		file,
		hasMessages: Boolean(messages),
		messagesLine: messages ? lineOf(messages.position) : null,
		unusedHelpers,
		missingMessages,
	};
}

const args = process.argv.slice(2);
const take = (flag) => {
	const position = args.indexOf(flag);

	return position >= 0 ? args.splice(position, 2)[1] : null;
};
const base = take("--base");
const commonPath = take("--common");

if (!base || args.length === 0) {
	process.stderr.write("Uso: node check-form-requests.mjs --base origin/<rama base> [--common <ruta>] <request.php> [<request.php>…]\n");
	process.exit(2);
}

try {
	const results = args.map((file) => check(file, base, commonPath && resolve(commonPath)));
	process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
	const ownFindings = results.some((r) => [...(r.unusedHelpers ?? []), ...(r.missingMessages ?? [])].some((finding) => finding.inBranch));
	process.exit(ownFindings ? 1 : 0);
}
catch (error) {
	process.stderr.write(`${error.message}\n`);
	process.exit(2);
}
