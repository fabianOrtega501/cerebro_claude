#!/usr/bin/env node
/**
 * Pre y PostToolUse sobre Bash (`--before` / `--after`): detecta los archivos que cambio un comando
 * en los repos registrados y los pasa por las guardas de Edit de settings.json como si fueran un Edit.
 * No bloquea, porque el comando ya corrio: avisa a Claude para que lo corrija con Edit o Write.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { allRepos, repoContaining } from "../brain/lib/projects.mjs";

/** Archivos de texto que se comparan; lo demas (imagenes, binarios) se ignora. */
const TEXT = /\.(php|js|cjs|mjs|jsx|ts|tsx|vue|json|sql|css|scss|md)$/i;

/** Tope por archivo, para no cargar en memoria archivos generados enormes. */
const MAX_SIZE = 1024 * 1024;

/** Donde se guarda la foto entre el antes y el despues de cada comando. */
const STATE_DIR = join(tmpdir(), "claude-bash-audit");

const SETTINGS = join(homedir(), ".claude", "settings.json");

/** Comandos de git que traen cambios ajenos y no se deben auditar como propios. */
const GIT_FOREIGN_CHANGES = /\bgit\s+(?:merge|pull|rebase|cherry-pick|checkout|switch|reset|stash|revert|am|restore|clone|fetch)\b/;

/** Edad a la que se borra una foto huerfana (otra guarda nego el comando y nunca llego su despues). */
const SNAPSHOT_TTL_MS = 60 * 60 * 1000;

/** Evento del hook leido de stdin; `null` si no es JSON valido. */
function readEvent() {
	try {
		return JSON.parse(readFileSync(0, "utf8") || "{}");
	}
	catch {
		return null;
	}
}

/** Identifica la llamada a Bash, para que el despues encuentre la foto de su antes. */
function keyOf(event) {
	if (event.tool_use_id)
		return String(event.tool_use_id).replace(/[^\w-]/g, "");

	return createHash("sha1")
		.update(`${event.session_id ?? ""}|${JSON.stringify(event.tool_input ?? {})}`)
		.digest("hex");
}

/** Salida de git en un repo, o `null` si fallo. */
function git(repo, args) {
	const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

	return r.status === 0 ? r.stdout : null;
}

