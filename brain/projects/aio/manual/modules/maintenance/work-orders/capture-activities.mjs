/**
 * Captures of the work order activities (Mantenimiento > Órdenes de trabajo): the observation button
 * of each technician, its editable and read-only dialogs, the finish dialog and the massive processing
 * with its filters. Read only: it never saves, finishes or processes anything.
 *
 * Usage:
 *   node modules/maintenance/work-orders/capture-activities.mjs --salida <carpeta>
 *        [--empresa "Empresa Demo"] [--orden 5]
 *
 * Apply the scenario first, from aio-app:
 *   node ~/.claude/skills/update-manual/lib/seed.mjs <perfil>/modules/maintenance/work-orders/seed-activities.sql
 */

import { clickAt, closeBrowser, evaluate, screenshot, wait, waitForRequestsIdle, waitUntil } from "../../../lib/browser.mjs";
import { clickChecked, dialogCount, waitForDialogAbove } from "../../../lib/dialogs.mjs";
import { DEFAULT_BASE, describeScreen, goTo, openSession, testCredentials, waitForTableSettled } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "Empresa Demo");
const orderNumber = arg("orden", "5");
const moduleName = arg("modulo", "Mantenimien");

const OWN_ACTIVITY = "Diagnóstico de bomba de agua";
const OTHERS_ACTIVITY = "Instalación de bomba de agua";
const OTHERS_STAFF = "ACOSTA";
const DRAFT = "Se encontró desgaste en el sello mecánico; se recomienda cambiarlo.";

const TOP_CARD = `(() => { const d = [...document.querySelectorAll('.v-dialog .v-card')]; return d[d.length - 1]; })()`;

/** Marks the element returned by `expr` with `data-cap` and scrolls it into view; false if missing. */
const mark = (cdp, expr, tag) =>
	evaluate(cdp, `(() => { document.querySelectorAll('[data-cap="${tag}"]').forEach(e => e.removeAttribute('data-cap'));
    const e = ${expr}; if (!e) return false; e.setAttribute('data-cap', ${JSON.stringify(tag)}); e.scrollIntoView({ block: 'center' }); return true; })()`);

const settle = async (cdp) => {
	await wait(700);
	await waitForRequestsIdle(cdp, { timeout: 30000 }).catch(() => {});
	await wait(500);
};

/** Activity card of the panel (outside any dialog) whose title is `name`. */
const panelCard = (name) =>
	`[...document.querySelectorAll('.v-list-item')].find(li => !li.closest('.v-dialog') && li.querySelector('.v-list-item') && li.innerText.split('\\n').some(l => l.trim() === ${JSON.stringify(name)}))`;

/** Observation button of the technician row that contains `staff`, inside the card `card`. */
const observationButton = (card, staff) =>
	`(() => { const c = ${card}; if (!c) return null; const row = [...c.querySelectorAll('.v-list-item')].find(li => li.innerText.includes(${JSON.stringify(staff)}));
    return row && [...row.querySelectorAll('.v-btn')].find(b => b.querySelector('[class*="tabler-message"], .tabler-eye')); })()`;

const openDialog = async (cdp, expr, what) => {
	const before = await dialogCount(cdp);
	if (!await mark(cdp, expr, "open"))
		throw new Error(`No se encontró ${what}.\nPantalla:\n${await describeScreen(cdp)}`);
	await wait(500);
	await clickChecked(cdp, '[data-cap="open"]', { what });
	await waitForDialogAbove(cdp, before, { timeout: 30000 });
	await wait(900);
};

const closeTopDialog = async (cdp) => {
	await mark(cdp, `[...${TOP_CARD}.querySelectorAll('.v-btn')].find(b => /^cerrar$/i.test(b.textContent.trim()))`, "close");
	await clickChecked(cdp, '[data-cap="close"]', { what: "Cerrar" });
	await wait(700);
	await evaluate(cdp, `document.activeElement?.blur()`);
};

