/**
 * Captures of an external work order (Mantenimiento > Órdenes de trabajo): the "Orden Externa" switch in
 * the add form, the header label, the unit value of a supply, the labor value when finishing, the massive
 * processing with editable values and the alert when changing to internal. Read only: it never saves.
 *
 * Usage:
 *   node modules/maintenance/work-orders/capture-external.mjs --salida <carpeta>
 *        [--empresa "Empresa Demo"] [--orden 900] [--solo-masivo]
 *
 * With --solo-masivo it only takes the massive processing, for OT_36 of an internal order: set
 * `is_external = false` on the order before running it, and apply the seed again afterwards.
 *
 * Apply the scenario first, from aio-app:
 *   node ~/.claude/skills/update-manual/lib/seed.mjs <perfil>/modules/maintenance/work-orders/seed-external.sql
 */

import { clearHighlights, closeBrowser, evaluate, highlight, insertText, screenshot, wait, waitForRequestsIdle, waitUntil } from "../../../lib/browser.mjs";
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
const orderNumber = arg("orden", "900");
const moduleName = arg("modulo", "Mantenimien");
const massiveOnly = args.includes("--solo-masivo");

const OWN_ACTIVITY = "Revisión y ajuste de frenos completo";
const SUPPLY_SEARCH = "Aceite motor";

const TOP_CARD = `(() => { const d = [...document.querySelectorAll('.v-dialog .v-card')].filter(e => e.getClientRects().length); return d[d.length - 1]; })()`;

/** Marks the element returned by `expr` with `data-cap` and scrolls it into view; false if missing. */
const mark = (cdp, expr, tag) =>
	evaluate(cdp, `(() => { document.querySelectorAll('[data-cap="${tag}"]').forEach(e => e.removeAttribute('data-cap'));
    const e = ${expr}; if (!e) return false; e.setAttribute('data-cap', ${JSON.stringify(tag)}); e.scrollIntoView({ block: 'center' }); return true; })()`);

const settle = async (cdp) => {
	await wait(700);
	await waitForRequestsIdle(cdp, { timeout: 30000 }).catch(() => {});
	await wait(500);
};

/** Column (`.v-col`) of the top dialog whose label is `label`. */
const fieldColumn = (label) =>
	`(() => { const l = [...${TOP_CARD}.querySelectorAll('.v-label, label')].find(x => x.textContent.trim() === ${JSON.stringify(label)}); return l && (l.closest('.v-col') || l.parentElement); })()`;

/** Button of the top dialog (or the page) whose text is exactly `text`. */
const buttonByText = (text, scope = "document") =>
	`[...${scope}.querySelectorAll('.v-btn')].filter(b => b.offsetParent).find(b => b.textContent.trim() === ${JSON.stringify(text)})`;

const clickExpr = async (cdp, expr, what) => {
	if (!await mark(cdp, expr, "click"))
		throw new Error(`No se encontró ${what}.\nPantalla:\n${await describeScreen(cdp)}`);
	await wait(400);
	await clickChecked(cdp, '[data-cap="click"]', { what });
};

const openDialog = async (cdp, expr, what) => {
	const before = await dialogCount(cdp);
	await clickExpr(cdp, expr, what);
	await waitForDialogAbove(cdp, before, { timeout: 30000 });
	await wait(900);
};

const shotTopDialog = async (cdp, file) => {
	await mark(cdp, TOP_CARD, "dialog");
	await screenshot(cdp, `${outputDir}/${file}`, { selector: '[data-cap="dialog"]' });
	await clearHighlights(cdp);
	console.log(`  ${file}`);
};

const closeTopDialog = async (cdp) => {
	await clickExpr(cdp, buttonByText("Cerrar", TOP_CARD), "Cerrar");
	await wait(700);
};

/** Closes the top dialog with its X button (`DialogCloseBtn`): these dialogs do not close with Escape. */
const closeWithX = async (cdp) => {
	await clickExpr(cdp, `[...document.querySelectorAll('.v-dialog-close-btn')].filter(b => b.offsetParent).pop()`, "la X del diálogo");
	await wait(800);
};

