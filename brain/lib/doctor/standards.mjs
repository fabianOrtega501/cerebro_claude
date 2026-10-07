/** Doctor, modulo standards: every file path cited by a project reuse inventory still exists. */
import { finding, read } from "./context.mjs";
import { join } from "node:path";

const AREA = "standards";

/** Repo-relative file paths written between backticks, e.g. `app/Services/X.php`. */
const PATH = /`((?:app|src|routes|database|resources|config|docs|tests|docker)\/[^`\s]+\.[a-z]{2,4})`/g;

/** Hallazgos del modulo. */
export function run(ctx) {
	const out = [];

	for (const [key, project] of Object.entries(ctx.projects)) {
		const inventory = join(ctx.root, "brain", "projects", key, "standards", "reuse.md");
		const text = read(inventory);

		if (text === null)
			continue;

		const repos = (project.repos ?? []).filter(repo => ctx.exists(repo));
		const missing = [...new Set([...text.matchAll(PATH)].map(m => m[1]))]
			.filter(path => !repos.some(repo => ctx.exists(join(repo, path))));

		if (missing.length)
			out.push(finding("aviso", AREA, `El inventario de ${key} cita ${missing.length} ruta(s) que ya no existen: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}.`,
				`Corrige brain/projects/${key}/standards/reuse.md: la pieza se movió o se borró.`));
	}

	return out;
}
