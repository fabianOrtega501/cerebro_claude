// Driver mínimo de Chrome DevTools Protocol sobre el WebSocket nativo de Node (>=22).
// Sin dependencias externas: no requiere Cypress, Playwright ni Puppeteer.
//
// Existe porque Cypress/Electron no arranca en entornos sin sesión de escritorio
// interactiva (falla con "bad option: --smoke-test").
//
// ─────────────────────────────────────────────────────────────────────────────
// CAPA GENÉRICA
//
// Solo va aquí lo que sirve para automatizar CUALQUIER web. Nada que sepa de
// Vuetify, de Leaflet ni de la app: eso vive en el adaptador (lib/session.mjs).
//
// Este es el motor ÚNICO del cerebro: lo comparten todos los proyectos. Un arreglo
// aquí los beneficia a todos a la vez, y por eso mismo un cambio específico de una
// app NO va aquí: va en el `session.mjs` de su perfil.
//
// Los repos de trabajo conservan copias propias, heredadas de antes de centralizar
// esto. No están sincronizadas y no se mantienen desde aquí.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Se puede forzar con la variable de entorno CHROME_PATH; si no, se prueban las
// ubicaciones habituales en Windows, Linux y macOS.
const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
	"/usr/bin/google-chrome",
	"/usr/bin/google-chrome-stable",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
	"/usr/bin/microsoft-edge",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

/**
 * Navegadores lanzados por este proceso que todavía no se han cerrado.
 *
 * Existe para la red de seguridad de abajo: sin este registro, un script que muere por una
 * excepción o por Ctrl+C deja el navegador vivo ocupando el puerto, y la corrida siguiente se
 * conecta a él en vez de lanzar uno nuevo.
 */
const openBrowsers = new Set();

/** Los manejadores de cierre se instalan una sola vez, no en cada `launchChrome`. */
let safetyNetInstalled = false;

/**
 * Comprueba si ya hay un navegador escuchando en un puerto de depuración.
 *
 * @param {number} port - Puerto a comprobar
 * @param {number} [timeout=1500] - Tope de espera en milisegundos
 * @returns {Promise<boolean>} `true` si algo respondió como navegador
 */
async function portIsBusy(port, timeout = 1500) {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: controller.signal });

		clearTimeout(timer);

		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Pide por el protocolo el cierre de lo que esté ocupando un puerto.
 *
 * @param {number} port - Puerto ocupado
 * @returns {Promise<boolean>} `true` si el puerto quedó libre
 */
async function closeWhateverIsOn(port) {
	try {
		const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
		const socket = new WebSocket(info.webSocketDebuggerUrl);

		await new Promise((ok, no) => {
			socket.onopen = ok;
			socket.onerror = no;
			setTimeout(no, 4000);
		});

		socket.send(JSON.stringify({ id: 1, method: "Browser.close" }));
		await wait(1200);
		socket.close();
	} catch {
		// No respondió: o ya se fue, o no es un navegador. Lo dirá la comprobación siguiente.
	}

	for (let attempt = 0; attempt < 10; attempt++) {
		if (!await portIsBusy(port, 600)) return true;
		await wait(400);
	}

	return false;
}

/**
 * Instala el cierre automático ante final de proceso, Ctrl+C o error no capturado.
 *
 * Es una red de seguridad, no el mecanismo principal: cada flujo debe cerrar con `closeBrowser`
 * en su `finally`. Pero un `throw` fuera del try, un Ctrl+C a mitad de corrida o un fallo al
 * importar dejan el navegador vivo, y **con Chrome de snap no se puede matar por señal**
 * (`EACCES`): el huérfano se queda escuchando y rompe la corrida siguiente.
 *
 * No se engancha a `exit` porque ahí ya no se puede esperar nada asíncrono, y cerrar el
 * navegador exige un ida y vuelta por el protocolo.
 */
