/**
 * Registro, estado y evaluacion del ambiente de trabajo (local, desa, qa, pre, prod).
 * El registro sale de `brain/environments.json` mas las credenciales `<PROY>_<AMB>_DB_*` de
 * secrets.env; el estado y la bitacora viven en `cache/environment/`, fuera del repo.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ENVIRONMENT_DIR solo se usa en pruebas: los comandos que corre Claude no alcanzan el env del hook.
const BASE = process.env.ENVIRONMENT_DIR || join(homedir(), ".claude");

export const PATHS = {
	base: BASE,
	registry: join(BASE, "brain", "environments.json"),
	secrets: join(BASE, "secrets.env"),
	state: join(BASE, "cache", "environment", "state.json"),
	log: join(BASE, "cache", "environment", "log.jsonl"),
};

export const ENVIRONMENTS = ["local", "desa", "qa", "pre", "prod"];

/** Nombres con que el usuario puede referirse a cada ambiente. */
const ALIASES = {
	local: "local",
	desa: "desa", desarrollo: "desa", dev: "desa",
	qa: "qa", pruebas: "qa", calidad: "qa",
	pre: "pre", preproduccion: "pre", "preproducción": "pre",
	prod: "prod", produccion: "prod", "producción": "prod", production: "prod",
};

/** Alternativa de regex con todos los alias, para reconocerlos en un mensaje. */
export const ALIAS_PATTERN = Object.keys(ALIASES).sort((a, b) => b.length - a.length).join("|");

/** Hosts que siempre son este equipo, aunque no esten en el registro. */
const FIXED_LOCAL = ["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"];

/** Claves de secrets.env cuyo valor nunca debe quedar escrito en la bitacora. */
const SENSITIVE_KEY = /PASSWORD|TOKEN|SECRET|_KEY$/;

/** Connection field of a database server: `DB_DESA_HOST`, `DB_PROD_PASSWORD`. */
const SERVER_KEY = /^DB_([A-Z0-9]+)_(HOST|PORT|USERNAME|PASSWORD)$/;

/** Database name: `DB_STATUS_QA` (project, env). `DB_PROD_STATUS` (env, project) is also read. */
const NAME_KEY = /^DB_([A-Z0-9]+)_([A-Z0-9]+)$/;

const ENV_CODES = new Set(["DESA", "QA", "PRE", "PROD"]);

/** Nombre canonico de un ambiente (`local`, `desa`, `qa`, `pre`, `prod`); `null` si no lo es. */
export function normalizeEnvironment(text) {
	return ALIASES[String(text ?? "").toLowerCase()] ?? null;
}

/** Pares [clave, valor] de secrets.env sin comentarios; conserva los duplicados, en orden. */
export function secretEntries() {
	let text = "";

	try {
		text = readFileSync(PATHS.secrets, "utf8");
	}
	catch {
		return [];
	}

	return text.split("\n")
		.map(l => l.trim())
		.filter(l => l && !l.startsWith("#") && l.indexOf("=") > 0)
		.map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]);
}

/** The registry file as written, or `{}` if it is missing or broken. */
function readRegistryFile() {
	try {
		return JSON.parse(readFileSync(PATHS.registry, "utf8"));
	}
	catch {
		return {};
	}
}

/**
 * Databases per environment, built from the servers and names in secrets.env.
 *
 * @returns {{databases: Array<{env: string, project: string, server: string, host: string, port?: string, db: string, source: string}>, unclassified: string[]}}
 *   `unclassified`: `DB_*` keys that fit no pattern or whose environment has no server
 */
export function databasesFromSecrets() {
	const servers = readRegistryFile().servers ?? {};
	const conn = {};
	const names = [];
	const unclassified = [];

	for (const [key, value] of secretEntries()) {
		if (!key.startsWith("DB_"))
			continue;

		const field = key.match(SERVER_KEY);

		if (field && servers[field[1]]) {
			conn[field[1]] = { ...conn[field[1]], [field[2].toLowerCase()]: value };
			continue;
		}

		const name = key.match(NAME_KEY);
		const [project, env] = !name ? [] : ENV_CODES.has(name[2]) ? [name[1], name[2]] : ENV_CODES.has(name[1]) ? [name[2], name[1]] : [];

		if (project)
			names.push({ project: project.toLowerCase(), env: env.toLowerCase(), db: value, source: key });
		else
			unclassified.push(key);
	}

	const databases = [];

	for (const entry of names) {
		const server = Object.keys(servers).find(s => servers[s].includes(entry.env));

		if (server && conn[server]?.host)
			databases.push({ ...entry, server, host: conn[server].host, port: conn[server].port });
		else
			unclassified.push(entry.source);
	}

	return { databases, unclassified: [...new Set(unclassified)] };
}

