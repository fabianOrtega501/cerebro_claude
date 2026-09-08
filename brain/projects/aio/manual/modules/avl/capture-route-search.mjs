/**
 * Capturas del buscador de rutas del Seguimiento Vehicular (ticket 10646).
 *
 * El formulario "Ver Rutas" gano dos cosas: un buscador de ruta por macro o micro codigo, que
 * solo se habilita despues de elegir el tipo de servicio, y la casilla "Ver puntos de control",
 * que ademas de las geometrias pinta los puntos de control de las rutas marcadas.
 *
 * Uso:
 *   node --experimental-websocket modules/avl/capture-route-search.mjs --salida <carpeta>
 *        --empresa "La Fabrica" [--servicio "RECOLECCIÓN RESIDENCIAL"] [--ruta MI00001]
 *        [--solo formulario|resultados|filtrada|puntos|todo]
 *
 * Necesita un servicio con **muchas** rutas: con dos o tres el buscador no se entiende. En el
 * ambiente local eso lo deja `seed-route-search.sql`, que ademas les pone nombres publicables.
 */

import {
	clickAt,
	clickByText,
	closeBrowser,
	evaluate,
	screenshot,
	wait,
	waitForSelector,
	waitUntil,
} from "../../lib/browser.mjs";
import { DIALOG, clickChecked, scrollDialogToTop } from "../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	appField,
	describeScreen,
	goTo,
	openSelect,
	openSession,
	searchFetcherSelect,
	selectOption,
	settleRequests,
	testCredentials,
} from "../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "La Fabrica");
const service = arg("servicio", "RECOLECCIÓN RESIDENCIAL");
const routeTerm = arg("ruta", "MI00001");
const only = arg("solo", "todo");

const TRACKING_VIEW = "/avl/vehicle-tracking";
const ROUTES_CONTROL = ".custom-icon-routes";
const ROUTE_ROW = ".v-data-table tbody tr input[type=checkbox]";
const CHECKPOINT = ".avl-checkpoint-marker";

const wants = (name) => only === "todo" || only === name;

/**
 * Resuelve el input del buscador de ruta, que no tiene id propio.
 *
 * @param {object} cdp - Conexion al navegador.
 * @returns {Promise<string>} - Selector marcado con un atributo propio.
 */
async function routeSearchInput(cdp) {
	const selector = await evaluate(
		cdp,
		`(() => {
			const etiqueta = [...document.querySelectorAll('.v-dialog .v-label')]
				.find(e => /Buscar\\s+Ruta/i.test(e.textContent.trim()));
			if (!etiqueta) return '';
			const campo = etiqueta.parentElement?.querySelector('input') || etiqueta.nextElementSibling?.querySelector('input');
			if (!campo) return '';
			campo.setAttribute('data-captura', 'ruta');

			return '[data-captura="ruta"]';
		})()`,
	);

	if (!selector) throw new Error("No se encontro el buscador de ruta en el modal");

	return selector;
}

/** Cuantas filas tiene la tabla de rutas ahora mismo. */
const rowCount = (cdp) => evaluate(cdp, `document.querySelectorAll('${ROUTE_ROW}').length`);

