/**
 * Lista los desarrollos iniciados en una ventana de tiempo, barriendo los repos del cerebro salvo
 * los de `EXCLUDED`.
 *
 * Uso:
 *   node collect-developments.mjs                          ultimos 10 dias habiles
 *   node collect-developments.mjs --dias-habiles 20
 *   node collect-developments.mjs --desde 2026-08-26 --hasta 2026-09-09
 *   node collect-developments.mjs --autor fabian --json
 *   node collect-developments.mjs --proyecto aio --proyecto status
 *   node collect-developments.mjs --incluir-manuales
 */

import { execFileSync } from "node:child_process";
import { readProjects } from "../../../brain/lib/projects.mjs";

// El manual no es un desarrollo: documenta uno que ya se cuenta en su propio proyecto. Se recupera
// con `--incluir-manuales` o pidiendolo con `--proyecto`.
const EXCLUDED = new Set(["manuales"]);

/** Corre git en un repo. `ok` dice si tuvo exito; nunca lanza. */
function git(repo, args) {
	try {
		return { ok: true, out: execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
	}
	catch (error) {
		return { ok: false, out: (error.stderr ?? error.stdout ?? error.message ?? "").toString().trim() };
	}
}

/** Fecha `AAAA-MM-DD` en hora local. `toISOString` no sirve: en zonas al oeste devuelve manana. */
function isoDate(date = new Date()) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Fecha `AAAA-MM-DD` de N dias habiles antes de `from`, saltando sabados y domingos. */
function businessDaysAgo(days, from = new Date()) {
	const date = new Date(from);
	let left = days;

	while (left > 0) {
		date.setDate(date.getDate() - 1);
		if (date.getDay() !== 0 && date.getDay() !== 6) left--;
	}

	return isoDate(date);
}

/**
 * Fecha en que se creo la rama, segun su reflog.
 *
 * La entrada mas antigua del reflog de una rama es siempre su `branch: Created from ...`, y ahi
 * `@{fecha}` es el dia en que se creo. Se usa esto y no el primer commit del rango contra la base
 * porque en cuanto la rama se mezcla a `desa` ese rango queda vacio y no hay fecha que sacar.
 *
 * @param {string} repo - Ruta del repo
 * @param {string} branch - Nombre de la rama local
 * @returns {{date: string, source: string}|null} `null` si el reflog no dice nada util
 */
function branchCreatedAt(repo, branch) {
	const log = git(repo, ["reflog", "show", "--date=iso-strict", "--format=%gd|%gs", branch]);

	if (!log.ok || !log.out) return null;

	const lines = log.out.split("\n").filter(Boolean);
	const oldest = lines[lines.length - 1];
	const stamp = oldest.match(/@\{([^}]+)\}/)?.[1];

	if (!stamp) return null;

	return { date: stamp.slice(0, 10), source: /Created from/.test(oldest) ? "reflog" : "reflog-parcial" };
}

/**
 * Fecha estimada de inicio cuando el reflog ya expiro: primer commit de la rama contra su base.
 * Devuelve `null` si la rama ya se mezclo y no le queda ningun commit propio.
 */
function firstCommitDate(repo, branch) {
	for (const base of ["origin/desa", "desa", "origin/master", "master", "origin/prod", "prod"]) {
		if (!git(repo, ["rev-parse", "--verify", "-q", base]).ok) continue;

		const log = git(repo, ["log", "--reverse", "--format=%ad", "--date=short", `${base}..${branch}`]);
		const first = log.ok ? log.out.split("\n").filter(Boolean)[0] : null;

		if (first) return { date: first, source: "primer-commit" };
	}

	return null;
}

/**
 * Parte el nombre de rama del equipo en sus piezas.
 * Formato esperado: `<tipo>/<ticket>-<autor>-origin<Base>-<Descripcion>`, con el ticket opcional.
 *
 * @param {string} branch - Nombre completo de la rama
 * @returns {{type: string, ticket: string|null, description: string}}
 */
function parseBranch(branch) {
	const [type, ...rest] = branch.includes("/") ? branch.split("/") : ["", branch];
	const name = rest.join("/");
	const ticket = name.match(/^(\d+(?:-\d+)*)-/)?.[1] ?? null;

	// Se quitan ticket, autor y `originBase`; lo que sobra es la descripcion que puso quien la creo.
	const description = name
		.replace(/^\d+(?:-\d+)*-/, "")
		.replace(/^[A-Za-zñÑ]+-/, "")
		.replace(/^origin[A-Za-z]+-?/i, "")
		.replace(/-desa$|-prod$|-qa$/i, "")
		.replace(/[-_]+/g, " ")
		// El equipo escribe la descripcion en CamelCase; separarla la vuelve legible en el slide.
		.replace(/([a-zñ0-9])([A-ZÑ])/g, "$1 $2")
		.trim();

	return { type: type || "otro", ticket, description: description || name };
}

/** Ramas que casi nunca van al slide: copias para otra base, ramas de prueba o de configuracion. */
function looksLikeNoise(branch, ticket) {
	return /-desa$|-prod$|-qa$/i.test(branch)
		|| /^pruebas\//i.test(branch)
		|| (!ticket && /claude|archivos|config/i.test(branch));
}