/** Repos registrados que toca el comando: el del cwd y los de cada ruta absoluta o `cd`. */
function reposTouched(event) {
	const command = event.tool_input?.command ?? "";
	const cwd = event.cwd ?? process.cwd();
	const candidates = [cwd];

	for (const [path] of command.matchAll(/(?:~|\/)[^\s'"`;&|<>()]+/g))
		candidates.push(path.startsWith("~") ? join(homedir(), path.slice(1)) : path);

	for (const [, target] of command.matchAll(/\bcd\s+['"]?([^\s'"&;|]+)/g)) {
		if (!target.includes("$"))
			candidates.push(isAbsolute(target) ? target : resolve(cwd, target));
	}

	const repos = allRepos();

	return [...new Set(candidates.map(path => repoContaining(path, repos)).filter(Boolean))];
}

/**
 * Archivos de texto modificados o nuevos de un repo, con su contenido actual.
 *
 * @param {string} repo - Raiz del repo
 * @returns {Record<string, string>} Ruta relativa al repo → contenido
 */
function modified(repo) {
	const out = git(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
	const files = {};

	if (!out)
		return files;

	const entries = out.split("\0").filter(Boolean);

	for (let i = 0; i < entries.length; i++) {
		const status = entries[i].slice(0, 2);
		const path = entries[i].slice(3);

		if (status[0] === "R" || status[0] === "C")
			i++;

		if (status.includes("D") || !TEXT.test(path))
			continue;

		try {
			const absolute = join(repo, path);

			if (statSync(absolute).size <= MAX_SIZE)
				files[path] = readFileSync(absolute, "utf8");
		}
		catch {
			continue;
		}
	}

	return files;
}

/** Guardas de Edit registradas en settings.json, en Pre y PostToolUse, sin contar las de Bash. */
function guards() {
	let config;

	try {
		config = JSON.parse(readFileSync(SETTINGS, "utf8"));
	}
	catch {
		return [];
	}

	const list = [];

	for (const hookEvent of ["PreToolUse", "PostToolUse"]) {
		for (const entry of config.hooks?.[hookEvent] ?? []) {
			const matcher = entry.matcher ?? "";
			let applies = matcher === "" || matcher === "*";

			try {
				applies ||= new RegExp(`^(?:${matcher})$`).test("Edit");
			}
			catch {
				applies = false;
			}

			if (!applies)
				continue;

			for (const hook of entry.hooks ?? []) {
				if (hook.type === "command" && hook.command && !/bash-(write-guard|change-audit)/.test(hook.command))
					list.push({ hookEvent, command: hook.command, timeout: (hook.timeout ?? 10) * 1000 });
			}
		}
	}

	return list;
}

/**
 * Pasa un cambio por una guarda simulando un Edit; `previous_content` le da el estado anterior.
 * De una guarda Pre cuenta solo el rechazo; de una Post, cualquier aviso.
 *
 * @param {{file: string, before: string, after: string}} change - Archivo y sus dos versiones
 * @param {{hookEvent: string, command: string, timeout: number}} guard - Guarda a ejecutar
 * @param {object} base - Evento original, para heredar sesion y directorio
 * @returns {string|null} Motivo del rechazo o aviso, o `null` si no objeta
 */
function evaluate(change, guard, base) {
	const simulated = {
		session_id: base.session_id,
		transcript_path: base.transcript_path,
		cwd: base.cwd,
		hook_event_name: guard.hookEvent,
		tool_name: "Edit",
		tool_input: {
			file_path: change.file,
			old_string: change.before,
			new_string: change.after,
			replace_all: false,
			previous_content: change.before,
		},
	};

	const r = spawnSync(guard.command, {
		shell: true,
		input: JSON.stringify(simulated),
		encoding: "utf8",
		timeout: guard.timeout,
	});

	if (r.status === 2 && r.stderr?.trim())
		return r.stderr.trim();

	let out = {};

	try {
		out = JSON.parse(r.stdout || "{}");
	}
	catch {
		return null;
	}

	const specific = out.hookSpecificOutput ?? {};

	if (guard.hookEvent === "PreToolUse")
		return specific.permissionDecision === "deny" ? (specific.permissionDecisionReason ?? null) : null;

	if (out.decision === "block" && out.reason)
		return out.reason;

	return specific.additionalContext ?? null;
}

/** Borra las fotos que quedaron sin su despues. */
function pruneSnapshots() {
	for (const name of readdirSync(STATE_DIR)) {
		const path = join(STATE_DIR, name);

		try {
			if (Date.now() - statSync(path).mtimeMs > SNAPSHOT_TTL_MS)
				rmSync(path, { force: true });
		}
		catch {
			continue;
		}
	}
}

/** Antes del comando: guarda el contenido de los archivos que ya estaban modificados. */
function before(event) {
	if (GIT_FOREIGN_CHANGES.test(event.tool_input?.command ?? ""))
		return;

	const repos = reposTouched(event);

	if (!repos.length)
		return;

	mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
	pruneSnapshots();

	const snapshot = Object.fromEntries(repos.map(repo => [repo, modified(repo)]));

	writeFileSync(join(STATE_DIR, `${keyOf(event)}.json`), JSON.stringify(snapshot), { mode: 0o600 });
}

/** Despues del comando: detecta que archivos cambio y los pasa por las guardas. */
function after(event) {
	const snapshotPath = join(STATE_DIR, `${keyOf(event)}.json`);

	if (!existsSync(snapshotPath))
		return;

	const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));

	rmSync(snapshotPath, { force: true });

	const changes = [];

	for (const [repo, previous] of Object.entries(snapshot)) {
		for (const [path, content] of Object.entries(modified(repo))) {
			const old = path in previous ? previous[path] : (git(repo, ["show", `HEAD:${path}`]) ?? "");

			if (old !== content)
				changes.push({ repo, file: join(repo, path), before: old, after: content });
		}
	}

	if (!changes.length)
		return;

	const list = guards();
	const findings = [];

	for (const change of changes) {
		for (const guard of list) {
			const reason = evaluate(change, guard, event);

			if (reason)
				findings.push(`- ${relative(change.repo, change.file)}: ${reason}`);
		}
	}

	if (!findings.length)
		return;

	process.stdout.write(JSON.stringify({
		decision: "block",
		reason: "Este comando de Bash cambio archivos de codigo sin pasar por Edit/Write, y las guardas los rechazan:\n"
			+ `${findings.join("\n")}\n`
			+ "Corrigelos con Edit o Write, y no vuelvas a escribir codigo del proyecto desde Bash.",
	}));
}

const event = readEvent();

if (event?.tool_name === "Bash") {
	try {
		if (process.argv[2] === "--before")
			before(event);
		else if (process.argv[2] === "--after")
			after(event);
	}
	catch {
		process.exit(0);
	}
}