function installSafetyNet() {
	if (safetyNetInstalled) return;

	safetyNetInstalled = true;

	const closeAll = async (code) => {
		// Por puerto y no con `closeBrowser`: aquí no hay conexión CDP a mano —la que tuviera el
		// flujo se perdió con el error— y `closeBrowser` sin ella no llega a mandar la orden.
		for (const browser of [...openBrowsers]) {
			openBrowsers.delete(browser);
			await closeWhateverIsOn(browser.port).catch(() => {});
			try { browser.process?.unref(); } catch { /* ya no está */ }
		}

		process.exit(code);
	};

	process.on("SIGINT", () => closeAll(130));
	process.on("SIGTERM", () => closeAll(143));
	process.on("uncaughtException", (error) => {
		console.error("Error no capturado:", error?.message ?? error);
		closeAll(1);
	});
	process.on("unhandledRejection", (reason) => {
		console.error("Promesa rechazada sin capturar:", reason?.message ?? reason);
		closeAll(1);
	});
}

/**
 * Lanza Chrome headless con el puerto de depuración abierto.
 *
 * Cada llamada crea un perfil temporal nuevo, así que la sesión arranca siempre limpia.
 *
 * Si el puerto ya está ocupado por un navegador huérfano de una corrida anterior, **lo cierra
 * antes de lanzar el nuevo**. Sin eso el fallo es silencioso y desconcertante: la comprobación
 * de "¿ya levantó?" la contesta el navegador viejo, así que el flujo se conecta a la pestaña de
 * otra corrida y falla mucho después, esperando un selector que en la página sí está.
 *
 * @param {object} [options]
 * @param {number} [options.port=9222] - Puerto de depuración. Cambiarlo permite varias corridas a la vez
 * @param {number} [options.scale=1] - Factor de escala del dispositivo
 * @returns {Promise<{process: object, port: number}>} El proceso y el puerto donde quedó
 *          escuchando. Ciérralo con `closeBrowser`, **nunca** con `.kill()`: con Chrome de snap
 *          la señal falla con `EACCES` y deja el navegador vivo
 * @throws {Error} Si no encuentra el ejecutable, si el puerto sigue ocupado tras intentar
 *          liberarlo, o si Chrome no abre el puerto
 */
