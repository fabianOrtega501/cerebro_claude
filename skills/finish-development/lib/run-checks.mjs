/**
 * Corre los checks que el proyecto declara en `stack.json` y dice cuales fallaron.
 *
 * Traduce el gestor de paquetes al que declara el lockfile del repo (o al instalado, si no hay
 * lockfile) y, si el repo trae `.nvmrc`, corre con esa version de Node. Queda en `ranAs`.
 *
 * Sale con codigo 1 si algun check fallo, para poder encadenarlo.
 *
 * Uso:
 *   node run-checks.mjs --repo /ruta --check "pnpm typecheck" --check "pnpm lint"
 *   node run-checks.mjs --repo /ruta --with-build    agrega el build, que es el que compila de verdad
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** `true` si el ejecutable existe en el PATH. */
function has(binary) {
	try {
		execFileSync("sh", ["-c", `command -v ${binary}`], { stdio: "ignore" });

		return true;
	}
	catch {
		return false;
	}
}

/**
 * Package manager for the repo, from its lockfile; without one, pnpm if installed, else npm.
 * @param {string} repo
 * @returns {"pnpm"|"yarn"|"npm"}
 */
function managerOf(repo) {
	if (existsSync(join(repo, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(repo, "yarn.lock"))) return "yarn";
	if (existsSync(join(repo, "package-lock.json"))) return "npm";

	return has("pnpm") ? "pnpm" : "npm";
}

/**
 * Rewrites a `pnpm`/`npm`/`yarn` check to the repo manager, inside `nvm use` when there is `.nvmrc`.
 * @param {string} check
 * @param {string} repo
 * @returns {string}
 */
function adapt(check, repo) {
	const [tool, ...rest] = check.trim().split(/\s+/);
	let command = check;

	if (["pnpm", "npm", "yarn"].includes(tool)) {
		const manager = managerOf(repo);
		const args = rest[0] === "run" ? rest.slice(1) : rest;
		const native = ["install", "ci", "add"];

		if (manager !== "npm") command = `${manager} ${args.join(" ")}`;
		else if (["exec", "dlx"].includes(args[0])) command = `npx ${args.slice(1).join(" ")}`;
		else command = native.includes(args[0]) ? `npm ${args.join(" ")}` : `npm run ${args.join(" ")}`;
	}

	const nvm = join(process.env.NVM_DIR ?? join(homedir(), ".nvm"), "nvm.sh");

	return existsSync(join(repo, ".nvmrc")) && existsSync(nvm) ? `. "${nvm}"; nvm use >/dev/null 2>&1; ${command}` : command;
}

const args = process.argv.slice(2);
const repo = args.includes("--repo") ? args[args.indexOf("--repo") + 1] : process.cwd();

const checks = args.reduce((acc, arg, i) => (arg === "--check" ? [...acc, args[i + 1]] : acc), []);

if (args.includes("--with-build")) checks.push(`${managerOf(repo)} run build`);

const results = [];

for (const check of checks) {
	const command = adapt(check, repo);
	const started = Date.now();

	try {
		const out = execSync(command, { cwd: repo, shell: "/bin/bash", encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600000 });

		results.push({ check, ranAs: command, ok: true, seconds: Math.round((Date.now() - started) / 1000), tail: out.trim().split("\n").slice(-5).join("\n") });
	}
	catch (error) {
		// La salida util de un typecheck que falla esta en stdout, no en stderr.
		const output = ((error.stdout ?? "") + (error.stderr ?? "")).toString().trim();

		results.push({ check, ranAs: command, ok: false, seconds: Math.round((Date.now() - started) / 1000), tail: output.split("\n").slice(-25).join("\n") });
	}
}

console.log(JSON.stringify({ repo, results, allPassed: results.every(r => r.ok) }, null, 2));

process.exit(results.every(r => r.ok) ? 0 : 1);
