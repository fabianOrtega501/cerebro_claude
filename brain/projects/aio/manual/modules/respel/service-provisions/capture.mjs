/**
 * Captura de la edición de una Prestación de Servicios (Green > Prestación de Servicios > Editar).
 *
 * Uso:
 *   node modules/respel/service-provisions/capture.mjs --salida <carpeta>
 *        [--empresa "PROMOCALI"] [--prestacion 121354] [--cantidad 12.5]
 *
 * Solo lee: digita la cantidad recibida para mostrar sus decimales y cierra sin guardar.
 */

import { clickAt, closeBrowser, evaluate, insertText, screenshot, wait } from "../../../lib/browser.mjs";
import { rowActionButton, shotTopDialog } from "../../../lib/dialogs.mjs";
import { DEFAULT_BASE, describeScreen, goTo, openSession, testCredentials, waitForTableSettled } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "PROMOCALI");
const provisionId = arg("prestacion", "121354");
const quantity = arg("cantidad", "12.5");

/** Campo de cantidad recibida del diálogo de edición. */
const QUANTITY_INPUT = '.v-overlay--active input[type="number"]';

/**
 * Espera hasta que una expresión del navegador sea verdadera.
 *
 * @param {object} cdp - Sesión CDP
 * @param {string} expression - Expresión a evaluar
 * @param {string} what - Qué se espera, para el mensaje de error
 * @returns {Promise<void>} Lanza si no se cumple en 30 s
 */
async function waitFor(cdp, expression, what) {
	for (let i = 0; i < 60; i++) {
		if (await evaluate(cdp, expression)) return;
		await wait(500);
	}

	throw new Error(`No apareció ${what}.`);
}

/**
 * Abre la edición de la prestación, digita la cantidad y fotografía el diálogo.
 *
 * @returns {Promise<void>} Deja `edicion.png` en la carpeta de salida, o `_fallo.png` si falla
 */
async function run() {
	let cdp;
	let chrome;

	try {
		({ cdp, chrome } = await openSession({ base, ...testCredentials(), company }));
		await goTo(cdp, base, "/respel/service-provisions", { selector: "table" });
		await waitForTableSettled(cdp).catch(() => {});

		const button = await rowActionButton(cdp, provisionId, ".v-update");

		if (!button) throw new Error(`La prestación ${provisionId} no está en la primera página o no se puede editar.`);

		await clickAt(cdp, button.x, button.y);
		await waitFor(cdp, `!!document.querySelector('${QUANTITY_INPUT}')`, "el campo de cantidad recibida");
		await wait(1500);

		await evaluate(cdp, `(() => { const i = document.querySelector('${QUANTITY_INPUT}'); i.focus(); i.select(); })()`);
		await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
		await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });

		for (const character of quantity) {
			await insertText(cdp, character);
			await wait(150);
		}

		await wait(800);
		await shotTopDialog(cdp, `${outputDir}/edicion.png`);

		console.log("listo:", outputDir);
	} catch (error) {
		if (cdp) {
			await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
			console.error("pantalla:", await describeScreen(cdp).catch(() => "no disponible"));
		}

		console.error("Fallo:", error.message);
		process.exitCode = 1;
	} finally {
		if (cdp || chrome) await closeBrowser(cdp, chrome);
	}
}

run();
