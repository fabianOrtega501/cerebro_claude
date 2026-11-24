/**
 * Capturas de la nube del vehículo en Seguimiento GPS y de su ventana «Despachos (24 h)».
 *
 * Uso:
 *   node modules/avl/capture-dispatch-history.mjs --salida <carpeta> --empresa "PROMOAMBIENTAL DISTRITO"
 *        --vehiculo 1106 [--base http://localhost:5173] [--email <usuario>] [--password <clave>]
 *
 * Necesita un vehículo con despachos En operación o Cerrados de las últimas 24 horas en un centro
 * operativo del usuario, y el permiso-bandera `/avl/vehicle-dispatch-history` concedido a su rol.
 */

import { clearHighlights, closeBrowser, evaluate, highlight, screenshot, wait, waitUntil } from "../../lib/browser.mjs";
import { DEFAULT_BASE, openSession, testCredentials } from "../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", null);
const vehicleCode = arg("vehiculo", null);
const { email, password } = testCredentials({ email: arg("email"), password: arg("password") });

if (!vehicleCode) {
	console.error("Falta --vehiculo con el código interno del vehículo, por ejemplo --vehiculo 1106.");
	process.exit(1);
}

const POPUP = ".leaflet-popup.vehicle-popup";
const DISPATCHES_BUTTON = `${POPUP} .vehicle-popup-card__actions button:last-child`;

const { cdp, chrome } = await openSession({ base, email, password, company, module: "AVL" });

try {
	await cdp.send("Page.navigate", { url: `${base}/avl/vehicle-tracking` });
	await waitUntil(cdp, `document.querySelectorAll('.contenido-scroll .cursor-pointer').length > 0`, { timeout: 90000, what: "lista de vehículos" });
	await wait(3000);

	const opened = await evaluate(cdp, `(() => {
	  const head = [...document.querySelectorAll('.contenido-scroll .cursor-pointer')].find(e => e.innerText.startsWith('${vehicleCode} -'));
	  if (head) head.click();
	  return !!head;
	})()`);
	if (!opened)
		throw new Error(`El vehículo ${vehicleCode} no está en la lista de Seguimiento GPS.`);

	await waitUntil(cdp, `!!document.querySelector('${POPUP}')`, { timeout: 15000, what: "nube del vehículo" });
	await wait(1500);
	await highlight(cdp, DISPATCHES_BUTTON, { label: "1", padding: 4 });
	await screenshot(cdp, `${outputDir}/vehiculo_nube.png`, { selector: POPUP, margin: 20 });
	await clearHighlights(cdp);

	await evaluate(cdp, `document.querySelector('${DISPATCHES_BUTTON}').click()`);
	await waitUntil(cdp, `!!document.querySelector('.v-overlay--active .dispatch-timeline__head')`, { timeout: 30000, what: "ventana de despachos" });
	await wait(2500);
	await screenshot(cdp, `${outputDir}/despachos_24h.png`, { selector: ".v-overlay--active .v-card", margin: 10 });

	console.log(`Capturas en ${outputDir}: vehiculo_nube.png, despachos_24h.png`);
} catch (error) {
	await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
	console.error(`Falló: ${error.message}`);
	process.exitCode = 1;
} finally {
	await closeBrowser(cdp, chrome);
}
