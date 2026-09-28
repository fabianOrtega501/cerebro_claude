/** Doctor, modulo memory: indices MEMORY.md, frontmatter, enlaces y copias del equipo que divergen. */
import { existsSync, lstatSync } from "node:fs";
import { basename, join } from "node:path";
import { finding, frontmatter, list, read } from "./context.mjs";

const AREA = "memory";

/** Carpetas de memoria: las del cerebro por proyecto y las `.claude/memory/` de cada repo registrado. */
function memoryDirs(ctx) {
	const own = list(join(ctx.root, "projects")).map(p => join(ctx.root, "projects", p, "memory"));
	const team = Object.values(ctx.projects).flatMap(p => p.repos ?? []).map(r => join(r, ".claude", "memory"));

	return [...own, ...team].filter(d => existsSync(d) && list(d).some(f => f.endsWith(".md")));
}

/** Nombre corto para los mensajes: `aio-app (equipo)` o `status (propia)`. */
function label(dir, ctx) {
	return dir.startsWith(join(ctx.root, "projects"))
		? `${basename(join(dir, "..")).replace(/^-datos-proyectos-/, "")} (cerebro)`
		: `${basename(join(dir, "..", ".."))} (equipo)`;
}

/** Hallazgos de una carpeta de memoria; devuelve tambien los nombres para cruzar enlaces. */
function checkDir(dir, ctx, out) {
	const where = label(dir, ctx);
	const files = list(dir).filter(f => f.endsWith(".md") && f !== "MEMORY.md");
	const index = read(join(dir, "MEMORY.md"));
	const names = new Set();
	const links = [];

	for (const file of files) {
		const path = join(dir, file);

		if (lstatSync(path).isSymbolicLink() && !existsSync(path)) {
			out.push(finding("error", AREA, `${where}: ${file} es un enlace a un archivo que ya no existe.`,
				"Corre plug.mjs para regenerar los enlaces, o borralo."));
			continue;
		}

		const text = read(path);
		const fm = frontmatter(text);
		const type = fm.type;

		names.add(fm.name ?? file.slice(0, -3));
		links.push(...[...(text ?? "").matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]));

		const missing = ["name", "description"].filter(k => !fm[k]);

		if (!type)
			missing.push("type");
		if (missing.length)
			out.push(finding("aviso", AREA, `${where}: ${file} no tiene ${missing.join(", ")} en el frontmatter.`));
		if (fm.name && fm.name !== file.slice(0, -3))
			out.push(finding("aviso", AREA, `${where}: ${file} dice name "${fm.name}"; el nombre debe ser igual al archivo.`));
	}

	if (index === null) {
		if (files.length)
			out.push(finding("aviso", AREA, `${where}: hay ${files.length} memoria(s) y ningun MEMORY.md: no se cargan.`,
				"Crea el indice con una linea por memoria (skill manage-memory)."));
		return { names, links };
	}

	const indexed = new Set([...index.matchAll(/\]\(([^)]+\.md)\)/g)].map(m => m[1]));

	for (const target of indexed) {
		if (!existsSync(join(dir, target)))
			out.push(finding("error", AREA, `${where}: MEMORY.md enlaza ${target}, que no existe.`, "Quita la linea o restaura la memoria."));
	}

	for (const file of files.filter(f => !indexed.has(f) && existsSync(join(dir, f))))
		out.push(finding("aviso", AREA, `${where}: ${file} no esta en MEMORY.md: nunca se recuerda.`, "Agrega su linea al indice."));

	return { names, links };
}

/** Hallazgos del modulo. */
export function run(ctx) {
	const out = [];
	const allNames = new Set();
	const allLinks = [];

	for (const dir of memoryDirs(ctx)) {
		const { names, links } = checkDir(dir, ctx, out);

		names.forEach(n => allNames.add(n));
		allLinks.push(...links);
	}

	const pending = [...new Set(allLinks.filter(l => !allNames.has(l)))];

	if (pending.length)
		out.push(finding("info", AREA, `${pending.length} enlace(s) [[...]] a memorias que aun no existen: ${pending.slice(0, 5).join(", ")}${pending.length > 5 ? "..." : ""}.`));

	for (const [key, project] of Object.entries(ctx.projects)) {
		const copies = new Map();

		for (const repo of project.repos ?? []) {
			const dir = join(repo, ".claude", "memory");

			for (const file of list(dir).filter(f => f.endsWith(".md") && f !== "MEMORY.md"))
				copies.set(file, [...(copies.get(file) ?? []), { repo: basename(repo), text: read(join(dir, file)) }]);
		}

		for (const [file, versions] of copies) {
			if (versions.length > 1 && new Set(versions.map(v => v.text)).size > 1)
				out.push(finding("aviso", AREA, `${key}: ${file} existe en ${versions.map(v => v.repo).join(" y ")} con contenido distinto.`,
					"Decide cual es la vigente y copiala al otro repo, en el MR de cada uno."));
		}
	}

	return out;
}