/** Ramas del autor en un repo, con su fecha de inicio y las piezas del nombre. */
function branchesOf(repo, author) {
	const refs = git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);

	if (!refs.ok) return [];

	return refs.out.split("\n").filter(Boolean)
		.filter(branch => branch.toLowerCase().includes(author.toLowerCase()))
		.map((branch) => {
			const started = branchCreatedAt(repo, branch) ?? firstCommitDate(repo, branch);
			const parsed = parseBranch(branch);

			return {
				repo,
				branch,
				...parsed,
				startedAt: started?.date ?? null,
				dateSource: started?.source ?? "desconocida",
				noise: looksLikeNoise(branch, parsed.ticket),
			};
		});
}

/**
 * Agrupa las ramas en desarrollos: un ticket es una sola caja del slide, aunque tenga rama en el
 * front, en el back, en la app movil y en el manual. Las ramas sin ticket se agrupan por su
 * descripcion, que es lo unico que las relaciona.
 */
function groupDevelopments(branches) {
	const groups = new Map();

	for (const item of branches) {
		const key = item.ticket ?? `sin-ticket::${item.description.toLowerCase().replace(/\s+/g, "")}`;
		const group = groups.get(key) ?? {
			ticket: item.ticket,
			description: item.description,
			type: item.type,
			startedAt: item.startedAt,
			noise: true,
			projects: [],
			branches: [],
		};

		group.branches.push({
			repo: item.repo,
			branch: item.branch,
			project: item.project,
			description: item.description,
			noise: item.noise,
			startedAt: item.startedAt,
			dateSource: item.dateSource,
		});
		if (!group.projects.some(p => p.key === item.project)) group.projects.push({ key: item.project, label: item.projectLabel });
		// Del grupo mandan la fecha mas temprana y la rama menos sospechosa: basta una rama real
		// para que el desarrollo entero lo sea.
		if (item.startedAt && (!group.startedAt || item.startedAt < group.startedAt)) group.startedAt = item.startedAt;
		if (!item.noise) {
			group.noise = false;
			group.description = item.description;
			group.type = item.type;
		}

		groups.set(key, group);
	}

	// El proyecto que encabeza la caja es el del producto: si el manual entro por bandera, acompana
	// al desarrollo pero no lo encabeza.
	for (const group of groups.values()) {
		const main = group.projects.find(p => !EXCLUDED.has(p.key)) ?? group.projects[0];

		group.project = main.key;
		group.projectLabel = main.label;
		group.repos = [...new Set(group.branches.map(b => b.repo))];

		// La descripcion manda la del proyecto principal: la rama del manual suele nombrar el
		// desarrollo de otra forma, y en el slide vale la del producto.
		const owner = group.branches.find(b => b.project === main.key && !b.noise) ?? group.branches.find(b => b.project === main.key);

		if (owner) group.description = owner.description;
	}

	return [...groups.values()];
}

/** Argumentos de linea de comando; las opciones repetibles se acumulan. */
function parseArgs(argv) {
	const options = { proyectos: [], autor: "fabian", diasHabiles: 10, desde: null, hasta: null, json: false, todo: false, incluirManuales: false };

	for (let i = 0; i < argv.length; i++) {
		const [flag, inline] = argv[i].split("=");
		const value = inline ?? argv[i + 1];
		const take = () => (inline ? value : argv[++i]);

		if (flag === "--proyecto") options.proyectos.push(take());
		else if (flag === "--autor") options.autor = take();
		else if (flag === "--dias-habiles") options.diasHabiles = Number(take());
		else if (flag === "--desde") options.desde = take();
		else if (flag === "--hasta") options.hasta = take();
		else if (flag === "--json") options.json = true;
		else if (flag === "--todo") options.todo = true;
		else if (flag === "--incluir-manuales") options.incluirManuales = true;
	}

	return options;
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const projects = readProjects();
	// Pedir un proyecto a mano manda sobre la exclusion por omision.
	const keys = options.proyectos.length
		? options.proyectos
		: Object.keys(projects).filter(key => options.incluirManuales || !EXCLUDED.has(key));
	const from = options.desde ?? businessDaysAgo(options.diasHabiles);
	const to = options.hasta ?? isoDate();

	const all = [];

	for (const key of keys) {
		const project = projects[key];

		if (!project) {
			console.warn(`Aviso: el proyecto "${key}" no esta en projects.json; se omite.`);
			continue;
		}

		for (const repo of project.repos ?? []) {
			for (const branch of branchesOf(repo, options.autor)) {
				all.push({ ...branch, project: key, projectLabel: project.label ?? key });
			}
		}
	}

	const inWindow = options.todo
		? all
		: all.filter(b => b.startedAt && b.startedAt >= from && b.startedAt <= to);

	const developments = groupDevelopments(inWindow).sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
	const report = { window: { from, to, businessDays: options.diasHabiles }, author: options.autor, developments };

	if (options.json) {
		console.log(JSON.stringify(report, null, 2));

		return;
	}

	console.log(`Desarrollos iniciados entre ${from} y ${to} (autor: ${options.autor})\n`);

	if (!developments.length) {
		console.log("Ninguno. Ampliar la ventana con --dias-habiles o revisar --autor.");

		return;
	}

	for (const key of [...new Set(developments.map(d => d.project))]) {
		const group = developments.filter(d => d.project === key);

		console.log(`${group[0].projectLabel}`);

		for (const dev of group) {
			const repos = dev.repos.map(r => r.split("/").pop()).join(", ");

			console.log(`  ${dev.startedAt}  ${(dev.ticket ?? "sin-ticket").padEnd(12)} ${dev.description}${dev.noise ? "   [posible ruido]" : ""}`);
			console.log(`              ${repos}`);
		}

		console.log("");
	}
}

main();
