/**
 * Capturas de las herramientas del mapa del AVL: los controles flotantes (zoom, capas, puntos
 * de interés, tipos de elemento, rutas y agrupar), la medición de distancias, las coordenadas
 * del cursor en tiempo real y la vista en pantalla completa.
 *
 * Todas existen en las dos vistas del módulo (`MapMeasureControl` y `useMapCursorCoordinates`
 * se montan tanto en `gpsHistoryView.vue` como en `VehicleTracking.vue`, y los controles
 * redondos los arman `updateLayerControl` / `useMapLayers` con los mismos nombres de clase),
 * así que el flujo sirve para ambas con `--vista`.
 *
 * Uso:
 *   node modules/avl/capture-map-tools.mjs --salida <carpeta> --empresa "Empresa Demo"
 *        [--vista vehicle-tracking|gps-history] [--base http://localhost:5173]
 *        [--email <usuario>] [--password <clave>]
 *        [--solo controles,capas,agrupar,coordenadas,medicion,pantalla-completa]
 *
 * No necesita datos de negocio: son controles del mapa, funcionan con el mapa vacío. Lo que sí
 * necesita datos es el **efecto** de la agrupación (los clústeres con el conteo), porque sin
 * marcadores no hay nada que agrupar: eso se documenta en un ambiente con vehículos.
 */

import { clearHighlights, click, clickAt, closeBrowser, evaluate, highlight, moveMouseTo, screenshot, wait, waitForSelector } from "../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, goTo, openSession, refreshMap, testCredentials } from "../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const { email, password } = testCredentials({ email: arg("email"), password: arg("password") });
const company = arg("empresa", null);
const view = arg("vista", "vehicle-tracking");

const VIEW_PATHS = {
	"gps-history": "/avl/gps-history",
	"vehicle-tracking": "/avl/vehicle-tracking",
};

/**
 * Los controles del mapa, en el orden en que se enumeran en el manual.
 *
 * Los redondos de la derecha no se distinguen por su posición —cuáles se pintan depende de los
 * permisos del usuario— sino por la clase de su ícono, que es la que les pone `changeIcon`.
 */
const MAP_CONTROLS = [
	{ selector: ".leaflet-control-zoom", name: "Zoom" },
	{ selector: ".custom-icon-control", name: "Capas" },
	{ selector: ".custom-icon-points-of-interest", name: "Puntos de Interés" },
	{ selector: ".custom-icon-points-of-element", name: "Tipo de elementos" },
	{ selector: ".custom-icon-routes", name: "Rutas" },
	{ selector: ".avl-grouping-control", name: "Agrupar objetos" },
	{ selector: ".map-measure-control button", name: "Medir distancia" },
];

/** Botón que maximiza el mapa dentro de la tarjeta de la vista. */
const FULLSCREEN_BUTTON = "button:has(.tabler-maximize)";

/*
 * Botón que devuelve el mapa a su tamaño normal: es la **X** de la barra del diálogo, no un
 * ícono de minimizar. Se restringe a la barra porque dentro del diálogo hay otra X, la que
 * limpia la medición.
 */
const EXIT_FULLSCREEN_BUTTON = ".v-dialog .v-toolbar button:has(.tabler-x)";

/** Botón que recoge el panel lateral de vehículos, dentro del diálogo de pantalla completa. */
const HIDE_PANEL_BUTTON = ".v-dialog button:has(.tabler-chevrons-left)";

/**
 * Espera a que se vayan los toasts de vue3-toastify.
 *
 * Al entrar a la vista salen "Vehículos obtenidos exitosamente" y "Usuarios obtenidos con
 * éxito" en la esquina inferior derecha, justo encima del rótulo de coordenadas. Si se
 * captura antes de que se desvanezcan, el recorte sale con los avisos y sin el dato.
 */
async function waitForToastsToClear(cdp, { timeout = 20000 } = {}) {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const pending = await evaluate(cdp, `document.querySelectorAll('.Toastify__toast').length`);
		if (pending === 0) {
			await wait(400);

			return true;
		}
		await wait(500);
	}

	console.log("  (aviso) los toasts no desaparecieron; la captura puede salir con avisos encima");

	return false;
}

