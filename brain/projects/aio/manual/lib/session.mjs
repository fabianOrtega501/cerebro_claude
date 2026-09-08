/**
 * Adaptador del AIO web: todo lo que sabe de Vuetify, de Leaflet y de esta app.
 *
 * Lo genérico (lanzar Chrome, evaluar, esperar, capturar) vive en `browser.mjs`, que es
 * idéntico en app-movil. Lo que dependa del framework o de la app va aquí.
 *
 * Un script de captura solo debería tener que llamar a `openSession` y luego navegar
 * a su vista.
 */

import {
	click,
	clickAt,
	clickByText,
	connectPage,
	evaluate,
	injectOnLoad,
	launchChrome,
	pressEscape,
	requestCount,
	setViewport,
	trackRequests,
	wait,
	waitForRequestsIdle,
	waitForSelector,
	waitForText,
} from "./browser.mjs";
import { setting } from "./config.mjs";

/**
 * Tamaño de captura del manual del AIO web: ventana completa, tema claro.
 * Es el de las capturas que ya están publicadas; mantenerlo para que el manual
 * se vea uniforme.
 */
export const VIEWPORT = { width: 1486, height: 795 };

/** URL del dev server del AIO web. Se puede fijar con AIO_WEB_URL. */
export const DEFAULT_BASE = setting("AIO_WEB_URL", "http://localhost:5173");

/**
 * Credenciales del usuario de pruebas.
 *
 * No se guardan en el repo: cada desarrollador define AIO_TEST_EMAIL y AIO_TEST_PASSWORD
 * en su `.claude/settings.local.json` (ver el .example), o las pasa por `--email`/`--password`.
 *
 * @param {object} [options]
 * @param {string} [options.email] - Tiene prioridad sobre la configuración
 * @param {string} [options.password] - Idem
 * @returns {{email: string, password: string}} Listas para `openSession`. **Si falta alguna, no
 *          devuelve: termina el proceso** indicando dónde definirlas
 */
export function testCredentials({ email, password } = {}) {
	const user = email ?? setting("AIO_TEST_EMAIL");
	const pass = password ?? setting("AIO_TEST_PASSWORD");

	if (!user || !pass) {
		console.error(
			"Faltan las credenciales del usuario de pruebas.\n" +
				"Pásalas con --email / --password, o define AIO_TEST_EMAIL y AIO_TEST_PASSWORD\n" +
				"en el bloque \"env\" de .claude/settings.local.json (ver el .example del repo).",
		);
		process.exit(1);
	}

	return { email: user, password: pass };
}

/**
 * Escribe un valor en un input disparando los eventos que Vuetify escucha.
 * El `change` y el `blur` son los que activan las reglas de validación del VForm:
 * sin ellos el formulario se considera no validado y el submit no hace nada.
 *
 * (Vive aquí y no en `browser.mjs` porque la app móvil necesita otros eventos: Ionic
 * escucha `ionInput` con `composed: true`.)
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} selector - Selector CSS del `input`, no del componente que lo envuelve
 * @param {string} value - Valor a escribir. Reemplaza el contenido, no lo concatena
 * @returns {Promise<void>}
 * @throws {Error} Si no encuentra el campo. Lanza a propósito: un `type` que no escribe se
 *         descubre pasos después, cuando el formulario se queja de que falta un dato
 */
export async function type(cdp, selector, value) {
	const written = await evaluate(
		cdp,
		`(() => { const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      input.focus();
      input.value = ${JSON.stringify(value)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return true; })()`,
	);
	if (!written) throw new Error(`No se encontró el input ${selector}`);
}

/**
 * El captcha del login son 5 dígitos que `Captcha.vue` dibuja en un `<canvas>` con
 * `fillText`, así que no se pueden leer del DOM. Este hook envuelve `fillText` antes de que
 * cargue la app y guarda las letras dibujadas sobre el canvas del captcha.
 *
 * Se resetea al llegar a 5 porque `generateCaptcha()` redibuja en cada intento fallido y en
 * cada refresco: siempre queda el código vigente.
 */
/*
 * Acepta dos clases de canvas: `captcha__canvas` es la del rediseño (ticket 10898) y
 * `captcha-canvas` la anterior, que sigue viva en las ramas que no lo tienen mezclado.
 * Las tres apariciones —este hook, la detección y el campo— tienen que aceptar ambas.
 */
const CAPTCHA_HOOK = `
(() => {
  window.__captchaChars = [];
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
    if (this.canvas && (this.canvas.classList.contains('captcha__canvas') || this.canvas.classList.contains('captcha-canvas'))) {
      if (window.__captchaChars.length >= 5) window.__captchaChars = [];
      window.__captchaChars.push(String(text));
    }
    return original.apply(this, arguments);
  };
})();
`;

