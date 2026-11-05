/**
 * Captura el campo Secuencia en la frecuencia de una solicitud de servicio y la columna Secuencia
 * en el paso «Solicitudes de Servicio» de una programación.
 *
 * Uso:
 *   node modules/respel/programmings/capture-sequence.mjs --salida <carpeta>
 *        [--base http://localhost:5173] [--empresa "PROMOCALI S.A.S. E.S.P"]
 *        [--solicitud 13073] [--programacion 2180] [--secuencia 5]
 *
 * No guarda nada: escribe la secuencia en el modal de frecuencia y lo cierra; abre la edición de
 * la programación y la cierra sin guardar. La programación debe tener solicitudes con secuencia.
 */

import { closeBrowser, evaluate, highlight, clearHighlights, screenshot, wait } from "../../../lib/browser.mjs";
import { DIALOG } from "../../../lib/dialogs.mjs";
import { DEFAULT_BASE, goTo, openSession, testCredentials, type } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "PROMOCALI S.A.S. E.S.P");
const serviceRequest = arg("solicitud", "13073");
const programNumber = arg("programacion", "2180");
const sequence = arg("secuencia", "5");
const SEQUENCE_FIELD = 'input[placeholder="Ingrese Secuencia"]';

/** Espera hasta que la expresión sea verdadera; lanza con `what` si se agota. */
async function waitFor(cdp, expression, what, timeout = 30000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await evaluate(cdp, expression)) return;
		await wait(400);
	}
	throw new Error(`Timeout esperando ${what}`);
}

/** Captura el modal de frecuencia con la secuencia escrita y señalada. */
async function captureFrequency(cdp) {
	await goTo(cdp, base, "/respel/service-requests");
	await waitFor(cdp, `!!document.querySelector('[title="Frecuencia del Servicio - ${serviceRequest}"]')`, "el botón de frecuencia de la solicitud");
	await evaluate(cdp, `document.querySelector('[title="Frecuencia del Servicio - ${serviceRequest}"]').click()`);
	await waitFor(cdp, `!!document.querySelector('${SEQUENCE_FIELD}')`, "el campo Secuencia del modal");
	await wait(1500);

	await type(cdp, SEQUENCE_FIELD, sequence);
	await evaluate(cdp, `document.activeElement?.blur()`);
	await evaluate(cdp, `document.querySelector('${SEQUENCE_FIELD}').closest('.v-col, [class*="v-col-"]').setAttribute('data-captura', 'frecuencia-secuencia')`);
	await highlight(cdp, '[data-captura="frecuencia-secuencia"]', { label: "1", padding: 4 });
	await screenshot(cdp, `${outputDir}/frecuencia-secuencia.png`, { selector: DIALOG });
	await clearHighlights(cdp);
}

/** Captura el paso de solicitudes de la programación con la columna Secuencia señalada. */
async function captureProgramming(cdp) {
	await goTo(cdp, base, "/respel/programmings");
	await waitFor(cdp, `[...document.querySelectorAll('tbody td')].some(td => td.innerText.trim() === '${programNumber}')`, `la programación ${programNumber}`);
	await evaluate(cdp, `(() => {
		const tr = [...document.querySelectorAll('tbody tr')].find(tr => [...tr.querySelectorAll('td')].some(td => td.innerText.trim() === '${programNumber}'));
		tr.querySelector('.tabler-edit').closest('button').click();
	})()`);
	await waitFor(cdp, `[...document.querySelectorAll('.v-dialog button[type=submit]')].some(b => b.offsetParent)`, "el asistente de la programación");
	await wait(2500);
	await evaluate(cdp, `[...document.querySelectorAll('.v-dialog button[type=submit]')].filter(b => b.offsetParent).pop().click()`);
	await waitFor(cdp, `[...document.querySelectorAll('.v-dialog thead th')].some(t => t.innerText.trim().toUpperCase() === 'SECUENCIA') && !!document.querySelector('.v-dialog tbody input[type=number]')`, "la tabla de solicitudes con la columna Secuencia", 45000);
	await wait(2000);

	await evaluate(cdp, `(() => {
		const th = [...document.querySelectorAll('.v-dialog thead th')].find(t => t.innerText.trim().toUpperCase() === 'SECUENCIA');
		th.setAttribute('data-captura', 'secuencia');
		th.scrollIntoView({ block: 'center' });
	})()`);
	await wait(600);
	await highlight(cdp, '[data-captura="secuencia"]', { label: "1", padding: 4 });
	await screenshot(cdp, `${outputDir}/programacion-secuencia.png`, { selector: DIALOG });
	await clearHighlights(cdp);
}

const { email, password } = testCredentials();
const { cdp, chrome } = await openSession({ base, email, password, company, module: "Green", port: 9445 });

try {
	await captureFrequency(cdp);
	await captureProgramming(cdp);
	console.log(`Capturas en ${outputDir}`);
} catch (error) {
	await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
	console.error(`Falló: ${error.message}`);
	process.exitCode = 1;
} finally {
	await closeBrowser(cdp, chrome);
}
