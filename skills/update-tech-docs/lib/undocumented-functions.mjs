/**
 * Lista las funciones sin docblock de los archivos que toca la rama.
 *
 * Solo mira los archivos del ticket, no el repo entero: documentar de golpe los cientos de
 * metodos historicos que nadie ha tocado convierte el MR en una revision imposible. Lo que se
 * pide es que el codigo nuevo salga documentado y que, ya que se abre un archivo, no se deje
 * dentro una funcion muda.
 *
 * Separa dos casos porque no tienen la misma urgencia:
 *   - `nuevas`: la declaracion esta en lineas anadidas. Documentarla no es opcional.
 *   - `sinDoc`: ya existia sin documentar en un archivo que estas tocando. Oportunidad, no deuda tuya.
 *
 * Uso:
 *   node undocumented-functions.mjs --project aio
 *   node undocumented-functions.mjs --project aio --base desa --json
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BRAIN = join(homedir(), ".claude", "brain");

/** Corre git y devuelve la salida limpia. `null` si falla. */
function git(repo, args) {
	try {
		return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	}
	catch {
		return null;
	}
}

/** Perfil de documentacion del proyecto. Termina el proceso si no existe. */
function loadProfile(project) {
	const path = join(BRAIN, "projects", project, "docs", "profile.json");

	if (!existsSync(path)) {
		console.error(`El proyecto "${project}" no tiene perfil de docs en ${path}.`);
		process.exit(2);
	}

	return JSON.parse(readFileSync(path, "utf8"));
}

/** Rama base codificada en el nombre (`originDesa` -> `desa`). `null` si no la lleva. */
function baseFromBranchName(branch) {
	const match = /origin([A-Za-z]+)/.exec(branch ?? "");

	return match ? match[1].toLowerCase() : null;
}

/**
 * Numeros de linea que el diff marca como anadidos en ese archivo.
 * Con `to` nulo compara contra el arbol de trabajo, para ver tambien lo que aun no se commiteo.
 */
function addedLines(repo, from, to, file) {
	const diff = git(repo, ["diff", "-U0", ...(to ? [from, to] : [from]), "--", file]) ?? "";
	const lines = new Set();

	for (const header of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
		const start = Number(header[1]);
		const count = header[2] === undefined ? 1 : Number(header[2]);

		for (let i = 0; i < count; i++) lines.add(start + i);
	}

	return lines;
}

/** Text of the docblock that ends at line `end`, or `null` if that line does not close one. */
function docblockEndingAt(lines, end) {
	if (end < 0 || !lines[end].trim().endsWith("*/")) return null;

	let start = end;

	while (start > 0 && !lines[start].includes("/**")) start--;

	return lines.slice(start, end + 1).join("\n");
}

/** Number of parameters in the signature that starts at `index`, which may span several lines. */
function parameterCount(lines, index) {
	let signature = "";

	for (let i = index; i < lines.length && !signature.includes(")"); i++) signature += lines[i];

	const inside = signature.slice(signature.indexOf("(") + 1, signature.indexOf(")"));

	return (inside.match(/\$\w+/g) ?? []).length;
}

/** Whether the signature starting at `index` declares a `void` return type. */
function returnsVoid(lines, index) {
	let signature = "";

	for (let i = index; i < lines.length && !/[{;]/.test(signature); i++) signature += lines[i];

	return /\)\s*:\s*void\b/.test(signature);
}

/** Whether the docblock has a prose line saying what the function does, besides its tags. */
function hasDescription(doc) {
	return doc
		.split("\n")
		.map(line => line.replace(/^\s*(?:\/\*\*|\*\/|\*)?\s*/, "").replace(/\*\/\s*$/, "").trim())
		.some(line => line !== "" && !line.startsWith("@"));
}

/** What a docblock lacks: a description, `@return` (unless it returns void), or one `@param` per argument. Swagger endpoints need none. */
function missingTags(doc, name, params, isVoid) {
	if (doc.includes("@OA\\")) return [];

	const missing = [];

	if (!hasDescription(doc)) missing.push("descripcion");
	if (name !== "__construct" && !isVoid && !/@returns?\b/.test(doc)) missing.push("@return");
	if ((doc.match(/@param\b/g) ?? []).length < params) missing.push("@param");

	return missing;
}

/** Parameter list and the text right after its closing parenthesis, for the signature starting at `index`. */
function tsSignature(lines, index) {
	const text = lines.slice(index, index + 15).join("\n");
	const open = text.indexOf("(");
	let depth = 0;

	for (let i = open; open >= 0 && i < text.length; i++) {
		if (text[i] === "(") depth++;
		if (text[i] === ")" && --depth === 0) return { params: text.slice(open + 1, i), rest: text.slice(i + 1) };
	}

	return null;
}

