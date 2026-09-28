/** Doctor, modulo config: settings.json valido, hooks registrados vivos y scripts que compilan. */
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { finding, list } from "./context.mjs";

const AREA = "config";

/** Rutas de scripts del cerebro que invoca un comando de settings.json. */
function scriptsIn(command, root) {
	return [...command.matchAll(/(?:\$HOME|~)\/\.claude\/([\w./-]+\.(?:mjs|js|py|sh))/g)].map(m => join(root, m[1]));
}

/** Todos los archivos con cierta extension bajo un directorio, recursivo. */
function walk(dir, ext, out = []) {
	for (const name of list(dir)) {
		if (name === "node_modules" || name === "__pycache__")
			continue;

		const path = join(dir, name);

		if (name.endsWith(ext))
			out.push(path);
		else if (!name.includes("."))
			walk(path, ext, out);
	}

	return out;
}

/** Hallazgos del modulo. */
export function run(ctx) {
	const out = [];

	if (!ctx.settings) {
		out.push(finding("error", AREA, "settings.json no es JSON valido: hooks y statusline estan caidos.",
			"Corrige la sintaxis; `node -e 'JSON.parse(require(\"fs\").readFileSync(\"settings.json\"))'` dice donde."));
		return out;
	}

	const registered = new Set();
	const commands = [];

	for (const [event, entries] of Object.entries(ctx.settings.hooks ?? {})) {
		for (const entry of entries)
			for (const hook of entry.hooks ?? [])
				if (hook.command)
					commands.push({ where: `hook ${event}`, command: hook.command });
	}

	if (ctx.settings.statusLine?.command)
		commands.push({ where: "statusLine", command: ctx.settings.statusLine.command });

	for (const { where, command } of commands) {
		for (const script of scriptsIn(command, ctx.root)) {
			registered.add(script);

			if (!ctx.isFile(script))
				out.push(finding("error", AREA, `${where} invoca ${relative(ctx.root, script)}, que no existe.`,
					"Restaura el archivo o quita el registro de settings.json."));
		}
	}

	for (const name of list(join(ctx.root, "hooks")).filter(n => n.endsWith(".mjs"))) {
		if (!registered.has(join(ctx.root, "hooks", name)))
			out.push(finding("aviso", AREA, `hooks/${name} existe pero no esta registrado en settings.json: no corre nunca.`,
				"Registralo o borralo."));
	}

	const scripts = [
		...walk(join(ctx.root, "hooks"), ".mjs"),
		...walk(join(ctx.root, "brain", "lib"), ".mjs"),
		...list(join(ctx.root, "skills")).flatMap(s => walk(join(ctx.root, "skills", s, "lib"), ".mjs")),
		join(ctx.root, "statusline.mjs"),
	].filter(ctx.isFile);

	for (const script of scripts) {
		const r = spawnSync("node", ["--check", script], { encoding: "utf8" });

		if (r.status !== 0)
			out.push(finding("error", AREA, `${relative(ctx.root, script)} no compila: ${r.stderr.split("\n").find(l => /Error/.test(l)) ?? "error de sintaxis"}`));
	}

	for (const script of walk(join(ctx.root, "brain", "lib"), ".py")) {
		// ast.parse no escribe __pycache__, a diferencia de py_compile.
		const r = spawnSync("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])", script],
			{ encoding: "utf8" });

		if (r.status !== 0)
			out.push(finding("error", AREA, `${relative(ctx.root, script)} no compila: ${r.stderr.trim().split("\n").pop()}`));
	}

	for (const key of Object.keys(ctx.settings.env ?? {})) {
		if (/PASSWORD|TOKEN|SECRET|API_KEY/i.test(key))
			out.push(finding("error", AREA, `settings.json define ${key} en "env": settings.json se versiona y se sube a GitHub.`,
				`Mueve ${key} a ~/.claude/secrets.env y leela con secret().`));
	}

	return out;
}