/**
 * Acerca el mapa con el control de zoom.
 *
 * Sin vehículos en pantalla el mapa arranca en vista continental: las capturas salen con
 * medio continente y una medición de cientos de kilómetros, que no es lo que documenta el
 * manual. El zoom se hace por el control y no por la API de Leaflet porque la instancia del
 * mapa vive en un ref de Vue, no en `window`.
 */
async function zoomIn(cdp, times = 7, { within = "" } = {}) {
	for (let step = 0; step < times; step++) {
		await click(cdp, `${within} .leaflet-control-zoom-in`.trim());
		await wait(700);
	}

	// Un respiro para que carguen los tiles del nivel nuevo.
	await wait(2500);
}

/** Rectángulo en pantalla del mapa visible (el de la página, no el del diálogo). */
const mapRect = (cdp) =>
	evaluate(
		cdp,
		`(() => { const c = [...document.querySelectorAll('.leaflet-container')].find(e => e.offsetParent !== null);
      if (!c) return null; const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
	);

/** Cuántos elementos cumplen el selector. */
const countOf = (cdp, selector) => evaluate(cdp, `document.querySelectorAll(${JSON.stringify(selector)}).length`);

/** Rectángulo en pantalla del primer elemento que cumple el selector, o `null` si no existe. */
const rectOf = (cdp, selector) =>
	evaluate(
		cdp,
		`(() => { const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
	);

/**
 * Rectángulo que envuelve a todos los elementos de una lista de selectores.
 *
 * Sirve para encuadrar un grupo de controles que no comparten contenedor, como la pila de
 * botones redondos de la derecha del mapa.
 *
 * @returns {Promise<object|null>} `{x, y, width, height}` en coordenadas de pantalla, o `null`
 *          si ninguno de los selectores existe
 */
const unionRect = (cdp, selectors) =>
	evaluate(
		cdp,
		`(() => {
      const els = ${JSON.stringify(selectors)}.flatMap(s => [...document.querySelectorAll(s)]);
      if (!els.length) return null;
      const rects = els.map(e => e.getBoundingClientRect());
      const left = Math.min(...rects.map(r => r.left));
      const top = Math.min(...rects.map(r => r.top));
      const right = Math.max(...rects.map(r => r.right));
      const bottom = Math.max(...rects.map(r => r.bottom));
      return { x: left, y: top, width: right - left, height: bottom - top }; })()`,
	);

/**
 * Recorte de una esquina del mapa, del tamaño pedido.
 *
 * Los controles viven pegados a los bordes del mapa, así que un recorte con margen alrededor
 * del control se sale hacia el fondo blanco de la página, y uno ajustado al control queda tan
 * pequeño que el lector no ubica dónde está. Anclar el recorte a la esquina del mapa da
 * contexto y encuadres iguales entre capturas.
 *
 * @param {object} map - Rectángulo del mapa, tal como lo devuelve `mapRect`
 * @param {object} [options]
 * @param {string} [options.corner="top-right"] - Esquina: `top-right`, `bottom-right`,
 *        `top-left` o `bottom-left`
 * @param {number} [options.width=520] - Ancho deseado; se limita al del mapa
 * @param {number} [options.height=380] - Alto deseado; se limita al del mapa
 * @returns {object} El recorte listo para `screenshot`, con valores enteros
 */
const cornerClip = (map, { corner = "top-right", width = 520, height = 380 } = {}) => {
	const clipWidth = Math.min(width, Math.round(map.width));
	const clipHeight = Math.min(height, Math.round(map.height));
	const right = corner.endsWith("right");
	const bottom = corner.startsWith("bottom");

	return {
		x: Math.round(right ? map.x + map.width - clipWidth : map.x),
		y: Math.round(bottom ? map.y + map.height - clipHeight : map.y),
		width: clipWidth,
		height: clipHeight,
	};
};

/**
 * Panorámica de los controles del mapa, numerados en el mismo orden en que los enumera el
 * manual.
 *
 * La numeración se calcula sobre los controles **presentes**: los redondos de puntos de
 * interés, tipos de elemento y rutas dependen de los permisos del usuario, así que con otro
 * usuario la pila es más corta y los números tienen que seguir siendo consecutivos.
 *
 * @returns {Promise<string[]>} Los nombres de los controles encontrados, en orden. Sirve para
 *          redactar el manual con la misma numeración que muestra la imagen
 */
async function captureControls(cdp) {
	const present = [];

	for (const control of MAP_CONTROLS) {
		if ((await countOf(cdp, control.selector)) > 0) present.push(control);
	}

	if (present.length === 0) throw new Error(`No se encontró ningún control del mapa. Pantalla:\n${await describeScreen(cdp)}`);

	const missing = MAP_CONTROLS.filter((control) => !present.includes(control));
	if (missing.length > 0) console.log(`  (aviso) sin permisos para: ${missing.map((c) => c.name).join(", ")}`);

	for (const [index, control] of present.entries()) {
		await highlight(cdp, control.selector, { label: String(index + 1), padding: 6 });
		console.log(`  ${index + 1}. ${control.name}`);
	}

	// Margen amplio: las viñetas numeradas se dibujan por fuera del recuadro, y las de los
	// controles pegados al borde del mapa se cortan con el margen por defecto.
	await screenshot(cdp, `${outputDir}/controles_mapa.png`, { selector: ".leaflet-container", margin: 22 });
	await clearHighlights(cdp);

	return present.map((control) => control.name);
}

/**
 * Panel de capas desplegado.
 *
 * El primer control redondo es el único que despliega un panel (los otros abren un diálogo:
 * `addActionEvent` les quita la expansión). Leaflet lo despliega con el `mouseenter` real del
 * ratón, así que no sirve un `click()` sintético; y el recuadro de `highlight` no lo cierra
 * porque se dibuja sin eventos de ratón.
 */
async function captureLayersPanel(cdp) {
	const control = await rectOf(cdp, ".custom-icon-control");
	if (!control) throw new Error("No se encontró el control de capas (.custom-icon-control)");

	await moveMouseTo(cdp, control.x + control.width / 2, control.y + control.height / 2);
	await wait(900);

	const expanded = await evaluate(
		cdp,
		`(() => { const e = document.querySelector('.custom-icon-control');
      return !!e && e.classList.contains('leaflet-control-layers-expanded')
        && (e.textContent || '').trim().length > 0; })()`,
	);
	if (!expanded) throw new Error(`El panel de capas no se desplegó. Pantalla:\n${await describeScreen(cdp)}`);

	const layers = await evaluate(
		cdp,
		`[...document.querySelectorAll('.custom-icon-control .leaflet-control-layers-overlays label')]
      .map(l => l.textContent.trim())`,
	);
	console.log(`  capas listadas: ${layers.join(", ") || "(ninguna)"}`);

	const map = await mapRect(cdp);

	await highlight(cdp, ".custom-icon-control", { padding: 8 });
	await screenshot(cdp, `${outputDir}/capas.png`, { clip: cornerClip(map) });
	await clearHighlights(cdp);

	// El panel se colapsa al salir el ratón: se retira al centro del mapa para no arrastrarlo
	// desplegado a las capturas siguientes.
	await moveMouseTo(cdp, map.x + map.width / 2, map.y + map.height / 2);
	await wait(500);
}

/**
 * Botón de agrupar objetos, en su estado activo.
 *
 * El control cambia de ícono (`avl-grouping-control--on`) al activarse, y eso es lo que se
 * documenta: los clústeres con el conteo solo aparecen si hay marcadores en el mapa, y en un
 * ambiente sin vehículos no hay nada que agrupar. Se deja desactivado al terminar para que las
 * capturas siguientes muestren el estado por defecto.
 */
async function captureGrouping(cdp) {
	await waitForSelector(cdp, ".avl-grouping-control", { timeout: 30000 });
	await click(cdp, ".avl-grouping-control");
	await wait(1200);

	const active = await evaluate(cdp, `!!document.querySelector('.avl-grouping-control.avl-grouping-control--on')`);
	if (!active) throw new Error(`El botón de agrupar no quedó activo. Pantalla:\n${await describeScreen(cdp)}`);

	const clusters = await countOf(cdp, ".avl-cluster-marker");
	console.log(`  agrupación activa; clústeres dibujados: ${clusters}`);
	if (clusters === 0) console.log("  (aviso) sin marcadores en el mapa no hay clústeres: la captura solo muestra el botón activo");

	const map = await mapRect(cdp);

	await highlight(cdp, ".avl-grouping-control", { padding: 8 });
	await screenshot(cdp, `${outputDir}/agrupar.png`, { clip: cornerClip(map) });
	await clearHighlights(cdp);

	await click(cdp, ".avl-grouping-control");
	await wait(1000);
}

/**
 * Vista del mapa en pantalla completa, con el panel lateral recogido.
 *
 * El botón abre un diálogo con un mapa nuevo, así que a partir de aquí hay dos
 * `.leaflet-container` en el DOM: este paso va **al final** para no dejar a los demás
 * apuntando al mapa equivocado. El mapa del diálogo se crea con la vista continental cuando no
 * hay marcadores que encuadrar, de modo que hay que acercarlo igual que el de la página.
 *
 * El panel lateral se recoge con el otro botón de la barra: así la captura muestra el mapa
 * ocupando toda la pantalla, que es lo que documenta, y no un listado de vehículos que en un
 * ambiente sin datos sale vacío.
 *
 * @returns {Promise<boolean>} `false` si la vista no tiene botón de pantalla completa; en ese
 *          caso no se genera la captura y hay que documentarla sin imagen
 */
async function captureFullscreen(cdp) {
	if ((await countOf(cdp, FULLSCREEN_BUTTON)) === 0) {
		console.log("  (aviso) esta vista no tiene botón de pantalla completa: no se captura");

		return false;
	}

	await click(cdp, FULLSCREEN_BUTTON);
	await waitForSelector(cdp, ".v-dialog .leaflet-container", { timeout: 30000 });
	await wait(1500);

	if ((await countOf(cdp, HIDE_PANEL_BUTTON)) > 0) {
		await click(cdp, HIDE_PANEL_BUTTON);
		await wait(1200);
	}

	await refreshMap(cdp);
	await waitForToastsToClear(cdp);
	await zoomIn(cdp, 5, { within: ".v-dialog" });

	await screenshot(cdp, `${outputDir}/pantalla_completa.png`);

	if ((await countOf(cdp, EXIT_FULLSCREEN_BUTTON)) > 0) {
		await click(cdp, EXIT_FULLSCREEN_BUTTON);
		await wait(1200);
	}

	return true;
}

/**
 * Coordenadas del cursor.
 *
 * El control se pinta al montar pero arranca con el marcador de posición
 * ("Lat: --  Lng: --"): solo muestra valores cuando el mapa recibe un `mousemove`, y el
 * texto se actualiza dentro de un requestAnimationFrame. Por eso hay que mover el ratón de
 * verdad y esperar a que el texto deje de ser el placeholder.
 */
async function captureCoordinates(cdp) {
	await waitForSelector(cdp, ".avl-cursor-coordinates", { timeout: 30000 });

	const rect = await mapRect(cdp);
	if (!rect) throw new Error("No se encontró el mapa visible");

	// Varias posiciones: si el cursor cae sobre un control o fuera del mapa, no hay evento.
	const positions = [0.5, 0.45, 0.55, 0.4];
	let text = "";
	let cursor = null;

	for (const fraction of positions) {
		cursor = { x: rect.x + rect.width * fraction, y: rect.y + rect.height * fraction };
		await moveMouseTo(cdp, cursor.x, cursor.y);
		await wait(600);

		text = await evaluate(cdp, `(document.querySelector('.avl-cursor-coordinates') || {}).textContent || ''`);
		if (text.includes("Lat:") && !text.includes("--")) break;
	}

	if (!text.includes("Lat:") || text.includes("--")) {
		throw new Error(`El control de coordenadas no tomó valores (texto: "${text}")`);
	}

	console.log(`  coordenadas leídas: ${text.trim()}`);

	// El rótulo es pequeño y queda en una esquina: sin señalarlo, el lector del manual no sabe
	// qué mirar dentro de un mapa lleno de detalle.
	await highlight(cdp, ".avl-cursor-coordinates", { padding: 8 });

	// El control se limpia con el `mouseout`, así que se repone la posición del cursor
	// después de dibujar el recuadro y justo antes de capturar.
	await moveMouseTo(cdp, cursor.x, cursor.y);
	await wait(250);

	// Recorte de la esquina inferior derecha del mapa, que es donde vive el rótulo.
	await screenshot(cdp, `${outputDir}/coordenadas.png`, {
		clip: cornerClip(rect, { corner: "bottom-right", width: 620, height: 300 }),
	});

	await clearHighlights(cdp);
}

/**
 * Medición de distancias.
 *
 * El botón alterna el modo; con el modo activo, cada click sobre el mapa agrega un vértice y
 * el control muestra la distancia acumulada. Se capturan dos puntos: con uno solo el rótulo
 * dice "0 m" y no se ve la línea.
 */
async function captureMeasure(cdp) {
	await waitForSelector(cdp, ".map-measure-control button", { timeout: 30000 });
	await click(cdp, ".map-measure-control button");
	await wait(800);

	const active = await evaluate(
		cdp,
		`!!document.querySelector('.map-measure-control button.bg-error, .map-measure-control .text-error, .map-measure-control button.v-btn--variant-elevated.bg-error')`,
	);
	if (!active) console.log("  (aviso) no se pudo confirmar que el modo medición quedó activo");

	const rect = await mapRect(cdp);

	// Dos vértices separados, dentro del mapa y lejos de los controles de los bordes.
	const points = [
		{ x: rect.x + rect.width * 0.35, y: rect.y + rect.height * 0.45 },
		{ x: rect.x + rect.width * 0.62, y: rect.y + rect.height * 0.62 },
	];

	for (const point of points) {
		await clickAt(cdp, point.x, point.y);
		await wait(900);
	}

	const label = await evaluate(cdp, `(document.querySelector('.map-measure-control__value') || {}).textContent || ''`);
	if (!label.trim()) {
		throw new Error(`La medición no produjo distancia. Pantalla:\n${await describeScreen(cdp)}`);
	}

	console.log(`  distancia medida: ${label.trim()}`);

	// Se numeran las dos partes del control para poder referenciarlas en el texto del manual:
	// el botón que activa la herramienta y el rótulo con la distancia acumulada.
	await highlight(cdp, ".map-measure-control button", { label: "1", padding: 8 });
	await highlight(cdp, ".map-measure-control__info", { label: "2", padding: 8 });

	await screenshot(cdp, `${outputDir}/medicion.png`, { selector: ".leaflet-container" });

	await clearHighlights(cdp);
}

/*
 * Los pasos, en el orden en que tienen que correr:
 *
 * - la medición deja líneas dibujadas sobre el mapa, así que va después de las capturas que
 *   muestran el mapa limpio;
 * - la pantalla completa crea un segundo mapa en el DOM, así que va al final.
 */
const STEPS = [
	{ name: "controles", run: captureControls },
	{ name: "capas", run: captureLayersPanel },
	{ name: "agrupar", run: captureGrouping },
	{ name: "coordenadas", run: captureCoordinates },
	{ name: "medicion", run: captureMeasure },
	{ name: "pantalla-completa", run: captureFullscreen },
];

const main = async () => {
	const path = VIEW_PATHS[view];
	if (!path) throw new Error(`Vista desconocida: ${view}. Opciones: ${Object.keys(VIEW_PATHS).join(", ")}`);

	const only = arg("solo", null)
		?.split(",")
		.map((name) => name.trim())
		.filter(Boolean);

	const steps = only ? STEPS.filter((step) => only.includes(step.name)) : STEPS;

	if (steps.length === 0) {
		throw new Error(`--solo no coincide con ningún paso. Opciones: ${STEPS.map((s) => s.name).join(", ")}`);
	}

	const { cdp, chrome } = await openSession({ base, email, password, company, module: "AVL" });

	try {
		await goTo(cdp, base, path, { selector: ".leaflet-container" });

		if (!(await refreshMap(cdp))) console.warn("Aviso: el mapa puede no haber tomado el tamaño completo del viewport");
		await wait(1500);

		await waitForToastsToClear(cdp);
		await zoomIn(cdp);

		for (const step of steps) {
			console.log(`\n${step.name}`);
			await step.run(cdp);
		}

		console.log(`\nCapturas en ${outputDir}`);
	} catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		throw error;
	} finally {
		await closeBrowser(cdp, chrome);
	}
};

main().catch((error) => {
	console.error(`\nFalló: ${error.message}`);
	process.exit(1);
});
