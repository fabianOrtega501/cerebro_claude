/**
 * Captures Operaciones > Novedades for the manual: add form, closing dialog with the
 * Salida No Conforme, issue detail with it, and the Mantenimiento closing dialog.
 * Never saves nor confirms. Apply `seed.sql` first.
 *
 * Usage:
 *   node modules/operations/issues/capture.mjs --salida <carpeta> [--empresa "Empresa Demo"]
 */

import { clickAt, closeBrowser, evaluate, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { DIALOG, centerOfText, scrollDialogToBottom, shotDialog } from "../../../lib/dialogs.mjs";
import { runSql } from "../../../lib/seed.mjs";
import {
	DEFAULT_BASE,
	appField,
	describeScreen,
	goTo,
	openSelect,
	openSession,
	pickOptionByName,
	testCredentials,
	type,
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
const company = arg("empresa", "Empresa Demo");
const moduleName = arg("modulo", "Operaciones");

const OPERATIONS_VIEW = "/operations/issues";
const MAINTENANCE_VIEW = "/maintenance/issues";
const OPEN_OPERATIONS_ISSUE = "La ruta 12 del sector norte";
const CLOSED_OPERATIONS_ISSUE = "El barrido de la avenida principal";
const OPEN_MAINTENANCE_ISSUE = "El vehículo presentó una falla";
const OPERATIONS_TYPE = "Incumplimiento de Frecuencia";
const SWITCH_LABEL = "Genera Salida No Conforme";
const CONCEPT_LABEL = "Concepto de Salida No Conforme";

const findings = [];
const check = (ok, what) => {
	console.log(`  ${ok ? "OK   " : "FALLA"} ${what}`);
	if (!ok) findings.push(what);
};

/** Visible labels inside the open dialog, one line each. */
const dialogLabels = (cdp) =>
	evaluate(
		cdp,
		`[...document.querySelectorAll('${DIALOG} label, ${DIALOG} .v-label')]
      .filter((l) => l.getClientRects().length > 0)
      .map((l) => l.textContent.replace(/\\s+/g, ' ').trim())
      .filter(Boolean)`,
	);

/** Opens the issues view and waits for its table with data. */
async function openIssues(cdp, path) {
	await goTo(cdp, base, path, { selector: ".v-data-table" });
	await waitForTableSettled(cdp);
	await waitUntil(cdp, "document.querySelectorAll('table tbody tr').length > 0", {
		timeout: 30000,
		what: "las novedades del listado",
	});
	await wait(800);
}

/** Id of the seeded issue whose description starts with `description`; throws if it is missing. */
async function issueId(description) {
	const id = Number(await runSql(
		`select id from operation.issues where description like '${description.replace(/'/g, "''")}%' order by id limit 1;`,
		{ tuplesOnly: true },
	));

	if (!id) throw new Error(`No está la novedad "${description}": aplica antes el seed.sql del módulo`);

	return id;
}

/** Center of the visible `action` button in the table row whose ID cell is `id`, or `null`. */
const rowActionById = (cdp, id, action) =>
	evaluate(
		cdp,
		`(() => {
      const row = [...document.querySelectorAll('tbody tr')]
        .filter((tr) => tr.getClientRects().length > 0)
        .find((tr) => [...tr.querySelectorAll('td')].some((td) => td.textContent.trim() === '${id}'));
      if (!row) return null;
      row.scrollIntoView({ block: 'center' });
      for (const btn of row.querySelectorAll(${JSON.stringify(action)})) {
        const r = btn.getBoundingClientRect();
        if (r.width && r.height) return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }
      return null;
    })()`,
	);

/** Clicks a row action of the issue whose description starts with `description` and waits for its dialog. */
async function openRowAction(cdp, description, action, dialogText) {
	const id = await issueId(description);
	const button = await rowActionById(cdp, id, action);

	if (!button) throw new Error(`No se encontró la acción ${action} de la novedad ${id}.\n${await describeScreen(cdp)}`);

	await clickAt(cdp, button.x, button.y);
	await waitUntil(cdp, `[...document.querySelectorAll('${DIALOG}')].some((d) => d.textContent.includes(${JSON.stringify(dialogText)}))`, {
		timeout: 30000,
		what: `el diálogo "${dialogText}"`,
	});
	await waitForNoSkeletons(cdp, { within: ".v-dialog" });
	await wait(1000);
}

/** Add form: no Salida No Conforme fields. */
async function captureAddForm(cdp) {
	await openIssues(cdp, OPERATIONS_VIEW);

	const add = await centerOfText(cdp, "button", "Agregar");

	if (!add) throw new Error(`No se encontró el botón Agregar.\n${await describeScreen(cdp)}`);

	await clickAt(cdp, add.x, add.y);
	await waitUntil(cdp, `document.querySelector('${DIALOG} form')`, { timeout: 30000, what: "el formulario de Agregar" });
	await waitForNoSkeletons(cdp, { within: ".v-dialog" });
	await wait(1200);

	await pickOptionByName(cdp, `${DIALOG} ${appField("issue_type_id")}`, OPERATIONS_TYPE);
	await type(cdp, `${DIALOG} textarea`, "La ruta 12 del sector norte no se recolectó en la frecuencia programada.");
	await wait(800);

	const labels = await dialogLabels(cdp);

	check(!labels.some((label) => label.includes(SWITCH_LABEL)), "Agregar no muestra Genera Salida No Conforme");
	check(!labels.some((label) => label.includes(CONCEPT_LABEL)), "Agregar no muestra el concepto");

	await evaluate(cdp, "document.activeElement?.blur()");
	await screenshot(cdp, `${outputDir}/formularioAgregar.png`);
}

/** Closing dialog of an Operaciones issue, with the switch on and the concepts open. */
async function captureOperationsClosing(cdp) {
	await openIssues(cdp, OPERATIONS_VIEW);
	await openRowAction(cdp, OPEN_OPERATIONS_ISSUE, ".v-close", "Cerrar novedades");

	let labels = await dialogLabels(cdp);

	check(labels.some((label) => label.includes("Solución")), "el cierre dice Solución");
	check(labels.some((label) => label.includes(SWITCH_LABEL)), "el cierre de Operaciones muestra el interruptor");

	await type(cdp, `${DIALOG} textarea`, "Se reprogramó la recolección de la ruta para el turno de la tarde.");

	const toggle = await evaluate(
		cdp,
		`(() => { const i = document.querySelector('${DIALOG} .v-switch input');
      if (!i) return null; const r = i.closest('.v-selection-control').getBoundingClientRect();
      return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!toggle) throw new Error("No se encontró el interruptor de la Salida No Conforme");

	await clickAt(cdp, toggle.x, toggle.y);
	await waitUntil(cdp, `document.querySelector('${DIALOG} .v-select input')`, { timeout: 10000, what: "el concepto" });

	labels = await dialogLabels(cdp);
	check(labels.some((label) => label.includes(CONCEPT_LABEL)), "con Sí aparece el concepto");

	const options = await openSelect(cdp, `${DIALOG} .v-select input`);

	check(options.length > 0, "el concepto lista los conceptos de la empresa");

	await wait(900);

	const firstOption = await evaluate(
		cdp,
		`(() => { const item = [...document.querySelectorAll('.v-overlay--active .v-list-item')]
        .find((i) => i.getClientRects().length > 0);
      if (!item) return null; const r = item.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!firstOption) throw new Error("No se encontró una opción visible del concepto");

	await clickAt(cdp, firstOption.x, firstOption.y);
	await wait(800);

	const chosen = await evaluate(cdp, `document.querySelector('${DIALOG} .v-select .v-select__selection')?.textContent.trim() || ''`);

	check(chosen.length > 0, "el concepto queda seleccionado");
	await evaluate(cdp, "document.activeElement?.blur()");
	await screenshot(cdp, `${outputDir}/cerrar-novedad-salida-no-conforme.png`);
}

/** Detail of a closed issue that registered the Salida No Conforme. */
async function captureDetail(cdp) {
	await openIssues(cdp, OPERATIONS_VIEW);
	await openRowAction(cdp, CLOSED_OPERATIONS_ISSUE, ".v-show", "Novedad");
	await scrollDialogToBottom(cdp);

	const labels = await dialogLabels(cdp);

	check(labels.some((label) => label.includes(SWITCH_LABEL)), "el detalle muestra Genera Salida No Conforme");
	check(labels.some((label) => label.includes(CONCEPT_LABEL)), "el detalle muestra el concepto");

	await shotDialog(cdp, `${outputDir}/ver-novedad-salida-no-conforme.png`);
}

/** Closing dialog of a Mantenimiento issue: only Solución. */
async function captureMaintenanceClosing(cdp) {
	await openIssues(cdp, MAINTENANCE_VIEW);
	await openRowAction(cdp, OPEN_MAINTENANCE_ISSUE, ".v-close", "Cerrar novedades");

	const labels = await dialogLabels(cdp);

	check(labels.some((label) => label.includes("Solución")), "el cierre de Mantenimiento dice Solución");
	check(!labels.some((label) => label.includes(SWITCH_LABEL)), "el cierre de Mantenimiento no muestra el interruptor");

	await evaluate(cdp, "document.activeElement?.blur()");
	await screenshot(cdp, `${outputDir}/cerrarNovedad.png`);
}

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
		module: moduleName,
	});

	try {
		await captureAddForm(cdp);
		await captureOperationsClosing(cdp);
		await captureDetail(cdp);
		await captureMaintenanceClosing(cdp);

		console.log(`\nCapturas en ${outputDir}`);
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		console.error(`Pantalla:\n${await describeScreen(cdp).catch(() => "(no disponible)")}`);
		throw error;
	}
	finally {
		console.log(`\nhallazgos (${findings.length})`);
		findings.forEach((f) => console.log(` - ${f}`));
		await closeBrowser(cdp, chrome);
	}
};

main().catch((error) => {
	console.error(`\nFallo: ${error.message}`);
	process.exit(1);
});
