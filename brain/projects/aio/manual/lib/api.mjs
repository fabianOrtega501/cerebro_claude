/**
 * Consultas al backend local, para preparar y verificar una corrida sin abrir el navegador.
 *
 * Sirve para dos cosas:
 *
 * 1. **Verificar que hay datos antes de capturar.** Una corrida completa toma entre 2 y 4
 *    minutos; comprobar por API que el módulo tiene registros toma segundos. Si no hay datos,
 *    no se captura: una pantalla vacía no se documenta.
 * 2. **Obtener el token** cuando algún flujo lo necesite. El token viene anidado dentro de
 *    `data` en la respuesta del login, así que no se saca con un `.data.token` directo.
 *
 * Uso como CLI:
 *   node lib/api.mjs token
 *   node lib/api.mjs get "categories/v0/get-select-data?company_id=0"
 *   node lib/api.mjs count "category-items/v0/get-all?company_id=0"
 */

import { pathToFileURL } from "node:url";
import { setting } from "./config.mjs";
import { testCredentials } from "./session.mjs";

/** URL de la API local. Se puede fijar con AIO_API_URL. */
export const DEFAULT_API = setting("AIO_API_URL", "http://localhost:8085/api");

/** Busca la primera propiedad `token` a cualquier profundidad de la respuesta del login. */
function findToken(value) {
	if (!value || typeof value !== "object") return null;

	for (const [key, nested] of Object.entries(value)) {
		if (key === "token" && typeof nested === "string" && nested) return nested;

		const found = findToken(nested);
		if (found) return found;
	}

	return null;
}

/*
 * El login del backend está limitado a 5 intentos por minuto y por email+IP
 * (`RouteServiceProvider` de aio-backend). Autenticar en cada consulta agota el cupo en
 * segundos y el backend responde 429. Por eso el token se reutiliza dentro del proceso, y
 * por eso `count` acepta varias rutas de una sola vez.
 */
let cachedToken = null;

/**
 * Autentica contra el backend local y devuelve el token.
 *
 * Las credenciales salen de AIO_TEST_EMAIL / AIO_TEST_PASSWORD, igual que el resto de la skill.
 *
 * @param {object} [options]
 * @param {string} [options.email] - Tiene prioridad sobre la variable de entorno
 * @param {string} [options.password] - Idem
 * @param {string} [options.deviceName="web"] - Nombre del dispositivo que registra Sanctum
 * @param {string} [options.api] - URL base de la API
 * @returns {Promise<string>} El token. **Se cachea en el proceso**: la segunda llamada no
 *          vuelve a autenticar, para no agotar el límite de 5 logins por minuto
 * @throws {Error} Si el backend no responde, si las credenciales fallan, o con 429 al agotarse
 *         el límite; el mensaje explica cómo agrupar las consultas
 */
export async function login({ email, password, deviceName = "web", api = DEFAULT_API } = {}) {
	if (cachedToken) return cachedToken;

	const credentials = testCredentials({ email, password });

	const response = await fetch(`${api}/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...credentials, device_name: deviceName }),
	}).catch((error) => {
		throw new Error(`No se pudo hablar con el backend en ${api}: ${error.message}. ¿Está arriba Sail?`);
	});

	const body = await response.json().catch(() => null);

	if (!response.ok || !body) {
		throw new Error(`El login falló (HTTP ${response.status}). Respuesta: ${JSON.stringify(body)?.slice(0, 200)}`);
	}

	if (response.status === 429) {
		throw new Error(
			"El backend respondió 429: se agotó el límite de 5 logins por minuto.\n" +
				"Espera un minuto, y agrupa las consultas en una sola invocación " +
				'(por ejemplo: node lib/api.mjs count "ruta1" "ruta2" "ruta3").',
		);
	}

	const token = findToken(body);
	if (!token) throw new Error(`El login respondió sin token: ${JSON.stringify(body).slice(0, 200)}`);

	cachedToken = token;

	return token;
}

/**
 * GET autenticado.
 *
 * @param {string} path - Ruta **sin** barra inicial, por ejemplo `categories/v0/get-select-data`
 * @param {object} [options]
 * @param {string} [options.token] - Si no se pasa, autentica con `login()`
 * @param {string} [options.api] - URL base de la API
 * @returns {Promise<object>} El cuerpo ya parseado, con la envoltura del backend
 *          (`{status, message, data, meta}`)
 * @throws {Error} Si el endpoint responde con un código de error
 */
export async function apiGet(path, { token, api = DEFAULT_API } = {}) {
	const authorization = token ?? (await login());

	const response = await fetch(`${api}/${path}`, {
		headers: { Authorization: `Bearer ${authorization}`, Accept: "application/json" },
	});

	const body = await response.json().catch(() => null);

	if (!response.ok) {
		throw new Error(`GET ${path} respondió HTTP ${response.status}: ${JSON.stringify(body)?.slice(0, 200)}`);
	}

	return body;
}

/**
 * Cuántos registros devuelve un endpoint de listado.
 *
 * Es el chequeo previo a una corrida: si da 0, el módulo no tiene datos en este ambiente y
 * capturarlo produciría pantallas vacías.
 *
 * @param {string} path - Ruta del listado, sin barra inicial
 * @param {object} [options] - Los mismos que `apiGet`
 * @returns {Promise<number>} Cuántos registros hay. Toma `meta.total` cuando el endpoint pagina,
 *          y el largo de `data` cuando devuelve el listado completo
 * @throws {Error} Si el endpoint falla. Ojo: algunos revientan con `per_page=all`
 */
export async function countRecords(path, options = {}) {
	const body = await apiGet(path, options);
	const data = body?.data;

	if (Array.isArray(data)) return data.length;

	return Number(body?.meta?.total ?? 0);
}

// ----------------------------------------------------------------------- CLI

// `pathToFileURL` y no una plantilla `file://${...}`: en Windows la ruta es `C:\...` y la
// comparación falla por el número de barras (`file://C:/` contra `file:///C:/`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const [command, argument] = process.argv.slice(2);

	try {
		if (command === "token") {
			console.log(await login());
		}
		else if (command === "get" && argument) {
			console.log(JSON.stringify(await apiGet(argument), null, 2));
		}
		else if (command === "count" && argument) {
			// Varias rutas en una sola invocación: un login para todas, en vez de uno por
			// consulta, que es lo que agota el límite de 5 por minuto.
			const paths = process.argv.slice(3);
			const width = Math.max(...paths.map((path) => path.length));

			for (const path of paths) {
				try {
					console.log(`${path.padEnd(width)}  ${await countRecords(path)}`);
				}
				catch (error) {
					console.log(`${path.padEnd(width)}  ERROR: ${error.message.split("\n")[0].slice(0, 90)}`);
				}
			}
		}
		else {
			console.error("Uso: node lib/api.mjs token | get <ruta> | count <ruta> [<ruta>...]");
			process.exit(1);
		}
	}
	catch (error) {
		console.error(error.message);
		process.exit(1);
	}
}
