#!/usr/bin/env node
/**
 * Checks that the i18n keys a branch added are still the last keys of each locale after merging
 * the base branch, and with --fix moves them to the end, line by line, without touching others.
 * A branch key is one that is neither in the merge-base nor in the base tip: merged keys never move.
 *
 * Usage:
 *   node i18n-tail.mjs --repo <path> --base origin/desa          report only, exit 1 if misplaced
 *   node i18n-tail.mjs --repo <path> --base origin/desa --fix    move the branch keys to the end
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCALE_RE = /(?:i18n\/locales|resources\/lang)\/[A-Za-z][A-Za-z_-]{1,7}\.json$/;
const KEY_LINE_RE = /^\s*"((?:[^"\\]|\\.)+)"\s*:/;

const args = process.argv.slice(2);
const arg = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const repo = arg("repo") ?? process.cwd();
const base = arg("base");
const fix = args.includes("--fix");

/** Runs git in the repo and returns its trimmed output, or `null` if it fails. */
function git(...gitArgs) {
	try {
		return execFileSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	} catch {
		return null;
	}
}

/** Top-level keys of a JSON text, in file order. `null` if it does not parse. */
function topKeys(text) {
	try {
		return Object.keys(JSON.parse(text));
	} catch {
		return null;
	}
}

/** Keys added by the branch that sit before a key it did not add. */
function misplaced(keys, added) {
	const lastForeign = keys.reduce((last, key, index) => (added.has(key) ? last : index), -1);
	return keys.filter((key, index) => added.has(key) && index < lastForeign);
}

/**
 * Moves the lines of `keys` to the end of the object, keeping their order and every other line
 * byte for byte. Returns the new text, or `null` if a key is not a single top-level line.
 */
function moveToEnd(text, keys) {
	const lines = text.split("\n");
	const close = lines.findLastIndex((line) => line.trim() === "}");
	const indent = lines.find((line) => KEY_LINE_RE.test(line))?.match(/^\s*/)[0] ?? "";
	const isMoved = (line) => line.match(/^\s*/)[0] === indent && keys.includes(KEY_LINE_RE.exec(line)?.[1]);
	const moved = lines.slice(0, close).filter(isMoved);
	if (moved.length !== keys.length || moved.some((line) => !topKeys(`{${line.replace(/,\s*$/, "")}}`))) return null;

	const kept = lines.slice(0, close).filter((line) => !isMoved(line));
	const lastKept = kept.findLastIndex((line) => KEY_LINE_RE.test(line));
	kept[lastKept] = kept[lastKept].replace(/^(.*?)(,?)(\s*)$/, (_, body, _comma, space) => `${body},${space}`);
	const tail = moved.map((line, index) => line.replace(/,(\s*)$/, "$1") + (index < moved.length - 1 ? "," : ""));
	return [...kept, ...tail, ...lines.slice(close)].join("\n");
}

if (!base) {
	console.error("Missing --base (for example origin/desa).");
	process.exit(2);
}

const mergeBase = git("merge-base", "HEAD", base);
if (!mergeBase) {
	console.log(JSON.stringify({ ok: false, reason: `No merge-base between HEAD and ${base}.` }, null, 2));
	process.exit(2);
}

const files = [...new Set((git("ls-files") ?? "").split("\n").filter((file) => LOCALE_RE.test(file)))];
const report = [];

for (const file of files) {
	const current = readFileSync(join(repo, file), "utf8");
	const keys = topKeys(current);
	if (!keys) {
		report.push({ file, misplaced: [], fixed: false, reason: "Not valid JSON: unresolved merge conflict?" });
		continue;
	}
	const baseKeys = [mergeBase, base].flatMap((ref) => topKeys(git("show", `${ref}:${file}`) ?? "") ?? []);
	if (!baseKeys.length) continue;

	const added = new Set(keys.filter((key) => !baseKeys.includes(key)));
	const wrong = misplaced(keys, added);
	if (!wrong.length) continue;

	const entry = { file, misplaced: wrong, fixed: false };
	if (fix) {
		const branchKeys = keys.filter((key) => added.has(key));
		const next = moveToEnd(current, branchKeys);
		if (next && topKeys(next)) {
			writeFileSync(join(repo, file), next);
			entry.fixed = true;
		} else {
			entry.reason = "Some branch key is not a single top-level line: move it by hand.";
		}
	}
	report.push(entry);
}

const pending = report.filter((entry) => !entry.fixed);
console.log(JSON.stringify({ ok: pending.length === 0, base, mergeBase, files: report }, null, 2));
process.exit(pending.length ? 1 : 0);
