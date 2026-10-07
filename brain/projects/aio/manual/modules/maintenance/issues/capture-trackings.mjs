/**
 * Capturas de los seguimientos de una novedad de mantenimiento: la acción
 * **Seguimientos** del listado, su ventana con el encabezado y los tramos, el formulario de alta y
 * el diálogo de **Cerrar novedad** con su nueva **Fecha de cierre** (`Mantenimiento/Novedades.md`).
 *
 * Sirve también de prueba de la pantalla: comprueba el encabezado, que el último tramo salga
 * «En curso», que solo ese tenga editar y eliminar, que el alta sugiera la fecha y que el cierre
 * traiga la fecha sugerida y el aviso. **Nunca guarda ni cierra nada.**
 *
 * Uso:
 *   node --experimental-websocket modules/maintenance/issues/capture-trackings.mjs \
 *     --salida <carpeta> [--empresa "PROMOAMBIENTAL"] [--novedad "1101/ESM728"]
 *
 * `--novedad` es un texto de la fila en la primera página (el vehículo sirve: la descripción no es columna). El escenario lo deja
 * `modules/maintenance/issues/seed.sql`: una novedad abierta con tres tramos, el último en curso.
 */

import { clearHighlights, clickAt, closeBrowser, evaluate, highlight, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { TOP_DIALOG, centerOfText, dialogCount, rowActionButton, shotTopDialog, waitForDialogAbove } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	describeScreen,
	goTo,
	openSession,
	testCredentials,
	waitForNoSkeletons,
	waitForTableSettled,
} from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "PROMOAMBIENTAL");
const moduleName = arg("modulo", "Mantenimiento");
const issueText = arg("novedad", "1101/ESM728");

const ISSUES_VIEW = "/maintenance/issues";

/*
 * La fila deja a la vista Ver y Editar; el resto de acciones está en el menú de puntos. Por eso
 * se abren por su título: a la vista llevan `aria-label`, y en el menú son `.v-list-item`.
 */
const TRACKINGS_ACTION = "Seguimientos";
const CLOSE_ACTION = "Cerrar Novedad";

/**
 * Centro del botón de puntos de la fila de la novedad.
 *
 * @returns {Promise<{x: number, y: number}|null>} `null` si la fila no tiene menú.
 */
