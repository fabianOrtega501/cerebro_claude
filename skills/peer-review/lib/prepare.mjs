#!/usr/bin/env node
/**
 * Pone en el repo la rama de un compañero para revisarla y resume lo que aporta sobre su base.
 * Uso: node prepare.mjs <rama> [--repo <ruta>] [--base <rama>]   ·   node prepare.mjs --return <rama> [--repo <ruta>]
 *      node prepare.mjs --local --base <rama> [--repo <ruta>]   (revisión propia: la rama actual con lo sin commit)
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Archivos generados que no se revisan línea por línea. */
const GENERATED = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|auto-imports\.d\.ts|components\.d\.ts|typed-router\.d\.ts|api-docs\.json)$/;

/** Ejecuta git en el repo y devuelve la salida; lanza el error de git si falla. */
function git(repo, args) {
	return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
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

/** Deja el repo en la rama del compañero; si hay cambios sin commit, no cambia de rama. */
function checkoutBranch(repo, branch) {
	const original = git(repo, ["branch", "--show-current"]);
	const pending = git(repo, ["status", "--porcelain"]);
	git(repo, ["fetch", "origin", branch]);

	if (original === branch) {
		if (!pending) git(repo, ["merge", "--ff-only", `origin/${branch}`]);

		return { original, pendingChanges: Boolean(pending) };
	}
	if (pending) throw new Error(`El repo tiene cambios sin commit; no se cambia de rama:\n${pending}`);

	if (git(repo, ["branch", "--list", branch])) {
		git(repo, ["switch", branch]);
		git(repo, ["merge", "--ff-only", `origin/${branch}`]);
	}
	else {
		git(repo, ["switch", "--track", `origin/${branch}`]);
	}

	return { original, pendingChanges: false };
}

/** Own commits (no merges) after `mergeBase`. */
function commitsSince(repo, mergeBase) {
	return git(repo, ["log", "--no-merges", "--format=%h|%an|%ae|%ad|%s", "--date=short", `${mergeBase}..HEAD`])
		.split("\n").filter(Boolean)
		.map((line) => {
			const [hash, author, email, date, subject] = line.split("|");

			return { hash, author, email, date, subject };
		});
}

/** Files of a `git diff --numstat` output, flagging generated ones. */
function filesOf(numstat) {
	return numstat.split("\n").filter(Boolean).map((line) => {
		const [added, removed, path] = line.split("\t");

		return { path, added: Number(added) || 0, removed: Number(removed) || 0, generated: GENERATED.test(path) };
	});
}

/** The current branch against its base, uncommitted and untracked changes included; never switches branch. */
function summarizeLocal(repo, base) {
	git(repo, ["fetch", "origin", base]);
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
	git(repo, ["fetch", "origin", base]);
	const mergeBase = git(repo, ["merge-base", `origin/${base}`, "HEAD"]);
	const commits = commitsSince(repo, mergeBase);
	const files = filesOf(git(repo, ["diff", "--numstat", "-M", `${mergeBase}...HEAD`]));

	return {
		repo,
		branch,
		base: `origin/${base}`,
		mergeBase: mergeBase.slice(0, 10),
		authors: [...new Set(commits.map((c) => `${c.author} <${c.email}>`))],
		commits,
		files,
		diffCommand: `git -C "${repo}" diff -M ${mergeBase.slice(0, 10)}...HEAD -- <archivo>`,
	};
}

const args = process.argv.slice(2);
const option = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);

try {
	const repo = repoRoot(option("--repo"));
	const back = option("--return");
	if (args.includes("--local")) {
		process.stdout.write(`${JSON.stringify(summarizeLocal(repo, option("--base") ?? defaultBase(repo)), null, 2)}\n`);
	}
	else if (back) {
		git(repo, ["switch", back]);
		process.stdout.write(`${JSON.stringify({ repo, currentBranch: git(repo, ["branch", "--show-current"]) }, null, 2)}\n`);
	}
	else {
		const branch = args[0];
		if (!branch || branch.startsWith("--")) throw new Error("Falta el nombre de la rama a revisar.");
		const { original, pendingChanges } = checkoutBranch(repo, branch);
		const base = option("--base") ?? defaultBase(repo);
		process.stdout.write(`${JSON.stringify({ originalBranch: original, pendingChanges, ...summarize(repo, branch, base) }, null, 2)}\n`);
	}
}
catch (error) {
	const detail = error.stderr ? String(error.stderr).trim() : error.message;
	process.stderr.write(`${detail}\n`);
	process.exit(1);
}
