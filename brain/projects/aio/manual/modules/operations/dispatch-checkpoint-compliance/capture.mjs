/**
 * Captures, 1800 px wide so the list shows its Semáforo column, the "Cumplimiento Por Puntos De Control" tab of Dispatches: the day list and the point-by-point detail.
 *
 * Uso:
 *   node modules/operations/dispatch-checkpoint-compliance/capture.mjs --salida <carpeta>
 *        [--empresa "Empresa Demo"] [--fecha 2026-09-28] [--placa LSZ861]
 *
 * Apply ../dispatches-overview/seed.sql and the seed.sql next to this file first.
 */

import { credentialsFor } from "/home/fabian-ortega/.claude/brain/lib/credentials.mjs";
import { closeBrowser, evaluate, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, goTo, openSession, waitForNoSkeletons } from "../../../lib/session.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "Empresa Demo");
const date = arg("fecha", "2026-09-28");
const plate = arg("placa", "LSZ861");

/** Scale of the published captures of the Dispatches Dashboard pages. */
const SCALE = 1.4;

/**
 * Writes a JPEG of the given CSS-pixel rectangle at the published scale.
 *
 * @param {object} cdp - CDP connection.
 * @param {string} target - Output file.
 * @param {{x: number, y: number, width: number, height: number}} rect - Area in CSS pixels.
 */
async function captureJpeg(cdp, target, rect) {
	const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, clip: { ...rect, scale: SCALE } });
	writeFileSync(target, Buffer.from(data, "base64"));
}

/**
 * Area of the tab content, from the tabs bar to the bottom of the last card or table.
 *
 * @param {object} cdp - CDP connection.
 * @returns {Promise<{x: number, y: number, width: number, height: number}>} Rectangle in page CSS pixels.
 */
async function contentRect(cdp) {
	return evaluate(cdp, `(() => {
		window.scrollTo(0, 0);
		const card = document.querySelector('.v-window, .v-tabs')?.closest('.v-card') ?? document.querySelector('.v-tabs').parentElement;
		const r = card.getBoundingClientRect();
		return { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height };
	})()`);
}

mkdirSync(outputDir, { recursive: true });
const { email, password } = credentialsFor("aio");
const { cdp, chrome } = await openSession({ base, email, password, company, module: "Operacion", width: 1800, height: 1700 });

try {
	await goTo(cdp, base, "/operations/dispatches?tab=checkpointCompliance");
	await waitUntil(cdp, `!!document.querySelector('input') && [...document.querySelectorAll('input')].some(i => i._flatpickr)`, { timeout: 60000, what: "filtros" });
	await wait(2000);
	const dateSet = await evaluate(cdp, `(() => { const fp = [...document.querySelectorAll('input')].map(i => i._flatpickr).find(Boolean); if (!fp) return false; fp.setDate('${date}', true); return true; })()`);
	if (!dateSet) throw new Error("No se encontró el selector de Fecha Programada");

	await waitUntil(cdp, `document.body.innerText.includes('${plate}')`, { timeout: 60000, what: "despachos del día" });
	await wait(2500);
	await waitForNoSkeletons(cdp).catch(() => {});
	console.log("TARJETAS", JSON.stringify(await evaluate(cdp, `[...document.querySelectorAll('.metric-card')].map(c => c.innerText.replace(/\\s+/g, ' ').trim())`)));
	await captureJpeg(cdp, `${outputDir}/cumplimiento_listado.jpg`, await contentRect(cdp));

	const opened = await evaluate(cdp, `(() => {
		const row = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes('${plate}'));
		const button = row?.querySelector('button');
		if (!button) return null;
		button.click();
		return button.innerText.trim();
	})()`);
	if (!opened) throw new Error(`No se encontró el despacho del vehículo ${plate}.\n${await describeScreen(cdp)}`);

	await waitUntil(cdp, `document.body.innerText.includes('Hora esperada') || document.body.innerText.includes('HORA ESPERADA')`, { timeout: 30000, what: "detalle" });
	await wait(2000);
	console.log("DETALLE", JSON.stringify(await evaluate(cdp, `[...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\\s+/g, ' ').trim())`)));
	await captureJpeg(cdp, `${outputDir}/cumplimiento_detalle.jpg`, await contentRect(cdp));
	console.log(`Capturas en ${outputDir}`);
} catch (error) {
	await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
	throw error;
} finally {
	await closeBrowser(cdp, chrome);
}