/**
 * Devuelve el código del captcha que está dibujado en pantalla.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @returns {Promise<string>} Los 5 dígitos, o cadena vacía si el hook no llegó a engancharse.
 *          Hay que comprobar la longitud antes de usarlo
 */
export const readCaptcha = (cdp) => evaluate(cdp, `(window.__captchaChars || []).join('')`);

/**
 * Selector de un campo `AppSelect` o `AppAutocomplete` a partir del `id` que le pasa la vista.
 *
 * Esos wrappers **no conservan el id**: lo reescriben como `app-select-<id>-<aleatorio>`
 * (`AppSelect.vue`) o `app-autocomplete-<id>-<aleatorio>` (`AppAutocomplete.vue`), con un
 * sufijo aleatorio distinto en cada render. Por eso hay que buscar por prefijo.
 *
 * @param {string} id - El `id` que la vista le pasa al componente, por ejemplo `companies`
 * @returns {string} Selector CSS que cubre las dos variantes. **No comprueba que exista**:
 *          si el id está mal escrito, el selector simplemente no coincide con nada
 */
export const appField = (id) => `[id^="app-select-${id}-"], [id^="app-autocomplete-${id}-"]`;

/**
 * Abre un `AppSelect` o un `AppAutocomplete` y espera su menú.
 *
 * Un `element.click()` sintético **no abre** los selects de Vuetify: el menú se activa desde
 * los eventos de ratón del `.v-field` (`mousedown` / `click:control`), no desde un click
 * programático sobre el `input`. Hay que despachar el ratón de verdad sobre el campo.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} inputSelector - Selector del input; usar `appField(id)` para los `AppSelect`
 * @param {object} [options]
 * @param {number} [options.attempts=6] - Cuántas veces reintentar si el menú abre vacío
 * @returns {Promise<string[]>} Los textos de las opciones del menú, ya abierto y con datos
 * @throws {Error} Si no encuentra el campo, o si tras todos los intentos el menú sigue vacío
 */
