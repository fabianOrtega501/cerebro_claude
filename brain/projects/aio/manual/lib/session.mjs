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
	setViewport,
	wait,
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
 *
 * Acepta dos clases de canvas: `captcha__canvas` es la del rediseño (ticket 10898) y
 * `captcha-canvas` la anterior, que sigue viva en las ramas que no lo tienen mezclado.
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
	const rect = await evaluate(
		cdp,
		`(() => { const i = document.querySelector(${JSON.stringify(inputSelector)});
      const field = i && i.closest('.v-field'); if (!field) return null;
      const r = field.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
	);
	if (!rect) throw new Error(`No se encontró el select ${inputSelector}`);

	// Las opciones llegan por API. Si el menú se abre antes de que responda, Vuetify pinta
	// "No data available" y ahí se queda: hay que cerrarlo y volver a abrirlo.
	for (let attempt = 1; attempt <= attempts; attempt++) {
		await clickAt(cdp, rect.x, rect.y);
		await waitForSelector(cdp, ".v-list-item", { timeout: 20000 });

		const options = await evaluate(cdp, `[...document.querySelectorAll('.v-list-item')].map(e => e.textContent.trim())`);
		const empty = options.every((option) => /no data available|sin datos|no hay datos/i.test(option));

		if (!empty) return options;

		await pressEscape(cdp);
		await wait(1500);
	}

	throw new Error(`El select ${inputSelector} nunca cargó opciones`);
}

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

	await cdp.send("Page.navigate", { url: `${base}/login` });
	await waitForSelector(cdp, 'input[type="email"]', { timeout: 90000 });

	await type(cdp, 'input[type="email"]', email);
	await type(cdp, 'input[type="password"]', password);

	// El captcha solo se muestra cuando VITE_APP_ENV no es 'QA'. Se aceptan las clases del
	// rediseño (`captcha__*`) y las anteriores, porque conviven según la rama que esté activa.
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
	captchaHook = false,
}) {
	const chrome = await launchChrome({ port });
	const cdp = await connectPage(port);

	await cdp.send("Page.enable");
	await cdp.send("Runtime.enable");
	await setViewport(cdp, { width, height });
	await injectOnLoad(cdp, HIDE_DEVTOOLS);

	// Hay vistas publicas con captcha —el registro de asistencia—: con esto `readCaptcha`
	// funciona igual que en las de sesion. Se inyecta antes de navegar o no engancha.
	if (captchaHook) await injectOnLoad(cdp, CAPTCHA_HOOK);

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
