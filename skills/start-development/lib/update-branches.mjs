/**
 * Pone al día todas las ramas locales de uno o varios repos, sin tocar el trabajo en curso.
 *
 * Existe para que una rama de desarrollo nazca siempre de un origen fresco. Crear una rama desde
 * una base atrasada no falla en el momento: falla más tarde, al mezclar, con conflictos que no
 * eran necesarios.
 *
 * **Solo hace fast-forward.** Es decir: mueve el puntero de la rama local hacia adelante cuando
 * el remoto avanzó y la local no tiene commits propios. Si la rama divergió o tiene trabajo sin
 * subir, git se niega y aquí se reporta sin tocarla. Nunca fusiona, nunca rebasa, nunca
 * descarta: no puede perder trabajo.
 *
 * Uso:
 *   `node update-branches.mjs --project aio`   los repos del proyecto, incluidos los compartidos
 *   `node update-branches.mjs /ruta/a/repo …`  repos concretos
 *   `node update-branches.mjs`                 deduce el proyecto del repo actual
 *   `node update-branches.mjs --json`          salida procesable
 *
 * **Preferir siempre `--project`.** Deducir el proyecto del directorio actual es un atajo para
 * uso manual; en el checklist el proyecto lo elige el usuario, no el azar de dónde esté parada
 * la terminal.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { projectOf, reposOf } from "../../../brain/lib/projects.mjs";

/**
 * Repos que hay que poner al dia para un proyecto: los suyos mas los ajenos con los que trabaja.
 * AMI comparte `aio-backend`; sin esto su base quedaria atrasada y la rama naceria mal.
 */
function reposToUpdate(project) {
	const own = reposOf(project);
	const stackFile = join(homedir(), ".claude", "brain", "projects", project, "stack", "stack.json");

	if (!existsSync(stackFile)) return own;

	try {
		const declared = (JSON.parse(readFileSync(stackFile, "utf8")).repos ?? []).map(r => r.path).filter(existsSync);

		return [...new Set([...own, ...declared])];
	}
	catch {
		return own;
	}
}

/**
 * Corre git en un repo.
 *
 * @returns {{ok: boolean, out: string}} `ok` dice si el comando tuvo éxito; `out` trae la salida
 *   o el mensaje de error. No lanza nunca: un fallo en un repo no debe abortar el resto.
 */