/**
 * Full connection for a project database, checked by the guard before it is returned.
 *
 * @param {string} project - Key as in secrets.env, e.g. `status`
 * @param {string} env - `desa`, `qa`, `pre` or `prod`
 * @param {{writes?: boolean|null}} [options] - `false` for queries: lets it pass in read mode
 * @returns {{host: string, port?: string, user?: string, password?: string, db: string}}
 */
export function dbConnection(project, env, { writes = null } = {}) {
	const entry = databasesFromSecrets().databases.find(d => d.project === project.toLowerCase() && d.env === env);

	if (!entry)
		throw new Error(`No database for ${project} in ${env}: add DB_${project.toUpperCase()}_${env.toUpperCase()} to secrets.env`);

	assertEnvironment({ host: entry.host, port: entry.port, db: entry.db, writes, why: `dbConnection(${project}, ${env})` });

	const secrets = Object.fromEntries(secretEntries());
	const prefix = `DB_${entry.server}_`;

	return { host: entry.host, port: entry.port, user: secrets[`${prefix}USERNAME`], password: secrets[`${prefix}PASSWORD`], db: entry.db };
}

/** Host de una URL, o `null`. */
function hostOf(url) {
	return String(url ?? "").match(/^[a-z]+:\/\/(?:[^@/]+@)?([^/:?#]+)/i)?.[1]?.toLowerCase() ?? null;
}

/** Registro completo: el archivo mas lo derivado de secrets.env. Sin archivo, solo local. */
export function readRegistry() {
	const file = readRegistryFile();

	const environments = Object.fromEntries(ENVIRONMENTS.map(env => [env, { hosts: [], ssh: [], databases: [], paths: [], mcp: [], ...(file.environments?.[env] ?? {}) }]));

	environments.local.hosts = [...new Set([...environments.local.hosts, ...FIXED_LOCAL])];
	environments.prod.production = true;

	for (const db of databasesFromSecrets().databases)
		environments[db.env]?.databases.push({ host: db.host, port: db.port, db: db.db });

	const secrets = Object.fromEntries(secretEntries());
	const allowedHosts = [
		...(file.alwaysAllowed?.hosts ?? []),
		...(file.alwaysAllowed?.fromSecrets ?? []).map(key => hostOf(secrets[key])).filter(Boolean),
	];

	return { environments, alwaysAllowed: { hosts: allowedHosts, paths: file.alwaysAllowed?.paths ?? [] } };
}

/** Ambiente activo; local si no hay estado o esta danado, que es el lado seguro. */
export function readState() {
	try {
		const state = JSON.parse(readFileSync(PATHS.state, "utf8"));

		if (ENVIRONMENTS.includes(state?.environment))
			return state;
	}
	catch {
		// Sin estado valido se cae a local: todo destino remoto queda negado.
	}

	return { environment: "local", mode: "escritura" };
}

/** Guarda el ambiente activo. Solo lo llaman los hooks de activacion. */
export function saveState(state) {
	mkdirSync(dirname(PATHS.state), { recursive: true, mode: 0o700 });
	writeFileSync(PATHS.state, JSON.stringify({ ...state, updated: new Date().toISOString() }, null, 2), { mode: 0o600 });
}

/** Texto sin contrasenas ni tokens: valores de secrets.env, `X_PASSWORD=`, `user:pass@` y `mysql -p`. */
export function redact(text) {
	let out = String(text ?? "");

	for (const [key, value] of secretEntries()) {
		if (SENSITIVE_KEY.test(key) && value.length >= 4)
			out = out.split(value).join("***");
	}

	return out
		.replace(/\b([A-Z_]*(?:PASSWORD|TOKEN|SECRET)[A-Z_]*)=(\S+)/g, "$1=***")
		.replace(/(\/\/[^:/\s@]+):[^@\s/]+@/g, "$1:***@")
		.replace(/(\bmysql\S*\s[^|;&]*?-p)(\S+)/g, "$1***");
}

/** Agrega un evento a la bitacora de lo hecho fuera de local, ya sin secretos. */
export function log(event) {
	try {
		mkdirSync(dirname(PATHS.log), { recursive: true, mode: 0o700 });
		appendFileSync(PATHS.log, `${redact(JSON.stringify({ date: new Date().toISOString(), ...event }))}\n`, { mode: 0o600 });
	}
	catch {
		// La bitacora nunca puede tumbar al hook.
	}
}

/** Estado en una linea: `local`, o `qa · modo lectura`. */
export function describeState(state) {
	if (state.environment === "local")
		return "local";

	return `${state.environment} · ${state.mode ? `modo ${state.mode}` : "falta definir el modo"}`;
}

/** Si el ambiente es produccion. */
export function isProduction(registry, env) {
	return env === "prod" || registry.environments?.[env]?.production === true;
}

/** Si un host es de la red interna: IP privada o dominio de la empresa. */
export function isInternal(host) {
	const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);

	if (ip) {
		const [a, b] = [Number(ip[1]), Number(ip[2])];

		return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
	}

	return /\.(datint\.co|local|lan|internal|corp)$/i.test(host);
}

function matches(host, list = []) {
	return list.some((item) => {
		const value = String(item).toLowerCase();

		return host === value || host.endsWith(`.${value}`);
	});
}

/**
 * Host real de un alias de ~/.ssh/config (`ssh -G`, no conecta). Sin alias, el mismo host.
 *
 * @param {string} host - Lo que se escribio despues de `ssh`
 * @returns {string}
 */
export function resolveSshHost(host) {
	if (!host || host.includes(".") || FIXED_LOCAL.includes(host))
		return host;

	const r = spawnSync("ssh", ["-G", host], { encoding: "utf8", timeout: 3000 });
	const real = r.status === 0 ? r.stdout.match(/^hostname\s+(\S+)/m)?.[1] : null;

	return real || host;
}

/**
 * Ubica un host en el registro.
 *
 * @returns {{scope: string, environment?: string, environments?: string[]}} scope: `local`,
 *   `allowed`, `public`, `environment`, `ambiguous` o `unknown`
 */
export function classifyHost(registry, host) {
	const clean = String(host ?? "").toLowerCase().replace(/^\[|\]$/g, "");

	if (!clean || FIXED_LOCAL.includes(clean))
		return { scope: "local" };

	// Sin punto es un servicio de docker o un nombre de este equipo; los alias de SSH se resuelven antes.
	if (!clean.includes(".") && !clean.includes(":"))
		return { scope: "local" };

	const found = Object.entries(registry.environments ?? {})
		.filter(([, def]) => matches(clean, def.hosts) || matches(clean, def.ssh)
			|| (def.databases ?? []).some(db => String(db.host).toLowerCase() === clean))
		.map(([name]) => name);

	if (found.includes("local"))
		return { scope: "local" };
	if (found.length === 1)
		return { scope: "environment", environment: found[0] };
	if (found.length > 1)
		return { scope: "ambiguous", environments: found };
	if (matches(clean, registry.alwaysAllowed?.hosts))
		return { scope: "allowed" };

	return isInternal(clean) ? { scope: "unknown" } : { scope: "public" };
}

/** Ubica una base: un servidor puede alojar bases de varios ambientes, asi que compara host, puerto y base. */
export function classifyDatabase(registry, { host, port, db }) {
	const byHost = classifyHost(registry, host);

	if (["local", "allowed", "public"].includes(byHost.scope))
		return byHost;

	const clean = String(host).toLowerCase();
	const search = (withPort) => {
		const hits = new Set();

		for (const [name, def] of Object.entries(registry.environments ?? {})) {
			for (const entry of def.databases ?? []) {
				const sameHost = String(entry.host).toLowerCase() === clean;
				const samePort = !withPort || !port || !entry.port || Number(entry.port) === Number(port);
				const sameDb = !db || !entry.db || String(entry.db).toLowerCase() === String(db).toLowerCase();

				if (sameHost && samePort && sameDb)
					hits.add(name);
			}
		}

		return [...hits];
	};

	const strict = search(true);
	const list = strict.length ? strict : search(false);

	if (list.length === 1)
		return list[0] === "local" ? { scope: "local" } : { scope: "environment", environment: list[0] };
	if (list.length > 1)
		return { scope: "ambiguous", environments: list };

	return byHost;
}

/**
 * Decide si un destino se permite en el estado actual.
 *
 * @param {{kind: string, host: string, port?: string, db?: string, writes: boolean|null, why: string, fixed?: string}} target
 * @returns {{type: "allow"|"ask"|"deny", reason: string, environment?: string, where: string}}
 */
export function evaluateTarget(target, registry, state) {
	const place = target.fixed
		? { scope: "environment", environment: target.fixed }
		: ["db", "artisan"].includes(target.kind) ? classifyDatabase(registry, target) : classifyHost(registry, target.host);
	const where = `${target.host}${target.port ? `:${target.port}` : ""}${target.db ? `/${target.db}` : ""}`;
	const result = (type, reason = "", environment) => ({ type, reason, environment, where, why: target.why });

	if (["local", "allowed", "public"].includes(place.scope))
		return result("allow");

	if (place.scope === "unknown")
		return result("deny", `El comando apunta a ${where} (${target.why}), que no esta registrado en ningun ambiente. Preguntale al usuario a que ambiente pertenece; si te lo dice, propon el cambio en ~/.claude/brain/environments.json con Edit y se le pedira aprobarlo.`);

	if (place.scope === "ambiguous")
		return result("deny", `${target.host} es un servidor que comparten ${place.environments.join(", ")}. Indica la base de datos (-d) para saber en que ambiente cae; si no esta registrada, preguntale al usuario.`);

	const env = place.environment;

	if (env !== state.environment) {
		const how = isProduction(registry, env)
			? "Produccion solo se activa con /ambiente prod <lectura|escritura>"
			: `Se activa con una frase como «vamos a trabajar en el ambiente de ${env}» o con /ambiente ${env} <lectura|escritura>`;

		return result("deny", `El comando apunta a ${env} (${where}) y el ambiente activo es ${describeState(state)}. Solo el usuario puede cambiar de ambiente: ${how}. No busques otra forma de llegar a ${env}.`, env);
	}

	if (!state.mode)
		return result("deny", `El ambiente ${env} esta activo pero falta el modo. Preguntale al usuario si vamos en lectura o en escritura; hasta que responda no se opera en ${env}.`, env);

	if (state.mode === "lectura" && target.writes === true)
		return result("deny", `Estamos en ${env} en modo lectura y esta operacion modifica (${target.why} sobre ${where}). Si hay que modificar, el usuario debe cambiar el modo a escritura.`, env);

	if (state.mode === "lectura" && target.writes === null)
		return result("ask", `Modo lectura en ${env}: no se puede saber si esta operacion modifica (${target.why} sobre ${where}). Apruebala solo si es de consulta.`, env);

	if (isProduction(registry, env))
		return result("ask", `Operacion en PRODUCCION (${target.why} sobre ${where}, modo ${state.mode}). Revisa el comando antes de aprobarlo.`, env);

	return result("allow", "", env);
}

/**
 * Para conectores del cerebro: lanza si el destino no se permite sin preguntar. Un script no puede
 * pedir aprobacion, asi que `ask` tambien lanza: esa operacion se corre desde Bash, a la vista.
 */
export function assertEnvironment({ host, port, db, writes = null, why = "conector del cerebro" }) {
	const decision = evaluateTarget({ kind: "db", host, port, db, writes, why }, readRegistry(), readState());

	log({ environment: decision.environment, tool: "assertEnvironment", target: decision.where, decision: decision.type });

	if (decision.type !== "allow")
		throw new Error(decision.reason || `Operacion no permitida sobre ${decision.where}`);
}
