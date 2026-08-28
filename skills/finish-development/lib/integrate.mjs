/**
 * Trae la rama base al trabajo actual con un merge, y se detiene si hay conflictos.
 *
 * Merge y no rebase: el equipo ya trabaja asi —el historial esta lleno de "Merge branch desa
 * into hotfix/..."— y rebase reescribe commits que quiza ya estan pusheados y que otro tiene.
 *
 * Ante un conflicto NO intenta resolver ni aborta: deja el merge a medias y devuelve la lista de
 * archivos. Resolverlo exige entender los dos lados, y eso no lo hace un script.
 *
 * Uso:
 *   node integrate.mjs --repo /ruta --base desa
 *   node integrate.mjs --repo /ruta --base desa --dry-run   solo dice que traeria
 */

import { execFileSync } from "node:child_process";

/** Corre git. `ok` dice si tuvo exito; nunca lanza. */
function git(repo, args) {
	try {
		return { ok: true, out: execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
	}
	catch (error) {
		return { ok: false, out: (error.stderr ?? error.stdout ?? error.message ?? "").toString().trim() };
	}
}

const args = process.argv.slice(2);
const repo = args.includes("--repo") ? args[args.indexOf("--repo") + 1] : execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const base = args[args.indexOf("--base") + 1];
const dryRun = args.includes("--dry-run");

if (!args.includes("--base") || !base) {
	console.error("Falta --base. La rama base sale del nombre de la rama (originDesa) o se pregunta al usuario.");
	process.exit(2);
}

const dirty = git(repo, ["status", "--porcelain"]).out;

if (dirty) {
	console.log(JSON.stringify({ ok: false, reason: "Hay cambios sin commitear; el merge se hace con el arbol limpio.", dirty: dirty.split("\n") }, null, 2));
	process.exit(1);
}

const fetched = git(repo, ["fetch", "origin", base]);
const target = `origin/${base}`;

/*
 * Sin esta comprobacion, un fetch fallido deja `incoming` vacio y el script anuncia "ya estas al
 * dia" sin haber mirado nada: el peor resultado posible, porque se pushea creyendo estar al dia.
 */
if (!git(repo, ["rev-parse", "--verify", "--quiet", target]).ok) {
	console.log(JSON.stringify({ ok: false, reason: `No existe ${target}. El fetch fallo o la rama base no esta en el remoto.`, fetchOutput: fetched.out }, null, 2));
	process.exit(1);
}

const incoming = git(repo, ["log", "--oneline", `HEAD..${target}`]).out;

if (!incoming) {
	console.log(JSON.stringify({ ok: true, merged: false, reason: `Ya estas al dia con ${target}.`, commits: [] }, null, 2));
	process.exit(0);
}

const commits = incoming.split("\n");

if (dryRun) {
	console.log(JSON.stringify({ ok: true, merged: false, dryRun: true, wouldMerge: commits }, null, 2));
	process.exit(0);
}

const merge = git(repo, ["merge", "--no-edit", target]);

if (merge.ok) {
	console.log(JSON.stringify({ ok: true, merged: true, commits, output: merge.out }, null, 2));
	process.exit(0);
}

// Merge a medias: se deja como esta para que el usuario decida cada conflicto.
const conflicts = git(repo, ["diff", "--name-only", "--diff-filter=U"]).out;

console.log(JSON.stringify({
	ok: false,
	merged: false,
	reason: "El merge dejo conflictos. NO se aborto: resuelvelos y sigue, o corre `git merge --abort`.",
	conflicts: conflicts ? conflicts.split("\n") : [],
	output: merge.out,
}, null, 2));

process.exit(1);
