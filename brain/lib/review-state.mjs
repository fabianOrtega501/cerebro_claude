#!/usr/bin/env node
/**
 * Tracks whether the uncommitted code of a work repo was reviewed with `review-overengineering`.
 * Usage: node review-state.mjs mark [<dir>]   marks every repo of the project of <dir> as reviewed.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { projectOf, reposOf } from "./projects.mjs";

const STATE = join(homedir(), ".claude", ".review-state.json");

/** Generated files that change by just running the dev server: they never count as code to review. */
const IGNORED = [":(exclude)*.d.ts", ":(exclude)*lock.json", ":(exclude)*lock.yaml", ":(exclude)composer.lock"];

/** Runs git in a repo. Returns `null` instead of throwing. */
function git(repo, args) {
	try {
		return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
	}
	catch {
		return null;
	}
}

/**
 * Hash of the uncommitted code of a repo (tracked changes plus new files), or `null` when clean.
 * @param {string} repo - Repo root.
 * @returns {{ branch: string, hash: string }|null}
 */
export function diffSignature(repo) {
	const diff = git(repo, ["diff", "HEAD", "--", ".", ...IGNORED]) ?? "";
	const untracked = (git(repo, ["ls-files", "--others", "--exclude-standard", "--", ".", ...IGNORED]) ?? "").split("\n").filter(Boolean);
	const blobs = untracked.length ? git(repo, ["hash-object", "--", ...untracked]) ?? "" : "";

	if (!diff && !untracked.length)
		return null;

	return { branch: (git(repo, ["branch", "--show-current"]) ?? "").trim(), hash: createHash("sha1").update(diff + untracked.join("\n") + blobs).digest("hex") };
}

/** Persisted state: `{ "<repo>|<branch>": { reviewed, notified } }`. Empty object if missing. */
export function readState() {
	try {
		return JSON.parse(readFileSync(STATE, "utf8"));
	}
	catch {
		return {};
	}
}

/** Writes the state; failing to write never breaks the caller. */
export function writeState(state) {
	try {
		writeFileSync(STATE, JSON.stringify(state, null, 2));
	}
	catch { /* the notice still works without memory, it just repeats */ }
}

/**
 * Marks the current uncommitted code of every repo of the project as reviewed.
 * @param {string} dir - Any directory inside a registered repo.
 * @returns {string[]} The repos that had code and were marked.
 */
export function markReviewed(dir) {
	const project = projectOf(dir);
	const state = readState();
	const marked = [];

	for (const repo of project ? reposOf(project) : []) {
		const signature = diffSignature(repo);

		if (!signature)
			continue;

		state[`${repo}|${signature.branch}`] = { reviewed: signature.hash, notified: null };
		marked.push(repo);
	}

	writeState(state);

	return marked;
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "mark") {
	const marked = markReviewed(process.argv[3] ?? process.cwd());

	console.log(marked.length ? `Revisión registrada en: ${marked.join(", ")}` : "No hay código sin commitear que registrar.");
}
