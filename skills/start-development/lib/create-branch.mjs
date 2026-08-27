/**
 * Crea la rama de un desarrollo en uno o varios repos, con el nombre normalizado del equipo.
 *
 * El nombre se arma, no se escribe a mano, porque la parte que importa —de qué rama sale— se
 * codifica **en el propio nombre** (`originDesa`). Un nombre mal puesto miente sobre el origen
 * del trabajo, y eso se descubre al mezclar.
 *
 * Formato:  `<tipo>/<ticket>-fabian-origin<Base>-<Descripcion>`
 * Sin ticket: `<tipo>/fabian-origin<Base>-<Descripcion>`
 *
 * Antes de crear nada comprueba las dos cosas que arruinan el arranque: que el árbol de trabajo
 * esté limpio y que la base esté **sincronizada con su remoto**. Nacer de una base atrasada no
 * falla ahora, falla al mezclar, con conflictos que no eran necesarios.
 *
 * Uso:
 *   node create-branch.mjs --tipo feature --ticket 10842 --base desa \
 *        --desc "Filtro por tipo de vehiculo" --repos /ruta/a --repos /ruta/b
 *   node create-branch.mjs ... --dry-run      solo muestra qué haría
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/** Corre git. `ok` dice si tuvo éxito; nunca lanza. */
function git(repo, args) {
	try {
		return { ok: true, out: execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
	}
	catch (error) {
		return { ok: false, out: (error.stderr ?? error.stdout ?? error.message ?? "").toString().trim() };
	}
}

/**
 * Convierte un texto libre en el trozo del nombre de rama.
 *
 * Quita tildes y `ñ` —una rama con acentos es un dolor en cualquier terminal— y pega las
 * palabras en PascalCase, que es la forma dominante en las ramas del equipo.
 *
 * @param {string} text - Descripción tal como la escribió el usuario
 * @returns {string} Algo como `FiltroPorTipoDeVehiculo`. Cadena vacía si no queda nada útil
 */
export function toBranchWords(text) {
	return (text ?? "")
		.normalize("NFD").replace(/[̀-ͯ]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(word => word[0].toUpperCase() + word.slice(1))
		.join("");
}

/**
 * Arma el nombre completo de la rama.
 *
 * @param {object} parts
 * @param {string} parts.type - `feature` o `hotfix`
 * @param {string} [parts.ticket] - Solo dígitos; si falta, el nombre se arma sin él
 * @param {string} parts.base - Rama de la que sale, tal como se llama en git (`desa`)
 * @param {string} parts.desc - Descripción libre
 * @returns {string} El nombre listo para `git switch -c`
 */
export function branchName({ type, ticket, base, desc }) {
	const origin = `origin${base[0].toUpperCase()}${base.slice(1)}`;
	const middle = ticket ? `${ticket}-fabian` : "fabian";

	return `${type}/${middle}-${origin}-${toBranchWords(desc)}`;
}

// La interfaz de línea de comandos va detrás de esta guarda para que `branchName` y
// `toBranchWords` se puedan importar y probar sin que el script se ejecute.
if (import.meta.url === `file://${process.argv[1]}`) main();

/** Lee un argumento de la línea de comandos; `--repos` puede repetirse. */
function arg(name, { many = false } = {}) {
	const values = [];

	for (let i = 0; i < process.argv.length; i++) {
		if (process.argv[i] === `--${name}`) values.push(process.argv[i + 1]);
	}

	return many ? values : values[0];
}

function main() {
const type = arg("tipo");
const ticket = arg("ticket");
const base = arg("base");
const desc = arg("desc");
const repos = arg("repos", { many: true });
const dryRun = process.argv.includes("--dry-run");

if (!["feature", "hotfix"].includes(type) || !base || !desc || !repos.length) {
	console.error("Uso: node create-branch.mjs --tipo <feature|hotfix> [--ticket <numero>] --base <rama> --desc \"<descripcion>\" --repos <ruta> [--repos <ruta>...] [--dry-run]");
	process.exit(1);
}

if (ticket && !/^\d+$/.test(ticket)) {
	console.error(`El ticket debe ser solo números; llegó "${ticket}".`);
	process.exit(1);
}

const name = branchName({ type, ticket, base, desc });

console.log(`Rama: ${name}\n`);

const problems = [];

// Primero se comprueban TODOS los repos y solo después se crea nada: dejar un repo con la rama
// creada y el otro sin ella es peor que no haber empezado.
for (const repo of repos) {
	if (!existsSync(repo)) {
		problems.push(`${repo}: no existe`);
		continue;
	}

	if (git(repo, ["status", "--porcelain"]).out) problems.push(`${repo}: hay cambios sin commitear`);

	if (!git(repo, ["rev-parse", "--verify", "--quiet", base]).ok) {
		problems.push(`${repo}: no existe la rama base "${base}"`);
		continue;
	}

	const upstream = git(repo, ["rev-parse", "--abbrev-ref", `${base}@{upstream}`]);

	if (upstream.ok && git(repo, ["rev-parse", "--verify", "--quiet", upstream.out]).ok) {
		const behind = git(repo, ["rev-list", "--count", `${base}..${upstream.out}`]).out;

		if (behind !== "0") problems.push(`${repo}: la base "${base}" está ${behind} commit(s) atrás de ${upstream.out}; actualízala antes`);
	}
	else {
		console.log(`  Aviso: en ${repo}, "${base}" no sigue a ninguna rama remota; no se pudo comprobar si está al día.`);
	}

	if (git(repo, ["rev-parse", "--verify", "--quiet", name]).ok) {
		problems.push(`${repo}: la rama "${name}" ya existe`);
	}
	else {
		/*
		 * Git distingue mayúsculas en los nombres de rama, así que `10718-fabian-...` y
		 * `10718-Fabian-...` conviven sin quejarse. Conviven y se confunden: el equipo ha usado
		 * las dos grafías. Y en un clon sobre un sistema de archivos que no distingue —Windows,
		 * macOS por defecto— la creación falla de forma críptica.
		 */
		const twin = git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"])
			.out.split("\n")
			.find(existing => existing.replace(/^origin\//, "").toLowerCase() === name.toLowerCase());

		if (twin) problems.push(`${repo}: ya existe "${twin}", que solo difiere en mayúsculas`);
	}
}

if (problems.length) {
	console.error(`\nNo se creó nada. Hay que resolver esto primero:\n${problems.map(p => `  - ${p}`).join("\n")}`);
	process.exit(1);
}

for (const repo of repos) {
	if (dryRun) {
		console.log(`  [dry-run] ${repo}: git switch -c ${name} ${base}`);
		continue;
	}

	const created = git(repo, ["switch", "-c", name, base]);

	console.log(created.ok ? `  ${repo}: creada y activa` : `  ${repo}: FALLÓ — ${created.out.split("\n")[0]}`);
}

}
