/**
 * Corre los checks que el proyecto declara en `stack.json` y dice cuales fallaron.
 *
 * Traduce el gestor de paquetes al que de verdad esta instalado: el `stack.json` del AIO pide
 * `pnpm typecheck`, pero si en la maquina solo hay npm eso muere con "orden no encontrada" y
 * parece un fallo del codigo. Se traduce en silencio y se deja constancia en `ranAs`.
 *
 * Sale con codigo 1 si algun check fallo, para poder encadenarlo.
 *
 * Uso:
 *   node run-checks.mjs --repo /ruta --check "pnpm typecheck" --check "pnpm lint"
 *   node run-checks.mjs --repo /ruta --with-build    agrega el build, que es el que compila de verdad
 */

import { execFileSync, execSync } from "node:child_process";

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
 * Reescribe un check al gestor disponible. `pnpm lint` -> `npm run lint` cuando no hay pnpm.
 * Los comandos propios de npm (`install`, `ci`) no llevan `run`.
 */
function adapt(check) {
	if (!check.startsWith("pnpm ") || has("pnpm")) return check;

	const rest = check.slice(5).trim();
	const native = ["install", "ci", "exec", "dlx"];

	return native.includes(rest.split(/\s+/)[0]) ? `npm ${rest}` : `npm run ${rest}`;
}

const args = process.argv.slice(2);
const repo = args.includes("--repo") ? args[args.indexOf("--repo") + 1] : process.cwd();

const checks = args.reduce((acc, arg, i) => (arg === "--check" ? [...acc, args[i + 1]] : acc), []);

if (args.includes("--with-build")) checks.push("pnpm build");

const results = [];

for (const check of checks) {
	const command = adapt(check);
	const started = Date.now();

	try {
		const out = execSync(command, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600000 });

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
