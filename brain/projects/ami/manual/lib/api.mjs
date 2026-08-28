/**
 * Consultas al backend local, para preparar y verificar una corrida sin abrir el navegador.
 *
 * Sirve para dos cosas:
 *
 * 1. **Obtener el token de sesión**, que el flujo de capturas necesita en `--token`: la app se
 *    autentica escribiendo la cookie `authUser`, y el token va adentro. Viene anidado dentro
 *    de `data` en la respuesta del login, así que no se saca con un `.data.token` directo.
 * 2. **Verificar que hay datos antes de capturar.** Una corrida toma varios minutos; comprobar
 *    por API que el módulo tiene registros toma segundos. Si no hay datos, no se captura: una
 *    pantalla vacía no se documenta.
 *
 * Uso como CLI:
 *   node lib/api.mjs token
 *   node lib/api.mjs get "visits/v0/get-all?company_id=0"
 *   node lib/api.mjs count "visits/v0/get-all?company_id=0"
 */

import { pathToFileURL } from "node:url";
import { DEFAULT_API, testCredentials } from "./session.mjs";

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

/**
 * Autentica contra el backend local y devuelve el token.
 *
 * Las credenciales salen de AMI_TEST_EMAIL / AMI_TEST_PASSWORD, igual que el resto de la skill.
 *
 * @param {object} [options]
 * @param {string} [options.email] - Tiene prioridad sobre la variable de entorno
 * @param {string} [options.password] - Idem
 * @param {string} [options.deviceName="AppMovil"] - Nombre del dispositivo que registra Sanctum
 * @param {string} [options.api] - URL base de la API
 * @returns {Promise<string>} El token que va en `--token` del flujo de capturas
 * @throws {Error} Si el backend no responde o las credenciales fallan
 */
export async function login({ email, password, deviceName = "AppMovil", api = DEFAULT_API } = {}) {
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

	const token = findToken(body);
	if (!token) throw new Error(`El login respondió sin token: ${JSON.stringify(body).slice(0, 200)}`);

	return token;
}

/**
 * GET autenticado.
 *
 * @param {string} path - Ruta **sin** barra inicial, por ejemplo `visits/v0/get-all`
 * @param {object} [options]
 * @param {string} [options.token] - Si no se pasa, autentica con `login()`
 * @param {string} [options.api] - URL base de la API
 * @returns {Promise<object>} El cuerpo parseado, con la envoltura del backend
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
 * @throws {Error} Si el endpoint falla
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
			console.log(await countRecords(argument));
		}
		else {
			console.error("Uso: node lib/api.mjs token | get <ruta> | count <ruta>");
			process.exit(1);
		}
	}
	catch (error) {
		console.error(error.message);
		process.exit(1);
	}
}