const rowMenuButton = (cdp) =>
	evaluate(
		cdp,
		`(() => { const tr = [...document.querySelectorAll('tbody tr')].find(t => t.getClientRects().length && t.textContent.includes(${JSON.stringify(issueText)}));
      const b = tr && [...tr.querySelectorAll('button')].find(x => x.getBoundingClientRect().width > 0 && x.querySelector('.tabler-dots'));
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

/**
 * Abre el menú de puntos de la fila y espera a que se pinten sus opciones.
 *
 * @returns {Promise<string[]>} Las opciones del menú.
 * @throws {Error} Si la fila no tiene menú o no se abre.
 */
const openRowMenu = async (cdp) => {
	const dots = await rowMenuButton(cdp);

	if (!dots) throw new Error(`La fila "${issueText}" no tiene el menú de puntos.\n${await describeScreen(cdp)}`);

	await clickAt(cdp, dots.x, dots.y);
	await waitUntil(cdp, `[...document.querySelectorAll('.v-overlay--active .v-list-item')].some(e => e.innerText.trim())`, { what: "el menú de la fila", timeout: 10000 });

	return evaluate(cdp, `[...document.querySelectorAll('.v-overlay--active .v-list-item')].map(e => e.innerText.trim())`);
};

const findings = [];
const check = (ok, what) => {
	console.log(`  ${ok ? "OK   " : "FALLA"} ${what}`);
	if (!ok) findings.push(what);
};

/** Texto del diálogo más alto, en una línea. */
const topDialogText = (cdp) => evaluate(cdp, `(${TOP_DIALOG})?.innerText.replace(/\\s+/g, ' ').trim() ?? ''`);

/**
 * Filas de la tabla del diálogo más alto, con cuántos botones de editar y eliminar **visibles** trae.
 *
 * @returns {Promise<Array<{text: string, update: number, remove: number}>>} Sin la fila de "no hay datos".
 */
const dialogRows = (cdp) =>
	evaluate(
		cdp,
		`(() => { const d = ${TOP_DIALOG}; if (!d) return [];
      const visibles = (tr, sel) => [...tr.querySelectorAll(sel)].filter(b => b.getBoundingClientRect().width > 0).length;
      return [...d.querySelectorAll('tbody tr')].filter(tr => tr.getClientRects().length > 0)
        .map(tr => ({ text: tr.innerText.replace(/\\s+/g, ' ').trim(), update: visibles(tr, '.v-update'), remove: visibles(tr, '.v-delete') }))
        .filter(r => r.text && !/no data|no hay datos/i.test(r.text)); })()`,
	);

/**
 * Abre el listado y deja la tabla quieta.
 *
 * @returns {Promise<void>}
 */
const openIssues = async (cdp) => {
	await goTo(cdp, base, ISSUES_VIEW, { selector: ".v-data-table" });
	await waitForTableSettled(cdp);

	// La tabla puede quedar "quieta" un instante antes de pintar las filas
	await waitUntil(
		cdp,
		`[...document.querySelectorAll('tbody tr')].some(t => t.getClientRects().length && t.textContent.includes(${JSON.stringify(issueText)}))`,
		{ what: `la fila de la novedad ${issueText}`, timeout: 30000 },
	);
};

/**
 * Ejecuta una acción de la fila de la novedad —a la vista o desde el menú de puntos— y espera el
 * diálogo que abre.
 *
 * @param {string} title - Título de la acción, tal como se ve en pantalla.
 * @returns {Promise<void>} Lanza si la acción no está en la fila ni en su menú, o si el diálogo no abre.
 */
const openRowDialog = async (cdp, title) => {
	const before = await dialogCount(cdp);
	let target = await rowActionButton(cdp, issueText, `[aria-label="${title}"]`);

	if (!target) {
		await openRowMenu(cdp);
		await wait(600); // la transición del menú: un click a mitad de ella no llega a la opción
		target = await centerOfText(cdp, ".v-overlay--active .v-list-item", title);
	}

	if (!target) throw new Error(`La fila "${issueText}" no tiene la acción ${title}.\n${await describeScreen(cdp)}`);

	await clickAt(cdp, target.x, target.y);

	if (!(await waitForDialogAbove(cdp, before))) throw new Error(`No abrió ${title}.\n${await describeScreen(cdp)}`);
};

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
		module: moduleName,
	});

	try {
		// --- 1. La acción en el listado
		await openIssues(cdp);

		const visible = await evaluate(cdp, `(() => { const tr = [...document.querySelectorAll('tbody tr')].find(t => t.getClientRects().length && t.textContent.includes(${JSON.stringify(issueText)}));
      return [...tr.querySelector('td').querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0).length; })()`);
		const menu = await openRowMenu(cdp);

		await wait(900); // que el menú termine de aparecer antes de capturarlo

		console.log(`  botones a la vista: ${visible} | menú: ${JSON.stringify(menu)}`);
		check(visible === 3, "la fila deja a la vista Ver, Editar y el menú de puntos");
		check(menu.includes(TRACKINGS_ACTION) && menu.indexOf(TRACKINGS_ACTION) === menu.indexOf(CLOSE_ACTION) + 1, "Seguimientos está en el menú, junto a Cerrar novedad");

		// Captura con el menú abierto y la opción señalada
		await evaluate(cdp, `(() => { const i = [...document.querySelectorAll('.v-overlay--active .v-list-item')].find(e => e.innerText.trim() === ${JSON.stringify(TRACKINGS_ACTION)}); i?.setAttribute('data-capture-target', '1'); return !!i; })()`);
		await highlight(cdp, "[data-capture-target]", { padding: 4 });
		await screenshot(cdp, `${outputDir}/seguimientos-accion.png`);
		await clearHighlights(cdp);

		// --- 2. La ventana de seguimientos
		await openIssues(cdp);
		await openRowDialog(cdp, TRACKINGS_ACTION);
		await waitUntil(cdp, `/seguimientos de la novedad/i.test((${TOP_DIALOG})?.innerText ?? '')`, { what: "el título de la ventana", timeout: 30000 });
		await waitForTableSettled(cdp, { within: ".v-dialog" });

		const windowText = await topDialogText(cdp);
		const rows = await dialogRows(cdp);

		console.log(`  tramos: ${rows.length}`);
		check(/inoperatividad acumulada/i.test(windowText), "el encabezado muestra la inoperatividad acumulada");
		check(/vehículo/i.test(windowText) && /fecha de novedad/i.test(windowText), "el encabezado muestra vehículo y fecha");
		check(rows.length >= 2, "la novedad tiene varios tramos que mostrar");
		check(/en curso/i.test(rows.at(-1)?.text ?? ""), "el último tramo aparece En curso");
		check(rows.slice(0, -1).every((r) => r.update === 0 && r.remove === 0), "los tramos anteriores no se editan ni eliminan");
		check(rows.at(-1)?.update > 0 && rows.at(-1)?.remove > 0, "el último tramo se puede editar y eliminar");
		check(/agregar/i.test(windowText), "con la novedad abierta aparece Agregar");

		await shotTopDialog(cdp, `${outputDir}/seguimientos-ventana.png`, 0);

		// --- 3. El formulario de alta
		const add = await centerOfText(cdp, ".v-dialog button", "Agregar");

		if (!add) throw new Error(`No se encontró Agregar en la ventana.\n${await describeScreen(cdp)}`);

		const before = await dialogCount(cdp);

		await clickAt(cdp, add.x, add.y);
		if (!(await waitForDialogAbove(cdp, before))) throw new Error(`No abrió el formulario de alta.\n${await describeScreen(cdp)}`);
		await waitForNoSkeletons(cdp);
		await wait(1200);

		const formText = await topDialogText(cdp);
		const startDate = await evaluate(cdp, `(() => { const d = ${TOP_DIALOG}; return [...d.querySelectorAll('input')].map(i => i.value).find(v => /^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}/.test(v)) ?? null; })()`);

		console.log(`  inicio sugerido: ${startDate}`);
		check(/actividad/i.test(formText) && /área responsable/i.test(formText), "el formulario pide actividad y área");
		check(/móvil que atiende/i.test(formText) && /acción ejecutada/i.test(formText), "el formulario ofrece móvil y acción ejecutada");
		check(Boolean(startDate), "el inicio llega sugerido");

		await shotTopDialog(cdp, `${outputDir}/seguimientos-agregar.png`);

		// --- 4. Cerrar novedad: la fecha de cierre y el aviso. Se recarga para soltar los diálogos.
		await openIssues(cdp);
		await openRowDialog(cdp, CLOSE_ACTION);
		await waitUntil(cdp, `[...(${TOP_DIALOG})?.querySelectorAll('input') ?? []].some(i => /^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}/.test(i.value))`, { what: "la fecha de cierre sugerida", timeout: 20000 });

		const closeText = await topDialogText(cdp);

		check(/fecha de cierre/i.test(closeText), "el cierre pide la fecha de cierre");
		check(/seguimiento en curso termina/i.test(closeText), "el cierre avisa que termina el seguimiento en curso");
		check(/soluci/i.test(closeText), "el cierre pide la solución, no el motivo de anulación");

		await shotTopDialog(cdp, `${outputDir}/cerrar-novedad-fecha.png`);
	}
	finally {
		await closeBrowser(cdp, chrome);
	}

	console.log(`\nhallazgos (${findings.length})${findings.length ? `:\n - ${findings.join("\n - ")}` : ""}`);
};

main().catch((error) => {
	console.error(`Falló: ${error.message}`);
	process.exit(1);
});