export async function launchChrome({ port = 9222, scale = 1 } = {}) {
	const { existsSync } = await import("node:fs");

	if (await portIsBusy(port)) {
		console.warn(`Aviso: el puerto ${port} ya estaba ocupado por un navegador de otra corrida; se cierra.`);

		if (!await closeWhateverIsOn(port)) {
			throw new Error(
				`El puerto ${port} sigue ocupado y no se pudo liberar.\n`
				+ `Corre: node ~/.claude/skills/update-manual/lib/close-orphans.mjs\n`
				+ `O usa otro puerto con --puerto.`,
			);
		}
	}

	installSafetyNet();
	const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
	if (!chrome) {
		throw new Error("No se encontró Chrome ni Edge. Define la ruta del ejecutable en la variable de entorno CHROME_PATH.");
	}

	const profile = mkdtempSync(join(tmpdir(), "cdp-profile-"));
	const process_ = spawn(
		chrome,
		[
			"--headless=new",
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${profile}`,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-gpu",
			"--hide-scrollbars",
			`--force-device-scale-factor=${scale}`,
			"about:blank",
		],
		{ stdio: "ignore" },
	);

	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (response.ok) {
				await response.json();

				const handle = { process: process_, port };

				openBrowsers.add(handle);

				return handle;
			}
		} catch {
			// aún no levanta
		}
		await wait(500);
	}
	throw new Error("Chrome no expuso el puerto de depuración");
}

/**
 * Conecta al primer target de tipo página.
 *
 * @param {number} port - El que devolvió `launchChrome`
 * @returns {Promise<{send: Function, on: Function, close: Function}>} La conexión que espera el
 *          resto de la librería: `send(metodo, params)` para comandos del protocolo,
 *          `on(metodo, callback)` para eventos, `close()` para cerrar el WebSocket
 * @throws {Error} Si Node no trae `WebSocket` global, o si no hay ninguna página a la que conectarse
 */
export async function connectPage(port) {
	// El WebSocket global existe sin flags desde Node 22. En Node 20 y 21 hay que arrancar
	// con --experimental-websocket; sin eso el fallo es un "WebSocket is not defined" seco,
	// varios pasos después de lanzar Chrome.
	if (typeof WebSocket === "undefined") {
		throw new Error(
			`Este driver necesita el WebSocket nativo de Node, que existe sin flags desde Node 22 (tienes ${process.version}).\n` +
				"Corre el script con:  node --experimental-websocket <script>\n" +
				"o cambia a Node 22+ (el .nvmrc del repo apunta a lts/*).",
		);
	}

	const response = await fetch(`http://127.0.0.1:${port}/json/list`);
	const page = (await response.json()).find((target) => target.type === "page");
	if (!page) throw new Error("No hay target de tipo page");

	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.addEventListener("open", resolve, { once: true });
		ws.addEventListener("error", reject, { once: true });
	});

	let lastId = 0;
	const pending = new Map();
	const listeners = new Map();

	ws.addEventListener("message", (event) => {
		const message = JSON.parse(event.data);
		if (message.id && pending.has(message.id)) {
			const { resolve, reject } = pending.get(message.id);
			pending.delete(message.id);
			if (message.error) reject(new Error(message.error.message));
			else resolve(message.result);
			return;
		}
		if (message.method && listeners.has(message.method)) {
			for (const callback of listeners.get(message.method)) callback(message.params);
		}
	});

	const send = (method, params = {}) =>
		new Promise((resolve, reject) => {
			const messageId = ++lastId;
			pending.set(messageId, { resolve, reject });
			ws.send(JSON.stringify({ id: messageId, method, params }));
		});

	const on = (method, callback) => {
		if (!listeners.has(method)) listeners.set(method, []);
		listeners.get(method).push(callback);
	};

	return { send, on, close: () => ws.close() };
}

/**
 * Espera pasiva.
 *
 * @param {number} ms - Milisegundos
 * @returns {Promise<void>}
 */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Evalúa una expresión en la página.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} expression - Expresión JavaScript. Debe **devolver un valor serializable**:
 *        un elemento del DOM no cruza, hay que extraerle los datos dentro de la expresión
 * @param {object} [options]
 * @param {boolean} [options.awaitPromise=false] - Ponerlo en `true` cuando la expresión sea
 *        `async`, o el valor llegaría como una promesa sin resolver
 * @returns {Promise<*>} El valor serializado, o `undefined` si la expresión no devuelve nada
 * @throws {Error} Si la expresión lanza en la página; el mensaje trae la descripción original
 */
