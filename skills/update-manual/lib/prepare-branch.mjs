/**
 * Prepara la rama de trabajo en el repo del manual antes de escribir nada ahí.
 *
 * La documentación de un desarrollo no se escribe sobre lo que estuviera activo en el repo del
 * manual: nace de `qa` fresco, igual que una rama de desarrollo, para que el MR del manual sea
 * revisable por separado y no arrastre lo que otro haya dejado a medias.
 *
 * Solo hace fast-forward al poner `qa` al día (mismo criterio que `update-branches.mjs`): si
 * divergió o tiene commits propios, no se toca y se avisa.
 *
 * Uso:
 *   node prepare-branch.mjs --project aio --nombre feature/10842-fabian-originDesa-Filtro
 *   node prepare-branch.mjs --project aio --nombre <rama> --base qa   (--base es el valor por defecto)
 *   node prepare-branch.mjs --project aio --nombre <rama> --dry-run
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolveManualRoot } from "./manual.mjs";

/** Corre git. `ok` dice si tuvo éxito; nunca lanza. */
function git(repo, args) {
	try {
		return { ok: true, out: execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
	}
	catch (error) {
		return { ok: false, out: (error.stderr ?? error.stdout ?? error.message ?? "").toString().trim() };
	}
}

function arg(name) {
	const i = process.argv.indexOf(`--${name}`);

	return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
	const project = arg("project");
	const nombre = arg("nombre");
	const base = arg("base") ?? "qa";
	const dryRun = process.argv.includes("--dry-run");

	if (!project || !nombre) {
		console.error("Uso: node prepare-branch.mjs --project <clave> --nombre <rama> [--base qa] [--dry-run]");
		process.exit(1);
	}

	const profilePath = join(homedir(), ".claude", "brain", "projects", project, "manual", "profile.mjs");

	if (!existsSync(profilePath)) {
		console.error(`El proyecto "${project}" no tiene flujo de manual (falta ${profilePath}).`);
		process.exit(1);
	}

	const { PROFILE } = await import(profilePath);
	const manualRoot = resolveManualRoot(PROFILE);

	console.log(`Manual: ${manualRoot}`);

	if (git(manualRoot, ["status", "--porcelain"]).out) {
		console.error(`Hay cambios sin commitear en ${manualRoot}. Resuélvelos antes de cambiar de rama.`);
		process.exit(1);
	}

	const fetch = git(manualRoot, ["fetch", "--all", "--prune", "--quiet"]);

	if (!fetch.ok) {
		console.error(`No se pudo traer del remoto: ${fetch.out.split("\n")[0]}`);
		process.exit(1);
	}

	// Poner `base` al día: fast-forward si es la rama actual, o mover la referencia local si no.
	const current = git(manualRoot, ["branch", "--show-current"]).out;
	const upstream = git(manualRoot, ["rev-parse", "--abbrev-ref", `${base}@{upstream}`]);

	if (upstream.ok) {
		const behind = git(manualRoot, ["rev-list", "--count", `${base}..${upstream.out}`]).out;
		const ahead = git(manualRoot, ["rev-list", "--count", `${upstream.out}..${base}`]).out;

		if (ahead !== "0") {
			console.error(`"${base}" tiene ${ahead} commit(s) que no están en ${upstream.out}. Revísalo a mano antes de seguir.`);
			process.exit(1);
		}

		if (behind !== "0") {
			if (dryRun) {
				console.log(`  [dry-run] pondría "${base}" al día (+${behind}) desde ${upstream.out}`);
			}
			else if (current === base) {
				const merged = git(manualRoot, ["merge", "--ff-only", upstream.out]);

				if (!merged.ok) {
					console.error(`No se pudo adelantar "${base}": ${merged.out.split("\n")[0]}`);
					process.exit(1);
				}
				console.log(`  "${base}" adelantada (+${behind})`);
			}
			else {
				const remote = upstream.out.includes("/") ? upstream.out.slice(0, upstream.out.indexOf("/")) : "origin";
				const remoteBranch = upstream.out.slice(remote.length + 1);
				const advanced = git(manualRoot, ["fetch", remote, `${remoteBranch}:${base}`]);

				if (!advanced.ok) {
					console.error(`No se pudo adelantar "${base}": ${advanced.out.split("\n").pop()}`);
					process.exit(1);
				}
				console.log(`  "${base}" adelantada (+${behind})`);
			}
		}
		else {
			console.log(`  "${base}" ya está al día`);
		}
	}
	else {
		console.warn(`  Aviso: "${base}" no sigue a ninguna rama remota en ${manualRoot}; no se pudo comprobar si está al día.`);
	}

	const existsLocal = git(manualRoot, ["rev-parse", "--verify", "--quiet", nombre]).ok;

	if (existsLocal) {
		if (dryRun) {
			console.log(`  [dry-run] git switch ${nombre}`);
			return;
		}

		const switched = git(manualRoot, ["switch", nombre]);

		console.log(switched.ok ? `  ${nombre}: ya existía, activada` : `  FALLÓ al activar "${nombre}": ${switched.out.split("\n")[0]}`);
		if (!switched.ok) process.exit(1);

		return;
	}

	if (dryRun) {
		console.log(`  [dry-run] git switch -c ${nombre} ${base}`);
		return;
	}

	const created = git(manualRoot, ["switch", "-c", nombre, base]);

	console.log(created.ok ? `  ${nombre}: creada y activa` : `  FALLÓ al crear "${nombre}": ${created.out.split("\n")[0]}`);
	if (!created.ok) process.exit(1);
}

main();
