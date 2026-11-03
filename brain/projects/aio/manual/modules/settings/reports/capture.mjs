/**
 * Capturas de Maestros > Reportes con un reporte PDF: formulario, filtros y filtro de lista múltiple. No guarda nada.
 *
 * Uso:
 *   node modules/settings/reports/capture.mjs --salida <carpeta> [--empresa "Istmo Green"] [--reporte "Despachos y descargues"] [--filtro "Vehículos"]
 */

import { clickAt, closeBrowser, evaluate, highlight, clearHighlights, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, goTo, openSession, testCredentials, waitForTableSettled } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const port = Number(arg("puerto", 9222));
const reportName = arg("reporte", "Despachos y descargues");
const filterName = arg("filtro", "Vehículos");
const dialog = ".v-overlay--active .v-overlay__content";

/** Clic real en el botón `buttonClass` de la fila que contiene `text`, dentro de `scope`. */
async function clickRowButton(scope, text, buttonClass) {
	const point = await evaluate(cdp, `(() => { const rows = [...document.querySelectorAll(${JSON.stringify(`${scope} tbody tr`)})];
    const row = rows.find(r => r.innerText.includes(${JSON.stringify(text)}));
    const btn = row && row.querySelector(${JSON.stringify(`.${buttonClass}`)});
    if (!btn) return null; btn.scrollIntoView({ block: 'center' });
    const r = btn.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!point) throw new Error(`No está el botón ${buttonClass} en la fila «${text}»`);
	await clickAt(cdp, point.x, point.y);
}

/** Clic real en el paso del asistente cuyo título contiene `text`. */
async function clickStep(text) {
	const point = await evaluate(cdp, `(() => { const el = [...document.querySelectorAll(${JSON.stringify(`${dialog} *`)})]
      .filter(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(text)} && e.offsetParent).pop();
    if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!point) throw new Error(`No está el paso «${text}»`);
	await clickAt(cdp, point.x, point.y);
}

const { email, password } = testCredentials();
const { cdp, chrome } = await openSession({ base, email, password, company: arg("empresa", "Istmo Green"), module: arg("modulo", "Operaciones"), port, height: 1000 });

try {
	await goTo(cdp, base, "/settings/reports", { text: "Agregar" });
	await waitForTableSettled(cdp).catch(() => {});

	await clickRowButton("", reportName, "v-update");
	await waitUntil(cdp, `[...document.querySelectorAll('${dialog} label')].some(l => l.textContent.includes('Formato PDF'))`, { what: "el formulario del reporte PDF" });
	await wait(1200);
	await evaluate(cdp, `document.activeElement?.blur()`);
	await highlight(cdp, `${dialog} .v-col:has(label[for*="pdf"]), ${dialog} .v-col:has(input[id*="pdf"])`, { padding: 4 }).catch(() => null);
	await screenshot(cdp, `${outputDir}/reporte-pdf.png`, { selector: dialog, margin: 0 });
	await clearHighlights(cdp);

	await clickStep("Filtros de Reporte");
	await waitUntil(cdp, `[...document.querySelectorAll('${dialog} tbody tr')].some(r => r.innerText.includes(${JSON.stringify(filterName)}))`, { what: "la tabla de filtros" });
	await wait(1000);
	await screenshot(cdp, `${outputDir}/filtros-reporte.png`, { selector: dialog, margin: 0 });

	await clickRowButton(dialog, filterName, "v-update");
	await waitUntil(cdp, `document.querySelectorAll('.v-overlay--active').length > 1 && [...document.querySelectorAll('.v-overlay--active label')].some(l => /Tipo Filtro/i.test(l.textContent))`, { what: "el formulario del filtro" });
	await wait(1200);
	await evaluate(cdp, `document.activeElement?.blur()`);
	await screenshot(cdp, `${outputDir}/filtro-lista-multiple.png`, { selector: `.v-overlay--active:last-of-type .v-overlay__content`, margin: 0 });
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