export async function evaluate(cdp, expression, { awaitPromise = false } = {}) {
	const result = await cdp.send("Runtime.evaluate", {
		expression,
		awaitPromise,
		returnByValue: true,
	});
	if (result.exceptionDetails) {
		throw new Error("Error en la página: " + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
	}
	return result.result?.value;
}

/**
 * Espera a que un selector exista y sea visible, opcionalmente conteniendo un texto.
 *
 * Ojo: comprueba `offsetParent !== null`, que siempre es null en elementos con
 * `position: fixed` (diálogos, overlays). Para esos, espera algo de adentro.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} selector - Selector CSS
 * @param {object} [options]
 * @param {number} [options.timeout=60000] - Tiempo máximo en milisegundos
 * @param {string} [options.text] - Exige además que el elemento contenga este texto
 * @returns {Promise<true>} Solo devuelve al encontrarlo; si no, lanza
 * @throws {Error} Al agotarse el tiempo
 */
export async function waitForSelector(cdp, selector, { timeout = 60000, text = null } = {}) {
	const deadline = Date.now() + timeout;
	const expression = text
		? `[...document.querySelectorAll(${JSON.stringify(selector)})].some(e => e.offsetParent !== null && e.textContent.includes(${JSON.stringify(text)}))`
		: `(() => { const e = document.querySelector(${JSON.stringify(selector)}); return !!e && e.offsetParent !== null; })()`;

	while (Date.now() < deadline) {
		if (await evaluate(cdp, expression)) return true;
		await wait(300);
	}
	throw new Error(`Timeout esperando ${selector}${text ? ` con texto "${text}"` : ""}`);
}

/**
 * Espera a que aparezca un texto en cualquier parte de la página.
 *
 * `document.body` se consulta con `?.`: llamando justo después de `Page.navigate` el documento
 * nuevo todavía no tiene body y un acceso directo lanza, en vez de seguir esperando.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} text - Texto a buscar en el `innerText` de la página
 * @param {object} [options]
 * @param {number} [options.timeout=60000] - Tiempo máximo en milisegundos
 * @returns {Promise<true>} Solo devuelve al encontrarlo; si no, lanza
 * @throws {Error} Al agotarse el tiempo
 */
export async function waitForText(cdp, text, { timeout = 60000 } = {}) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await evaluate(cdp, `(document.body?.innerText ?? '').includes(${JSON.stringify(text)})`)) return true;
		await wait(300);
	}
	throw new Error(`Timeout esperando el texto "${text}"`);
}

/**
 * Espera a que una expresión de la página se vuelva verdadera.
 *
 * Es la salida cuando la condición no se puede escribir como "existe el selector X": un atributo
 * en el `<html>`, un `aria-checked`, que un overlay ya **no** esté. `waitForSelector` no cubre
 * ninguno de esos casos, y sustituirlos por una espera fija deja capturas a medio aplicar.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} expression - JavaScript que se evalúa en la página. Su resultado se lee como
 *        booleano, así que un `document.querySelector(...)` sirve tal cual
 * @param {object} [options]
 * @param {number} [options.timeout=30000] - Tiempo máximo en milisegundos
 * @param {string} [options.what] - Cómo llamar a la condición en el mensaje de error
 * @returns {Promise<true>} Solo devuelve al cumplirse; si no, lanza
 * @throws {Error} Al agotarse el tiempo
 */
export async function waitUntil(cdp, expression, { timeout = 30000, what = null } = {}) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await evaluate(cdp, `!!(${expression})`)) return true;
		await wait(200);
	}
	throw new Error(`Timeout esperando ${what ?? expression}`);
}

/**
 * Cierra el navegador y la conexión, en ese orden.
 *
 * Se pide por el protocolo (`Browser.close`) y **no** con `chrome.process.kill()`: la señal falla
 * con `EACCES` cuando el proceso corre confinado (Chrome de snap, o el script dentro de un
 * sandbox), y ese fallo en el `finally` pisa el error de verdad y además deja el navegador vivo
 * ocupando el puerto de depuración, con lo que la corrida siguiente se conecta al de la anterior.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {object} chrome - Lo que devolvió `launchChrome`
 * @returns {Promise<void>} No lanza nunca: está pensado para llamarse desde un `finally`
 */
