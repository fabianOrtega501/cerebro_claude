/**
 * Capturas de Reportes > Generar con el reporte PDF «Despachos y descargues por vehículo».
 *
 * Uso:
 *   node modules/reports/generate/capture.mjs --salida <carpeta> [--empresa "Istmo Green"] [--modulo Operaciones]
 *     [--inicio 2026-08-01] [--fin 2026-08-03] [--vacio-inicio 2026-01-01] [--vacio-fin 2026-01-05] [--generar]
 */

import { clearHighlights, closeBrowser, evaluate, highlight, screenshot, wait, waitForRequestsIdle, waitForSelector } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, closeSelectMenu, describeScreen, goTo, openSelect, openSession, selectOption, testCredentials } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const port = Number(arg("puerto", 9222));
const company = arg("empresa", "Istmo Green");
const reportName = arg("reporte", "Despachos y descargues por vehículo");

const field = (name) => `[id*="${name}"]`;
const row = (name) => `tr:has(${field(name)})`;

/** Espera a que terminen las peticiones y a que la vista se repinte. */
const settle = async () => {
	await waitForRequestsIdle(cdp, { timeout: 20000 }).catch(() => null);
	await wait(1200);
};

/** Fija la fecha de un filtro por su flatpickr y devuelve el valor que quedó. */
const setDate = (name, value) => evaluate(cdp, `(() => { const el = document.querySelector(${JSON.stringify(field(name))});
  const fp = el?._flatpickr || el?.closest('.v-input')?.querySelector('input')?._flatpickr;
  if (!fp) return null; fp.setDate(${JSON.stringify(value)}, true); return fp.input.value; })()`);

/** Abre el calendario del filtro de fecha. */
const openCalendar = (name) => evaluate(cdp, `(() => { const el = document.querySelector(${JSON.stringify(field(name))});
  const fp = el?._flatpickr || el?.closest('.v-input')?.querySelector('input')?._flatpickr;
  if (!fp) return false; fp.open(); return true; })()`);

/** Texto que muestra el campo de una lista: el valor elegido o su placeholder. */
const listText = (name) => evaluate(cdp, `(() => { const i = document.querySelector(${JSON.stringify(field(name))});
  const box = i?.closest('.v-input'); return (box?.innerText?.trim() || i?.placeholder || '').replace(/\\s+/g, ' '); })()`);

const { email, password } = testCredentials();
const { cdp, chrome } = await openSession({ base, email, password, company, module: arg("modulo", "Operaciones"), port });

try {
	await goTo(cdp, base, "/reports/generate");
	await waitForSelector(cdp, '[id^="app-autocomplete-"]', { timeout: 60000 });
	const reportInput = await evaluate(cdp, `document.querySelector('[id^="app-autocomplete-"]').id`);
	await openSelect(cdp, `[id="${reportInput}"]`);
	await selectOption(cdp, reportName);
	await settle();
	await waitForSelector(cdp, field("vehicle_ids"), { timeout: 30000 });

	console.log("vehículos sin filtros:", await listText("vehicle_ids"));
	await highlight(cdp, row("vehicle_ids"), { padding: 4 });
	await screenshot(cdp, `${outputDir}/filtros.png`);
	await clearHighlights(cdp);

	await openSelect(cdp, field("company_id"));
	await selectOption(cdp, company);
	await closeSelectMenu(cdp).catch(() => null);
	await settle();

	console.log("fecha inicial:", await setDate("start_date", arg("inicio", "2026-08-01")));
	await settle();
	await openCalendar("final_date");
	await wait(800);
	await screenshot(cdp, `${outputDir}/calendario.png`);
	await evaluate(cdp, `document.querySelectorAll('.flatpickr-calendar.open').forEach(c => c.classList.remove('open'))`);

	console.log("fecha final:", await setDate("final_date", arg("fin", "2026-08-03")));
	await settle();
	console.log("vehículos con periodo:", await listText("vehicle_ids"));
	await openSelect(cdp, field("vehicle_ids"));
	await wait(600);
	await screenshot(cdp, `${outputDir}/vehiculos.png`);
	await closeSelectMenu(cdp).catch(() => null);
	await evaluate(cdp, `document.activeElement?.blur()`);

	if (args.includes("--generar")) {
		await evaluate(cdp, `[...document.querySelectorAll('button')].find(b => b.innerText.trim().startsWith('Generar'))?.click()`);
		await wait(1500);
		await screenshot(cdp, `${outputDir}/programado.png`);
		await wait(4000);
		await openSelect(cdp, field("company_id"));
		await selectOption(cdp, company);
		await closeSelectMenu(cdp).catch(() => null);
		await settle();
	}

	await evaluate(cdp, `(() => { const el = document.querySelector(${JSON.stringify(field("final_date"))});
    (el?._flatpickr || el?.closest('.v-input')?.querySelector('input')?._flatpickr)?.clear(); })()`);
	await settle();
	await setDate("start_date", arg("vacio-inicio", "2026-01-01"));
	await settle();
	await setDate("final_date", arg("vacio-fin", "2026-01-05"));
	await settle();
	console.log("vehículos en periodo vacío:", await listText("vehicle_ids"));
	await evaluate(cdp, `document.activeElement?.blur()`);
	await highlight(cdp, row("vehicle_ids"), { padding: 4 });
	await screenshot(cdp, `${outputDir}/sin-vehiculos.png`);
	await clearHighlights(cdp);
	await evaluate(cdp, `[...document.querySelectorAll('button')].find(b => b.innerText.trim().startsWith('Generar'))?.click()`);
	await wait(1200);
	await screenshot(cdp, `${outputDir}/aviso-sin-vehiculos.png`);
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
