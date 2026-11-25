#!/usr/bin/env node
/**
 * Pone en el repo la rama de un compañero para revisarla y resume lo que aporta sobre su base.
 * Uso: node prepare.mjs <rama> --base <rama> [--repo <ruta>]   ·   node prepare.mjs --return <rama o commit> [--repo <ruta>]
 *      node prepare.mjs --local --base <rama> [--repo <ruta>]   (revisión propia: la rama actual con lo sin commit)
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Archivos generados que no se revisan línea por línea. */
const GENERATED = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|auto-imports\.d\.ts|components\.d\.ts|typed-router\.d\.ts|api-docs\.json)$/;

const VALUE_FLAGS = ["--repo", "--base", "--return"];

const BOOL_FLAGS = ["--local"];

/** Ejecuta git en el repo y devuelve la salida; lanza el error de git si falla. */
function git(repo, args) {
	return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** True si git termina bien; para las consultas que responden con el código de salida. */
function gitSucceeds(repo, args) {
	try {
		git(repo, args);

		return true;
	}
	catch {
		return false;
	}
}

/** Separa las opciones de la rama a revisar, en cualquier orden; lanza ante una opción desconocida. */
function parseArgs(argv) {
	const options = {};
	const positional = [];
	for (let i = 0; i < argv.length; i += 1) {
		if (BOOL_FLAGS.includes(argv[i])) {
			options[argv[i].slice(2)] = true;
			continue;
		}
		if (!VALUE_FLAGS.includes(argv[i])) {
			positional.push(argv[i]);
			continue;
		}
		const value = argv[i + 1];
		if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argv[i]}.`);
		options[argv[i].slice(2)] = value;
		i += 1;
	}
	const unknown = positional.find((arg) => arg.startsWith("--"));
	if (unknown) throw new Error(`Opción desconocida: ${unknown}.`);

	return { ...options, branch: positional[0] ?? null };
}

/** Raíz del repositorio git de la ruta indicada o, sin ruta, del directorio actual. */
function repoRoot(path) {
	return git(resolve(path ?? process.cwd()), ["rev-parse", "--show-toplevel"]);
}

/** Rama por defecto del remoto, para cuando no se indica la base. */
function defaultBase(repo) {
	try {
		return git(repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).replace(/^origin\//, "");
	}
	catch {
		throw new Error("No se pudo deducir la rama base: indícala con --base.");
	}
}

/** Trae la base y comprueba que exista en el remoto, antes de tocar la rama del repo. */
function fetchBase(repo, base) {
	try {
		git(repo, ["fetch", "origin", base]);
	}
	catch (error) {
		throw new Error(`No se pudo traer la base origin/${base}: ${String(error.stderr ?? error.message).trim()}`);
	}
}

/** Rama actual o, con HEAD separado, el commit, para poder volver al final. */
function currentPosition(repo) {
	const branch = git(repo, ["branch", "--show-current"]);

	return branch ? { original: branch, detached: false } : { original: git(repo, ["rev-parse", "HEAD"]), detached: true };
}

/** Vuelve a la rama o al commit donde estaba el repo. */
function switchBack(repo, position) {
	git(repo, position.detached ? ["switch", "--detach", position.original] : ["switch", position.original]);
}

/** Error que explica por qué la rama local no puede avanzar a la del remoto sin perder ni mezclar commits. */
function divergenceError(repo, branch) {
	const ahead = git(repo, ["rev-list", "--count", `origin/${branch}..${branch}`]);

	return new Error(`La rama local ${branch} tiene ${ahead} commit(s) que no están en origin/${branch} (va adelante o el autor reescribió la rama). No se cambia de rama: revísala con el revisor antes de seguir.`);
}

/** Deja el repo en la rama del compañero, al día con el remoto; si algo falla, no cambia de rama. */
function checkoutBranch(repo, branch, position) {
	const pending = git(repo, ["status", "--porcelain"]);
	git(repo, ["fetch", "origin", branch]);
	const localExists = Boolean(git(repo, ["branch", "--list", branch]));
	const fastForward = !localExists || gitSucceeds(repo, ["merge-base", "--is-ancestor", branch, `origin/${branch}`]);

	if (!position.detached && position.original === branch) {
		if (!fastForward) throw divergenceError(repo, branch);
		if (!pending) git(repo, ["merge", "--ff-only", `origin/${branch}`]);

		return Boolean(pending);
	}
	if (pending) throw new Error(`El repo tiene cambios sin commit; no se cambia de rama:\n${pending}`);
	if (!fastForward) throw divergenceError(repo, branch);

	if (localExists) {
		git(repo, ["switch", branch]);
		try {
			git(repo, ["merge", "--ff-only", `origin/${branch}`]);
		}
		catch (error) {
			switchBack(repo, position);
			throw error;
		}
	}
	else {
		git(repo, ["switch", "--track", `origin/${branch}`]);
	}

	return false;
}

/** Commits propios (sin merges) después de `mergeBase`. */
function commitsSince(repo, mergeBase) {
	return git(repo, ["log", "--no-merges", "--format=%h|%an|%ae|%ad|%s", "--date=short", `${mergeBase}..HEAD`])
		.split("\n").filter(Boolean)
		.map((line) => {
			const [hash, author, email, date, subject] = line.split("|");

			return { hash, author, email, date, subject };
		});
}

/** Archivos de una salida de `git diff --numstat`, marcando los generados. */
function filesOf(numstat) {
	return numstat.split("\n").filter(Boolean).map((line) => {
		const [added, removed, path] = line.split("\t");

		return { path, added: Number(added) || 0, removed: Number(removed) || 0, generated: GENERATED.test(path) };
	});
}

/** La rama actual contra su base, con lo sin commit y lo sin seguimiento; nunca cambia de rama. */
function summarizeLocal(repo, base) {
	fetchBase(repo, base);
	const mergeBase = git(repo, ["merge-base", `origin/${base}`, "HEAD"]);
	const commits = commitsSince(repo, mergeBase);
	const untracked = git(repo, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)
		.map((path) => ({ path, added: null, removed: 0, generated: GENERATED.test(path), untracked: true }));

	return {
		repo,
		branch: git(repo, ["branch", "--show-current"]),
		base: `origin/${base}`,
		mergeBase: mergeBase.slice(0, 10),
		authors: [...new Set(commits.map((c) => `${c.author} <${c.email}>`))],
		commits,
		uncommitted: git(repo, ["status", "--porcelain"]).split("\n").filter(Boolean),
		files: [...filesOf(git(repo, ["diff", "--numstat", "-M", mergeBase])), ...untracked],
		diffCommand: `git -C "${repo}" diff -M ${mergeBase.slice(0, 10)} -- <archivo>`,
	};
}

/** Commits, autores y archivos que la rama aporta sobre su base. */
function summarize(repo, branch, base) {
	const mergeBase = git(repo, ["merge-base", `origin/${base}`, "HEAD"]);
	const commits = commitsSince(repo, mergeBase);

	return {
		repo,
		branch,
		base: `origin/${base}`,
		mergeBase: mergeBase.slice(0, 10),
		authors: [...new Set(commits.map((c) => `${c.author} <${c.email}>`))],
		commits,
		files: filesOf(git(repo, ["diff", "--numstat", "-M", `${mergeBase}...HEAD`])),
		diffCommand: `git -C "${repo}" diff -M ${mergeBase.slice(0, 10)}...HEAD -- <archivo>`,
	};
}

/** Vuelve a la rama o al commit original, sin pisar cambios pendientes. */
function returnTo(repo, target) {
	const pending = git(repo, ["status", "--porcelain"]);
	if (pending) throw new Error(`El repo tiene cambios sin commit; no se cambia de rama:\n${pending}`);
	if (!gitSucceeds(repo, ["rev-parse", "--verify", "--quiet", `${target}^{commit}`])) throw new Error(`No existe la rama o el commit ${target}.`);
	const isBranch = gitSucceeds(repo, ["show-ref", "--verify", "--quiet", `refs/heads/${target}`]);
	git(repo, isBranch ? ["switch", target] : ["switch", "--detach", target]);

	return { repo, currentBranch: git(repo, ["branch", "--show-current"]) || git(repo, ["rev-parse", "--short", "HEAD"]) };
}

try {
	const options = parseArgs(process.argv.slice(2));
	const repo = repoRoot(options.repo);
	if (options.local) {
		process.stdout.write(`${JSON.stringify(summarizeLocal(repo, options.base ?? defaultBase(repo)), null, 2)}\n`);
	}
	else if (options.return) {
		process.stdout.write(`${JSON.stringify(returnTo(repo, options.return), null, 2)}\n`);
	}
	else {
		if (!options.branch) throw new Error("Falta el nombre de la rama a revisar.");
		const base = options.base ?? defaultBase(repo);
		fetchBase(repo, base);
		const position = currentPosition(repo);
		const pendingChanges = checkoutBranch(repo, options.branch, position);
		let summary;
		try {
			summary = summarize(repo, options.branch, base);
		}
		catch (error) {
			if (!pendingChanges && position.original !== options.branch) switchBack(repo, position);
			throw error;
		}
		process.stdout.write(`${JSON.stringify({ originalBranch: position.original, originalDetached: position.detached, pendingChanges, ...summary }, null, 2)}\n`);
	}
}
catch (error) {
	const detail = error.stderr ? String(error.stderr).trim() : error.message;
	process.stderr.write(`${detail}\n`);
	process.exit(1);
}