export async function closeBrowser(cdp, chrome) {
	if (chrome) openBrowsers.delete(chrome);

	/*
	 * Sin conexión CDP hay que ir por el puerto. Antes esto fallaba en silencio: `Promise.race`
	 * con un `undefined` dentro resuelve de inmediato, así que la orden de cierre nunca salía y
	 * el navegador quedaba vivo sin que nadie se enterara.
	 */
	if (!cdp) {
		if (chrome?.port) await closeWhateverIsOn(chrome.port).catch(() => {});

		try { chrome?.process?.unref(); } catch { /* ya no está */ }

		return;
	}

	try {
		/*
		 * Con carrera contra el reloj: `Browser.close` casi nunca responde, porque el navegador
		 * cierra el WebSocket mientras se apaga y la promesa del comando se queda esperando para
		 * siempre. Lo que importa es que la orden salga.
		 */
		await Promise.race([cdp.send("Browser.close"), wait(3000)]);
	} catch {
		try {
			chrome?.process?.kill();
		} catch {
			// Confinado: no se puede señalar. Ya se intentó por el protocolo.
		}
	}

	try {
		cdp?.close();
	} catch {
		// El WebSocket ya se cayó al cerrar el navegador.
	}

	/*
	 * Soltar el proceso hijo. Node mantiene vivo su bucle de eventos mientras un proceso que él
	 * lanzó siga corriendo, así que un Chrome que tarda en apagarse deja el script colgado
	 * **después** de haber terminado todas las capturas: el trabajo está hecho y el comando nunca
	 * vuelve.
	 */
	chrome?.process?.unref();
}

/**
 * Concede el permiso de ubicación y fija unas coordenadas fijas para la página.
 *
 * En headless la geolocalización está denegada de fábrica, así que sin esto solo se puede capturar
 * el camino "sin ubicación". Hay que llamarlo **antes** de navegar: las vistas que la usan la piden
 * al montarse, y un permiso concedido después llega tarde.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {object} options
 * @param {string} options.origin - Origen al que se le concede el permiso, sin barra final
 * @param {number} options.latitude - Latitud en grados decimales
 * @param {number} options.longitude - Longitud en grados decimales
 * @param {number} [options.accuracy=20] - Precisión en **metros**. Las vistas la dibujan como el
 *        círculo alrededor del punto del ciudadano, así que un valor grande se nota en la captura
 * @returns {Promise<void>}
 */
export async function setGeolocation(cdp, { origin, latitude, longitude, accuracy = 20 }) {
	await cdp.send("Browser.grantPermissions", { origin, permissions: ["geolocation"] });
	await cdp.send("Emulation.setGeolocationOverride", { latitude, longitude, accuracy });
}

/**
 * Hace click sobre un elemento, con el `click()` del DOM.
 *
 * No sirve para lo que dependa de la posición del puntero —selects de Vuetify, popups de
 * mapas—: para eso está `clickAt`, que despacha el ratón de verdad.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} selector - Selector CSS
 * @param {object} [options]
 * @param {number} [options.index=0] - Cuál de los elementos que cumplen el selector
 * @returns {Promise<void>}
 * @throws {Error} Si no existe ese elemento. **Lanza**, al revés que `clickByText`
 */
export async function click(cdp, selector, { index = 0 } = {}) {
	const clicked = await evaluate(
		cdp,
		`(() => { const els=[...document.querySelectorAll(${JSON.stringify(selector)})];
      const e = els[${index}]; if (!e) return false; e.click(); return true; })()`,
	);
	if (!clicked) throw new Error(`No se pudo hacer click en ${selector} [${index}]`);
}

/**
 * Hace click en el primer elemento cuyo texto coincide. Sirve donde el índice no
 * es estable: botones de diálogos, ítems de menú.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} selector - Selector CSS de los candidatos
 * @param {string} text - Texto a buscar. La comparación no distingue mayúsculas y es parcial
 * @returns {Promise<boolean>} `false` si no lo encuentra. **No lanza**, al revés que `click`:
 *          hay que comprobar el resultado o el flujo sigue como si hubiera hecho click
 */
export async function clickByText(cdp, selector, text) {
	return evaluate(
		cdp,
		`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(el => el.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
      if (!e) return false; e.click(); return true; })()`,
	);
}

/**
 * Fija el tamaño del viewport.
 *
 * Cada manual tiene su tamaño de captura; pásalo explícito desde el adaptador
 * para que todas las corridas de ese manual salgan iguales.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {object} [options]
 * @param {number} [options.width=1280] - Ancho en píxeles
 * @param {number} [options.height=800] - Alto en píxeles
 * @param {boolean} [options.mobile=false] - Emular un dispositivo móvil. Cambia el `user-agent`
 *        y activa los eventos táctiles, que es lo que necesitan las apps de Ionic
 * @returns {Promise<void>}
 */
