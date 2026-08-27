/**
 * Configuración por desarrollador (rutas, puertos, credenciales de pruebas).
 *
 * El orden de resolución es:
 *
 *   1. La variable de entorno, si está definida.
 *   2. `~/.claude/secrets.env` — **solo credenciales**, fuera de todo repo y con permisos 600.
 *   3. El bloque `env` de `<repo>/.claude/settings.local.json`.
 *   4. El bloque `env` de `<repo>/.claude/settings.json` (por si el equipo fija algo compartido).
 *   5. El valor por defecto que pase quien llama.
 *
 * El paso 2 existe porque una contraseña dentro de un repo es una contraseña a un descuido de
 * filtrarse, aunque el archivo esté ignorado. Los pasos 3 y 4 siguen ahí porque las rutas y
 * los puertos sí son configuración del repo y no tiene sentido centralizarlos.
 *
 * Los pasos 3 y 4 leen los archivos directamente en vez de confiar en el entorno: Claude Code
 * aplica el `env` de los settings **al iniciar la sesión**, así que un `settings.local.json`
 * recién creado no se vería hasta reiniciar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MOTOR TRANSVERSAL del cerebro. No contiene nada de ningún proyecto concreto.
 * Lo específico va en el perfil: `~/.claude/brain/projects/<proyecto>/manual/profile.mjs`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { secret, SECRETS_PATH } from "../../../brain/lib/secrets.mjs";

/** Raíz del cerebro, que también es un repo git y por eso hay que distinguirla. */
const BRAIN_ROOT = join(homedir(), ".claude");

/**
 * Repo de **trabajo** al que se refiere esta corrida.
 *
 * No basta con el repo git del directorio actual: los flujos se ejecutan desde
 * `~/.claude/brain/projects/<proyecto>/manual/`, que está dentro del repo del cerebro. Tomarlo
 * tal cual haría buscar la configuración en `~/.claude/.claude`, que no existe, y el fallo sería
 * silencioso —todo caería a los valores por defecto— hasta que algo apuntara al sitio equivocado.
 *
 * Por eso, si el directorio actual está dentro del cerebro, el repo se deduce del proyecto al
 * que pertenece la carpeta y se busca en `brain/projects.json`.
 *
 * @returns Ruta absoluta del repo de trabajo, o `null` si no se puede determinar.
 */
function workRepo() {
	let root = null;

	try {
		root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	}
	catch {
		root = null;
	}

	if (root && root !== BRAIN_ROOT) return root;

	// Se está corriendo desde dentro del cerebro: deducir el proyecto por la ruta.
	const match = process.cwd().match(/\/brain\/projects\/([^/]+)\//);
	if (!match) return null;

	try {
		const { projects } = JSON.parse(readFileSync(join(BRAIN_ROOT, "brain", "projects.json"), "utf8"));

		return projects[match[1]]?.repos?.find(existsSync) ?? null;
	}
	catch {
		return null;
	}
}

/**
 * Carpeta `.claude/` del repo de trabajo.
 *
 * @returns La ruta, o `null` si no se pudo determinar el repo.
 */
function repoClaudeDir() {
	const root = workRepo();

	return root ? join(root, ".claude") : null;
}

const CLAUDE_DIR = repoClaudeDir();

/** Lee el bloque `env` de un settings del repo, tolerando que no exista o esté mal formado. */
function readEnvBlock(fileName) {
	if (!CLAUDE_DIR) return {};

	const path = join(CLAUDE_DIR, fileName);
	if (!existsSync(path)) return {};

	try {
		return JSON.parse(readFileSync(path, "utf8"))?.env ?? {};
	}
	catch (error) {
		console.warn(`Aviso: no se pudo leer ${fileName} (${error.message}); se ignora.`);

		return {};
	}
}

const localEnv = readEnvBlock("settings.local.json");
const projectEnv = readEnvBlock("settings.json");

/**
 * Valor de configuración por nombre.
 *
 * Las claves de documentación de los settings (`"//"`, `"//credenciales"`) se ignoran solas
 * porque nunca coinciden con un nombre de variable.
 *
 * @param {string} name - Nombre de la variable, por ejemplo `AIO_MANUAL_WEB`
 * @param {*} [fallback] - Valor si no está definida en ningún lado
 * @returns {*} El valor, o `fallback`. Una variable definida pero **vacía** cuenta como no
 *          definida: las plantillas las traen en blanco para que cada quien las llene
 */
export function setting(name, fallback = undefined) {
	const value = process.env[name] || secret(name) || localEnv[name] || projectEnv[name] || fallback;

	return value === "" ? fallback : value;
}

/**
 * Igual que `setting`, pero para lo que no tiene alternativa razonable.
 *
 * @param {string} name - Nombre de la variable
 * @param {object} [options]
 * @param {string} [options.para] - Para qué sirve, para que el mensaje de error sea accionable
 * @returns {string} El valor. **Si falta, no devuelve: termina el proceso** con un mensaje que
 *          dice dónde definirlo, distinguiendo credenciales del resto
 */
export function requiredSetting(name, { para } = {}) {
	const value = setting(name);

	if (value) return value;

	const isCredential = /PASSWORD|TOKEN|SECRET|EMAIL/.test(name);
	const donde = isCredential
		? `${SECRETS_PATH} (una línea ${name}=...)`
		: `el bloque "env" de .claude/settings.local.json del repo`;

	console.error(`Falta ${name}${para ? ` (${para})` : ""}.\nDefínelo en ${donde}.`);
	process.exit(1);
}