function git(repo, args) {
	try {
		return { ok: true, out: execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
	}
	catch (error) {
		return { ok: false, out: (error.stderr ?? error.stdout ?? error.message ?? "").toString().trim() };
	}
}

/** Repos del proyecto al que pertenece el directorio actual, o el repo actual suelto. */
function reposOfCurrentProject() {
	const project = projectOf();

	if (project) return reposOf(project);

	const here = git(process.cwd(), ["rev-parse", "--show-toplevel"]);

	return here.ok ? [here.out] : [];
}

/**
 * Actualiza un repo entero.
 *
 * La rama **actual** se adelanta con `merge --ff-only`, porque es la única que tiene archivos
 * desplegados en disco. Las demás con `fetch origin rama:rama`, que actualiza la referencia
 * local directamente y **rechaza por diseño** cualquier avance que no sea fast-forward: es la
 * forma segura de poner al día ramas en las que no estás parado.
 *
 * @returns Resumen con las ramas adelantadas, las que ya estaban al día y las que no se pudieron
 *   tocar (con el motivo). Un repo con cambios sin commitear se actualiza igual, salvo su rama
 *   actual: cambiar el árbol de trabajo bajo los pies del usuario sería peor que no actualizar.
 */
function updateRepo(repo) {
	const result = { repo, current: null, dirty: false, fetched: false, advanced: [], upToDate: [], skipped: [] };

	const current = git(repo, ["branch", "--show-current"]);

	result.current = current.ok ? current.out : null;
	result.dirty = (git(repo, ["status", "--porcelain"]).out ?? "").length > 0;

	const fetch = git(repo, ["fetch", "--all", "--prune", "--quiet"]);

	result.fetched = fetch.ok;

	if (!fetch.ok) {
		result.skipped.push({ branch: "(todo el repo)", reason: `no se pudo traer del remoto: ${fetch.out.split("\n")[0]}` });

		return result;
	}

	// Solo las ramas que siguen a una remota: una rama puramente local no tiene con qué compararse.
	const listed = git(repo, ["for-each-ref", "--format=%(refname:short)\t%(upstream:short)", "refs/heads"]);

	for (const line of listed.out.split("\n").filter(Boolean)) {
		const [branch, upstream] = line.split("\t");

		if (!upstream) {
			result.skipped.push({ branch, reason: "no sigue a ninguna rama remota" });
			continue;
		}

		// El `--prune` del fetch borra las referencias remotas que ya no existen, pero la rama
		// local conserva su upstream apuntando al vacío. Sin esta comprobación, el `rev-list` de
		// abajo falla y el motivo que se reporta es el error crudo de git, ilegible.
		if (!git(repo, ["rev-parse", "--verify", "--quiet", upstream]).ok) {
			result.skipped.push({ branch, reason: `su rama remota (${upstream}) ya no existe; seguramente se mezcló y se borró` });
			continue;
		}

		const behind = git(repo, ["rev-list", "--count", `${branch}..${upstream}`]).out;
		const ahead = git(repo, ["rev-list", "--count", `${upstream}..${branch}`]).out;

		if (behind === "0" && ahead === "0") {
			result.upToDate.push(branch);
			continue;
		}

		if (ahead !== "0") {
			result.skipped.push({ branch, reason: behind === "0" ? `tiene ${ahead} commit(s) sin subir` : `divergió: ${ahead} propio(s), ${behind} del remoto` });
			continue;
		}

		if (branch === result.current) {
			if (result.dirty) {
				result.skipped.push({ branch, reason: `${behind} commit(s) atrás, pero hay cambios sin commitear` });
				continue;
			}

			const merged = git(repo, ["merge", "--ff-only", upstream]);

			merged.ok ? result.advanced.push(`${branch} (+${behind})`) : result.skipped.push({ branch, reason: merged.out.split("\n")[0] });
			continue;
		}

		const remote = upstream.includes("/") ? upstream.slice(0, upstream.indexOf("/")) : "origin";
		const remoteBranch = upstream.slice(remote.length + 1);
		const advanced = git(repo, ["fetch", remote, `${remoteBranch}:${branch}`]);

		advanced.ok ? result.advanced.push(`${branch} (+${behind})`) : result.skipped.push({ branch, reason: advanced.out.split("\n").pop() });
	}

	return result;
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const projectIndex = args.indexOf("--project");
const project = projectIndex >= 0 ? args[projectIndex + 1] : null;
const explicit = args.filter((a, i) => !a.startsWith("--") && i !== projectIndex + 1);

let targets;

if (project) {
	targets = reposToUpdate(project);

	if (!targets.length) {
		console.error(`El proyecto "${project}" no existe en projects.json o ninguno de sus repos está clonado.`);
		process.exit(1);
	}
}
else {
	targets = explicit.length ? explicit : reposOfCurrentProject();
}

if (!targets.length) {
	console.error("No se encontró ningún repo que actualizar. Usa --project <clave> o pasa las rutas.");
	process.exit(1);
}

if (project) console.log(`Proyecto: ${project}\n`);

const results = targets.map(updateRepo);

if (asJson) {
	console.log(JSON.stringify(results, null, 2));
	process.exit(0);
}

for (const r of results) {
	console.log(`${r.repo}`);
	console.log(`  rama actual: ${r.current ?? "?"}${r.dirty ? "  (con cambios sin commitear)" : ""}`);

	if (r.advanced.length) console.log(`  adelantadas: ${r.advanced.join(", ")}`);
	if (r.upToDate.length) console.log(`  ya al día:   ${r.upToDate.length} rama(s)`);

	for (const s of r.skipped) console.log(`  sin tocar:   ${s.branch} — ${s.reason}`);

	console.log();
}
