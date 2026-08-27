/**
 * Detecta modulos con cambios de logica de negocio cuya documentacion no se toco en la rama.
 * Recibe --project y opcionalmente --base y --branch; reporte por stdout o --json.
 * Sale 1 si hay modulos pendientes, 0 si esta todo cubierto o no aplica.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BRAIN = join(homedir(), ".claude", "brain");

/** Corre git y devuelve la salida limpia, o null si falla. */
function git(repo, args) {
	try {
		return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	}
	catch {
		return null;
	}
}

/** Perfil de documentacion de un proyecto. Null si el proyecto no tiene uno. */
function loadProfile(project) {
	const path = join(BRAIN, "projects", project, "docs", "profile.json");

	if (!existsSync(path)) return null;

	try {
		return JSON.parse(readFileSync(path, "utf8"));
	}
	catch {
		return null;
	}
}

/**
 * Rama de la que salio la actual, deducida del nombre (`...originDesa...`).
 * Devuelve null si el nombre no la codifica; entonces hay que pasar --base.
 */
function baseFromBranchName(branch) {
	const match = (branch ?? "").match(/origin([A-Z][a-z]+)/);

	return match ? match[1].toLowerCase() : null;
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const value = name => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : null);
const project = value("--project");

if (!project) {
	console.error("Falta --project <clave>. Los proyectos con perfil de docs estan en ~/.claude/brain/projects/*/docs/.");
	process.exit(2);
}

const profile = loadProfile(project);

if (!profile) {
	console.error(`El proyecto "${project}" no tiene perfil de documentacion tecnica.\nPara crearlo: ~/.claude/brain/projects/${project}/docs/profile.json`);
	process.exit(2);
}

const repo = profile.repo;

if (!existsSync(repo)) {
	console.error(`El repo del perfil no existe: ${repo}`);
	process.exit(2);
}

// `--branch` permite revisar una rama sin cambiarse a ella: util para el hook y para mirar la
// rama de otro sin tocar el arbol de trabajo.
const branch = value("--branch") ?? git(repo, ["branch", "--show-current"]);
const tip = value("--branch") ?? "HEAD";
const base = value("--base") ?? baseFromBranchName(branch) ?? "desa";

// Se compara contra el punto donde la rama se separo de la base, no contra la punta de la base:
// asi los commits que otros metieron en la base mientras tanto no aparecen como cambios propios.
const forkPoint = git(repo, ["merge-base", base, tip]) ?? git(repo, ["merge-base", `origin/${base}`, tip]);

if (!forkPoint) {
	console.error(`No se pudo ubicar de donde sale "${branch}" respecto a "${base}". Pasa --base <rama>.`);
	process.exit(2);
}

const changed = (git(repo, ["diff", "--name-only", forkPoint, tip]) ?? "").split("\n").filter(Boolean);
// Lo que aun no esta commiteado solo cuenta si se mira la rama actual. Se piden las rutas
// directamente en vez de recortar la salida de `status --porcelain`: ese formato lleva dos
// caracteres de estado y un espacio delante, y cualquier trim previo desplaza el recorte.
const uncommitted = tip === "HEAD"
	? [
			...(git(repo, ["diff", "--name-only", "HEAD"]) ?? "").split("\n"),
			...(git(repo, ["ls-files", "--others", "--exclude-standard"]) ?? "").split("\n"),
		].filter(Boolean)
	: [];
const all = [...new Set([...changed, ...uncommitted])];

const moduleRegex = new RegExp(profile.moduleFrom);
const touchedModules = new Map();
const touchedDocs = new Set();

for (const file of all) {
	if (file.startsWith(`${profile.modulesDir}/`) || file.startsWith(`${profile.architectureDir}/`)) {
		touchedDocs.add(file);
		continue;
	}

	if (!profile.sourceGlobs.some(glob => file.startsWith(`${glob}/`))) continue;

	const found = file.match(moduleRegex);
	const name = found?.[1];

	if (!name || (profile.ignoreModules ?? []).includes(name)) continue;

	if (!touchedModules.has(name)) touchedModules.set(name, []);

	touchedModules.get(name).push(file);
}

const report = [...touchedModules.entries()].map(([name, files]) => {
	const folder = profile.modules?.[name] ?? name.toLowerCase();
	const dir = `${profile.modulesDir}/${folder}`;
	const documented = [...touchedDocs].some(doc => doc.startsWith(`${dir}/`));

	return { module: name, folder, dir, exists: existsSync(join(repo, dir)), documented, files };
});

const pending = report.filter(r => !r.documented);

if (asJson) {
	console.log(JSON.stringify({ project, repo, branch, base, forkPoint, standard: profile.standard, report, pending: pending.map(p => p.module) }, null, 2));
	process.exit(pending.length ? 1 : 0);
}

console.log(`${profile.label}  ${branch} <- ${base}`);

if (!report.length) {
	console.log("\nNingun cambio en logica de negocio. No hay documentacion que actualizar.");
	process.exit(0);
}

for (const r of report) {
	console.log(`\n  ${r.module}  (${r.files.length} archivo(s))`);
	for (const f of r.files.slice(0, 5)) console.log(`    ${f}`);
	if (r.files.length > 5) console.log(`    ...y ${r.files.length - 5} mas`);
	console.log(`    doc: ${r.dir}${r.exists ? "" : "  (la carpeta no existe todavia)"}  ->  ${r.documented ? "actualizada" : "SIN TOCAR"}`);
}

if (pending.length) {
	console.log(`\n${pending.length} modulo(s) con logica cambiada y documentacion sin tocar: ${pending.map(p => p.module).join(", ")}`);
	console.log(`El estandar del repo (${profile.standard}) pide la documentacion en el mismo MR que el codigo.`);
}

process.exit(pending.length ? 1 : 0);
