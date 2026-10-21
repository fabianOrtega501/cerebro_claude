/**
 * Captures the General level of the Dispatches Dashboard: the full view and the
 * "Rutas del plan operativo" section with its two rows of KPI cards.
 *
 * Uso:
 *   node modules/operations/dispatches-overview/capture.mjs --salida <carpeta>
 *        [--empresa "Empresa Demo"] [--fecha 2026-09-28]
 *
 * The day comes from `seed.sql` next to this file; apply it first.
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

/** Scale of the published captures of this page (about 1.4 CSS px per image px). */
const SCALE = 1.4;

/**
 * Writes a JPEG of the given CSS-pixel rectangle at the published scale.
 *
 * @param {object} cdp - CDP connection.
 * @param {string} target - Output file.
 * @param {{x: number, y: number, width: number, height: number}} rect - Area in CSS pixels.
 * @returns {Promise<void>}
 */
async function captureJpeg(cdp, target, rect) {
	const { data } = await cdp.send("Page.captureScreenshot", {
		format: "jpeg",
		quality: 92,
		clip: { ...rect, scale: SCALE },
	});
	writeFileSync(target, Buffer.from(data, "base64"));
}

mkdirSync(outputDir, { recursive: true });
const { email, password } = credentialsFor("aio");
const { cdp, chrome } = await openSession({ base, email, password, company, module: "Operacion" });

try {
	await goTo(cdp, base, "/operations/dispatches?tab=dashboard");
	await waitUntil(cdp, `document.querySelectorAll('.metric-card').length >= 8`, { timeout: 60000, what: "tarjetas del tablero" });

	const dateSet = await evaluate(cdp, `(() => {
		const fp = [...document.querySelectorAll('input')].map(i => i._flatpickr).find(Boolean);
		if (!fp) return false;
		fp.setDate('${date}', true);
		return true;
	})()`);
	if (!dateSet) throw new Error("No se encontró el selector de Fecha Programada");

	await waitUntil(cdp, `document.body.innerText.includes('${date.split("-").reverse().join("/")}')`, { timeout: 30000, what: "la fecha en el subtítulo" });
	await wait(2500);
	await waitForNoSkeletons(cdp).catch(() => {});

	const cards = await evaluate(cdp, `[...document.querySelectorAll('.metric-card')].map(c => c.innerText.replace(/\\s+/g, ' ').trim())`);
	console.log(JSON.stringify(cards));

	const section = await evaluate(cdp, `(() => {
		const title = [...document.querySelectorAll('h5')].find(h => h.textContent.trim() === 'Rutas del plan operativo');
		const metricCards = [...document.querySelectorAll('.metric-card')].slice(0, 8);
		if (!title || metricCards.length < 8) return null;
		window.scrollTo(0, 0);
		const top = title.getBoundingClientRect().top - 12;
		const left = title.getBoundingClientRect().left - 14;
		const bottom = Math.max(...metricCards.map(c => c.getBoundingClientRect().bottom)) + 12;
		const right = Math.max(...metricCards.map(c => c.getBoundingClientRect().right)) + 14;
		return { x: left, y: top + window.scrollY, width: right - left, height: bottom - top };
	})()`);
	if (!section) throw new Error(`No se encontró la sección de tarjetas.\n${await describeScreen(cdp)}`);

	await captureJpeg(cdp, `${outputDir}/dashboard_rutas_plan.jpg`, section);

	const viewport = await evaluate(cdp, `({ width: window.innerWidth, height: window.innerHeight })`);
	await captureJpeg(cdp, `${outputDir}/dashboard_general.jpg`, { x: 0, y: 0, width: viewport.width, height: viewport.height });
	console.log(`Capturas en ${outputDir}`);
} catch (error) {
	await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
	throw error;
} finally {
	await closeBrowser(cdp, chrome);
}