export async function setViewport(cdp, { width = 1280, height = 800, mobile = false } = {}) {
	await cdp.send("Emulation.setDeviceMetricsOverride", {
		width,
		height,
		deviceScaleFactor: 1,
		mobile,
	});
}

/**
 * Instala un script que corre antes de cualquier código de la página en cada navegación.
 * Sirve para enganchar cosas que se dibujan al montar, antes de que la app arranque.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} script - Código a inyectar. Se ejecuta en **cada** navegación, no solo en la
 *        siguiente, así que debe poder correr varias veces sin romperse
 * @returns {Promise<void>}
 */
export async function injectOnLoad(cdp, script) {
	await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: script });
}

/**
 * Presiona Escape. Sirve para cerrar menús y overlays sin hacer click en el fondo.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @returns {Promise<void>} No comprueba que algo se haya cerrado: si hace falta, verifícalo aparte
 */
export async function pressEscape(cdp) {
	for (const type of ["keyDown", "keyUp"]) {
		await cdp.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
	}
}

/**
 * Click real del ratón en coordenadas de pantalla.
 *
 * Un `element.click()` sintético llega con clientX/clientY en 0,0. Las librerías que
 * ubican algo a partir de la posición del puntero (mapas, tooltips, menús contextuales)
 * necesitan el evento con coordenadas de verdad.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {number} x - Coordenada horizontal **de pantalla**, no relativa al elemento
 * @param {number} y - Coordenada vertical de pantalla
 * @returns {Promise<void>} No verifica que el click diera en algo: sobre un mapa, las
 *          coordenadas pueden caer en un hueco y no pasar nada
 */
export async function clickAt(cdp, x, y) {
	const point = { x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 };
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, button: "none", clickCount: 0 });
	await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point });
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point });
}

/**
 * Mueve el puntero sin hacer click.
 *
 * Hace falta para capturar cualquier cosa que dependa de la posición del cursor (rótulos
 * que siguen al puntero, tooltips de hover): esos elementos se limpian con el `mouseout`,
 * así que hay que reponer la posición justo antes de capturar.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {number} x - Coordenada horizontal de pantalla
 * @param {number} y - Coordenada vertical de pantalla
 * @returns {Promise<void>}
 */
export async function moveMouseTo(cdp, x, y) {
	await cdp.send("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: Math.round(x),
		y: Math.round(y),
		button: "none",
		clickCount: 0,
	});
}

/**
 * Teclea `text` en el elemento con foco, anexandolo a lo que ya haya. Sin foco se pierde, sin error.
 * Hace falta en los buscadores de N caracteres: escuchan el evento de busqueda de Vuetify, que
 * no se dispara asignando `input.value`. `Input.insertText` entra por el camino del teclado real.
 */
export async function insertText(cdp, text) {
	await cdp.send("Input.insertText", { text });
}

/**
 * Dibuja un recuadro rojo sobre un elemento, para señalar en la captura dónde tiene que mirar
 * el usuario.
 *
 * Se puede llamar varias veces para marcar varios elementos en la misma captura. Con `label`
 * cada recuadro lleva una viñeta numerada, para que la imagen se corresponda con los pasos
 * numerados del documento.
 *
 * Los recuadros van en `position: fixed` con las coordenadas del `getBoundingClientRect`, así
 * que también funcionan sobre modales y popovers. Se limpian con `clearHighlights`, o solos al
 * navegar a otra página.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} selector - Selector CSS del elemento a señalar
 * @param {object} [options]
 * @param {number} [options.index=0] - Cuál de los elementos que cumplen el selector
 * @param {number} [options.padding=6] - Separación en píxeles entre el recuadro y el elemento
 * @param {string} [options.label] - Viñeta numerada en la esquina. Úsala cuando el texto del
 *        manual enumere pasos; sin ella el recuadro va limpio
 * @param {string} [options.color="#ff3b30"] - Color del borde y de la viñeta
 * @returns {Promise<void>}
 * @throws {Error} Si el elemento no existe. Lanza a propósito: una captura sin el recuadro que
 *         se esperaba pasa desapercibida hasta que alguien mira la imagen
 */