export async function openSelect(cdp, inputSelector, { attempts = 6 } = {}) {
	/** Posición del `.v-field` del select, medida en el momento de usarla. */
	const fieldRect = () =>
		evaluate(
			cdp,
			`(() => { const i = document.querySelector(${JSON.stringify(inputSelector)});
      const field = i && i.closest('.v-field'); if (!field) return null;
      const r = field.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
		);

	if (!(await fieldRect())) throw new Error(`No se encontró el select ${inputSelector}`);

	let lastFailure = "no abrió el menú";

	// Dos fallos distintos, y los dos hay que reintentar:
	//  - El menú abre pero **vacío**: las opciones llegan por API y Vuetify ya pintó
	//    "No data available", que se queda fijo aunque después lleguen los datos.
	//  - El menú **no abre**: si el click cae mientras la vista termina de montar (skeletons,
	//    un campo que todavía se está reposicionando), no pasa nada. La posición se vuelve a
	//    medir en cada intento justo por eso.
	for (let attempt = 1; attempt <= attempts; attempt++) {
		const rect = await fieldRect();

		if (!rect) {
			await wait(1500);
			continue;
		}

		await clickAt(cdp, rect.x, rect.y);

		const opened = await waitForSelector(cdp, ".v-list-item", { timeout: 8000 })
			.then(() => true)
			.catch(() => false);

		if (opened) {
			const options = await evaluate(
				cdp,
				`[...document.querySelectorAll('.v-list-item')].map(e => e.textContent.trim())`,
			);
			const empty = options.every((option) => /no data available|sin datos|no hay datos/i.test(option));

			if (!empty) return options;

			lastFailure = "el menú abrió vacío";
		}
		else {
			lastFailure = "no abrió el menú";
		}

		await pressEscape(cdp);
		await wait(1500);
	}

	throw new Error(`El select ${inputSelector} nunca cargó opciones tras ${attempts} intentos (${lastFailure})`);
}

/**
 * Marca varias opciones de un `AppAutocomplete` o `AppSelect` **múltiple**.
 *
 * No sirve medir las opciones una vez y hacer los clicks seguidos: cada opción marcada agrega su
 * chip al campo, el campo crece y **el menú se recoloca**, así que a partir del segundo click las
 * coordenadas guardadas apuntan a otra fila —o afuera del menú, que además lo cierra—. Aquí se
 * remide en cada vuelta y, si el menú se cerró, se vuelve a abrir.
 *
 * Al terminar cierra el menú con la tecla real: un `.v-list` abierto tapa los botones del diálogo.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} inputSelector - Selector del input; usar `appField(id)`
 * @param {number} count - Cuántas opciones marcar, en el orden en que las pinta el menú
 * @returns {Promise<string[]>} Los textos de las opciones marcadas. **Puede devolver menos de
 *          `count`** si el menú no tenía tantas: hay que comprobar la longitud
 * @throws {Error} Si el menú nunca abre con opciones
 */
export async function pickOptions(cdp, inputSelector, count) {
	const chosen = [];

	await openSelect(cdp, inputSelector);

	for (let picked = 0; picked < count; picked++) {
		// El menú puede haberse cerrado al marcar la opción anterior.
		const open = await evaluate(cdp, `!!document.querySelector('.v-overlay--active .v-list-item')`);
		if (!open) await openSelect(cdp, inputSelector);

		// Las ya marcadas se excluyen **por su texto**, no por el DOM: en un multi-select de
		// Vuetify el item elegido no queda con `aria-selected`, así que buscar "el primero no
		// seleccionado" devuelve siempre el mismo y termina marcándolo y desmarcándolo.
		const option = await evaluate(
			cdp,
			`(() => {
        const taken = ${JSON.stringify(chosen)};
        const items = [...document.querySelectorAll('.v-overlay--active .v-list-item')]
          .filter(e => !/no data available|sin datos|no hay datos/i.test(e.textContent))
          .filter(e => !taken.includes(e.textContent.trim()));
        const item = items[0];
        if (!item) return null;
        const r = item.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return { text: item.textContent.trim(), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()`,
		);

		if (!option) break;

		await clickAt(cdp, option.x, option.y);
		await wait(400);

		// Se confirma que la opción quedó marcada de verdad: si el click cayó fuera del menú, el
		// bucle seguiría creyendo que avanza y el fallo saldría mucho después.
		//
		// Los múltiples se comprueban por la cantidad de chips; los simples no tienen chips, así
		// que en ellos se mira que el campo haya quedado con texto.
		const applied = await evaluate(
			cdp,
			`(() => { const i = document.querySelector(${JSON.stringify(inputSelector)});
        const field = i && i.closest('.v-input');
        if (!field) return null;
        return { chips: field.querySelectorAll('.v-chip').length, value: (i.value || '').trim() }; })()`,
		);

		const ok = applied && (applied.chips > picked || (picked === 0 && applied.value !== ""));

		if (!ok) {
			throw new Error(
				`La opción "${option.text}" de ${inputSelector} no quedó marcada ` +
					`(${JSON.stringify(applied)} tras ${picked + 1} intento(s)): el click no llegó al menú`,
			);
		}

		chosen.push(option.text);
	}

	await pressEscape(cdp);
	await wait(500);

	return chosen;
}

/**
 * Ejecuta una acción y espera a que terminen las peticiones que dispare.
 *
 * Es la forma correcta de esperar en esta skill: en vez de suponer cuánto tarda una consulta con un
 * `wait(2500)` —que o se queda corto en una máquina lenta o regala segundos en cada corrida—, se
 * espera a que la red se calle. `openSession` deja el contador puesto, así que no hay que
 * instalar nada.
 *
 * Toma el conteo **antes** de la acción, que es el detalle fácil de olvidar: justo después de un
 * click la petición todavía no salió, así que `inFlight` sigue en cero y una espera ingenua se
 * cumple de inmediato.
 *
 * **No sirve para acciones que no consultan** —elegir un vehículo del lote es local—: ahí la espera
 * se agota sin que nada esté mal. Para esas, `required: false` o un `wait` corto y explícito.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {Function} action - Lo que dispara la consulta; se espera su promesa
 * @param {object} [options]
 * @param {string} [options.what] - Nombre de la acción para el aviso si se agota el tiempo
 * @param {number} [options.timeout=45000] - Tiempo máximo en milisegundos
 * @param {number} [options.settleMs=400] - Cuánto debe sostenerse el silencio de red
 * @param {boolean} [options.required=true] - Exigir que la acción haya disparado al menos una
 *        petición. Con `false` solo espera a que no quede ninguna en vuelo
 * @returns {Promise<boolean>} `false` si se agotó el tiempo. Si se pasó `what`, además lo avisa por
 *          consola, de modo que el llamador puede ignorar el retorno sin que el fallo pase callado
 */
export async function settleRequests(cdp, action, { what = null, timeout = 45000, settleMs = 400, required = true } = {}) {
	const before = (await requestCount(cdp)) ?? 0;

	await action();

	const idle = await waitForRequestsIdle(cdp, {
		minRequests: required ? before + 1 : 0,
		timeout,
		settleMs,
	});

	if (!idle && what) console.log(`  AVISO: se agotó la espera de las peticiones de ${what}`);

	return idle;
}

/**
 * Marca una opción concreta de un `AppSelect` o `AppAutocomplete`, por su texto exacto.
 *
 * `pickOptions` solo sabe tomar las **primeras** N del menú, y muchas veces eso no sirve: en el
 * despacho masivo, los primeros centros y servicios que ofrece el menú forman una combinación sin
 * rutas con frecuencia vigente para hoy, así que la búsqueda vuelve vacía y el flujo muere varios
 * pasos después. Cuando el escenario exige valores determinados, se eligen por nombre.
 *
 * La posición se mide en el momento de clickear: en un múltiple, cada opción marcada agrega su
 * chip, el campo crece y el menú se recoloca.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} inputSelector - Selector del input; usar `appField(id)`
 * @param {string} name - Texto exacto de la opción, tal como lo pinta el menú
 * @param {object} [options]
 * @param {boolean} [options.closeAfter=true] - Cierra el menú al terminar. En un múltiple el
 *        `.v-list` abierto tapa los botones del diálogo, así que conviene dejarlo en `true`
 * @returns {Promise<void>}
 * @throws {Error} Si la opción no está; el mensaje lista las disponibles, que es lo que hace falta
 *         para corregir el parámetro sin volver a correr a ciegas
 */
export async function pickOptionByName(cdp, inputSelector, name, { closeAfter = true } = {}) {
	const options = await openSelect(cdp, inputSelector);

	const point = await evaluate(
		cdp,
		`(() => { const item = [...document.querySelectorAll('.v-overlay--active .v-list-item')]
        .find(e => e.textContent.trim() === ${JSON.stringify(name)});
      if (!item) return null;
      const r = item.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!point) {
		throw new Error(
			`La opción "${name}" no está en ${inputSelector}. Disponibles: ${JSON.stringify(options.slice(0, 20))}`,
		);
	}

	await clickAt(cdp, point.x, point.y);
	await wait(500);

	if (closeAfter) {
		await pressEscape(cdp);
		await wait(400);
	}
}

/**
 * Busca un término en un `AioDataFetcherSelect` y espera sus opciones.
 *
 * No es un `AppAutocomplete` y `pickOptions` **no sirve** con él: no trae las opciones cargadas,
 * las pide al backend desde su `@update:search` con un debounce de 500 ms, y con menos de 3
 * caracteres ni siquiera pregunta —el menú se queda en "Mín. 3 caracteres"—. De ahí las dos
 * particularidades:
 *
 * - El menú se abre con el ratón real sobre el `.v-field`; enfocar el `input` por JS no lo
 *   despliega, y sin menú abierto no hay opciones que leer por más que se teclee.
 * - Solo se emite `input`. El `type` de `browser.mjs` dispara además `blur`, y el `blur` cierra
 *   el menú justo antes de que lleguen los datos.
 *
 * Deja el menú **abierto**, que es lo que hace falta para capturarlo o para elegir una opción.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} inputSelector - Selector del `input` del campo
 * @param {string} term - Término a buscar; con menos de 3 caracteres el componente no consulta
 * @param {object} [options]
 * @param {number} [options.timeout=20000] - Milisegundos de espera por las opciones
 * @returns {Promise<string[]>} Los textos de las opciones. **Vacío si no llegó ninguna**: puede
 *          ser que el término no exista o que no alcanzara los 3 caracteres, así que el llamador
 *          tiene que comprobar la longitud (el mensaje del menú lo distingue)
 * @throws {Error} Si el campo no está en el DOM o no tiene tamaño
 */
export async function searchFetcherSelect(cdp, inputSelector, term, { timeout = 20000 } = {}) {
	const fieldRect = () =>
		evaluate(
			cdp,
			`(() => { const i = document.querySelector(${JSON.stringify(inputSelector)});
      const field = i && i.closest('.v-field'); if (!field) return null;
      const r = field.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
		);

	const rect = await fieldRect();

	if (!rect) throw new Error(`No se encontró el buscador ${inputSelector}`);

	await clickAt(cdp, rect.x, rect.y);
	await wait(400);

	const typed = await evaluate(
		cdp,
		`(() => { const i = document.querySelector(${JSON.stringify(inputSelector)});
      if (!i) return false;
      i.focus();
      i.value = ${JSON.stringify(term)};
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true; })()`,
	);

	if (!typed) throw new Error(`No se pudo teclear en el buscador ${inputSelector}`);

	const options = () =>
		evaluate(
			cdp,
			`[...document.querySelectorAll('.v-overlay--active .v-list-item')]
        .map(e => e.textContent.trim())
        .filter(t => !/no data available|sin datos|no hay datos|caracteres|cargando|loading/i.test(t))`,
		);

	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const found = await options();

		if (found.length) {
			// La lista sigue creciendo mientras Vuetify pinta: se deja asentar antes de devolverla.
			await wait(800);

			return options();
		}

		await wait(600);
	}

	return [];
}

/**
 * Lo que el menú de un select tenga escrito ahora mismo.
 *
 * Es el diagnóstico de un buscador que no devolvió nada: "Mín. 3 caracteres" es que el término no
 * llegó al componente, y "No se encontraron datos" es que el término no existe.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @returns {Promise<string[]>} Los textos del menú abierto, vacío si no hay menú
 */
export const menuMessages = (cdp) =>
	evaluate(
		cdp,
		`[...document.querySelectorAll('.v-overlay--active .v-list-item')].map(e => e.textContent.trim()).slice(0, 5)`,
	);

/**
 * Elige una opción del menú abierto de un select, por su texto.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} text - Texto de la opción. Coincidencia parcial y sin distinguir mayúsculas
 * @returns {Promise<void>}
 * @throws {Error} Si esa opción no está; el mensaje lista las disponibles, que es lo que hace
 *         falta para corregir el parámetro sin volver a correr a ciegas
 */
export async function selectOption(cdp, text) {
	const chosen = await clickByText(cdp, ".v-list-item", text);
	if (!chosen) {
		const options = await evaluate(cdp, `[...document.querySelectorAll('.v-list-item')].map(e => e.textContent.trim()).slice(0, 30)`);
		throw new Error(`No existe la opción "${text}". Disponibles: ${JSON.stringify(options)}`);
	}
	await wait(400);
}

/**
 * Texto de la pantalla actual. Cuando un paso falla, esto es lo primero que hay que mirar
 * para saber si quedó una alerta, un formulario en blanco o una vista distinta.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @returns {Promise<string>} El `innerText` **recortado a 1200 caracteres**, con los saltos de
 *          línea repetidos colapsados. Es para diagnóstico, no para buscar contenido
 */
export const describeScreen = (cdp) =>
	evaluate(cdp, `document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 1200)`);

/**
 * Lanza Chrome, entra al AIO y deja la sesión lista en el módulo indicado.
 *
 * @param {object} options
 * @param {string} options.base - URL del dev server, por ejemplo http://localhost:5173
 * @param {string} options.email - Usuario de pruebas
 * @param {string} options.password - Clave del usuario de pruebas
 * @param {string} options.company - Nombre de la empresa a seleccionar
 * @param {string} options.module - Texto de la tarjeta del módulo, por ejemplo "AVL"
 * @returns {Promise<{cdp: object, chrome: object}>}
 */
export async function openSession({
	base,
	email,
	password,
	company,
	module,
	port = 9222,
	width = VIEWPORT.width,
	height = VIEWPORT.height,
}) {
	const chrome = await launchChrome({ port });
	const cdp = await connectPage(port);

	await cdp.send("Page.enable");
	await cdp.send("Runtime.enable");
	await setViewport(cdp, { width, height });
	await injectOnLoad(cdp, CAPTCHA_HOOK);
	await injectOnLoad(cdp, HIDE_DEVTOOLS);

	// El contador de peticiones queda puesto desde el arranque y sobrevive a las navegaciones, para
	// que cualquier flujo pueda esperar a que **terminen** las consultas en vez de a un reloj.
	await trackRequests(cdp);

	await cdp.send("Page.navigate", { url: `${base}/login` });
	await waitForSelector(cdp, 'input[type="email"]', { timeout: 90000 });

	await type(cdp, 'input[type="email"]', email);
	await type(cdp, 'input[type="password"]', password);

	// El captcha solo se muestra cuando VITE_APP_ENV no es 'QA'.
	const hasCaptcha = await evaluate(cdp, `!!document.querySelector('.captcha__canvas, .captcha-canvas')`);
	if (hasCaptcha) {
		const code = await readCaptcha(cdp);
		if (!code || code.length !== 5) throw new Error(`No se pudo leer el captcha (leído: "${code}")`);
		await type(cdp, ".captcha__field input, .captcha-input-col input", code);
	}

	await click(cdp, 'button[type="submit"]');

	// La pantalla de inicio pide empresa y módulo.
	await waitForSelector(cdp, appField("companies"), { timeout: 60000 }).catch(async () => {
		throw new Error(`El login no llegó a la pantalla de inicio. Pantalla:\n${await describeScreen(cdp)}`);
	});

	// Sin empresa no se cargan los módulos: `modulos.vue` los pide al seleccionarla. Se
	// devuelve la sesión en la pantalla de inicio, que sirve para explorar qué hay disponible.
	if (!company) return { cdp, chrome };

	await openSelect(cdp, appField("companies"));
	await selectOption(cdp, company);

	await waitForSelector(cdp, ".module-card", { timeout: 60000 });
	if (module) {
		const opened = await clickByText(cdp, ".module-card", module);
		if (!opened) {
			const modules = await evaluate(cdp, `[...document.querySelectorAll('.module-card')].map(e => e.textContent.trim())`);
			throw new Error(`No está el módulo "${module}". Disponibles: ${JSON.stringify(modules)}`);
		}
		await wait(2500);
	}

	return { cdp, chrome };
}

/**
 * El dev server monta el panel flotante de `vite-plugin-vue-devtools` sobre la app, centrado
 * abajo. No es parte del AIO —en producción no existe— y en las capturas se cuela encima de lo
 * que esté en esa zona: llegó a tapar el texto del aviso inferior del Portal Ciudadano. Se oculta
 * con CSS antes de que cargue la app, en vez de esperar a que aparezca para quitarlo.
 */
const HIDE_DEVTOOLS = `
(() => {
  const apply = () => {
    if (!document.head) return requestAnimationFrame(apply);
    const style = document.createElement('style');
    style.textContent = '#__vue-devtools-container__, #vue-inspector-container { display: none !important }';
    document.head.appendChild(style);
  };
  apply();
})();
`;

/**
 * Lanza Chrome y abre una vista **pública** del AIO, sin pasar por el login.
 *
 * Las rutas con `meta.public` (el Portal Ciudadano, los certificados, el registro de asistencia a
 * capacitaciones) las deja pasar el guard sin sesión y montan con `layout: 'blank'`, así que no hay
 * empresa ni módulo que elegir, ni captcha que resolver.
 *
 * @param {object} options
 * @param {string} options.base - URL del dev server, sin barra final
 * @param {string} options.path - Ruta pública, empezando por `/`
 * @param {string} [options.selector] - Esperar a que aparezca este selector antes de devolver
 * @param {string} [options.text] - Esperar a que aparezca este texto
 * @param {number} [options.port=9222] - Puerto de depuración
 * @param {number} [options.width] - Ancho del viewport; por defecto el del manual
 * @param {number} [options.height] - Alto del viewport; por defecto el del manual
 * @returns {Promise<{cdp: object, chrome: object}>} **Hay que cerrarlos** con `closeBrowser`
 * @throws {Error} Si lo que se espera no aparece a tiempo
 */
export async function openPublicPage({
	base,
	path,
	selector = null,
	text = null,
	port = 9222,
	width = VIEWPORT.width,
	height = VIEWPORT.height,
}) {
	const chrome = await launchChrome({ port });
	const cdp = await connectPage(port);

	await cdp.send("Page.enable");
	await cdp.send("Runtime.enable");
	await setViewport(cdp, { width, height });
	await injectOnLoad(cdp, HIDE_DEVTOOLS);
	await trackRequests(cdp);

	await cdp.send("Page.navigate", { url: `${base}${path}` });
	if (selector) await waitForSelector(cdp, selector, { timeout: 90000 });
	if (text) await waitForText(cdp, text, { timeout: 90000 });

	return { cdp, chrome };
}

/**
 * Fuerza a Leaflet a recalcular el tamaño del mapa.
 *
 * El mapa se crea cuando la vista monta, que puede ser antes de que el viewport definitivo esté
 * aplicado. Cuando eso pasa, el mapa queda con un tamaño mínimo: solo carga un parche de tiles
 * en la esquina, el canvas de las geometrías queda en 0x0 y ninguna capa se ve. Leaflet
 * recalcula al recibir un `resize` de la ventana.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {object} [options]
 * @param {number} [options.attempts=10] - Cuántos `resize` disparar antes de rendirse
 * @returns {Promise<boolean>} `false` si el mapa nunca tomó el ancho completo. **No lanza**:
 *          conviene avisarlo y seguir, porque a veces la captura igual sirve
 */
export async function refreshMap(cdp, { attempts = 10 } = {}) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		await evaluate(cdp, `(() => { window.dispatchEvent(new Event('resize')); return true; })()`);
		await wait(800);

		// El mapa está bien dimensionado cuando su contenedor de tiles cubre el ancho visible.
		const sized = await evaluate(
			cdp,
			`(() => { const c = document.querySelector('.leaflet-container'); if (!c) return false;
        const r = c.getBoundingClientRect();
        const tiles = [...document.querySelectorAll('.leaflet-tile')];
        if (!tiles.length || r.width < 100) return false;
        const right = Math.max(...tiles.map(t => t.getBoundingClientRect().right));
        return right >= r.right - 260; })()`,
		);

		if (sized) return true;
	}

	return false;
}

/**
 * Devuelve puntos de pantalla que caen sobre una geometría dibujada por Leaflet **en canvas**.
 *
 * Los mapas del AVL se crean con `preferCanvas: true`, así que las rutas no son elementos del
 * DOM: no hay `<path>` que consultar ni sobre el que hacer click. Lo que sí se puede es leer
 * los píxeles del canvas y buscar uno pintado; el renderer de canvas de Leaflet hace su propio
 * hit-testing con las coordenadas del ratón, así que un click ahí abre el popup de la capa.
 *
 * Devuelve varios candidatos separados entre sí: las rutas son mallas de calles y el hit-test
 * falla en muchos píxeles pintados, así que hay que poder reintentar en tramos distintos.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} [selector=".leaflet-overlay-pane canvas"] - El canvas donde Leaflet dibuja
 * @param {object} [options]
 * @param {number} [options.timeout=30000] - Tiempo máximo esperando a que algo esté dibujado
 * @param {number} [options.max=12] - Cuántos candidatos devolver
 * @param {number} [options.spacing=40] - Separación mínima entre candidatos, en píxeles, para
 *        que los reintentos caigan en tramos distintos y no en el mismo vecindario
 * @returns {Promise<Array<{x: number, y: number}>>} Puntos en **coordenadas de pantalla**, listos
 *          para `clickAt`. Ordenados del centro hacia afuera
 * @throws {Error} Si al agotarse el tiempo no hay nada dibujado en ese canvas
 */
export async function pointsOnCanvasStroke(
	cdp,
	selector = ".leaflet-overlay-pane canvas",
	{ timeout = 30000, max = 12, spacing = 40 } = {},
) {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const points = await evaluate(
			cdp,
			`(() => {
        const c = document.querySelector(${JSON.stringify(selector)});
        if (!c || !c.width || !c.height) return [];
        const ctx = c.getContext('2d');
        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
        const cx = width / 2, cy = height / 2;

        // Paso de 2 px: alcanza para encontrar el trazo sin recorrer un millón de píxeles.
        const painted = [];
        for (let y = 0; y < height; y += 2) {
          for (let x = 0; x < width; x += 2) {
            if (data[(y * width + x) * 4 + 3] > 128) {
              painted.push({ x, y, d: (x - cx) ** 2 + (y - cy) ** 2 });
            }
          }
        }
        if (!painted.length) return [];

        // Candidatos repartidos: los más cercanos al centro pero separados entre sí, para que
        // los reintentos caigan en tramos distintos y no en el mismo vecindario.
        painted.sort((a, b) => a.d - b.d);
        const chosen = [];
        for (const p of painted) {
          if (chosen.every(e => (e.x - p.x) ** 2 + (e.y - p.y) ** 2 >= ${spacing} ** 2)) chosen.push(p);
          if (chosen.length >= ${max}) break;
        }

        const r = c.getBoundingClientRect();
        return chosen.map(p => ({ x: r.left + p.x, y: r.top + p.y }));
      })()`,
		);

		if (points.length) return points;
		await wait(500);
	}

	throw new Error(`No hay ninguna geometría dibujada en ${selector}`);
}

/**
 * Igual que `pointsOnCanvasStroke` pero devuelve solo el punto más cercano al centro.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} [selector] - El canvas donde Leaflet dibuja
 * @param {object} [options] - Los mismos que `pointsOnCanvasStroke`, salvo `max`
 * @returns {Promise<{x: number, y: number}>} Punto en coordenadas de pantalla
 * @throws {Error} Si no hay nada dibujado
 */
export async function pointOnCanvasStroke(cdp, selector, options) {
	const [point] = await pointsOnCanvasStroke(cdp, selector, { ...options, max: 1 });

	return point;
}

/**
 * Devuelve un punto de pantalla que cae **sobre** el trazo de un `<path>` de SVG.
 *
 * No todos los mapas del AIO son de canvas: el de la consulta geográfica de la ruta se crea sin
 * `preferCanvas`, así que sus geometrías sí son `<path>`.
 *
 * El centro del bounding box no sirve: en una ruta curva puede quedar fuera de la línea y el
 * click se lo lleva el mapa en vez de la geometría. Se toma un punto de la longitud del trazo y
 * se convierte a coordenadas de pantalla con la matriz del SVG.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} selector - Selector de los `<path>`
 * @param {object} [options]
 * @param {number} [options.index=0] - Cuál de los trazos que cumplen el selector
 * @param {number} [options.fraction=0.5] - Punto del recorrido, de 0 a 1. Conviene probar
 *        varias: el punto medio suele caer bajo un marcador que se lleva el click
 * @returns {Promise<{x: number, y: number}>} Punto en coordenadas de pantalla
 * @throws {Error} Si no hay un trazo con ese índice, o si el trazo tiene longitud cero
 */
export async function pointOnPath(cdp, selector, { index = 0, fraction = 0.5 } = {}) {
	const point = await evaluate(
		cdp,
		`(() => {
      const paths = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const p = paths[${index}];
      if (!p || !p.getTotalLength) return null;
      const length = p.getTotalLength();
      if (!length) return null;
      const pt = p.getPointAtLength(length * ${fraction});
      const m = p.getScreenCTM();
      return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
    })()`,
	);
	if (!point) throw new Error(`No se encontró un trazo para ${selector} [${index}]`);
	return point;
}

/**
 * Espera a que no queden skeletons en pantalla.
 *
 * Los formularios del AIO pintan `VSkeletonLoader` mientras cargan sus selects (APS, centros
 * operativos, turnos, servicios...). Capturar con un tiempo fijo deja imágenes con las barras
 * grises en vez de los datos, que es lo que el manual tiene que mostrar.
 *
 * Para **tablas** dentro de un diálogo no alcanza: usa `waitForTableSettled`.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {object} [options]
 * @param {number} [options.timeout=45000] - Tiempo máximo en milisegundos
 * @param {string} [options.within=""] - Selector contenedor, por ejemplo `.v-dialog`. Vacío
 *        revisa toda la página
 * @returns {Promise<boolean>} `false` si se agotó el tiempo con skeletons todavía en pantalla.
 *          **Hay que comprobarlo**: capturar igual produce imágenes a medio cargar
 */
export async function waitForNoSkeletons(cdp, { timeout = 45000, within = "" } = {}) {
	const selector = `${within} .v-skeleton-loader`.trim();
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const remaining = await evaluate(cdp, `document.querySelectorAll(${JSON.stringify(selector)}).length`);
		if (remaining === 0) {
			// Un respiro para que terminen las transiciones de entrada de los campos.
			await wait(800);

			return true;
		}
		await wait(500);
	}

	return false;
}

/**
 * Espera a que una tabla del AIO termine de cargar de verdad.
 *
 * `waitForNoSkeletons` por sí solo no basta dentro de un diálogo: la tabla se monta vacía,
 * pide los datos y **después** pinta los skeletons, así que la condición "no hay skeletons"
 * se cumple en el hueco previo y la captura sale a medio cargar.
 *
 * Aquí se espera a que se cumplan las tres cosas a la vez y **se sostengan**: que haya una
 * fila (aunque sea la de "No data available"), que no queden `VSkeletonLoader` y que no haya
 * un overlay de `vue-loading-overlay` activo (el de las barras, `Standard/Loader/Loading.vue`).
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {object} [options]
 * @param {string} [options.within=""] - Selector contenedor, por ejemplo `.v-dialog `. **Ojo al
 *        espacio final**: se concatena con el selector interno
 * @param {number} [options.timeout=60000] - Tiempo máximo en milisegundos
 * @param {number} [options.stableMs=1200] - Cuánto debe sostenerse el estado cargado antes de
 *        darlo por bueno. Sin esta espera se cuela el hueco entre montar la tabla y pintar los
 *        skeletons
 * @returns {Promise<boolean>} `false` si se agotó el tiempo. **Hay que comprobarlo**: capturar
 *          sin hacerlo produce tablas a medio cargar, que fue exactamente el fallo de Despachos
 */
export async function waitForTableSettled(cdp, { within = "", timeout = 60000, stableMs = 1200 } = {}) {
	const scope = within ? `${within} ` : "";
	const deadline = Date.now() + timeout;
	let stableSince = null;

	while (Date.now() < deadline) {
		const state = await evaluate(
			cdp,
			`(() => {
        const visible = e => e && e.offsetParent !== null;
        const rows = document.querySelectorAll('${scope}.v-window-item--active tbody tr, ${scope}tbody tr').length;
        const skeletons = document.querySelectorAll('${scope}.v-skeleton-loader').length;
        const loading = [...document.querySelectorAll('${scope}.vl-overlay, ${scope}.vl-active')].filter(visible).length;
        return { rows, skeletons, loading };
      })()`,
		);

		if (state.rows > 0 && state.skeletons === 0 && state.loading === 0) {
			stableSince ??= Date.now();
			if (Date.now() - stableSince >= stableMs) return true;
		}
		else {
			stableSince = null;
		}

		await wait(300);
	}

	return false;
}

/**
 * Navega a una vista del módulo y espera a que el contenido reemplace al de la vista previa.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} base - URL del dev server, sin barra final
 * @param {string} path - Ruta de la vista, empezando por `/`
 * @param {object} [options]
 * @param {string} [options.selector] - Esperar a que aparezca este selector
 * @param {string} [options.text] - Esperar a que aparezca este texto
 * @returns {Promise<void>} Sin `selector` ni `text` solo espera un tiempo fijo, así que la vista
 *          puede quedar a medio cargar: conviene pasar siempre uno de los dos
 * @throws {Error} Si lo que se espera no aparece a tiempo
 */
export async function goTo(cdp, base, path, { selector = null, text = null } = {}) {
	await cdp.send("Page.navigate", { url: `${base}${path}` });
	await wait(1500);
	if (selector) await waitForSelector(cdp, selector, { timeout: 90000 });
	if (text) await waitForText(cdp, text, { timeout: 90000 });
}