const main = async () => {
	const { cdp, chrome } = await openSession({ base, ...testCredentials({ email: arg("email"), password: arg("password") }), company, module: moduleName });

	try {
		await goTo(cdp, base, "/maintenance/work-orders", { selector: ".v-data-table" });
		await waitForTableSettled(cdp).catch(() => {});

		if (massiveOnly) {
			await mark(cdp, `[...document.querySelectorAll('tbody tr')]
        .filter(tr => [...tr.querySelectorAll('td')].some(td => td.textContent.trim() === ${JSON.stringify(orderNumber)}))
        .map(tr => [...tr.querySelectorAll('.v-update')].find(b => b.getBoundingClientRect().width > 0)).find(Boolean)`, "edit");
			await clickChecked(cdp, '[data-cap="edit"]', { what: `editar la orden ${orderNumber}` });
			await waitUntil(cdp, `[...document.querySelectorAll('.v-btn')].some(b => /^procesar$/i.test(b.textContent.trim()))`, { timeout: 60000, what: "detalle de la orden" });
			await settle(cdp);
			await openDialog(cdp, buttonByText("Procesar"), "Procesar");
			await waitUntil(cdp, `${TOP_CARD}.innerText.includes('Mostrando')`, { timeout: 30000, what: "conteo del masivo" });
			await settle(cdp);
			await shotTopDialog(cdp, "procesar-masivo.png");

			return;
		}

		await openDialog(cdp, buttonByText("Agregar"), "Agregar");
		await mark(cdp, fieldColumn("Orden Externa"), "switch");
		await highlight(cdp, '[data-cap="switch"]', { padding: 6 });
		await shotTopDialog(cdp, "orden-externa-agregar.png");
		await closeTopDialog(cdp);

		const opened = await mark(cdp, `[...document.querySelectorAll('tbody tr')]
      .filter(tr => [...tr.querySelectorAll('td')].some(td => td.textContent.trim() === ${JSON.stringify(orderNumber)}))
      .map(tr => [...tr.querySelectorAll('.v-update')].find(b => b.getBoundingClientRect().width > 0)).find(Boolean)`, "edit");
		if (!opened)
			throw new Error(`No se encontró la orden ${orderNumber}: aplique seed-external.sql.`);
		await clickChecked(cdp, '[data-cap="edit"]', { what: `editar la orden ${orderNumber}` });
		await waitUntil(cdp, `[...document.querySelectorAll('.v-btn')].some(b => /^procesar$/i.test(b.textContent.trim()))`, { timeout: 60000, what: "detalle de la orden" });
		await settle(cdp);

		await mark(cdp, `[...document.querySelectorAll('.v-card')].find(c => c.querySelector('.v-card-title')?.textContent.includes('Información de Orden de Trabajo'))`, "header");
		await evaluate(cdp, `(() => { const c = document.querySelector('[data-cap="header"]'); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 90); })()`);
		await wait(700);
		await evaluate(cdp, `[...document.querySelectorAll('.v-card-item .v-chip')].find(c => /Orden Externa/.test(c.textContent))?.setAttribute('data-cap', 'chip')`);
		await highlight(cdp, '[data-cap="chip"]', { padding: 6 });
		const clip = await evaluate(cdp, `(() => { const r = document.querySelector('[data-cap="header"]').getBoundingClientRect();
      return { x: r.x + window.scrollX - 8, y: r.y + window.scrollY - 8, width: r.width + 16, height: Math.min(r.height, 330) + 16, scale: 1 }; })()`);
		await wait(300);
		await screenshot(cdp, `${outputDir}/orden-externa-encabezado.png`, { clip });
		await clearHighlights(cdp);
		console.log("  orden-externa-encabezado.png");

		await openDialog(cdp, `[...document.querySelectorAll('.v-btn')].filter(b => b.offsetParent && b.textContent.trim() === 'Gestionar')[1]`, "Gestionar suministros");
		await settle(cdp);
		await openDialog(cdp, buttonByText("Agregar", TOP_CARD), "Agregar suministro");
		await clickExpr(cdp, `${fieldColumn("Suministro")}.querySelector('.v-field')`, "campo Suministro");
		await insertText(cdp, SUPPLY_SEARCH);
		await waitUntil(cdp, `[...document.querySelectorAll('.v-overlay--active .v-list-item')].some(i => i.textContent.includes(${JSON.stringify(SUPPLY_SEARCH)}))`, { timeout: 20000, what: "opciones de suministro" });
		await clickExpr(cdp, `[...document.querySelectorAll('.v-overlay--active .v-list-item')].find(i => i.textContent.includes(${JSON.stringify(SUPPLY_SEARCH)}))`, "opción de suministro");
		await waitUntil(cdp, `(${fieldColumn("Valor Unitario")})?.querySelector('input')?.value > 0`, { timeout: 20000, what: "valor unitario precargado" });
		await clickExpr(cdp, `${fieldColumn("Cantidad")}.querySelector('input')`, "campo Cantidad");
		await insertText(cdp, "4");
		await evaluate(cdp, `document.activeElement?.blur()`);
		await mark(cdp, fieldColumn("Valor Unitario"), "unit");
		await highlight(cdp, '[data-cap="unit"]', { padding: 6 });
		await shotTopDialog(cdp, "suministro-valor-unitario.png");
		await closeTopDialog(cdp);
		await closeWithX(cdp);

		await openDialog(cdp, `(() => { const c = [...document.querySelectorAll('.v-list-item')].find(li => !li.closest('.v-dialog') && li.innerText.includes(${JSON.stringify(OWN_ACTIVITY)}));
      return c && [...c.querySelectorAll('.v-btn')].find(b => b.querySelector('.tabler-checkbox')); })()`, "Finalizar actividad");
		await mark(cdp, `[...${TOP_CARD}.querySelectorAll('.v-col')].find(c => c.textContent.trim().startsWith('Valor'))`, "value");
		await highlight(cdp, '[data-cap="value"]', { padding: 6 });
		await shotTopDialog(cdp, "finalizar-valor.png");
		await closeTopDialog(cdp);

		await openDialog(cdp, buttonByText("Procesar"), "Procesar");
		await waitUntil(cdp, `${TOP_CARD}.innerText.includes('Mostrando')`, { timeout: 30000, what: "conteo del masivo" });
		await settle(cdp);
		await mark(cdp, `${TOP_CARD}.querySelector('.labor-value--editable')`, "labor");
		await highlight(cdp, '[data-cap="labor"]', { padding: 6 });
		await shotTopDialog(cdp, "procesar-masivo-externa.png");
		await closeWithX(cdp);

		await openDialog(cdp, buttonByText("Editar"), "Editar información");
		await waitUntil(cdp, `!!(${fieldColumn("Orden Externa")})`, { timeout: 30000, what: "formulario de edición cargado" });
		await settle(cdp);
		await clickExpr(cdp, `${fieldColumn("Orden Externa")}.querySelector('input')`, "interruptor Orden Externa");
		await openDialog(cdp, buttonByText("Editar", TOP_CARD), "guardar el encabezado");
		await shotTopDialog(cdp, "alerta-cambio-interna.png");
		await clickExpr(cdp, buttonByText("Cancelar", TOP_CARD), "Cancelar");
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