export async function highlight(cdp, selector, { index = 0, padding = 6, label = null, color = "#ff3b30" } = {}) {
	const drawn = await evaluate(
		cdp,
		`(() => {
      const target = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!target) return false;

      const rect = target.getBoundingClientRect();
      const padding = ${padding};

      let root = document.getElementById('__manual_highlights');
      if (!root) {
        root = document.createElement('div');
        root.id = '__manual_highlights';
        document.body.appendChild(root);
      }

      const box = document.createElement('div');
      Object.assign(box.style, {
        position: 'fixed',
        left: Math.max(0, rect.x - padding) + 'px',
        top: Math.max(0, rect.y - padding) + 'px',
        width: (rect.width + padding * 2) + 'px',
        height: (rect.height + padding * 2) + 'px',
        border: '3px solid ${color}',
        borderRadius: '8px',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: '2147483647',
      });
      root.appendChild(box);

      const label = ${JSON.stringify(label)};
      if (label !== null) {
        const badge = document.createElement('div');
        badge.textContent = label;
        Object.assign(badge.style, {
          position: 'fixed',
          left: Math.max(0, rect.x - padding - 11) + 'px',
          top: Math.max(0, rect.y - padding - 11) + 'px',
          width: '22px',
          height: '22px',
          borderRadius: '11px',
          background: '${color}',
          color: '#ffffff',
          font: 'bold 13px/22px sans-serif',
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: '2147483647',
        });
        root.appendChild(badge);
      }

      return true;
    })()`,
	);

	if (!drawn) throw new Error(`No se encontró el elemento para señalar: ${selector} [${index}]`);
}

/**
 * Quita los recuadros que haya puesto `highlight`.
 *
 * Llamarlo siempre después de capturar: si no, los recuadros se arrastran a la siguiente
 * captura de la misma corrida.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @returns {Promise<void>} No falla si no había ninguno
 */
export async function clearHighlights(cdp) {
	await evaluate(cdp, `(() => { document.getElementById('__manual_highlights')?.remove(); return true; })()`);
}

/**
 * Captura la pantalla completa o el recorte de un selector.
 *
 * `includeHeader` extiende el recorte hasta el borde superior de la ventana, para
 * que la barra superior de la app salga junto al contenido.
 *
 * `clip` permite pasar el recorte ya calculado (`{x, y, width, height}`), para cuando el
 * encuadre no sale de un solo elemento: por ejemplo una esquina de un mapa.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} target - Ruta del PNG a escribir. Las carpetas que falten se crean
 * @param {object} [options]
 * @param {string} [options.selector] - Recortar a este elemento. Sin él y sin `clip`, captura
 *        el viewport completo
 * @param {number} [options.margin=10] - Margen alrededor del elemento, en píxeles
 * @param {boolean} [options.includeHeader=false] - Extiende el recorte hasta el borde superior
 *        de la ventana, para que la barra de la app salga junto al contenido
 * @param {{x: number, y: number, width: number, height: number}} [options.clip] - Recorte
 *        explícito. Tiene prioridad sobre `selector`
 * @returns {Promise<string>} La misma ruta de `target`, para poder encadenar
 * @throws {Error} Si se pasó `selector` y no existe en la página
 */
