/** Doctor, modulo inventory: skills, agentes y hooks frente al README, y referencias que no existen. */
import { join, relative } from "node:path";
import { finding, frontmatter, list, read } from "./context.mjs";

const AREA = "inventory";

/** Subagentes que trae Claude Code y no viven en agents/. */
const BUILTIN_AGENTS = new Set(["Explore", "general-purpose", "Plan", "claude-code-guide", "statusline-setup", "claude"]);

/** Nombres en backticks de la primera columna de la tabla bajo `### <title>` del README. */
function readmeTable(readme, title) {
	const section = readme.split(/^### /m).find(s => s.startsWith(title));

	return new Set([...(section ?? "").matchAll(/^\|\s*`([\w-]+)`\s*\|/gm)].map(m => m[1]));
}

/** Documentos del cerebro donde se nombran piezas: skills, agentes, CLAUDE.md, README y FLUJO. */
function documents(ctx, skills, agents) {
	return [
		...skills.map(s => join(ctx.root, "skills", s, "SKILL.md")),
		...agents.map(a => join(ctx.root, "agents", `${a}.md`)),
		...["CLAUDE.md", "README.md", "FLUJO.md"].map(f => join(ctx.root, f)),
	].filter(ctx.isFile);
}

/** Hallazgos del modulo. */
export function run(ctx) {
	const out = [];
	const skills = list(join(ctx.root, "skills")).filter(s => ctx.isFile(join(ctx.root, "skills", s, "SKILL.md")));
	const agents = list(join(ctx.root, "agents")).filter(a => a.endsWith(".md")).map(a => a.slice(0, -3));
	const hooks = list(join(ctx.root, "hooks")).filter(h => h.endsWith(".mjs")).map(h => h.slice(0, -4));

	for (const skill of skills) {
		const fm = frontmatter(read(join(ctx.root, "skills", skill, "SKILL.md")));

		if (fm.name !== skill)
			out.push(finding("error", AREA, `skills/${skill}: el frontmatter dice name "${fm.name ?? "(vacio)"}"; Claude la registra con ese nombre y no con el de la carpeta.`,
				`Pon name: ${skill}.`));
		if (!fm.description)
			out.push(finding("error", AREA, `skills/${skill} no tiene description: Claude no sabe cuando cargarla.`));
	}

	for (const agent of agents) {
		const fm = frontmatter(read(join(ctx.root, "agents", `${agent}.md`)));

		if (fm.name !== agent)
			out.push(finding("error", AREA, `agents/${agent}.md: name "${fm.name ?? "(vacio)"}" no coincide con el archivo.`));
		if (!fm.model)
			out.push(finding("aviso", AREA, `agents/${agent}.md no fija model: hereda el de la sesion, que es justo lo que el reparto de modelos evita.`));
	}

	const readme = read(join(ctx.root, "README.md")) ?? "";

	for (const [title, actual] of [["Skills", skills], ["Agentes", agents], ["Hooks", hooks]]) {
		const listed = readmeTable(readme, title);

		for (const name of actual.filter(n => !listed.has(n)))
			out.push(finding("aviso", AREA, `${name} no aparece en la tabla "${title}" del README.`, "Agrega su fila."));
		for (const name of [...listed].filter(n => !actual.includes(n)))
			out.push(finding("aviso", AREA, `El README lista ${name} en "${title}", pero ya no existe.`, "Quita la fila o restaura la pieza."));
	}

	for (const doc of documents(ctx, skills, agents)) {
		const text = read(doc) ?? "";
		const where = relative(ctx.root, doc);

		for (const [, agent] of text.matchAll(/subagent_type:\s*"([\w-]+)"/g)) {
			if (!agents.includes(agent) && !BUILTIN_AGENTS.has(agent))
				out.push(finding("error", AREA, `${where} delega en el subagente "${agent}", que no existe.`));
		}

		const paths = new Set([...text.matchAll(/~\/\.claude\/([\w./<>*${}-]+)/g)].map(m => m[1].replace(/[.,:;)]+$/, "")));

		for (const path of paths) {
			// Rutas de ejemplo o generadas: no son referencias a una pieza concreta.
			if (/[<*${]/.test(path) || path.startsWith("projects/") || path.startsWith("cache/") || path === "secrets.env")
				continue;

			if (!ctx.exists(join(ctx.root, path)))
				out.push(finding("aviso", AREA, `${where} menciona ~/.claude/${path}, que no existe.`,
					"Corrige la ruta o quita la mencion: quien siga la instruccion va a fallar."));
		}
	}

	return out;
}
