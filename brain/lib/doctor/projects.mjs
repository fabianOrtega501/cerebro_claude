/** Doctor, modulo projects: clones registrados, directorios adicionales y credenciales por proyecto. */
import { finding, read } from "./context.mjs";
import { join } from "node:path";

const AREA = "projects";

/** Hallazgos del modulo. */
export function run(ctx) {
	const out = [];
	const repos = Object.values(ctx.projects).flatMap(p => p.repos ?? []);

	if (!repos.length) {
		out.push(finding("error", AREA, "brain/projects.json no registra ningun repo, o no se puede leer."));
		return out;
	}

	for (const repo of repos) {
		if (!ctx.exists(repo))
			out.push(finding("aviso", AREA, `projects.json registra ${repo}, que no existe en disco.`,
				"Clonalo o quitalo del registro y corre plug.mjs."));
	}

	const extra = new Set(ctx.settings?.permissions?.additionalDirectories ?? []);
	const missing = repos.filter(r => ctx.exists(r) && !extra.has(r));
	const stale = [...extra].filter(d => !repos.includes(d));

	if (missing.length || stale.length)
		out.push(finding("aviso", AREA, `additionalDirectories no coincide con projects.json (faltan ${missing.length}, sobran ${stale.length}).`,
			"node ~/.claude/brain/lib/sync-directories.mjs"));

	const secrets = read(join(ctx.root, "secrets.env")) ?? "";
	const filled = new Set([...secrets.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*\S/gm)].map(m => m[1]));

	const without = Object.keys(ctx.projects)
		.filter(key => !filled.has(`${key.toUpperCase()}_TEST_EMAIL`) || !filled.has(`${key.toUpperCase()}_TEST_PASSWORD`));

	if (without.length)
		out.push(finding("info", AREA, `Sin usuario de pruebas en secrets.env: ${without.join(", ")}. Se piden cuando un flujo los necesite.`));

	return out;
}
