/**
 * Interpreta lo que el usuario escribió al invocar el checklist, para no preguntarle lo que ya dijo.
 *
 * `/start-development aio feature desa 10842 Filtro por tipo de vehiculo` debería bastar. El
 * problema es que nadie recuerda el orden de cinco argumentos, así que **no se exige ninguno**:
 * cada dato se reconoce por lo que es.
 *
 *   - proyecto → coincide con una clave de `projects.json`
 *   - tipo     → `feature` o `hotfix`
 *   - base     → una rama base real de los repos del proyecto
 *   - lado     → `front`, `back`, `ambos`/`both`, o `nose` si no lo tiene claro
 *   - modo     → `practica` (guiado, escribe él) o `entrega` (normal)
 *   - ticket   → solo dígitos
 *   - lo demás → la descripción, en el orden en que venía
 *
 * El orden importa poco justamente porque las categorías no se solapan. La única ambigüedad real
 * sería un proyecto llamado `feature` o una rama de solo dígitos; ninguna existe ni tendría
 * sentido crearla.
 *
 * Uso: `node parse-request.mjs aio feature desa 10842 Filtro por tipo de vehiculo`
 * Devuelve JSON con lo reconocido y lo que falta.
 */

import { execFileSync } from "node:child_process";
import { readProjects, reposOf } from "../../../brain/lib/projects.mjs";

/** Ramas que el equipo usa como base. Lo demás son ramas de trabajo, no orígenes válidos. */
const BASE_BRANCHES = ["desa", "qa", "prod", "main", "master"];

/** Como escribe la gente cada modo. `practice` encadena la skill `practice-ticket`. */
const MODES = {
	practica: "practice", practice: "practice", practicar: "practice", estudio: "practice",
	entrega: "delivery", delivery: "delivery", normal: "delivery", rapido: "delivery", urgente: "delivery",
};

/** Como escribe la gente cada lado. `unknown` es una respuesta legitima, no un dato faltante. */
const SIDES = {
	front: "front", frontend: "front", f: "front",
	back: "back", backend: "back", b: "back",
	ambos: "both", both: "both", dos: "both", fullstack: "both",
	nose: "unknown", "no-se": "unknown", unknown: "unknown",
};

/**
 * Ramas base que existen de verdad en los repos de un proyecto.
 *
 * @returns Las que están en **todos** los repos: crear la rama desde una base que solo existe en
 *   uno dejaría el desarrollo cojo, y es mejor no ofrecerla que fallar después.
 */
export function realBases(project) {
	const repos = reposOf(project);

	if (!repos.length) return [];

	const perRepo = repos.map((repo) => {
		try {
			const out = execFileSync("git", ["-C", repo, "branch", "-r", "--format=%(refname:short)"], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});

			return new Set(out.split("\n").map(b => b.replace(/^origin\//, "").trim()).filter(b => BASE_BRANCHES.includes(b)));
		}
		catch {
			return new Set();
		}
	});

	return BASE_BRANCHES.filter(base => perRepo.every(set => set.has(base)));
}

/**
 * Reparte las palabras sueltas en los datos del checklist.
 *
 * @param {string[]} words - Los argumentos tal como los escribió el usuario
 * @returns {{project, type, base, ticket, side, mode, desc, missing}} Lo reconocido, más `missing`: la lista
 *   de datos que siguen faltando, en el orden en que conviene pedirlos. `desc` puede quedar
 *   vacía aunque sobren palabras, si todas se consumieron como otra cosa.
 */
export function parseRequest(words) {
	const projects = Object.keys(readProjects());
	const rest = [];
	const found = { project: null, type: null, base: null, ticket: null, side: null, mode: null };

	// El proyecto se resuelve primero porque de él dependen las bases válidas.
	for (const word of words) {
		const lower = word.toLowerCase();

		if (!found.project && projects.includes(lower)) found.project = lower;
		else rest.push(word);
	}

	const bases = found.project ? realBases(found.project) : BASE_BRANCHES;
	const words2 = [];

	for (const word of rest) {
		const lower = word.toLowerCase();

		if (!found.type && ["feature", "hotfix"].includes(lower)) found.type = lower;
		else if (!found.side && SIDES[lower]) found.side = SIDES[lower];
		else if (!found.mode && MODES[lower]) found.mode = MODES[lower];
		else if (!found.base && bases.includes(lower)) found.base = lower;
		else if (!found.ticket && /^\d{3,}$/.test(word)) found.ticket = word;
		else words2.push(word);
	}

	const desc = words2.join(" ").trim();
	const missing = [];

	if (!found.project) missing.push("project");
	if (!found.type) missing.push("type");
	if (!found.base) missing.push("base");
	if (!desc) missing.push("desc");
	if (!found.side) missing.push("side");
	if (!found.mode) missing.push("mode");

	// El ticket no entra en `missing`: puede no haberlo legítimamente, y darlo por obligatorio
	// haría preguntar por algo que a veces no existe.
	return { ...found, desc, bases, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	console.log(JSON.stringify(parseRequest(process.argv.slice(2)), null, 2));
}
