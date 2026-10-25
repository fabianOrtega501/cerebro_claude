/**
 * Capturas de los canales de la empresa en el inicio del portal y de la búsqueda de varias rutas.
 *
 * Uso:
 *   node modules/public/citizen-portal/capture-channels-routes.mjs --salida <carpeta>
 *        [--empresa "Istmo Green"] [--municipio "Distrito de Panam"] [--comuna Betania] [--puerto 9222]
 *
 * Necesita una empresa publicada con sitio web, redes y logo, y una comuna con varias rutas, algunas con recorrido.
 */

import { clickAt, closeBrowser, evaluate, screenshot, wait, waitForSelector, waitUntil } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, openPublicPage } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const port = Number(arg("puerto", 9222));
const company = arg("empresa", "Istmo Green");
const municipality = arg("municipio", "Distrito de Panam");
const commune = arg("comuna", "Betania");

/** Hace clic de mouse real en el centro del elemento; `false` si no existe. */
const clickCenter = async (cdp, selector, index = 0) => {
	const point = await evaluate(cdp, `(() => { const e = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!e) return null;
		e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`);

	if (!point) return false;
	await clickAt(cdp, point.x, point.y);

	return true;
};

/** Elige en el menú abierto la opción que contiene el texto, desplazando la lista si es larga. */
const pickFromMenu = async (cdp, text) => {
	const find = `[...document.querySelectorAll('.v-overlay--active .v-list-item')].findIndex(e => e.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`;
	let index = await evaluate(cdp, find);

	for (let step = 0; index < 0 && step < 200; step++) {
		await evaluate(cdp, `(() => { const l = document.querySelector('.v-overlay--active .v-list'); if (l) l.scrollTop += 300; return true })()`);
		await wait(60);
		index = await evaluate(cdp, find);
	}

	if (index < 0) throw new Error(`No está la opción "${text}" en el menú`);
	await clickCenter(cdp, ".v-overlay--active .v-list-item", index);
	await wait(800);
};

/** Abre el campo del buscador por su posición y elige la opción. */
const pickField = async (cdp, fieldIndex, text) => {
	await clickCenter(cdp, ".cp-search__field .v-field__input", fieldIndex);
	await wait(800);
	await pickFromMenu(cdp, text);
};

/** Quita el foco y el resaltado de hover, para que la captura no muestre un estado pasajero. */
const settle = async (cdp) => {
	await evaluate(cdp, `(() => { document.activeElement?.blur(); return true })()`);
	await wait(400);
};

const { cdp, chrome } = await openPublicPage({ base, path: "/public/citizen-portal", selector: ".cp-options", port });

try {
	await waitForSelector(cdp, ".cp-channels", { timeout: 30000 });
	await wait(1500);
	await screenshot(cdp, `${outputDir}/canales.png`, { selector: ".cp-channels", margin: 16 });

	await evaluate(cdp, `(() => { location.assign('/public/citizen-portal/schedules-routes'); return true })()`);
	await waitForSelector(cdp, ".cp-view__search", { timeout: 60000 });
	await wait(1500);
	await clickCenter(cdp, ".cp-view__search");
	await waitUntil(cdp, `!!document.querySelector('.cp-search__title')`, { what: "la ventana de búsqueda" });
	await wait(1500);

	await pickField(cdp, 0, company);
	await pickField(cdp, 1, municipality);
	await pickField(cdp, 2, commune);
	await settle(cdp);
	await screenshot(cdp, `${outputDir}/buscar-ruta-modal.png`, { selector: ".cp-search", margin: 0 });

	await clickCenter(cdp, ".cp-search__actions .cp-search__submit");
	await waitForSelector(cdp, ".cp-route-card", { timeout: 30000 });
	await waitUntil(cdp, `!document.querySelector('.v-snackbar--active')`, { timeout: 10000, what: "que se cierre el aviso de rutas obtenidas" });
	await wait(800);
	await clickCenter(cdp, ".cp-route-card", 1);
	await wait(300);
	await evaluate(cdp, `(() => { document.querySelector('.cp-search__list').scrollTop = 0; document.querySelector('.cp-search__body').scrollTop = 99999; return true })()`);
	await settle(cdp);
	await screenshot(cdp, `${outputDir}/buscar-ruta-resultados.png`, { selector: ".cp-search", margin: 0 });

	await clickCenter(cdp, ".cp-search__footer .cp-search__submit");
	await waitForSelector(cdp, ".cp-route-picker", { timeout: 30000 });
	await wait(2500);
	await evaluate(cdp, `(() => { window.scrollTo(0, 0); return true })()`);
	await settle(cdp);
	await screenshot(cdp, `${outputDir}/selector-ruta.png`);

	await clickCenter(cdp, ".cp-route-picker__map");
	await waitUntil(cdp, `document.querySelectorAll('.leaflet-overlay-pane path').length > 0`, { timeout: 30000, what: "las rutas en el mapa" });
	await wait(3000);
	await screenshot(cdp, `${outputDir}/mapa-todas.png`);

	await evaluate(cdp, `(() => { document.querySelectorAll('.leaflet-overlay-pane path')[0].dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 600, clientY: 400 })); return true })()`);
	await waitUntil(cdp, `!!document.querySelector('.cp-map__popup')`, { what: "la ventana de la ruta" });
	await wait(600);
	await screenshot(cdp, `${outputDir}/mapa-todas-ficha.png`);

	console.log(`Capturas en ${outputDir}`);
}
catch (error) {
	console.error(`Falló: ${error.message}`);
	await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
	console.error(await describeScreen(cdp).catch(() => ""));
	process.exitCode = 1;
}
finally {
	await closeBrowser(cdp, chrome);
}
