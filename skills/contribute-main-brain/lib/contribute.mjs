/**
 * Mechanical steps of contribute-main-brain on the main-brain clone: start a branch, check for personal leaks, validate.
 * Usage: node contribute.mjs start <slug> | check | validate [plugin]
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveTarget } from "../../../brain/lib/upstream.mjs";

const BASE = "origin/qa";

const LEAKS = [
	[/\/home\/[^/\s]+|\/datos\/proyectos/, "ruta de esta maquina"],
	[/~\/\.claude|\.claude\/brain|brain\/lib\/|brain\/projects/, "pieza del cerebro personal"],
	[/secrets\.env|credentialsFor|dbConnection|assertEnvironment/, "credenciales o ambientes del cerebro"],
	[/ticket-context|hu-pdf-guard|practice-ticket|start-development|finish-development/, "skill o hook personal"],
	[/@datint\.co|fabian\.ortega|fabianOrtega/i, "dato personal"],
	[/(PASSWORD|TOKEN|SECRET)\s*[=:]\s*['"]?\w{6,}/, "posible credencial"],
];

/** Runs git in the clone; returns trimmed stdout or throws with git's message. */
function git(repo, ...args) {
	return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Prints a message to stderr and exits with `code`. */
function fail(message, code = 1) {
	console.error(message);
	process.exit(code);
}

/** Claude Code CLI: `CLAUDE_BIN`, `claude` on the PATH, or the newest binary bundled with the VS Code extension. */
function claudeBin() {
	if (process.env.CLAUDE_BIN)
		return process.env.CLAUDE_BIN;

	if (spawnSync("sh", ["-c", "command -v claude"]).status === 0)
		return "claude";

	const extensions = join(homedir(), ".vscode", "extensions");
	const newest = (existsSync(extensions) ? readdirSync(extensions) : [])
		.filter(d => d.startsWith("anthropic.claude-code-"))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		.at(-1);

	return newest ? join(extensions, newest, "resources", "native-binary", "claude") : null;
}

/** Fetches, refuses with local changes, and creates `feature/<slug>` from `origin/qa`. */
function start(repo, slug) {
	if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug))
		fail("Uso: contribute.mjs start <slug-en-kebab-case>   (queda feature/<slug>)", 2);

	git(repo, "fetch", "--quiet", "origin");

	if (git(repo, "status", "--porcelain"))
		fail(`El clon ${repo} tiene cambios sin commitear. Resuelvelos antes de abrir otra rama.`);

	const branch = `feature/${slug}`;

	if (git(repo, "branch", "--list", branch))
		fail(`La rama ${branch} ya existe en el clon.`);

	git(repo, "switch", "--quiet", "--no-track", "-c", branch, BASE);
	console.log(`Rama ${branch} creada desde ${BASE} (${git(repo, "rev-parse", "--short", BASE)}).`);
}

/** Lines added on the branch (committed, staged, unstaged or untracked) that look personal; exits 1 if any. */
function check(repo) {
	const added = git(repo, "diff", BASE, "--unified=0", "--no-color")
		.split("\n")
		.reduce((acc, line) => {
			if (line.startsWith("+++ b/")) acc.file = line.slice(6);
			else if (line.startsWith("+") && !line.startsWith("+++")) acc.lines.push([acc.file, line.slice(1)]);

			return acc;
		}, { file: null, lines: [] }).lines;

	for (const file of git(repo, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean))
		for (const line of readFileSync(join(repo, file), "utf8").split("\n"))
			added.push([file, line]);

	const hits = added.flatMap(([file, line]) => LEAKS.filter(([pattern]) => pattern.test(line)).map(([, why]) => `${file}: [${why}] ${line.trim().slice(0, 140)}`));

	if (!hits.length)
		return console.log(`Sin rastros personales en lo agregado frente a ${BASE}.`);

	console.log(hits.join("\n"));
	fail(`\n${hits.length} linea(s) para revisar antes del commit.`);
}

/** Runs `claude plugin validate` on the marketplace and, if given, on one plugin with `--strict`. */
function validate(repo, plugin) {
	const bin = claudeBin();

	if (!bin)
		fail("No encontre el CLI de Claude Code: define CLAUDE_BIN con su ruta.");

	const runs = [["plugin", "validate", "."], ...(plugin ? [["plugin", "validate", `./plugins/${plugin}`, "--strict"]] : [])];

	for (const args of runs) {
		console.log(`$ claude ${args.join(" ")}`);

		if (spawnSync(bin, args, { cwd: repo, stdio: "inherit" }).status !== 0)
			fail("La validacion fallo.");
	}
}

const repo = resolveTarget("main-brain");

if (!repo || !existsSync(repo))
	fail("main-brain no esta registrado en brain/projects.json o su clon no existe.");

const [command, arg] = process.argv.slice(2);

if (command === "start") start(repo, arg);
else if (command === "check") check(repo);
else if (command === "validate") validate(repo, arg);
else fail("Uso: contribute.mjs start <slug> | check | validate [plugin]", 2);