export async function screenshot(cdp, target, { selector = null, margin = 10, includeHeader = false, clip: explicitClip = null } = {}) {
	let clip = explicitClip ? { ...explicitClip, scale: 1 } : null;

	if (selector && !clip) {
		const rect = await evaluate(
			cdp,
			`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, windowWidth: window.innerWidth }; })()`,
		);
		if (!rect) throw new Error(`No se encontró el selector para capturar: ${selector}`);

		clip = includeHeader
			? {
					x: 0,
					y: 0,
					width: rect.windowWidth,
					height: Math.ceil(rect.y + rect.height + margin),
					scale: 1,
				}
			: {
					x: Math.max(0, Math.floor(rect.x - margin)),
					y: Math.max(0, Math.floor(rect.y - margin)),
					width: Math.ceil(rect.width + margin * 2),
					height: Math.ceil(rect.height + margin * 2),
					scale: 1,
				};
	}

	/*
	 * `captureBeyondViewport` solo cuando el recorte de verdad se sale de la pantalla.
	 *
	 * Esa opción obliga a Chrome a rehacer el layout para poder pintar lo que no está
	 * visible, y ese reflow dispara eventos del ratón en la página: los elementos que
	 * dependen de la posición del cursor (el rótulo de coordenadas del mapa) reciben un
	 * `mouseout` y se limpian justo antes de la captura. Si el recorte cabe en la pantalla,
	 * no hace falta y la captura sale con lo que se está viendo.
	 */
	const viewport = await evaluate(cdp, `({ width: window.innerWidth, height: window.innerHeight })`);
	const beyondViewport = Boolean(
		clip && (clip.x < 0 || clip.y < 0 || clip.x + clip.width > viewport.width + 1 || clip.y + clip.height > viewport.height + 1),
	);

	const { data } = await cdp.send("Page.captureScreenshot", {
		format: "png",
		...(clip ? { clip } : {}),
		captureBeyondViewport: beyondViewport,
	});

	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, Buffer.from(data, "base64"));
	return target;
}

/**
 * Parchea window.fetch en la página para forzar fallos de red o de servidor.
 * Sirve para capturar los estados de error sin tocar el backend.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {object} options
 * @param {string} options.pattern - Subcadena de la URL a interceptar. Lo que no coincida pasa
 *        al `fetch` real
 * @param {'serverError'|'offline'|'failFrom'|'slow'|'none'} options.mode - Qué simular.
 *        `none` deja pasar todo, útil para desactivar sin restaurar
 * @param {number} [options.from=1] - Solo con `failFrom`: a partir de qué llamada empieza a fallar
 * @param {number} [options.delayMs=2500] - Solo con `slow`: cuánto retrasar la respuesta
 * @returns {Promise<void>} El parche queda puesto hasta `restoreFetch` o hasta recargar la página
 */
export async function interceptFetch(cdp, { pattern, mode, from = 1, delayMs = 2500 }) {
	await evaluate(
		cdp,
		`(() => {
      if (!window.__originalFetch) window.__originalFetch = window.fetch;
      window.__fetchCount = 0;
      const pattern = ${JSON.stringify(pattern)};
      const mode = ${JSON.stringify(mode)};
      const from = ${from};
      const delayMs = ${delayMs};

      window.fetch = async (resource, options) => {
        const url = typeof resource === 'string' ? resource : resource.url;
        if (!url.includes(pattern) || mode === 'none') return window.__originalFetch(resource, options);

        window.__fetchCount++;

        if (mode === 'offline') throw new TypeError('Failed to fetch');
        if (mode === 'serverError' || (mode === 'failFrom' && window.__fetchCount >= from)) {
          return new Response(JSON.stringify({ message: 'Error del servidor' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        if (mode === 'slow') {
          const response = await window.__originalFetch(resource, options);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return response;
        }
        return window.__originalFetch(resource, options);
      };
      return true;
    })()`,
	);
}

/**
 * Restaura el `fetch` original de la página.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @returns {Promise<void>} No falla si nunca se interceptó
 */
export async function restoreFetch(cdp) {
	await evaluate(cdp, `(() => { if (window.__originalFetch) window.fetch = window.__originalFetch; return true; })()`);
}
