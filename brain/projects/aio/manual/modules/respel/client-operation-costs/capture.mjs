/**
 * Capturas del maestro Costos de Operación (Green > Comercial) y de su opción en la ficha del cliente.
 *
 * Uso:
 *   node --experimental-websocket modules/respel/client-operation-costs/capture.mjs --salida <carpeta>
 *        [--empresa "PROMOCALI"] [--cliente "COSMITET LTDA"]
 *
 * No guarda nada: abre formularios y avisos, los fotografía y los cierra con Cerrar. El escenario
 * lo deja `seed.sql`, que hay que aplicar antes: cuatro vigencias del cliente, una por estado.
 */

import { clearHighlights, closeBrowser, evaluate, highlight, screenshot, wait, waitForSelector } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, goTo, openSession, searchFetcherSelect, testCredentials, type } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "PROMOCALI");
const clientName = arg("cliente", "COSMITET LTDA");

const DIALOG_CARD = ".v-overlay--active .v-card";

const clickButton = (cdp, text, scope = "") =>
	evaluate(cdp, `(() => { const b = [...document.querySelectorAll('${scope} button')].reverse().find(b => b.innerText.trim() === ${JSON.stringify(text)} && b.offsetParent !== null); if (!b) return false; b.click(); return true; })()`);

const clearToasts = (cdp) => evaluate(cdp, `document.querySelectorAll('.Toastify__toast').forEach(t => t.remove())`);

/** Espera a que la tabla tenga filas con acciones: la fila vacía también es un `tr`. */
async function waitForRows(cdp, timeout = 40000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await evaluate(cdp, `document.querySelectorAll('.v-data-table tbody tr .tabler-eye').length`) > 0) return;
		await wait(1000);
	}
	throw new Error(`La tabla no cargó filas.\n${await describeScreen(cdp)}`);
}

/** Espera a que abra un diálogo con su contenido montado. */
async function waitForDialog(cdp) {
	await waitForSelector(cdp, DIALOG_CARD, { timeout: 20000 });
	await wait(2500);
}

/** Hace clic en el ícono visible de la fila cuyo texto contiene `text`. Lanza si no está. */
async function clickRowIcon(cdp, text, icon) {
	const ok = await evaluate(cdp, `(() => {
    const row = [...document.querySelectorAll('.v-data-table tbody tr')].find(r => r.innerText.includes(${JSON.stringify(text)}));
    const button = row && [...row.querySelectorAll('.${icon}')].map(i => i.closest('button')).find(b => b && b.getBoundingClientRect().width > 0);
    if (!button) return false; button.click(); return true; })()`);
	if (!ok) throw new Error(`No se encontró ${icon} en la fila "${text}"`);
}

/** Elige en el buscador de clientes del diálogo abierto la opción con el nombre exacto. */
async function pickClient(cdp, name) {
	await searchFetcherSelect(cdp, '.v-overlay--active input[name="client_data"]', name);
	await wait(800);
	const picked = await evaluate(cdp, `(() => { const o = [...document.querySelectorAll('.v-overlay--active .v-list-item')].find(e => e.textContent.trim() === ${JSON.stringify(name)}); if (!o) return false; o.click(); return true; })()`);
	if (!picked) throw new Error(`El buscador no ofreció "${name}"`);
	await wait(800);
}

const { cdp, chrome } = await openSession({ base, ...testCredentials(), company, module: "Green" });

