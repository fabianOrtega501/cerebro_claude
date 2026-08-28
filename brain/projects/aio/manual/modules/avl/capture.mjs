/**
 * Capturas del módulo AVL para el manual: capa de rutas, popup de la ruta y modal de detalle.
 *
 * Uso:
 *   node modules/avl/capture.mjs --salida ./capturas --empresa "<nombre de la empresa>" \
 *     [--base http://localhost:5173] [--email <usuario>] [--password <clave>] \
 *     [--servicio "Matenimiento Cestas"] [--vista gps-history|vehicle-tracking] \
 *     [--solo modal|popup]
 *
 * El dev server y el usuario de pruebas salen de las variables de entorno AIO_WEB_URL,
 * AIO_TEST_EMAIL y AIO_TEST_PASSWORD. Cada desarrollador las define en su
 * `.claude/settings.local.json` (ver el .example del repo).
 */

import { join } from "node:path";
import { click, clickAt, clickByText, closeBrowser, evaluate, screenshot, wait, waitForSelector } from "../../lib/browser.mjs";
import {
	DEFAULT_BASE,
	appField,
	describeScreen,
	goTo,
	openSelect,
	openSession,
	pointOnCanvasStroke,
	pointsOnCanvasStroke,
	refreshMap,
	selectOption,
	testCredentials,
	waitForNoSkeletons,
} from "../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const { email, password } = testCredentials({ email: arg("email"), password: arg("password") });
const company = arg("empresa", null);
const service = arg("servicio", null);
const view = arg("vista", "gps-history");
const only = arg("solo", null);

const VIEW_PATHS = {
	"gps-history": "/avl/gps-history",
	"vehicle-tracking": "/avl/vehicle-tracking",
};

/**
 * Abre el modal de rutas desde el control redondo del mapa y deja dibujadas las rutas del
 * servicio indicado. Devuelve cuántas rutas se seleccionaron.
 */
async function drawRoutes(cdp) {
	// El control solo existe si el usuario tiene permiso de lectura sobre
	// /operations/operation-routes.
	await waitForSelector(cdp, ".custom-icon-routes", { timeout: 90000 }).catch(async () => {
		throw new Error(
			`No apareció el control de rutas en el mapa. ¿Permisos sobre /operations/operation-routes? Pantalla:\n${await describeScreen(cdp)}`,
		);
	});

	await click(cdp, ".custom-icon-routes");
	await waitForSelector(cdp, appField("service_id"), { timeout: 30000 });

	await openSelect(cdp, appField("service_id"));

	// Sin --servicio se toma el primero de la lista: en el ambiente local casi nunca hay más
	// de un servicio con rutas dibujables.
	if (service) {
		await selectOption(cdp, service);
	} else {
		await click(cdp, ".v-list-item");
		await wait(400);
	}

	await click(cdp, "#buscar-rutas");

	// Ojo con esperar `tbody tr`: mientras la consulta va en camino la tabla ya tiene una fila,
	// la de "No data available". Hay que esperar una fila **con checkbox**, que solo existe
	// cuando llegaron rutas de verdad.
	await waitForSelector(cdp, ".v-data-table tbody tr input[type=checkbox]", { timeout: 60000 }).catch(async () => {
		throw new Error(`El servicio no devolvió rutas. Pantalla:\n${await describeScreen(cdp)}`);
	});
	await wait(500);

	// Se marcan dos rutas: una basta para el popup, pero con dos se ve que la capa admite
	// varias y el mapa queda más parecido al del manual.
	const checked = await evaluate(
		cdp,
		`(() => { const rows = [...document.querySelectorAll('.v-data-table tbody tr')].slice(0, 2);
      rows.forEach(r => r.querySelector('input[type=checkbox]')?.click());
      return rows.length; })()`,
	);
	await wait(500);

	// Si los checkboxes no quedaron marcados, `Confirmar` cierra el modal sin dibujar nada y el
	// error aparecería después, lejos de su causa.
	const confirmedCount = await evaluate(
		cdp,
		`[...document.querySelectorAll('.v-data-table input[type=checkbox]')].filter(i => i.checked).length`,
	);
	if (!confirmedCount) {
		const firstRow = await evaluate(
			cdp,
			`(document.querySelector('.v-data-table tbody tr') || {}).innerHTML?.slice(0, 600) ?? 'sin filas'`,
		);
		throw new Error(`Los checkboxes de las rutas no quedaron marcados. HTML de la primera fila:\n${firstRow}`);
	}

	await screenshot(cdp, join(outputDir, "capa_rutas.png"));

	const confirmed = await clickByText(cdp, ".v-card-actions button", "confirmar");
	if (!confirmed) throw new Error("No se encontró el botón Confirmar del modal de rutas");

	// El mapa hace fitBounds sobre las geometrías: hay que esperar a que el trazo esté pintado
	// en el canvas. Si nunca aparece, las rutas seleccionadas no traen geometry_line.
	await pointOnCanvasStroke(cdp, ".leaflet-overlay-pane canvas", { timeout: 60000 }).catch(() => {
		throw new Error("Las rutas seleccionadas no dibujaron geometría. ¿Tienen geometry_line?");
	});
	await wait(1200);

	return checked;
}

