/**
 * Capturas del maestro de Sistemas (Mantenimiento > Maestros > Sistemas), pestaña Sistemas.
 *
 * La vista monta varias pestañas (Sistemas, Definiciones de componentes, Actividades,
 * Componentes por tipo de vehículo, Componentes de vehículo); Sistemas es la activa al entrar.
 * Todas las capturas son del diálogo de formulario, no de la ventana completa: el manual las
 * publica recortadas al modal (~1010x321).
 *
 * Uso:
 *   node modules/maintenance/systems/capture.mjs --salida <carpeta>
 *        --empresa "Empresa Demo"
 *        [--base http://localhost:5173] [--email <usuario>] [--password <clave>]
 *
 * Necesita al menos un sistema registrado, porque Ver y Editar salen de una fila de la tabla:
 *   node lib/api.mjs count "maintenance-systems/v0/get-all"
 */

import { clickAt, evaluate, screenshot, wait, waitForSelector } from "../../../lib/browser.mjs";
import {
	DEFAULT_BASE,
	describeScreen,
	goTo,
	openSession,
	testCredentials,
	waitForNoSkeletons,
} from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "Empresa Demo");

/** La vista del maestro de Sistemas. */
const SYSTEMS_VIEW = "/maintenance/systems";

/** El diálogo es `position: fixed`: hay que esperar algo de adentro, no el contenedor. */
const DIALOG = ".v-dialog .v-card";

/**
 * Centro en pantalla del elemento, o `null` si no existe.
 *
 * @param {string} selector - Selector CSS
 * @param {number} [index] - Cuál de los elementos que cumplen el selector
 * @returns {Promise<{x: number, y: number}|null>} Coordenadas **de pantalla**, en píxeles
 */
const centerOf = (cdp, selector, index = 0) =>
	evaluate(
		cdp,
		`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

/**
 * Espera a que la tabla tenga filas de verdad.
 *
 * La tabla pinta una fila incluso vacía (la de "No data available"), así que esperar `tbody tr`
 * se cumple de inmediato. Lo que solo existe con datos es el botón de consulta de la fila.
 *
 * @returns {Promise<number>} Cuántas filas con datos hay
 * @throws Si no cargan datos dentro del tiempo esperado
 */
const waitForRows = async (cdp) => {
	const deadline = Date.now() + 60000;

	while (Date.now() < deadline) {
		const rows = await evaluate(cdp, `document.querySelectorAll('tbody tr .v-show').length`);
		if (rows > 0) return rows;
		await wait(500);
	}

	throw new Error(`La tabla de sistemas no cargó datos. Pantalla:\n${await describeScreen(cdp)}`);
};

/**
 * Abre un diálogo, espera a que el formulario termine de montar y lo captura recortado.
 *
 * @param {string} selector - Selector del botón que abre el diálogo
 * @param {string} name - Nombre del archivo, sin extensión
 * @returns {Promise<boolean>} `false` si el botón no existe; hay que comprobarlo
 */
const captureDialog = async (cdp, selector, name) => {
	const button = await centerOf(cdp, selector);
	if (!button) return false;

	await clickAt(cdp, button.x, button.y);
	await waitForSelector(cdp, DIALOG, { timeout: 60000 });
	await waitForNoSkeletons(cdp, { within: ".v-dialog" });

	// El select de tipo de objetivo pide sus opciones al abrir el diálogo.
	await wait(1500);
	await screenshot(cdp, `${outputDir}/${name}.png`, { selector: DIALOG });

	return true;
};

/**
 * Cierra el diálogo abierto y quita el foco del botón que lo abrió.
 *
 * Vuetify devuelve el foco al disparador, que queda con su anillo puesto: en la captura
 * siguiente se lee como si el botón estuviera activado.
 */
const closeDialog = async (cdp) => {
	const close = await centerOf(cdp, ".v-dialog .v-btn-close, .v-dialog .v-card .v-btn--icon");
	if (close) await clickAt(cdp, close.x, close.y);
	else await evaluate(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);

	await wait(1200);
	await evaluate(cdp, `document.activeElement?.blur()`);
	await wait(500);
};

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
	});

	try {
		await goTo(cdp, base, SYSTEMS_VIEW, { selector: ".v-data-table" });
		const rows = await waitForRows(cdp);
		await waitForNoSkeletons(cdp);

		console.log(`  tabla de sistemas con ${rows} fila(s)`);

		// Los botones de la barra conservan su id, que se arma con el texto traducido.
		const captures = [
			['[id^="Agregar"]', "agregar"],
			['[id^="Buscar"]', "buscar"],
			["tbody tr .v-show", "ver"],
			["tbody tr .v-update", "editar"],
		];

		for (const [selector, name] of captures) {
			const ok = await captureDialog(cdp, selector, name);
			console.log(`  ${name}: ${ok ? "capturado" : "AVISO: no se encontró el botón"}`);
			if (ok) await closeDialog(cdp);
		}

		console.log(`\nCapturas en ${outputDir}`);
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		throw error;
	}
	finally {
		// Nunca `chrome.process.kill()`: falla con EACCES en procesos confinados y pisa el
		// error real desde el `finally`.
		const { closeBrowser } = await import("../../../lib/browser.mjs");

		await closeBrowser(cdp, chrome);
	}
};

main().catch((error) => {
	console.error(`\nFalló: ${error.message}`);
	process.exit(1);
});
