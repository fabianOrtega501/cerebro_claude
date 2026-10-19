/**
 * Captures Operaciones > PQR for the manual: the Portal Ciudadano button, the annul dialog
 * with its reason, the annulled notice in the detail, and the portal contact section.
 * Never confirms an annulment. Apply `seed.sql` first.
 *
 * Usage:
 *   node modules/operations/pqrs/capture.mjs --salida <carpeta> [--empresa "Empresa Demo"] [--solo contacto]
 */

import { clearHighlights, clickAt, closeBrowser, evaluate, highlight, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { DIALOG, shotDialog } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	describeScreen,
	goTo,
	openPublicPage,
	openSession,
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

const VIEW = "/operations/pqrs";
const OPEN_PQR = "MLKA-2026-727005";
const ANNULLED_PQR = "LQKH-2026-074996";
const REASON = "Reporte duplicado: el ciudadano radicó la misma solicitud dos veces.";

/** Opens the PQR view and waits for its rows. */
async function openPqrs(cdp) {
	await goTo(cdp, base, VIEW, { selector: ".v-data-table" });
	await waitForTableSettled(cdp);
	await waitUntil(cdp, "document.querySelectorAll('table tbody tr').length > 0", { timeout: 30000, what: "los PQR del listado" });
	await wait(800);
}

/** Center of a visible button of the row with `tracking`; `last` picks the "more actions" button. */
const rowButton = (cdp, tracking, label) =>
	evaluate(
		cdp,
		`(() => {
      const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.innerText.includes(${JSON.stringify(tracking)}));
      if (!row) return null;
      const buttons = [...row.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0);
      const btn = ${JSON.stringify(label)} === 'last' ? buttons.pop() : buttons.find((b) => b.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
	);

/** Toolbar with the Portal Ciudadano button highlighted. */
async function capturePortalButton(cdp) {
	await openPqrs(cdp);
	await highlight(cdp, "#Portal\\ Ciudadano", { padding: 6 });
	await screenshot(cdp, `${outputDir}/pqr-portal-ciudadano.png`);
	await clearHighlights(cdp);
}

/** Annul dialog: first with the required error, then with a reason. Never confirms. */
async function captureAnnulDialog(cdp) {
	const more = await rowButton(cdp, OPEN_PQR, "last");

	if (!more) throw new Error(`No se encontró el menú de acciones de ${OPEN_PQR}.\n${await describeScreen(cdp)}`);

	await clickAt(cdp, more.x, more.y);
	await wait(800);
	await evaluate(cdp, `[...document.querySelectorAll('.v-overlay--active .v-list-item')].find((i) => /Anular/.test(i.innerText))?.click()`);
	await waitUntil(cdp, `[...document.querySelectorAll('${DIALOG}')].some((d) => d.textContent.includes('Motivo de anulación'))`, { timeout: 20000, what: "el diálogo Anular PQR" });
	await wait(800);

	await evaluate(cdp, `[...document.querySelectorAll('${DIALOG} .v-btn')].find((b) => /^\\s*Anular\\s*$/.test(b.innerText))?.click()`);
	await waitUntil(cdp, `document.querySelector('${DIALOG} .v-messages__message')`, { timeout: 10000, what: "el error del motivo" });
	await wait(500);
	await shotDialog(cdp, `${outputDir}/pqr-anular-sin-motivo.png`);

	await type(cdp, `${DIALOG} textarea`, REASON);
	await wait(800);
	await shotDialog(cdp, `${outputDir}/pqr-anular-motivo.png`);

	await evaluate(cdp, `[...document.querySelectorAll('${DIALOG} .v-btn')].find((b) => /Cerrar/.test(b.innerText))?.click()`);
	await wait(1000);
}

/** Detail of the annulled PQR, cropped from the dialog top to the notice. */
async function captureAnnulledNotice(cdp) {
	await openPqrs(cdp);
	const view = await rowButton(cdp, ANNULLED_PQR, "Ver");

	if (!view) throw new Error(`No se encontró Ver en ${ANNULLED_PQR}.\n${await describeScreen(cdp)}`);

	await clickAt(cdp, view.x, view.y);
	await waitUntil(cdp, `document.querySelector('.v-dialog .v-alert')`, { timeout: 30000, what: "el aviso de PQR anulado" });
	await waitForNoSkeletons(cdp, { within: ".v-dialog" });
	await wait(1500);

	const clip = await evaluate(
		cdp,
		`(() => {
      const card = document.querySelector('${DIALOG}').getBoundingClientRect();
      const alert = document.querySelector('.v-dialog .v-alert').getBoundingClientRect();
      return { x: Math.round(card.left), y: Math.round(card.top), width: Math.round(card.width), height: Math.round(alert.bottom - card.top + 210) };
    })()`,
	);
	await screenshot(cdp, `${outputDir}/pqr-anulado-aviso.png`, { clip });
}

/** Contact section of the portal form, with the identification hint and the client number highlighted. */
async function captureContactSection() {
	const { cdp, chrome } = await openPublicPage({ base, path: "/public/citizen-portal/report-complaint", selector: "#cp-complaint-contact", port: 9223, height: 1400 });

	try {
		await wait(4000);
		await evaluate(cdp, `window.scrollTo(0, document.querySelector('#cp-complaint-contact').getBoundingClientRect().top + window.scrollY - 40)`);
		await wait(800);
		await highlight(cdp, "input[placeholder='Cédula - Pasaporte - Otros']", { label: "1", padding: 6 });
		await highlight(cdp, "input[placeholder^='Ingrese Número de Cliente']", { label: "2", padding: 6 });
		await wait(300);
		const clip = await evaluate(
			cdp,
			`(() => {
        const r = document.querySelector("section[aria-labelledby='cp-complaint-contact']").getBoundingClientRect();
        return { x: Math.max(0, Math.round(r.left - 30)), y: Math.max(0, Math.round(r.top + window.scrollY - 20)), width: Math.round(r.width + 60), height: Math.round(r.height + 40) };
      })()`,
		);
		await screenshot(cdp, `${outputDir}/datos-contacto.png`, { clip });
		await clearHighlights(cdp);
	} finally {
		await closeBrowser(cdp, chrome);
	}
}

const main = async () => {
	if (arg("solo") === "contacto") {
		await captureContactSection();
		console.log(`\nCapturas en ${outputDir}`);

		return;
	}

	const { cdp, chrome } = await openSession({ base, ...testCredentials(), company, module: "Operaciones" });

	try {
		await capturePortalButton(cdp);
		await captureAnnulDialog(cdp);
		await captureAnnulledNotice(cdp);
	} catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`Pantalla:\n${await describeScreen(cdp).catch(() => "(no disponible)")}`);
		throw error;
	} finally {
		await closeBrowser(cdp, chrome);
	}

	await captureContactSection();
	console.log(`\nCapturas en ${outputDir}`);
};

main().catch((error) => {
	console.error(`Falló: ${error.message}`);
	process.exit(1);
});