async function run() {
	const { email, password } = testCredentials();
	let cdp;
	let chrome;

	try {
		({ cdp, chrome } = await openSession({ base, email, password, company, module: "AVL" }));

		await goTo(cdp, base, TRACKING_VIEW);
		await waitForSelector(cdp, ROUTES_CONTROL, { timeout: 90000 }).catch(async () => {
			throw new Error(`No aparecio el control de rutas. Pantalla:\n${await describeScreen(cdp)}`);
		});

		await clickChecked(cdp, ROUTES_CONTROL, { what: "el control de rutas" });
		await waitForSelector(cdp, appField("service_id"), { timeout: 30000 });
		await wait(1500);

		if (wants("formulario")) {
			// Recien abierto: el buscador de ruta esta deshabilitado y dice que falta el servicio.
			await screenshot(cdp, `${outputDir}/ruta-buscador-vacio.png`, { selector: DIALOG });
			console.log("captura: ruta-buscador-vacio");
		}

		await openSelect(cdp, appField("service_id"));
		await selectOption(cdp, service);
		await wait(800);

		await settleRequests(cdp, () => clickChecked(cdp, "#buscar-rutas", { what: "Buscar" }), {
			what: "la consulta de rutas",
			timeout: 90000,
		});
		await waitForSelector(cdp, ROUTE_ROW, { timeout: 60000 }).catch(async () => {
			throw new Error(`El servicio no devolvio rutas. Pantalla:\n${await describeScreen(cdp)}`);
		});
		await wait(1200);

		const total = await rowCount(cdp);

		console.log("filas tras buscar por servicio:", total);

		if (wants("resultados")) {
			await evaluate(cdp, `document.activeElement && document.activeElement.blur()`);

			// No se baja el scroll: dejaria fuera el formulario, que es lo que documenta esta captura.
			await wait(500);
			await screenshot(cdp, `${outputDir}/ruta-resultados.png`, { selector: DIALOG });
			console.log("captura: ruta-resultados");
		}

		if (wants("filtrada") || wants("puntos")) {
			// La captura anterior bajo el scroll: el buscador quedaria fuera de la pantalla.
			await scrollDialogToTop(cdp);

			const input = await routeSearchInput(cdp);
			const options = await searchFetcherSelect(cdp, input, routeTerm);

			if (!options.length) throw new Error(`El buscador no devolvio rutas para "${routeTerm}"`);

			await selectOption(cdp, options[0]);
			await wait(800);

			// Elegir la ruta no filtra: el filtro se aplica al pulsar Buscar.
			await clickChecked(cdp, "#buscar-rutas", { what: "Buscar con la ruta elegida" });
			await wait(2500);

			const filtradas = await rowCount(cdp);

			console.log("filas tras filtrar por ruta:", filtradas, "(antes", total + ")");

			if (filtradas >= total)
				console.log("AVISO: el filtro no redujo la tabla; revisar antes de publicar");

			if (wants("filtrada")) {
				await evaluate(cdp, `document.activeElement && document.activeElement.blur()`);
				await wait(500);
				await screenshot(cdp, `${outputDir}/ruta-filtrada.png`, { selector: DIALOG });
				console.log("captura: ruta-filtrada");
			}
		}

		if (wants("puntos")) {
			// Se marca la ruta que quedo en la tabla y se pide ver sus puntos de control.
			await evaluate(cdp, `document.querySelector('${ROUTE_ROW}')?.click()`);
			await wait(600);
			await evaluate(cdp, `document.querySelector('.v-dialog input[name="show_checkpoints"]')?.click()`);
			await wait(600);

			await screenshot(cdp, `${outputDir}/ruta-ver-puntos.png`, { selector: DIALOG });
			console.log("captura: ruta-ver-puntos");

			await clickByText(cdp, ".v-dialog button", "Confirmar");
			await waitUntil(cdp, `document.querySelectorAll('${CHECKPOINT}').length > 0`, {
				timeout: 90000,
				what: "los puntos de control en el mapa",
			});
			await wait(3500);

			const puntos = await evaluate(cdp, `document.querySelectorAll('${CHECKPOINT}').length`);

			console.log("puntos de control dibujados:", puntos);
			await screenshot(cdp, `${outputDir}/ruta-puntos-control.png`, { selector: ".leaflet-container" });
			console.log("captura: ruta-puntos-control");

			await openCheckpointPopup(cdp);
			await wait(1500);
			await screenshot(cdp, `${outputDir}/ruta-punto-popup.png`, { selector: ".leaflet-container" });
			console.log("captura: ruta-punto-popup");
		}

		console.log("\nListo. Capturas en", outputDir);
	} catch (error) {
		console.error("\nFallo:", error.message);

		if (cdp) {
			await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
			console.error("\nEstado de la pantalla:\n", await describeScreen(cdp).catch(() => "(no se pudo leer)"));
		}

		process.exitCode = 1;
	} finally {
		if (cdp) await closeBrowser(cdp, chrome).catch(() => {});
	}
}

/**
 * Abre el globo de un punto de control probando los que haya en pantalla.
 *
 * @param {object} cdp - Conexion al navegador.
 * @returns {Promise<boolean>} - Falso si ninguno abrio globo; hay que comprobarlo.
 */
async function openCheckpointPopup(cdp) {
	const raw = await evaluate(
		cdp,
		`JSON.stringify([...document.querySelectorAll('${CHECKPOINT}')].map(e => {
			const r = e.getBoundingClientRect();

			return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
		}).filter(p => p.x > 0 && p.y > 0))`,
	);

	for (const { x, y } of JSON.parse(raw)) {
		await clickAt(cdp, x, y);
		await wait(1500);

		const open = await evaluate(cdp, `!!document.querySelector('.leaflet-popup-content .map-popup-card')`);

		if (open) return true;
	}

	console.log("AVISO: no se pudo abrir el globo de ningun punto de control");

	return false;
}

run();
