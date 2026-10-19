#!/usr/bin/env node
/**
 * Busca, en los repos de brain/projects.json, las ramas del remoto que llevan el número de un ticket.
 * Uso: node find-branches.mjs <numero> [<otro numero>…]   (Mantis y, si lo hay, el código de GLPI)
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readProjects } from "../../../brain/lib/projects.mjs";

/** Runs git in `repo`; returns trimmed stdout, or `null` if git fails. */
function git(repo, args) {
	try {
		return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000 }).trim();
	}
	catch {
		return null;
	}
}

/** Branches of `repo` under `refs` (remote or local) whose name contains any of `numbers` as a whole number. */
function branchesOf(repo, refs, numbers) {
	const pattern = new RegExp(`(^|[^0-9])(${numbers.join("|")})([^0-9]|$)`);
	const out = git(repo, ["for-each-ref", refs, "--sort=-committerdate", "--format=%(refname:short)|%(committerdate:short)|%(authorname)|%(subject)"]) ?? "";

	return out.split("\n").filter(Boolean)
		.map((line) => {
			const [ref, date, author, ...subject] = line.split("|");

			return { branch: ref.replace(/^origin\//, ""), date, author, lastCommit: subject.join("|") };
		})
		.filter(({ branch }) => branch !== "HEAD" && pattern.test(branch));
}

/** Merge commits on remote branches that mention any of `numbers`: the ticket already went into a base. */
function mergesOf(repo, numbers) {
	const grep = numbers.flatMap((n) => ["--grep", n]);
	const out = git(repo, ["log", "--remotes=origin", "--merges", ...grep, "--format=%h|%ad|%s", "--date=short", "-10"]) ?? "";

	return out.split("\n").filter(Boolean).map((line) => {
		const [hash, date, ...subject] = line.split("|");

		return { hash, date, subject: subject.join("|") };
	});
}

const numbers = process.argv.slice(2).filter((n) => /^\d+$/.test(n));

if (!numbers.length) {
	process.stderr.write("Uso: node find-branches.mjs <numero> [<otro numero>…]\n");
	process.exit(2);
}

const repos = Object.entries(readProjects())
	.filter(([, project]) => !project.upstream)
	.flatMap(([key, project]) => (project.repos ?? []).filter(existsSync).map((repo) => ({ project: key, repo })));

const found = repos.map(({ project, repo }) => ({
	project,
	repo,
	fetched: git(repo, ["fetch", "--quiet", "--prune", "origin"]) !== null,
	current: git(repo, ["branch", "--show-current"]),
	branches: branchesOf(repo, "refs/remotes/origin", numbers),
	localOnly: branchesOf(repo, "refs/heads", numbers),
	merges: mergesOf(repo, numbers),
}));

for (const entry of found)
	entry.localOnly = entry.localOnly.filter((local) => !entry.branches.some((remote) => remote.branch === local.branch));

process.stdout.write(`${JSON.stringify({
	numbers,
	matches: found.filter((r) => r.branches.length || r.localOnly.length || r.merges.length),
	fetchFailed: found.filter((r) => !r.fetched).map((r) => r.repo),
}, null, 2)}\n`);