const shotTopDialog = async (cdp, file) => {
	await mark(cdp, TOP_CARD, "dialog");
	await screenshot(cdp, `${outputDir}/${file}`, { selector: '[data-cap="dialog"]' });
	console.log(`  ${file}`);
};

const main = async () => {
	const { cdp, chrome } = await openSession({ base, ...testCredentials({ email: arg("email"), password: arg("password") }), company, module: moduleName });

	try {
		await goTo(cdp, base, "/maintenance/work-orders", { selector: ".v-data-table" });
		await waitForTableSettled(cdp).catch(() => {});

		const opened = await mark(cdp, `[...document.querySelectorAll('tbody tr')]
      .filter(tr => [...tr.querySelectorAll('td')].some(td => td.textContent.trim() === ${JSON.stringify(orderNumber)}))
      .map(tr => [...tr.querySelectorAll('.v-update')].find(b => b.getBoundingClientRect().width > 0)).find(Boolean)`, "edit");
		if (!opened)
			throw new Error(`No se encontró la orden ${orderNumber} editable en la primera página.`);
		await clickChecked(cdp, '[data-cap="edit"]', { what: `editar la orden ${orderNumber}` });
		await waitUntil(cdp, `[...document.querySelectorAll('.v-btn')].some(b => /^procesar$/i.test(b.textContent.trim()))`, { timeout: 60000, what: "detalle de la orden" });
		await settle(cdp);

		if (!await mark(cdp, panelCard(OWN_ACTIVITY), "card"))
			throw new Error(`No está la actividad "${OWN_ACTIVITY}": aplique seed-activities.sql.`);
		await evaluate(cdp, `document.querySelector('[data-cap="card"]').scrollIntoView({ block: 'center' })`);
		await wait(600);
		const clip = await evaluate(cdp, `(() => { const r = document.querySelector('[data-cap="card"]').getBoundingClientRect();
      return { x: Math.max(0, r.x + window.scrollX - 10), y: Math.max(0, r.y + window.scrollY - 10), width: r.width + 20, height: r.height + 20, scale: 1 }; })()`);
		await screenshot(cdp, `${outputDir}/observacion-botones.png`, { clip });
		console.log("  observacion-botones.png");

		await openDialog(cdp, observationButton(panelCard(OWN_ACTIVITY), "ROJAS"), "la observación propia");
		await mark(cdp, `${TOP_CARD}.querySelector('textarea')`, "draft");
		await clickChecked(cdp, '[data-cap="draft"]', { what: "campo de observación" });
		await cdp.send("Input.insertText", { text: DRAFT });
		await wait(400);
		await shotTopDialog(cdp, "observacion-editable.png");
		await closeTopDialog(cdp);

		await openDialog(cdp, observationButton(panelCard(OTHERS_ACTIVITY), OTHERS_STAFF), "la observación de otro técnico");
		await shotTopDialog(cdp, "observacion-consulta.png");
		await closeTopDialog(cdp);

		await openDialog(cdp, `(() => { const c = ${panelCard(OWN_ACTIVITY)}; return c && [...c.querySelectorAll('.v-btn')].find(b => b.querySelector('.tabler-checkbox')); })()`, "Finalizar actividad");
		await shotTopDialog(cdp, "finalizar-actividad.png");
		await closeTopDialog(cdp);

		await openDialog(cdp, `[...document.querySelectorAll('.v-btn')].find(b => /^procesar$/i.test(b.textContent.trim()))`, "Procesar");
		await waitUntil(cdp, `${TOP_CARD}.innerText.includes('Mostrando')`, { timeout: 30000, what: "conteo del masivo" });
		await settle(cdp);
		await shotTopDialog(cdp, "procesar-masivo.png");
	}
	catch (error) {
		console.error(`Falló: ${error.message}`);
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		process.exitCode = 1;
	}
	finally {
		await closeBrowser(cdp, chrome);
	}
};

main();