/** Number of top-level parameters in a TypeScript parameter list. */
function tsParameterCount(params) {
	const trimmed = params.trim().replace(/,$/, "");
	let depth = 0;
	let count = trimmed === "" ? 0 : 1;

	for (const char of trimmed) {
		if ("([{<".includes(char)) depth++;
		if (")]}>".includes(char)) depth--;
		if (char === "," && depth === 0) count++;
	}

	return count;
}

const TS_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "constructor", "super", "await", "typeof"]);
const TS_CLASS = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_]\w*)/;
const TS_FUNCTION = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[(<]/;
const TS_CONST = /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(function\b|[A-Za-z_$][\w$]*\s*=>|[(<])/;
const TS_METHOD = /^\s+(?:(?:public|private|protected|static|async|override)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\(/;

/** Name, parameter count and void return of the function declared on `index`; `null` if the line declares none. */
function tsDeclaration(lines, index) {
	const line = lines[index];
	const declared = TS_FUNCTION.exec(line) ?? TS_CONST.exec(line) ?? TS_METHOD.exec(line);

	if (!declared || TS_KEYWORDS.has(declared[1])) return null;
	if (declared[2] && /=>$/.test(declared[2])) return { name: declared[1], params: 1, isVoid: false };

	const signature = tsSignature(lines, index);

	if (!signature) return null;

	const isConst = /^\s*(?:export\s+)?(?:const|let)\s/.test(line);
	const isArrow = /^\s*(?::[^=]*)?=>/.test(signature.rest);
	const isMethodBody = /^\s*(?::[^{;=]*)?\{/.test(signature.rest);

	if (isConst && declared[2] !== "function" && !isArrow) return null;
	if (!isConst && !/\bfunction\b/.test(line) && !isMethodBody) return null;

	return {
		name: declared[1],
		params: tsParameterCount(signature.params),
		isVoid: /^\s*:\s*(?:Promise<\s*)?void\b/.test(signature.rest),
	};
}

/** Classes and functions of a TS or Vue file, nested arrow functions and object or class methods included. */
function tsFunctionsIn(source) {
	const lines = source.split("\n");
	const found = [];

	lines.forEach((line, index) => {
		const type = TS_CLASS.exec(line);
		const fn = type ? null : tsDeclaration(lines, index);

		if (!type && !fn) return;

		let cursor = index - 1;

		while (cursor >= 0 && (lines[cursor].trim() === "" || lines[cursor].trim().startsWith("@"))) cursor--;

		const doc = docblockEndingAt(lines, cursor);
		const missing = type ? (hasDescription(doc ?? "") ? [] : ["descripcion"]) : missingTags(doc ?? "", fn.name, fn.params, fn.isVoid);

		found.push({ name: type ? `class ${type[1]}` : fn.name, line: index + 1, hasDoc: doc !== null, missing: doc === null ? [] : missing });
	});

	return found;
}

/**
 * Clases, interfaces, traits, enums y funciones de un archivo PHP, con si llevan docblock y que etiquetas le faltan.
 * Se ignoran las anonimas (`function (`) y los `fn()`: no son unidades documentables.
 */
function functionsIn(source) {
	const lines = source.split("\n");
	const found = [];

	lines.forEach((line, index) => {
		const type = /^\s*(?:(?:final|abstract|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_]\w*)/.exec(line);
		const match = type
			? [line, `${type[1]} ${type[2]}`]
			: /^\s*(?:(?:final|abstract)\s+)?(?:public|private|protected)?\s*(?:static\s+)?function\s+([A-Za-z_]\w*)\s*\(/.exec(line);

		if (!match) return;

		// El docblock puede estar pegado o separado por atributos (#[...]) y lineas en blanco.
		let cursor = index - 1;

		while (cursor >= 0 && (lines[cursor].trim() === "" || lines[cursor].trim().startsWith("#["))) cursor--;

		const doc = docblockEndingAt(lines, cursor);

		found.push({
			name: match[1],
			line: index + 1,
			hasDoc: doc !== null,
			missing: doc === null || type ? [] : missingTags(doc, match[1], parameterCount(lines, index), returnsVoid(lines, index)),
		});
	});

	return found;
}

const args = process.argv.slice(2);
const value = name => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : null);
const asJson = args.includes("--json");
const project = value("--project");

if (!project) {
	console.error("Falta --project. Ejemplo: --project aio");
	process.exit(2);
}

const profile = loadProfile(project);
const repo = profile.repo;
const branch = value("--branch") ?? git(repo, ["branch", "--show-current"]);
const tip = value("--branch") ?? "HEAD";
const base = value("--base") ?? baseFromBranchName(branch) ?? "desa";
const forkPoint = git(repo, ["merge-base", base, tip]) ?? git(repo, ["merge-base", `origin/${base}`, tip]);

if (!forkPoint) {
	console.error(`No se pudo calcular el punto de bifurcacion contra "${base}".`);
	process.exit(2);
}

const committed = (git(repo, ["diff", "--name-only", forkPoint, tip]) ?? "").split("\n").filter(Boolean);
/*
 * Se piden las rutas ya limpias en vez de parsear `status --porcelain`: su primera columna es un
 * espacio cuando el cambio no esta en el indice, y cualquier `trim()` por el camino desplaza el
 * corte y se come una letra de la ruta.
 */
const pending = tip === "HEAD"
	? [
		...(git(repo, ["diff", "--name-only", "HEAD"]) ?? "").split("\n"),
		...(git(repo, ["ls-files", "--others", "--exclude-standard"]) ?? "").split("\n"),
	].filter(Boolean)
	: [];

/*
 * Docblocks apply to every PHP file, not only to business logic: tests and migrations need them too.
 * `docGlobs` in the profile overrides the default; `sourceGlobs` stays for check-docs.mjs.
 * `docExtensions` adds TypeScript and Vue for the front and mobile repos.
 */
const globs = profile.docGlobs ?? ["app", "database/migrations", "database/seeders", "tests"];
const extensions = profile.docExtensions ?? [".php"];
const files = [...new Set([...committed, ...pending])]
	.filter(f => extensions.some(ext => f.endsWith(ext)) && !f.endsWith(".d.ts") && globs.some(g => f.startsWith(g)))
	.filter(f => existsSync(join(repo, f)));

const report = [];
const label = f => `${f.name} (linea ${f.line})`;
const withMissing = f => `${label(f)}: falta ${f.missing.join(" y ")}`;

for (const file of files) {
	// Con tip=HEAD interesa tambien lo pendiente: una funcion recien escrita aun no esta commiteada.
	const added = addedLines(repo, forkPoint, tip === "HEAD" ? null : tip, file);
	const source = tip === "HEAD" ? readFileSync(join(repo, file), "utf8") : git(repo, ["show", `${tip}:${file}`]) ?? "";
	const funcs = file.endsWith(".php") ? functionsIn(source) : tsFunctionsIn(source);
	const undocumented = funcs.filter(f => !f.hasDoc);
	const incomplete = funcs.filter(f => f.hasDoc && f.missing.length);

	if (!undocumented.length && !incomplete.length) continue;

	report.push({
		file,
		nuevas: undocumented.filter(f => added.has(f.line)).map(label),
		sinDoc: undocumented.filter(f => !added.has(f.line)).map(label),
		incompletasNuevas: incomplete.filter(f => added.has(f.line)).map(withMissing),
		incompletas: incomplete.filter(f => !added.has(f.line)).map(withMissing),
	});
}

const totalNuevas = report.reduce((n, r) => n + r.nuevas.length + r.incompletasNuevas.length, 0);
const totalSinDoc = report.reduce((n, r) => n + r.sinDoc.length + r.incompletas.length, 0);

if (asJson) {
	console.log(JSON.stringify({ repo, branch, base, archivos: report, totalNuevas, totalSinDoc }, null, 2));
	process.exit(totalNuevas ? 1 : 0);
}

console.log(`${profile.label ?? project}  ${branch} <- ${base}\n`);

if (!report.length) {
	console.log("Todas las funciones de los archivos tocados estan documentadas.");
	process.exit(0);
}

for (const entry of report) {
	console.log(`  ${entry.file}`);
	for (const fn of entry.nuevas) console.log(`    NUEVA sin documentar:  ${fn}`);
	for (const fn of entry.incompletasNuevas) console.log(`    NUEVA incompleta:      ${fn}`);
	for (const fn of entry.sinDoc) console.log(`    ya existia sin doc:    ${fn}`);
	for (const fn of entry.incompletas) console.log(`    ya existia incompleta: ${fn}`);
	console.log("");
}

console.log(`${totalNuevas} funcion(es) nueva(s) sin documentar o incompleta(s), ${totalSinDoc} preexistente(s) en archivos que tocas.`);

process.exit(totalNuevas ? 1 : 0);
