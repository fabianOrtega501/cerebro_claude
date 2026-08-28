/**
 * Clasifica lo que hay sin commitear para que nadie haga `git add .` a ciegas.
 *
 * Separa lo que escribiste de lo que escribio una herramienta (`auto-imports.d.ts`, lockfiles) y
 * marca lo que huele mal (`console.log`, posibles credenciales, `.env`). No decide nada ni toca
 * el indice: devuelve el reparto en JSON y la decision se toma arriba, con el usuario.
 *
 * Los generados NO se excluyen solos a proposito. A veces deben ir —si agregaste un componente,
 * `components.d.ts` cambia de verdad— y colarlos o dejarlos fuera por regla fija rompe una de las
 * dos situaciones. Se marcan para que se decidan una por una.
 *
 * Uso:
 *   node classify-changes.mjs            en el repo actual
 *   node classify-changes.mjs --repo /ruta
 */

import { execFileSync } from "node:child_process";

/** Nombres que casi siempre los reescribe una herramienta, no una persona. */
const GENERATED = [
	/^auto-imports\.d\.ts$/,
	/^components\.d\.ts$/,
	/^typed-router\.d\.ts$/,
	/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock)$/,
];

/** Rastros que no deberian viajar en un commit. El `hint` explica por que se marca. */
const SMELLS = [
	{ pattern: /^\+.*console\.log\(/, hint: "console.log sin quitar" },
	{ pattern: /^\+.*\bdd\(|^\+.*\bdump\(/, hint: "dd()/dump() de depuracion" },
	{ pattern: /^\+.*(password|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']{6,}/i, hint: "posible credencial escrita a mano" },
	{ pattern: /^\+.*\b(?:\d{1,3}\.){3}\d{1,3}\b/, hint: "IP absoluta en el codigo" },
	{ pattern: /^\+.*debugger\b/, hint: "debugger olvidado" },
];

/** Corre git y devuelve stdout. Cadena vacia si falla. */
function git(repo, args) {
	try {
		return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
	}
	catch {
		return "";
	}
}

/**
 * Lineas anadidas que encajan con algun `SMELLS`, agrupadas por archivo.
 * Solo mira el diff de trabajo + indice: lo ya commiteado no es asunto de este paso.
 */
function findSmells(repo, files) {
	const found = [];

	for (const file of files) {
		const diff = git(repo, ["diff", "HEAD", "--unified=0", "--", file]);

		for (const line of diff.split("\n")) {
			if (!line.startsWith("+") || line.startsWith("+++")) continue;

			for (const smell of SMELLS) {
				if (smell.pattern.test(line)) found.push({ file, hint: smell.hint, line: line.slice(1).trim().slice(0, 120) });
			}
		}
	}

	return found;
}

const args = process.argv.slice(2);
const repo = args.includes("--repo")
	? args[args.indexOf("--repo") + 1]
	: execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

const entries = git(repo, ["status", "--porcelain"]).split("\n").filter(Boolean).map((line) => {
	// El formato es `XY <ruta>`; los renombrados llegan como `R  viejo -> nuevo`.
	const status = line.slice(0, 2);
	const path = line.slice(3).replace(/^.* -> /, "");

	return { status, path, staged: status[0] !== " " && status[0] !== "?", untracked: status.startsWith("??") };
});

const generated = entries.filter(e => GENERATED.some(rx => rx.test(e.path)));
const code = entries.filter(e => !generated.includes(e));

console.log(JSON.stringify({
	repo,
	total: entries.length,
	code,
	generated,
	smells: findSmells(repo, code.filter(e => !e.untracked).map(e => e.path)),
	untracked: entries.filter(e => e.untracked).map(e => e.path),
}, null, 2));
