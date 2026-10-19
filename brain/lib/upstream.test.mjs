/** Tests of upstream.mjs over throwaway git repos and a fake home. Run: node --test --experimental-test-module-mocks <this file>. */
import { after, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "upstream-test-"));
const HOME = join(ROOT, "home");
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };

/** Runs git in `cwd` and returns its trimmed output. */
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** Writes `files` (`{ path: content }`) under `dir` and commits them. */
const commit = (dir, files, message = "change") => {
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), content);
	}

	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", message);
};

describe("upstream", () => {
	const plain = join(ROOT, "plain");
	const origin = join(ROOT, "origin.git");
	const seed = join(ROOT, "seed");
	const clone = join(ROOT, "clone");
	let up;
	let mocked;

	before(async () => {
		mkdirSync(join(HOME, ".claude", "brain"), { recursive: true });

		mkdirSync(plain);
		git(plain, "init", "-q", "-b", "desa");
		commit(plain, { ".claude/skills/a/SKILL.md": "a\n", "src/app.js": "x\n" });

		git(ROOT, "init", "-q", "--bare", "-b", "qa", origin);
		git(ROOT, "clone", "-q", origin, seed);
		git(seed, "checkout", "-q", "-b", "qa");
		commit(seed, { "plugins/dev/skills/t/SKILL.md": "v1\n", ".claude-plugin/marketplace.json": "{}\n", "README.md": "r\n" });
		git(seed, "push", "-q", "origin", "qa");
		git(ROOT, "clone", "-q", "-b", "qa", origin, clone);

		writeFileSync(join(HOME, ".claude", "brain", "projects.json"), JSON.stringify({
			projects: {
				work: { repos: [plain] },
				"main-brain": { repos: [clone], upstream: { ref: "origin/qa", paths: ["plugins", ".claude-plugin"] } },
			},
		}));

		mocked = mock.module("node:os", { exports: { homedir: () => HOME, tmpdir } });
		up = await import("./upstream.mjs?test");
	});

	after(() => {
		mocked.restore();
		rmSync(ROOT, { recursive: true, force: true });
	});

	it("plain repo watches .claude", () => {
		assert.deepEqual(up.watchOf(plain), { ref: "HEAD", paths: [".claude"], remote: false });
		assert.equal(up.currentTree(plain), git(plain, "rev-parse", "HEAD:.claude"));
		assert.equal(up.fetchWatched(plain), null);
		assert.equal(up.inspect(plain).status, "unwatched");

		up.markReviewed(plain);

		assert.equal(up.inspect(plain).status, "clean");
		assert.ok(existsSync(join(up.upstreamPaths(plain).snapshot, "skills", "a", "SKILL.md")));

		commit(plain, { ".claude/skills/b/SKILL.md": "b\n" });

		assert.equal(up.inspect(plain).status, "changed");
		assert.deepEqual(up.changedFiles(plain, up.inspect(plain).since), ["A\t.claude/skills/b/SKILL.md"]);
	});

	it("remote repo watches its branch", () => {
		assert.deepEqual(up.watchOf(clone), { ref: "origin/qa", paths: ["plugins", ".claude-plugin"], remote: true });
		assert.equal(up.resolveTarget("main-brain"), clone);
		assert.deepEqual(up.liveFiles(clone), [".claude-plugin/marketplace.json", "plugins/dev/skills/t/SKILL.md"]);
		assert.equal(up.readLive(clone, "plugins/dev/skills/t/SKILL.md"), "v1\n");

		up.markReviewed(clone);

		const snapshot = up.upstreamPaths(clone).snapshot;

		assert.equal(up.inspect(clone).status, "clean");
		assert.equal(readFileSync(join(snapshot, "plugins/dev/skills/t/SKILL.md"), "utf8"), "v1\n");
		assert.equal(existsSync(join(snapshot, "README.md")), false);
	});

	it("local feature branch is not a change", () => {
		git(clone, "checkout", "-q", "-b", "feature/mine");
		commit(clone, { "plugins/dev/skills/mine/SKILL.md": "mine\n" });

		assert.equal(up.inspect(clone).status, "clean");
	});

	it("change appears after fetch", () => {
		commit(seed, { "plugins/dev/skills/t/SKILL.md": "v2\n", "plugins/dev/skills/n/SKILL.md": "n\n" });
		git(seed, "push", "-q", "origin", "qa");

		assert.equal(up.inspect(clone).status, "clean");
		assert.equal(up.fetchWatched(clone), true);

		const { status, since } = up.inspect(clone);

		assert.equal(status, "changed");
		assert.deepEqual(up.changedFiles(clone, since).sort(), ["A\tplugins/dev/skills/n/SKILL.md", "M\tplugins/dev/skills/t/SKILL.md"]);
		assert.equal(up.readLive(clone, "plugins/dev/skills/t/SKILL.md"), "v2\n");
	});

	it("dismissed version stays quiet", () => {
		up.markDismissed(clone);

		assert.equal(up.inspect(clone).status, "dismissed");
	});
});