/** Hace click sobre el trazo de una ruta y captura el popup. */
async function capturePopup(cdp) {
	// Las rutas son mallas de calles: un único punto es frágil, así que se prueban varios tramos
	// hasta que uno abra el popup.
	const points = await pointsOnCanvasStroke(cdp);
	let opened = false;

	for (const [index, point] of points.entries()) {
		await clickAt(cdp, point.x, point.y);
		await wait(900);

		opened = await evaluate(cdp, `!!document.querySelector('.leaflet-popup.route-popup')`);
		if (opened) {
			console.log(`Popup abierto en el intento ${index + 1} de ${points.length}`);
			break;
		}
	}

	if (!opened) {
		const popups = await evaluate(cdp, `[...document.querySelectorAll('.leaflet-popup')].map(e => e.className)`);
		throw new Error(`Ningún click sobre la ruta abrió el popup (${points.length} intentos). Popups en el DOM: ${JSON.stringify(popups)}`);
	}

	await wait(600);

	await screenshot(cdp, join(outputDir, "popup_ruta.png"));
	await screenshot(cdp, join(outputDir, "popup_ruta_detalle.png"), { selector: ".leaflet-popup.route-popup", margin: 12 });
}

/** Abre el modal de detalle desde el popup y captura los pasos del wizard. */
async function captureDetailModal(cdp) {
	const opened = await evaluate(
		cdp,
		`(() => { const b = document.querySelector('.route-popup .v-btn'); if (!b) return false; b.click(); return true; })()`,
	);
	if (!opened) throw new Error("No se encontró el botón de detalles dentro del popup");

	await waitForSelector(cdp, ".v-dialog .v-card", { timeout: 60000 });

	// La modal abre vacía: el wizard se monta cuando responde RouteService.show. Si se espera
	// "sin skeletons" antes de eso, la condición se cumple con la modal en blanco y la captura
	// sale con las barras grises. Primero hay que esperar a que el wizard exista.
	await waitForSelector(cdp, ".v-dialog .stepper-icon-step", { timeout: 60000 });

	// Y después a que sus formularios terminen de cargar los selects.
	if (!(await waitForNoSkeletons(cdp, { within: ".v-dialog" }))) {
		console.warn("Aviso: la modal seguía cargando (quedaron skeletons en la captura)");
	}

	await screenshot(cdp, join(outputDir, "modal_detalle_ruta.png"));

	// El wizard tiene 6 pasos; el segundo (Personal) muestra que las demás secciones también
	// se consultan sin poder editarlas.
	const steps = await evaluate(cdp, `[...document.querySelectorAll('.v-dialog .stepper-icon-step')].length`);
	if (steps > 1) {
		await click(cdp, ".v-dialog .stepper-icon-step", { index: 1 });
		await wait(1200);
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });
		await screenshot(cdp, join(outputDir, "modal_detalle_ruta_personal.png"));
	}
}

/**
 * Deja evidencia de por qué falló un paso: una captura de la pantalla tal como quedó y el
 * estado de los elementos que suelen ser la causa. Sin esto, depurar en headless es a ciegas.
 */
async function dumpDiagnostics(cdp) {
	try {
		await screenshot(cdp, join(outputDir, "_fallo.png"));

		const info = await evaluate(
			cdp,
			`(() => ({
        canvas: [...document.querySelectorAll('canvas')].map(c => c.className + ' ' + c.width + 'x' + c.height),
        dialogosAbiertos: [...document.querySelectorAll('.v-overlay--active')].length,
        filas: document.querySelectorAll('.v-data-table tbody tr').length,
        marcados: [...document.querySelectorAll('.v-data-table input[type=checkbox]')].filter(i => i.checked).length,
        botones: [...document.querySelectorAll('.v-card-actions button')].map(b => b.textContent.trim()),
        texto: document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 500),
      }))()`,
		);

		console.error("\nDiagnóstico:");
		console.error(JSON.stringify(info, null, 2));
		console.error(`Captura del fallo: ${join(outputDir, "_fallo.png")}`);
	} catch (error) {
		console.error(`No se pudo tomar el diagnóstico: ${error.message}`);
	}
}

const main = async () => {
	const path = VIEW_PATHS[view];
	if (!path) throw new Error(`Vista desconocida: ${view}`);

	const { cdp, chrome } = await openSession({
		base,
		email,
		password,
		company,
		module: "AVL",
	});

	try {
		await goTo(cdp, base, path, { selector: ".leaflet-container" });

		const mapReady = await refreshMap(cdp);
		if (!mapReady) console.warn("Aviso: el mapa puede no haber tomado el tamaño completo del viewport");
		await wait(1000);

		const drawn = await drawRoutes(cdp);
		console.log(`Rutas dibujadas: ${drawn}`);

		if (only !== "modal") await capturePopup(cdp);
		if (only !== "popup") {
			if (only === "modal") await capturePopup(cdp);
			await captureDetailModal(cdp);
		}

		console.log(`\nCapturas en ${outputDir}`);
	} catch (error) {
		await dumpDiagnostics(cdp);
		throw error;
	} finally {
		await closeBrowser(cdp, chrome);
	}
};

main().catch((error) => {
	console.error(`\nFalló: ${error.message}`);
	process.exit(1);
});
