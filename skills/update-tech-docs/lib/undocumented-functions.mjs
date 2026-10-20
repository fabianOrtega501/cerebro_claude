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

/** What a docblock lacks: `@return`, or one `@param` per argument. Swagger endpoints (`@OA\`) need neither. */
function missingTags(doc, name, params) {
	if (doc.includes("@OA\\")) return [];

	const missing = [];

	if (name !== "__construct" && !/@return\b/.test(doc)) missing.push("@return");
	if ((doc.match(/@param\b/g) ?? []).length < params) missing.push("@param");

	return missing;
}

/**
 * Funciones declaradas en un archivo PHP, con si llevan docblock justo encima y que etiquetas le faltan.
 * Se ignoran las anonimas (`function (`) y los `fn()`: no son unidades documentables.
 */
function functionsIn(source) {
	const lines = source.split("\n");
	const found = [];

	lines.forEach((line, index) => {
		const match = /^\s*(?:(?:final|abstract)\s+)?(?:public|private|protected)?\s*(?:static\s+)?function\s+([A-Za-z_]\w*)\s*\(/.exec(line);

		if (!match) return;

		// El docblock puede estar pegado o separado por atributos (#[...]) y lineas en blanco.
		let cursor = index - 1;

		while (cursor >= 0 && (lines[cursor].trim() === "" || lines[cursor].trim().startsWith("#["))) cursor--;

		const doc = docblockEndingAt(lines, cursor);

		found.push({
			name: match[1],
			line: index + 1,
			hasDoc: doc !== null,
			missing: doc === null ? [] : missingTags(doc, match[1], parameterCount(lines, index)),
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
 */
const globs = profile.docGlobs ?? ["app", "database/migrations", "database/seeders", "tests"];
const files = [...new Set([...committed, ...pending])]
	.filter(f => f.endsWith(".php") && globs.some(g => f.startsWith(g)))
	.filter(f => existsSync(join(repo, f)));

const report = [];
const label = f => `${f.name} (linea ${f.line})`;
const withMissing = f => `${label(f)}: falta ${f.missing.join(" y ")}`;

for (const file of files) {
	// Con tip=HEAD interesa tambien lo pendiente: una funcion recien escrita aun no esta commiteada.
	const added = addedLines(repo, forkPoint, tip === "HEAD" ? null : tip, file);
	const funcs = functionsIn(readFileSync(join(repo, file), "utf8"));
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
