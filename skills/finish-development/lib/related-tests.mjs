/**
 * Runs the unit tests related to the files the branch changed, and fails only on new failures.
 *
 * Failures that also happen on the merge base are inherited: they are reported, not blocking.
 *
 * Usage:
 *   node related-tests.mjs --repo /path [--base origin/desa]
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SOURCE = /\.(ts|tsx|js|mjs|vue)$/;

const args = process.argv.slice(2);
const option = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const repo = path.resolve(option("--repo") ?? process.cwd());

/**
 * Runs git in the repo and returns its trimmed output.
 *
 * @param {string[]} gitArgs
 * @returns {string}
 */
function git(gitArgs) {
	return execFileSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8" }).trim();
}

/**
 * Base ref from `--base` or from the branch name (`originDesa` -> `origin/desa`).
 *
 * @returns {string | null}
 */
function baseRef() {
	if (option("--base")) return option("--base");

	const match = /origin([A-Za-z]+)/.exec(git(["rev-parse", "--abbrev-ref", "HEAD"]));

	return match ? `origin/${match[1].toLowerCase()}` : null;
}

/**
 * Failed tests from a vitest run, as `file › name` keys relative to the run root.
 *
 * @param {string} cwd - Where vitest runs.
 * @param {string[]} vitestArgs - Subcommand and files.
 * @returns {{ keys: string[], ran: number, error: string | null }}
 */
function runVitest(cwd, vitestArgs) {
	const report = path.join(mkdtempSync(path.join(tmpdir(), "related-tests-")), "report.json");
	const run = spawnSync("npx", ["vitest", ...vitestArgs, "--run", "--passWithNoTests", "--reporter=json", `--outputFile=${report}`], {
		cwd,
		encoding: "utf8",
		timeout: 600000,
	});

	if (!existsSync(report)) return { keys: [], ran: 0, error: `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-15).join("\n") };

	const data = JSON.parse(readFileSync(report, "utf8"));
	const keys = data.testResults.flatMap((file) =>
		file.assertionResults.filter((test) => test.status === "failed").map((test) => `${path.relative(cwd, file.name)} › ${test.fullName}`),
	);

	rmSync(path.dirname(report), { recursive: true, force: true });

	return { keys, ran: data.numTotalTests, error: null };
}

/**
 * Failures of the given spec files on the merge base, run in a temporary worktree.
 *
 * @param {string} mergeBase - Commit to check out.
 * @param {string[]} specs - Spec files relative to the repo.
 * @returns {string[]}
 */
function failuresOnBase(mergeBase, specs) {
	const tree = mkdtempSync(path.join(tmpdir(), "related-base-"));

	try {
		git(["worktree", "add", "--detach", tree, mergeBase]);
		symlinkSync(path.join(repo, "node_modules"), path.join(tree, "node_modules"));

		const present = specs.filter((spec) => existsSync(path.join(tree, spec)));

		return present.length ? runVitest(tree, ["run", ...present]).keys : [];
	}
	finally {
		spawnSync("git", ["-C", repo, "worktree", "remove", "--force", tree]);
		rmSync(tree, { recursive: true, force: true });
	}
}

const base = baseRef();

if (!base) {
	console.log(JSON.stringify({ repo, ok: false, error: "No base: pass --base origin/<branch>." }, null, 2));
	process.exit(1);
}

const mergeBase = git(["merge-base", base, "HEAD"]);
const changed = [
	...git(["diff", "--name-only", mergeBase]).split("\n"),
	...git(["ls-files", "--others", "--exclude-standard"]).split("\n"),
].filter((file) => SOURCE.test(file) && existsSync(path.join(repo, file)));

if (!changed.length) {
	console.log(JSON.stringify({ repo, base, ok: true, skipped: "No source files changed." }, null, 2));
	process.exit(0);
}

const current = runVitest(repo, ["related", ...new Set(changed)]);

if (current.error) {
	console.log(JSON.stringify({ repo, base, ok: false, error: current.error }, null, 2));
	process.exit(1);
}

const specs = [...new Set(current.keys.map((key) => key.split(" › ")[0]))];
const inherited = current.keys.length ? new Set(failuresOnBase(mergeBase, specs)) : new Set();
const newFailures = current.keys.filter((key) => !inherited.has(key));

console.log(
	JSON.stringify(
		{ repo, base, changed: changed.length, testsRun: current.ran, ok: newFailures.length === 0, newFailures, inheritedFailures: [...inherited] },
		null,
		2,
	),
);

process.exit(newFailures.length ? 1 : 0);