try {
	await goTo(cdp, base, "/respel/client-operation-costs");
	await waitForRows(cdp);

	// 1. Listado, acotado al cliente del escenario con el buscador.
	await clickButton(cdp, "Buscar");
	await waitForDialog(cdp);
	await pickClient(cdp, clientName);
	await clickButton(cdp, "Buscar", ".v-overlay--active");
	await wait(3500);
	await waitForRows(cdp);
	await clearToasts(cdp);
	await evaluate(cdp, "document.activeElement?.blur()");
	await screenshot(cdp, `${outputDir}/1.png`);

	// 1b. La tabla desborda: la columna Estado solo se ve desplazando el contenedor a la derecha.
	await evaluate(cdp, `document.querySelectorAll('.v-table__wrapper').forEach(w => { w.scrollLeft = w.scrollWidth; })`);
	await wait(800);
	await highlight(cdp, ".v-data-table thead th:last-child", { padding: 4 });
	await screenshot(cdp, `${outputDir}/estados.png`);
	await clearHighlights(cdp);
	await evaluate(cdp, `document.querySelectorAll('.v-table__wrapper').forEach(w => { w.scrollLeft = 0; })`);
	await wait(500);

	// 2. Formulario de Agregar.
	await clickButton(cdp, "Agregar");
	await waitForDialog(cdp);
	await screenshot(cdp, `${outputDir}/2.png`);
	await clickButton(cdp, "Cerrar", ".v-overlay--active");
	await wait(1500);

	// 3. Formulario de Buscar, con el campo Estado.
	await clickButton(cdp, "Buscar");
	await waitForDialog(cdp);
	await highlight(cdp, '.v-overlay--active [id^="app-autocomplete-status-"]', { padding: 8 });
	await screenshot(cdp, `${outputDir}/3.png`);
	await clearHighlights(cdp);
	await clickButton(cdp, "Cerrar", ".v-overlay--active");
	await wait(1500);

	// 4. Exportar.
	await clickButton(cdp, "Exportar");
	await waitForDialog(cdp);
	await screenshot(cdp, `${outputDir}/4.png`);
	await clickButton(cdp, "Cerrar", ".v-overlay--active");
	await wait(1500);

	// 5. Columna de acciones de la vigencia vigente.
	await evaluate(cdp, "document.activeElement?.blur()");
	await highlight(cdp, ".v-data-table tbody tr:nth-child(2) td:first-child", { padding: 4 });
	await screenshot(cdp, `${outputDir}/5.png`);
	await clearHighlights(cdp);

	// 6. Ver.
	await clickRowIcon(cdp, "2026-01-01", "tabler-eye");
	await waitForDialog(cdp);
	await screenshot(cdp, `${outputDir}/6.png`);
	await clickButton(cdp, "Cerrar", ".v-overlay--active");
	await wait(1500);

	// 7. Editar, y 8. el aviso de rentabilidad al cambiar el costo. Se cierra sin guardar.
	await clickRowIcon(cdp, "2026-01-01", "tabler-edit");
	await waitForDialog(cdp);
	await screenshot(cdp, `${outputDir}/7.png`);
	await type(cdp, '.v-overlay--active [id^="app-text-field-cost_amount-"]', "41000000");
	await wait(500);
	await clickButton(cdp, "Editar", ".v-overlay--active");
	await wait(4000);
	const warning = await evaluate(cdp, `[...document.querySelectorAll('.v-overlay--active .v-card')].some(c => c.innerText.includes('prestaciones de servicio ejecutadas'))`);
	if (!warning) throw new Error("No apareció el aviso de rentabilidad: ¿el cliente tiene prestaciones en el rango?");
	await screenshot(cdp, `${outputDir}/8.png`);
	await clickButton(cdp, "Cerrar", ".v-overlay--active");
	await wait(2000);
	await clearToasts(cdp);
	await clickButton(cdp, "Cerrar", ".v-overlay--active");
	await wait(1500);

	// 9. Confirmación de anular, sobre la programada. Se cierra sin confirmar.
	await clickRowIcon(cdp, "2027-01-01", "tabler-trash");
	await wait(1500);
	await screenshot(cdp, `${outputDir}/9.png`);
	await clickButton(cdp, "Cerrar", ".v-overlay--active");
	await wait(1500);

	// 10. Aviso de cruce: una vigencia que choca con la vigente. El backend la rechaza.
	await clickButton(cdp, "Agregar");
	await waitForDialog(cdp);
	await pickClient(cdp, clientName);
	await evaluate(cdp, `(() => { const i = [...document.querySelectorAll('.v-overlay--active input')].filter(i => i._flatpickr); i[0]._flatpickr.setDate('2026-06-01', true); i[1]._flatpickr.setDate('2026-12-31', true); })()`);
	await evaluate(cdp, `(() => { const f = document.querySelector('.v-overlay--active [id^="app-autocomplete-business_line_id-"]'); return !!f; })()`);
	const { pickOptionByName } = await import("../../../lib/session.mjs");
	await pickOptionByName(cdp, '.v-overlay--active [id^="app-autocomplete-business_line_id-"]', "Ruta Hospitalaria");
	await type(cdp, '.v-overlay--active [id^="app-text-field-cost_amount-"]', "20000000");
	await clickButton(cdp, "Guardar", ".v-overlay--active");
	await wait(2500);
	await screenshot(cdp, `${outputDir}/10.png`);
	await clickButton(cdp, "Cerrar", ".v-overlay--active");
	await wait(1500);
	await clearToasts(cdp);

	// Ficha del cliente: la opción del menú de acciones y el historial filtrado.
	await goTo(cdp, base, "/respel/clients");
	await wait(6000);
	await clickButton(cdp, "Buscar");
	await waitForDialog(cdp);
	// El buscador de clientes abre en skeletons: hay que esperar el campo, no el diálogo.
	await waitForSelector(cdp, '.v-overlay--active [id^="app-text-field-name-"]', { timeout: 30000 });
	await type(cdp, '.v-overlay--active [id^="app-text-field-name-"]', clientName);
	await clickButton(cdp, "Buscar", ".v-overlay--active");
	await wait(5000);
	await evaluate(cdp, `[...document.querySelectorAll('.v-data-table tbody tr .tabler-dots')].map(i => i.closest('button')).find(b => b && b.getBoundingClientRect().width > 0)?.click()`);
	await wait(1500);
	await highlight(cdp, ".v-overlay--active .v-list-item:last-child", { padding: 4 });
	await screenshot(cdp, `${outputDir}/cliente-1.png`);
	await clearHighlights(cdp);
	await evaluate(cdp, `[...document.querySelectorAll('.v-overlay--active .v-list-item')].find(e => e.textContent.includes('Costos de Operación'))?.click()`);
	await wait(7000);
	await clearToasts(cdp);
	await screenshot(cdp, `${outputDir}/cliente-2.png`);

	console.log("Capturas listas en", outputDir);
} catch (error) {
	console.log("FALLO:", error.message);
	await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
	console.log(await describeScreen(cdp).catch(() => ""));
	process.exitCode = 1;
} finally {
	await closeBrowser(cdp, chrome);
}
