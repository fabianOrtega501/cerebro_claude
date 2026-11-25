#!/usr/bin/env node
/**
 * PreToolUse (Bash): commits go without `Co-Authored-By`. Denies a `git commit` whose message has it and a `git push`
 * of own commits (author = `git config user.email`) that have it. Absorbed from main-brain `development` 0.5.0.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

const TRAILER = /co-authored-by:\s*\S/i;

const GIT_OPTIONS = String.raw`(?:\s+(?:-C|-c)\s+(?:"[^"]*"|'[^']*'|\S+)|\s+--?[\w-]+(?:=\S+)?)*`;

const COMMIT = new RegExp(String.raw`\bgit${GIT_OPTIONS}\s+commit\b`);

const PUSH = new RegExp(String.raw`\bgit(${GIT_OPTIONS})\s+push\b([^;&|\n]*)`);

const WITH_VALUE = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);

/** Hook event from stdin, or `{}` if missing or not JSON. */
function readEvent() {
	try {
		return JSON.parse(readFileSync(0, "utf8") || "{}");
	}
	catch {
		return {};
	}
}

/** Denies the tool in a PreToolUse with the reason for Claude. */
function deny(reason) {
	process.stdout.write(JSON.stringify({
		hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
	}));
}

/** Runs git in a folder and returns stdout, or `null` if it fails. */
function git(dir, args) {
	const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

	return result.status === 0 ? result.stdout : null;
}

/** Path written in the command, unquoted and with `~` expanded, resolved against `base`. */
function realPath(path, base) {
	const clean = path.replace(/^["']|["']$/g, "").replace(/^~(?=[\\/]|$)/, homedir());

	return isAbsolute(clean) ? clean : resolve(base, clean);
}

/** Repo folder the command runs in: `-C`, else the last `cd`, else the working directory. */
function repoDir(command, options, cwd) {
	const withC = /-C\s+("[^"]*"|'[^']*'|\S+)/.exec(options ?? "");
	if (withC)
		return realPath(withC[1], cwd);

	const cds = [...command.matchAll(/(?:^|[;&|]\s*)cd\s+("[^"]*"|'[^']*'|[^\s;&|]+)/g)];

	return cds.length ? realPath(cds.at(-1)[1], cwd) : cwd;
}

/** File content, or empty if it cannot be read. */
function readIfExists(path) {
	try {
		return path ? readFileSync(path, "utf8") : "";
	}
	catch {
		return "";
	}
}

/** Reason to deny a `git commit` whose message (inline or `-F`) has the trailer, or `null`. */
function checkCommit(command, cwd) {
	const file = /(?:\s-F\s*|\s--file[=\s])("[^"]*"|'[^']*'|[^\s;&|]+)/.exec(command);
	const path = file && file[1] !== "-" ? realPath(file[1], repoDir(command, "", cwd)) : null;

	return TRAILER.test(command + readIfExists(path))
		? "El mensaje del commit trae «Co-Authored-By». Quítalo: los commits van sin coautor."
		: null;
}

/** Branch or commit the push uploads (HEAD if not given). */
function pushSource(args) {
	const parts = args.trim().split(/\s+/);
	const positional = parts.filter((arg, i) => arg && !arg.startsWith("-") && !WITH_VALUE.has(parts[i - 1]));

	return (positional[1] ?? "").replace(/^\+/, "").split(":")[0] || "HEAD";
}

/** Reason to deny a `git push` of own commits that have the trailer, or `null`. */
function checkPush(push, command, cwd) {
	const dir = repoDir(command, push[1], cwd);
	const email = (git(dir, ["config", "user.email"]) ?? "").trim().toLowerCase();
	const log = git(dir, ["log", "--max-count=500", "--format=%h%x00%ae%x00%B%x1e", pushSource(push[2]), "--not", "--remotes"]);
	const withTrailer = (log ?? "").split("\x1e")
		.map(record => record.trim().split("\x00"))
		.filter(([hash, author, body]) => hash && (!email || author.toLowerCase() === email) && TRAILER.test(body ?? ""))
		.map(([hash]) => hash);

	return withTrailer.length
		? `Commits propios por subir con «Co-Authored-By»: ${withTrailer.join(", ")}. Quita el trailer antes del push (amend si es el último, rebase si son varios).`
		: null;
}

const event = readEvent();
const command = String(event.tool_input?.command ?? "");
const cwd = event.cwd ?? process.cwd();

if (event.tool_name === "Bash") {
	const push = PUSH.exec(command);
	const reasons = [COMMIT.test(command) ? checkCommit(command, cwd) : null, push ? checkPush(push, command, cwd) : null].filter(Boolean);

	if (reasons.length)
		deny(reasons.join(" | "));
}
