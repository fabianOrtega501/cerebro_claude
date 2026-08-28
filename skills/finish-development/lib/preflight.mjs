/**
 * Reune el contexto para cerrar un desarrollo y frena lo que no debe seguir.
 *
 * Todo lo que la skill necesita decidir sale de aqui en un solo JSON: en que repo estamos, de
 * que rama nacio el trabajo, si hay algo que subir y con que gestor de paquetes correr los
 * checks. Se ejecuta primero y su campo `blockers` manda: si trae algo, no se sigue.
 *
 * La rama base NO se adivina mirando el remoto. Se lee del propio nombre (`originDesa`), que es
 * como `start-development` la codifica. Deducirla de otra forma es como se acaba mezclando
 * contra la rama equivocada.
 *
 * Uso:
 *   node preflight.mjs                 en el repo actual
 *   node preflight.mjs --project aio   fuerza el proyecto en vez de deducirlo
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { projectOf } from "../../../brain/lib/projects.mjs";

/** Corre git en `repo`. `ok` dice si tuvo exito; nunca lanza. */
function git(repo, args) {
	try {
		return { ok: true, out: execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
	}
	catch (error) {
		return { ok: false, out: (error.stderr ?? error.stdout ?? error.message ?? "").toString().trim() };
	}
}

/** `stack.json` del proyecto, o `null` si no lo tiene. */
function readStack(project) {
	const path = join(homedir(), ".claude", "brain", "projects", project, "stack", "stack.json");

	try {
		return JSON.parse(readFileSync(path, "utf8"));
	}
	catch {
		return null;
	}
}

/** Rama base codificada en el nombre (`feature/10842-fabian-originDesa-Filtro` -> `desa`). */
function baseFromBranch(branch) {
	const match = /origin([A-Za-z]+)/.exec(branch);

	return match ? match[1].toLowerCase() : null;
}

/** Numero de ticket al inicio del nombre de rama. `null` si la rama no lo lleva. */
function ticketFromBranch(branch) {
	const match = /^[^/]+\/(\d+)[-_]/.exec(branch);

	return match ? match[1] : null;
}

/** Gestor de paquetes realmente disponible, para no proponer un `pnpm` que no esta instalado. */
function packageManager() {
	for (const candidate of ["pnpm", "npm"]) {
		try {
			execFileSync("sh", ["-c", `command -v ${candidate}`], { stdio: "ignore" });

			return candidate;
		}
		catch { /* se prueba el siguiente */ }
	}

	return null;
}

const args = process.argv.slice(2);
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const project = args.includes("--project") ? args[args.indexOf("--project") + 1] : projectOf(repo);
const stack = project ? readStack(project) : null;

const branch = git(repo, ["branch", "--show-current"]).out;
const protectedBranches = stack?.protectedBranches ?? ["main", "master", "desa", "qa", "prod"];
const upstream = git(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
const dirty = git(repo, ["status", "--porcelain"]).out;
const base = baseFromBranch(branch);

/*
 * Con upstream se compara contra el; sin el —rama recien creada, aun sin pushear— se compara
 * contra la base. Dar `ahead: 0` a una rama nueva la hace parecer vacia y aborta el cierre justo
 * en el caso mas normal: el primer push del desarrollo.
 */
const compareTo = upstream.ok ? upstream.out : (base ? `origin/${base}` : null);
const comparable = compareTo && git(repo, ["rev-parse", "--verify", "--quiet", compareTo]).ok;
const counts = comparable ? git(repo, ["rev-list", "--left-right", "--count", `${compareTo}...HEAD`]).out.split(/\s+/) : [];

const blockers = [];

if (!branch) blockers.push("HEAD desprendido: no hay rama desde la que cerrar el desarrollo.");
if (protectedBranches.includes(branch)) blockers.push(`Estas en "${branch}", una rama protegida que despliega sola. Cierra el desarrollo desde una rama de trabajo.`);
if (!dirty && !(Number(counts[1]) > 0)) blockers.push("No hay nada que subir: el arbol esta limpio y no hay commits por delante del remoto.");

const repoConfig = (stack?.repos ?? []).find(r => r.path === repo) ?? null;

console.log(JSON.stringify({
	repo,
	project,
	role: repoConfig?.role ?? null,
	branch,
	base,
	ticket: ticketFromBranch(branch),
	ticketPrefix: stack?.ticketPrefix ?? null,
	protectedBranches,
	hasUpstream: upstream.ok,
	upstream: upstream.ok ? upstream.out : null,
	comparedTo: comparable ? compareTo : null,
	behind: Number(counts[0] ?? 0),
	ahead: Number(counts[1] ?? 0),
	dirty: Boolean(dirty),
	checks: repoConfig?.checks ?? [],
	packageManager: packageManager(),
	blockers,
}, null, 2));
