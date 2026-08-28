/**
 * Adaptador de la app móvil (AMI): todo lo que sabe de Ionic y de esta app.
 *
 * Lo genérico (lanzar Chrome, evaluar, esperar, capturar) vive en `browser.mjs`, que es
 * idéntico en aio-app. Lo que dependa del framework o de la app va aquí.
 */

import { evaluate } from "./browser.mjs";
import { setting } from "./config.mjs";

/**
 * Tamaño de captura del manual de la app móvil: teléfono, modo oscuro, con la barra
 * azul superior. Es el de las capturas ya publicadas; mantenerlo para que el manual
 * se vea uniforme.
 */
export const VIEWPORT = { width: 390, height: 844, mobile: true };

/** URL del dev server de app-movil. Se puede fijar con AMI_WEB_URL. */
export const DEFAULT_BASE = setting("AMI_WEB_URL", "http://localhost:5180");

/** URL de la API local contra la que corre la app. Se puede fijar con AIO_API_URL. */
export const DEFAULT_API = setting("AIO_API_URL", "http://localhost:8085/api");

/**
 * Credenciales del usuario de pruebas.
 *
 * No se guardan en el repo: cada desarrollador define AMI_TEST_EMAIL y AMI_TEST_PASSWORD
 * en su `.claude/settings.local.json` (ver el .example), o las pasa por `--email`/`--password`.
 *
 * @param {object} [options]
 * @param {string} [options.email] - Tiene prioridad sobre la configuración
 * @param {string} [options.password] - Idem
 * @returns {{email: string, password: string}} **Si falta alguna, no devuelve: termina el
 *          proceso** indicando dónde definirlas
 */
export function testCredentials({ email, password } = {}) {
	const user = email ?? setting("AMI_TEST_EMAIL");
	const pass = password ?? setting("AMI_TEST_PASSWORD");

	if (!user || !pass) {
		console.error(
			"Faltan las credenciales del usuario de pruebas.\n" +
				"Pásalas con --email / --password, o define AMI_TEST_EMAIL y AMI_TEST_PASSWORD\n" +
				"en el bloque \"env\" de .claude/settings.local.json (ver el .example del repo).",
		);
		process.exit(1);
	}

	return { email: user, password: pass };
}

/**
 * Escribe un valor en un `ion-input` disparando los eventos que Ionic escucha.
 *
 * Los `ion-input` son web components: el evento tiene que viajar con `composed: true`
 * para cruzar el shadow DOM, y además hay que emitir el `ionInput` propio de Ionic con
 * el valor en el `detail`. Un `input` normal no actualiza el binding de Vue.
 *
 * (Vive aquí y no en `browser.mjs` porque el AIO web necesita otros eventos: Vuetify valida
 * el VForm con `change` y `blur`.)
 *
 * `index` sirve para las pantallas con varios campos iguales. Es la forma fiable de apuntar a
 * uno concreto: **Ionic Vue no refleja sus props como atributos** en el DOM, así que un selector
 * del estilo `ion-col[size="8"] ion-input` no coincide con nada aunque el template diga
 * `<IonCol size="8">`.
 *
 * Lanza si no encuentra el campo: un `type` que no escribe se descubre varios pasos después,
 * cuando la pantalla se queja de que falta un dato.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} selector - Selector del `input` interno, no del `ion-input` que lo envuelve
 * @param {string} value - Valor a escribir. Reemplaza el contenido, no lo concatena
 * @param {object} [options]
 * @param {number} [options.index=0] - Cuál de los campos que cumplen el selector. Es la forma
 *        fiable de apuntar a uno concreto cuando hay varios iguales
 * @returns {Promise<void>}
 * @throws {Error} Si no encuentra el campo en esa posición
 */
export async function type(cdp, selector, value, { index = 0 } = {}) {
	const written = await evaluate(
		cdp,
		`(() => { const input = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!input) return false;
      input.value = ${JSON.stringify(value)};
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, composed: true, detail: { value: ${JSON.stringify(value)} } }));
      return true; })()`,
	);

	if (!written) throw new Error(`No se encontró el campo para escribir: ${selector} [${index}]`);
}
