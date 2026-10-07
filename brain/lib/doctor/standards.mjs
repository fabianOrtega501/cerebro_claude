/** Doctor, modulo standards: reuse inventories and rule catalogs of code-standards-guard stay valid. */
import { finding, read } from "./context.mjs";
import { basename, join } from "node:path";

const AREA = "standards";

/** Repo-relative file paths written between backticks, e.g. `app/Services/X.php`. */
const PATH = /`((?:app|src|routes|database|resources|config|docs|tests|docker)\/[^`\s]+\.[a-z]{2,4})`/g;

/** Rule kinds implemented in hooks/code-standards-guard.mjs; a rule without kind needs a pattern. */
const KINDS = ["inline-comment", "docblock-length", "phpdoc-with-oa", "function-name-words", "standard-service-method"];

/** File cited by a rule `source` ("aio-backend/x.md, seccion ..."), or `null` if it is not a path. */
function sourceFile(source, root, repos) {
	const path = String(source ?? "").split(",")[0].trim();

	if (path.startsWith("~/.claude/"))
		return join(root, path.slice("~/.claude/".length));
	if (path.startsWith("brain/"))
		return join(root, path);

	const repo = repos.find(r => path.startsWith(`${basename(r)}/`));

	return repo ? join(repo, path.slice(basename(repo).length + 1)) : null;
}

/** Problems of one rule catalog: broken regex, unknown kind, missing source or stale exception. */
function checkCatalog(ctx, label, catalog, repos) {
	const problems = [];

	for (const rule of catalog?.rules ?? []) {
		if (rule.kind && !KINDS.includes(rule.kind))
			problems.push(`${rule.id}: kind "${rule.kind}" desconocido`);
		if (!rule.kind && !rule.pattern)
			problems.push(`${rule.id}: sin pattern ni kind`);

		for (const regex of [rule.pattern, rule.files].filter(Boolean)) {
			try {
				new RegExp(regex);
			}
			catch {
				problems.push(`${rule.id}: expresion invalida ${regex}`);
			}
		}

		const source = sourceFile(rule.source, ctx.root, repos);

		if (!rule.source || (source && !ctx.exists(source)))
			problems.push(`${rule.id}: la fuente "${rule.source ?? "(vacia)"}" no existe`);

		for (const exception of rule.exceptions ?? []) {
			if (!repos.some(repo => ctx.exists(join(repo, exception))))
				problems.push(`${rule.id}: la excepcion ${exception} ya no existe`);
		}
	}

	return problems.map(p => finding("aviso", AREA, `${label}: ${p}.`, "Corrige el catalogo de code-standards-guard."));
}

/** Hallazgos del modulo. */
export function run(ctx) {
	const out = [];
	const allRepos = Object.values(ctx.projects).flatMap(p => p.repos ?? []).filter(repo => ctx.exists(repo));
	const common = read(join(ctx.root, "brain", "standards", "common.json"));

	if (common !== null) {
		try {
			out.push(...checkCatalog(ctx, "brain/standards/common.json", JSON.parse(common), allRepos));
		}
		catch {
			out.push(finding("error", AREA, "brain/standards/common.json no es un JSON valido: la guarda de codigo queda apagada."));
		}
	}

	for (const [key, project] of Object.entries(ctx.projects)) {
		const repos = (project.repos ?? []).filter(repo => ctx.exists(repo));
		const inventory = read(join(ctx.root, "brain", "projects", key, "standards", "reuse.md"));
		const rules = read(join(ctx.root, "brain", "projects", key, "standards", "rules.json"));

		if (inventory !== null) {
			const missing = [...new Set([...inventory.matchAll(PATH)].map(m => m[1]))]
				.filter(path => !repos.some(repo => ctx.exists(join(repo, path))));

			if (missing.length)
				out.push(finding("aviso", AREA, `El inventario de ${key} cita ${missing.length} ruta(s) que ya no existen: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}.`,
					`Corrige brain/projects/${key}/standards/reuse.md: la pieza se movió o se borró.`));
		}

		if (rules !== null) {
			try {
				out.push(...checkCatalog(ctx, `reglas de ${key}`, JSON.parse(rules), repos));
			}
			catch {
				out.push(finding("error", AREA, `brain/projects/${key}/standards/rules.json no es un JSON valido: sus reglas no se aplican.`));
			}
		}
	}

	return out;
}
