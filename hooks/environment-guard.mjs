#!/usr/bin/env node
/**
 * PreToolUse (Bash, WebFetch, Write, Edit, MultiEdit, NotebookEdit, Skill, mcp__*): averigua a que
 * host, base o servidor apunta la llamada y la permite, pregunta o niega segun el ambiente activo.
 * Protege sus propias piezas y pide aprobacion en cada `git push`. Evita accidentes, no ataques.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { PATHS, evaluateTarget, log, readRegistry, readState, resolveSshHost } from "../brain/lib/environments.mjs";
import { allRepos } from "../brain/lib/projects.mjs";

const SETTINGS = join(PATHS.base, "settings.json");
const OWN_FILES = ["hooks/environment-guard.mjs", "hooks/environment-activation.mjs", "hooks/environment-start.mjs",
	"brain/lib/environments.mjs"].map(f => join(PATHS.base, f));

/** Sentencias SQL que modifican datos o estructura. */
const SQL_WRITE = /\b(insert|update|delete|merge|upsert|alter|drop|create|truncate|grant|revoke|reindex|vacuum|cluster|call|refresh\s+materialized|comment\s+on|copy\s+\S+\s+from)\b/i;

/** Metodos o banderas de curl, wget y httpie que envian o modifican. */
const HTTP_WRITE = /(?:\s-X\s*|--request[=\s]+)['"]?(?:POST|PUT|PATCH|DELETE)\b|\s(?:-d|--data(?:-raw|-binary|-urlencode)?|-F|--form|-T|--upload-file|--json)[\s=]|--post-(?:data|file)|--method=(?:POST|PUT|PATCH|DELETE)|\s(?:POST|PUT|PATCH|DELETE)\s/i;

/** Piezas de la guarda que no se modifican por Bash. */
const OWN_PIECES = /cache\/environment\/|brain\/environments\.json|\.claude\/settings\.json|hooks\/environment-|brain\/lib\/environments\.mjs/;

/** Llamadas que, dentro de un script en linea, escriben o borran un archivo. */
const SCRIPT_WRITE = /\bopen\([^)]*,\s*['"][wax]|\.write_(?:text|bytes)\s*\(|\b(?:writeFileSync|writeFile|appendFileSync|appendFile|renameSync|unlinkSync|rmSync)\s*\(|\bfile_put_contents\s*\(/;

const DB_CLIENTS = new Set(["psql", "pg_dump", "pg_dumpall", "pg_restore", "createdb", "dropdb", "vacuumdb", "mysql", "mysqldump", "mariadb", "sqlcmd"]);
const READ_ONLY_CLIENTS = new Set(["pg_dump", "pg_dumpall", "mysqldump"]);

/** Programas que ejecutan el cuerpo de un heredoc en vez de guardarlo. */
const EXECUTORS = new Set(["python", "python3", "node", "php", "ruby", "perl", "bash", "sh", "zsh", "psql", "mysql", "mariadb", "sqlcmd", "ssh", "docker"]);

const ARTISAN_NO_DB = /^(?:make:|route:|view:|event:|lang:|stub:|vendor:|package:|config:|optimize|list$|about$|help$|key:generate$|storage:link$|schedule:list$|-V$|--version$)/;
const ARTISAN_READ = /^(?:migrate:status|db:show|db:table|db:monitor|model:show)$/;

const DOCKER_WITH_VALUE = new Set(["-e", "--env", "-u", "--user", "-w", "--workdir", "--env-file"]);
const SSH_WITH_VALUE = new Set(["-p", "-i", "-l", "-o", "-F", "-J", "-L", "-R", "-D", "-W", "-b", "-c", "-E", "-e", "-m", "-O", "-Q", "-S", "-w", "-B", "-I"]);

const RANK = { allow: 0, ask: 1, deny: 2 };

function readEvent() {
	try {
		return JSON.parse(readFileSync(0, "utf8") || "{}");
	}
	catch {
		return null;
	}
}

function decision(type, reason = "", extra = {}) {
	return { type, reason, ...extra };
}

/** Programa, argumentos y texto de cada comando de la linea, saltando `sudo`, `exec` y `X=1`. */
function segments(command) {
	return command
		.split(/&&|\|\||;|\||\n/)
		.map((text) => {
			const tokens = text.trim().split(/\s+/).filter(Boolean);
			let i = 0;

			while (i < tokens.length && (tokens[i] === "sudo" || tokens[i] === "exec" || /^[A-Za-z_]\w*=/.test(tokens[i])))
				i++;

			return { program: basename(tokens[i] ?? ""), args: tokens.slice(i + 1), text };
		})
		.filter(s => s.program);
}

/** El comando sin los heredocs que son datos, y aparte los que un programa ejecuta (SQL, scripts). */
function heredocs(command) {
	const lines = command.split("\n");
	const out = [];
	const executed = [];

	for (let i = 0; i < lines.length; i++) {
		out.push(lines[i]);

		const mark = lines[i].match(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1/);

		if (!mark)
			continue;

		const before = segments(lines[i].slice(0, mark.index));
		const last = before[before.length - 1];
		const program = last ? [last.program, ...last.args].map(t => basename(t)).find(t => DB_CLIENTS.has(t)) ?? last.program : "";
		const runs = EXECUTORS.has(program);
		const body = [];
		let j = i + 1;

		while (j < lines.length && lines[j].trim() !== mark[2]) {
			body.push(lines[j]);

			if (runs)
				out.push(lines[j]);
			j++;
		}

		if (runs)
			executed.push({ program, body: body.join("\n") });
		if (j < lines.length)
			out.push(lines[j]);

		i = j;
	}

	return { clean: out.join("\n"), executed };
}

/** Valor de una bandera: `-h X`, `-hX`, `--host=X` o `--host X`. */
function flag(args, short, long) {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		for (const l of long) {
			if (arg === l)
				return args[i + 1];
			if (arg.startsWith(`${l}=`))
				return arg.slice(l.length + 1);
		}

		for (const s of short) {
			if (arg === s)
				return args[i + 1];
			if (arg.startsWith(s) && arg.length > s.length && !arg.startsWith("--"))
				return arg.slice(s.length);
		}
	}

	return undefined;
}

/** Host y puerto de `host:5432`, `host,1433` o `tcp:host`. */
function hostAndPort(value) {
	const clean = String(value ?? "").replace(/^['"]|['"]$/g, "").replace(/^(?:tcp|udp):/i, "");
	const comma = clean.match(/^([^,]+),(\d+)$/);

	if (comma)
		return { host: comma[1], port: comma[2] };

	const colon = clean.match(/^([^:]+):(\d+)$/);

	return colon ? { host: colon[1], port: colon[2] } : { host: clean };
}

function readIfExists(path) {
	try {
		return statSync(path).size < 1024 * 1024 ? readFileSync(path, "utf8") : "";
	}
	catch {
		return "";
	}
}

function baseDirs(command, cwd) {
	const bases = [cwd];

	for (const [, target] of command.matchAll(/\bcd\s+['"]?([^\s'"&;|]+)/g)) {
		if (!target.includes("$"))
			bases.push(isAbsolute(target) ? target : resolve(cwd, target));
	}

	return bases;
}

/** SQL que recibe un cliente: por `-c`, por archivo, por redireccion o por heredoc. */
function sqlOf(segment, from, bases, executed) {
	const parts = [];
	const args = segment.args.slice(from);

	for (const [, , sql] of segment.text.matchAll(/(?:^|\s)(?:-c|--command|-Q|-q)(?:=|\s+)(['"])([\s\S]*?)\1/g))
		parts.push(sql);

	const file = flag(args, ["-f", "-i"], ["--file", "--input-file"]);
	const redirected = segment.text.match(/<\s*(['"]?)([^\s'"<>|;&]+)\1/)?.[2];

	for (const path of [file, redirected].filter(Boolean))
		for (const base of bases)
			parts.push(readIfExists(isAbsolute(path) ? path : resolve(base, path)));

	for (const { body } of executed)
		parts.push(body);

	return parts.join("\n");
}

function readEnvFile(path) {
	const vars = {};

	for (const line of readIfExists(path).split("\n")) {
		const pair = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);

		if (pair)
			vars[pair[1]] = pair[2].replace(/^['"]|['"]$/g, "");
	}

	return vars;
}

/** Conexion de `bootstrap/cache/config.php`: si existe, Laravel ignora el `.env`. */
function dbFromConfigCache(path) {
	const php = readIfExists(path);

	if (!php)
		return null;

	const name = php.match(/'database'\s*=>\s*array\s*\(\s*'default'\s*=>\s*'([^']+)'/)?.[1] ?? "pgsql";
	const block = php.match(new RegExp(`'${name}'\\s*=>\\s*array\\s*\\(([\\s\\S]{0,3000}?)\\)\\s*,`))?.[1];

	if (!block)
		return null;

	const value = key => block.match(new RegExp(`'${key}'\\s*=>\\s*'([^']*)'`))?.[1];

	return { host: value("host"), port: value("port"), db: value("database") };
}

/** Repo Laravel de un artisan: el del contenedor de `docker exec` o el del directorio de trabajo. */
function artisanRepo(segment, bases) {
	const laravel = allRepos().filter(r => existsSync(join(r, "artisan")));

	if (segment.program === "docker") {
		const args = segment.args;
		let i = args.indexOf("exec") + 1;

		while (i > 0 && i < args.length && args[i].startsWith("-"))
			i += DOCKER_WITH_VALUE.has(args[i]) ? 2 : 1;

		const container = args[i] ?? "";
		// `status-api-laravel.test-1` es de status-api y no de status: gana el nombre mas largo.
		const repo = laravel.filter(r => container.startsWith(basename(r))).sort((a, b) => b.length - a.length)[0];

		if (repo)
			return repo;
	}

	return [...bases].reverse().find(base => existsSync(join(base, "artisan")))
		?? laravel.find(r => bases.some(b => b.startsWith(r + "/"))) ?? null;
}

/** Base contra la que corre artisan: lo fijado en el comando, si no la cache, si no el `.env`. */
function artisanDatabase(segment, sub, command, bases) {
	const fixed = key => command.match(new RegExp(`\\b${key}=([^\\s;'"&|]+)`))?.[1];
	const repo = artisanRepo(segment, bases);
	let file = {};

	if (repo) {
		const cache = dbFromConfigCache(join(repo, "bootstrap", "cache", "config.php"));
		const env = readEnvFile(join(repo, sub === "test" && existsSync(join(repo, ".env.testing")) ? ".env.testing" : ".env"));

		file = cache ?? { host: env.DB_HOST, port: env.DB_PORT, db: env.DB_DATABASE };
	}

	const host = fixed("DB_HOST") ?? file.host;

	return host ? { host, port: fixed("DB_PORT") ?? file.port, db: fixed("DB_DATABASE") ?? file.db } : null;
}

/**
 * Destinos a los que apunta un comando de Bash.
 *
 * @returns {Array<{kind: string, host: string, port?: string, db?: string, writes: boolean|null, why: string}>}
 */
function bashTargets(original, cwd) {
	const { clean, executed } = heredocs(original);
	const bases = baseDirs(clean, cwd);
	const targets = [];

	for (const segment of segments(clean)) {
		const { program, args, text } = segment;
		const isHttp = ["curl", "wget", "http", "https"].includes(program);

		for (const [, host, port] of text.matchAll(/\b(?:https?|wss?|ftp):\/\/(?:[^@\s/]+@)?([^\s/:'"`?#]+)(?::(\d+))?/gi))
			targets.push({ kind: "http", host, port, writes: isHttp ? HTTP_WRITE.test(` ${text} `) : null, why: isHttp ? program : "URL en el comando" });

		for (const [, , host, port, db] of text.matchAll(/\b(postgres(?:ql)?|mysql|mariadb|sqlserver|mssql|mongodb(?:\+srv)?|redis):\/\/(?:[^@\s/]+@)?([^:/\s?'"]+)(?::(\d+))?(?:\/([^?\s'"]+))?/gi))
			targets.push({ kind: "db", host, port, db, writes: null, why: "cadena de conexion" });

		for (const [, host, port, db] of text.matchAll(/jdbc:[a-z]+:\/\/([^:/;\s'"]+)(?::(\d+))?(?:[/;](?:databaseName=)?([^?;\s'"]+))?/gi))
			targets.push({ kind: "db", host, port, db, writes: null, why: "cadena JDBC" });

		const clientAt = [program, ...args].findIndex(token => DB_CLIENTS.has(basename(token)));

		if (clientAt >= 0) {
			const client = basename([program, ...args][clientAt]);
			const clientArgs = args.slice(Math.max(clientAt - 1, 0));
			const sqlcmd = client === "sqlcmd";
			const rawHost = sqlcmd
				? flag(clientArgs, ["-S"], ["--server"])
				: flag(clientArgs, ["-h"], ["--host"]) ?? clean.match(/\bPGHOST=([^\s;'"]+)/)?.[1] ?? text.match(/\bhost=([^\s'"]+)/)?.[1];

			if (rawHost) {
				const { host, port } = hostAndPort(rawHost);
				const finalPort = port ?? flag(clientArgs, sqlcmd ? [] : ["-p", "-P"], ["--port"]) ?? clean.match(/\bPGPORT=(\d+)/)?.[1];
				const db = flag(clientArgs, ["-d"], ["--dbname", "--database"]) ?? clean.match(/\bPGDATABASE=([^\s;'"]+)/)?.[1] ?? text.match(/\bdbname=([^\s'"]+)/)?.[1];
				const sql = sqlOf(segment, Math.max(clientAt - 1, 0), bases, executed.filter(e => e.program === client));
				let writes = null;

				if (READ_ONLY_CLIENTS.has(client))
					writes = false;
				else if (["createdb", "dropdb", "pg_restore", "vacuumdb"].includes(client))
					writes = true;
				else if (sql.trim())
					writes = SQL_WRITE.test(sql);

				targets.push({ kind: "db", host, port: finalPort, db, writes, why: client });
			}
		}

		const artisanAt = [program, ...args].findIndex(token => basename(token) === "artisan");

		if (artisanAt >= 0) {
			const sub = [program, ...args][artisanAt + 1] ?? "list";

			if (!ARTISAN_NO_DB.test(sub)) {
				const db = artisanDatabase(segment, sub, clean, bases);

				if (db)
					targets.push({ kind: "artisan", ...db, writes: !ARTISAN_READ.test(sub), why: `artisan ${sub}` });
			}
		}

		if (program === "ssh" || program === "sftp") {
			let i = 0;

			while (i < args.length && args[i].startsWith("-"))
				i += SSH_WITH_VALUE.has(args[i]) ? 2 : 1;

			if (args[i]) {
				const alias = args[i].replace(/^[^@]+@/, "");
				const { host, port } = hostAndPort(alias);
				const real = resolveSshHost(host);

				targets.push({ kind: "ssh", host: real, port, writes: null, why: host === real ? program : `${program} (alias ${host})` });
			}

			const jump = flag(args, ["-J"], []);

			if (jump)
				targets.push({ kind: "ssh", host: resolveSshHost(hostAndPort(jump.replace(/^[^@]+@/, "")).host), writes: null, why: "ssh -J" });
		}

		if (program === "scp" || program === "rsync") {
			const positional = args.filter(arg => !arg.startsWith("-"));

			positional.forEach((arg, index) => {
				const remote = arg.match(/^(?:[^@\s/]+@)?([^:\s/]+):(?!\/\/)/);
				const last = index === positional.length - 1;

				if (remote)
					targets.push({ kind: "copy", host: resolveSshHost(remote[1]), writes: last, why: `${program} ${last ? "hacia" : "desde"} el servidor` });
			});
		}

		if (["nc", "ncat", "netcat", "telnet"].includes(program)) {
			const host = args.find(arg => !arg.startsWith("-") && !/^\d+$/.test(arg));

			if (host)
				targets.push({ kind: "net", host, writes: null, why: program });
		}

		for (const [, host, port] of text.matchAll(/\b(?:TCP|UDP)\d?(?:-\w+)?:([^:,\s]+):(\d+)/gi))
			targets.push({ kind: "net", host, port, writes: null, why: "socat" });

		for (const [, host] of text.matchAll(/(?:\s-H\s*|--host[=\s]+|DOCKER_HOST=)['"]?(?:tcp|ssh):\/\/(?:[^@\s/]+@)?([^:/\s'"]+)/gi))
			targets.push({ kind: "docker", host, writes: null, why: "docker remoto" });
	}

	for (const [, value] of clean.matchAll(/--(?:host|hostname|server|servidor)[=\s]+['"]?([^\s'"]+)/gi)) {
		const { host, port } = hostAndPort(value);

		if (!targets.some(t => t.host === host))
			targets.push({ kind: "net", host, port, writes: null, why: "parametro --host" });
	}

	return targets;
}

/** Destinos de cualquier herramienta. */
function targetsOf(event, registry) {
	const input = event.tool_input ?? {};
	const tool = event.tool_name ?? "";

	if (tool === "Bash")
		return bashTargets(input.command ?? "", event.cwd ?? process.cwd());

	if (tool === "WebFetch") {
		const host = String(input.url ?? "").match(/^[a-z]+:\/\/(?:[^@/]+@)?([^/:?#]+)/i)?.[1];

		return host ? [{ kind: "http", host, writes: false, why: "WebFetch" }] : [];
	}

	if (tool.startsWith("mcp__")) {
		const server = tool.split("__")[1];
		const env = Object.entries(registry.environments ?? {}).find(([, def]) => (def.mcp ?? []).includes(server))?.[0];

		return env ? [{ kind: "mcp", host: server, fixed: env, writes: null, why: `MCP ${server}` }] : [];
	}

	if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
		const path = resolve(input.file_path ?? input.notebook_path ?? "");

		if ((registry.alwaysAllowed?.paths ?? []).some(allowed => path.startsWith(allowed)))
			return [];

		const env = Object.entries(registry.environments ?? {})
			.find(([name, def]) => name !== "local" && (def.paths ?? []).some(mount => path.startsWith(mount)))?.[0];

		return env ? [{ kind: "file", host: path, fixed: env, writes: true, why: "archivo montado del servidor" }] : [];
	}

	return [];
}

/** Archivos a los que escribe un comando: redirecciones, `tee`, `sed -i`, `cp`, `mv`, `rm`, `dd of=`. */
function writeTargets(command) {
	const out = [...command.matchAll(/(?:^|[^<>0-9&])\d?>>?(?!&)\s*(['"]?)([^\s'"|;&<>()]+)\1/g)].map(m => m[2]);

	for (const { program, args } of segments(command)) {
		const positional = args.filter(arg => !arg.startsWith("-"));

		if (program === "tee" || ["mv", "rm", "truncate", "unlink", "shred"].includes(program))
			out.push(...positional);
		if ((program === "sed" || program === "perl") && args.some(arg => /^-\w*i/.test(arg) || arg === "--in-place"))
			out.push(...positional);
		if (["cp", "install", "ln"].includes(program) && positional.length)
			out.push(positional[positional.length - 1]);
		if (program === "dd")
			out.push(...args.filter(arg => arg.startsWith("of=")).map(arg => arg.slice(3)));
	}

	return out.map(t => t.replace(/^['"]|['"]$/g, "")).filter(t => t !== "/dev/null");
}

/** Protege las piezas de la guarda: el estado y la bitacora no se tocan; registro y config piden aprobacion. */
function protectOwnPieces(event) {
	const tool = event.tool_name ?? "";
	const input = event.tool_input ?? {};

	if (tool === "Skill" && String(input.skill ?? "").replace(/^.*:/, "") === "ambiente")
		return decision("deny", "El cambio de ambiente solo lo hace el usuario con /ambiente o con una frase explicita. Tu no puedes invocarlo.");

	if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
		const path = resolve(input.file_path ?? input.notebook_path ?? "");

		if (path === PATHS.state || path === PATHS.log)
			return decision("deny", "Ese archivo lo manejan solo los hooks de ambiente: el estado lo cambia el usuario y la bitacora solo crece. No lo modifiques.");
		if (path === PATHS.registry)
			return decision("ask", "Claude propone un cambio en el registro de ambientes. Revisa que host o base asigna a que ambiente antes de aprobarlo.");
		if (path === SETTINGS || OWN_FILES.includes(path))
			return decision("ask", "Claude propone modificar settings.json o una pieza de la guarda de ambientes. Revisa el cambio antes de aprobarlo.");
	}

	if (tool === "Bash") {
		const command = input.command ?? "";
		const cwd = event.cwd ?? process.cwd();
		const mentions = OWN_PIECES.test(command);
		const touched = writeTargets(command).find(t => (t.includes("$") ? mentions : OWN_PIECES.test(isAbsolute(t) ? t : resolve(cwd, t))));

		if (touched || (mentions && SCRIPT_WRITE.test(command)))
			return decision("deny", "No modifiques desde Bash el estado de ambiente, la bitacora, el registro de ambientes, settings.json ni la guarda. Para el registro y la configuracion usa Edit: se le pedira aprobacion al usuario.");
	}

	return null;
}

/** Si el comando publica en un remoto. */
function isGitPush(command) {
	return segments(command).some(({ program, args }) => {
		if (program !== "git")
			return false;

		const positional = args.filter((arg, i) => !arg.startsWith("-") && args[i - 1] !== "-C" && args[i - 1] !== "-c");

		return positional[0] === "push";
	});
}

const event = readEvent();

if (!event)
	process.exit(0);

const registry = readRegistry();
const state = readState();
const decisions = [];
const own = protectOwnPieces(event);

if (own)
	decisions.push(own);

for (const target of targetsOf(event, registry)) {
	const result = evaluateTarget(target, registry, state);

	if (result.type !== "allow" || result.environment)
		decisions.push(result);
}

if (event.tool_name === "Bash" && isGitPush(event.tool_input?.command ?? ""))
	decisions.push(decision("ask", "git push publica en el repositorio remoto. Apruebalo solo si pediste subir estos cambios."));

const summary = String(event.tool_input?.command ?? event.tool_input?.url ?? event.tool_input?.file_path ?? "").slice(0, 300);

for (const d of decisions.filter(d => d.environment))
	log({ environment: d.environment, mode: state.mode, tool: event.tool_name, target: d.where,
		decision: { allow: "permitido", ask: "consultado al usuario", deny: "negado" }[d.type], command: summary });

const worst = decisions.reduce((max, d) => (RANK[d.type] > RANK[max] ? d.type : max), "allow");

if (worst === "allow")
	process.exit(0);

const reasons = [...new Set(decisions.filter(d => d.type === worst).map(d => d.reason))].slice(0, 2).join(" | ");

process.stdout.write(JSON.stringify({
	hookSpecificOutput: {
		hookEventName: "PreToolUse",
		permissionDecision: worst === "deny" ? "deny" : "ask",
		permissionDecisionReason: reasons,
	},
}));
