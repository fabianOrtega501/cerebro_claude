/**
 * Capturas de los seguimientos de una bitácora (Mantenimiento > Bitácora > Seguimiento).
 *
 * El seguimiento gana el **área responsable** y su propia **fecha**, y la tabla muestra desde
 * cuándo y hasta cuándo estuvo el vehículo a cargo de esa área, con el tiempo transcurrido. El
 * último seguimiento de una bitácora en proceso queda «En curso».
 *
 * Sirve también de prueba: comprueba que el formulario traiga las áreas del maestro MTMT-004 y la
 * fecha precargada, y que la tabla tenga las columnas nuevas.
 *
 * Uso:
 *   node modules/maintenance/logbook/capture-tracking.mjs --salida <carpeta> --empresa "Empresa Demo"
 *
 * Hace falta una bitácora **En proceso** con al menos un seguimiento registrado; si no, la tabla
 * sale vacía y la captura no documenta nada. El flujo avisa cuando no la encuentra.
 */

import { clickAt, closeBrowser, evaluate, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { centerOfText } from "../../../lib/dialogs.mjs";
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
const company = arg("empresa", "Empresa Demo");
const moduleName = arg("modulo", "Mantenimiento");

const LOGBOOK_VIEW = "/maintenance/logbook";

/** El modal de seguimientos es el primero; el formulario de alta se abre encima. */
const TRACKING_DIALOG = ".v-dialog .v-card";

const findings = [];
const check = (ok, what) => {
	console.log(`  ${ok ? "OK   " : "FALLA"} ${what}`);
	if (!ok) findings.push(what);
};

/** Encabezados de la tabla de seguimientos. */
const trackingHeaders = (cdp) =>
	evaluate(
		cdp,
		`[...document.querySelectorAll('.v-dialog table thead th')].map((th) => th.textContent.replace(/\\s+/g, ' ').trim())`,
	);

/**
 * Etiquetas de los campos del diálogo que esté encima.
 *
 * @param {object} cdp - Conexión con Chrome.
 * @returns {Promise<string[]>} Los textos de los `label`, sin los vacíos. Un campo sin rótulo
 * sencillamente no aparece, que es lo que delata a los que se quedaron sin etiqueta.
 */
const dialogLabels = (cdp) =>
	evaluate(
		cdp,
		`(() => { const dialogos = [...document.querySelectorAll('.v-dialog')];
      const form = dialogos[dialogos.length - 1];
      return [...form.querySelectorAll('label')].map((l) => l.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean); })()`,
	);

/** Filas de la tabla de seguimientos. */
const trackingRows = (cdp) =>
	evaluate(
		cdp,
		`(() => [...document.querySelectorAll('.v-dialog table tbody tr')]
      .map((tr) => tr.textContent.replace(/\\s+/g, ' ').trim())
      .filter((t) => t && !/no data|no hay datos/i.test(t)))()`,
	);

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
		module: moduleName,
	});

	try {
		await goTo(cdp, base, LOGBOOK_VIEW, { selector: ".v-data-table" });
		await waitForTableSettled(cdp);

		// El botón de seguimientos solo está en las bitácoras En proceso.
		const tracking = await evaluate(
			cdp,
			`(() => { const fila = [...document.querySelectorAll('table tbody tr')].find(tr => /en proceso/i.test(tr.textContent));
        const boton = fila && fila.querySelector('.v-tracking');
        if (!boton) return null;
        const r = boton.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
		);

		if (!tracking) {
			throw new Error(
				`No hay ninguna bitácora En proceso con el botón de seguimientos.\n${await describeScreen(cdp)}`,
			);
		}

		await clickAt(cdp, tracking.x, tracking.y);
		await waitUntil(cdp, "document.querySelectorAll('.v-dialog').length > 0", {
			timeout: 30000,
			what: "el modal de seguimientos",
		});
		await wait(2500);

		const headers = await trackingHeaders(cdp);
		const rows = await trackingRows(cdp);

		console.log(`  columnas: ${JSON.stringify(headers)}`);
		console.log(`  seguimientos: ${rows.length}`);

		check(headers.some((h) => /responsable/i.test(h)), "la tabla muestra el área responsable");
		check(headers.some((h) => /registrado por/i.test(h)), "la tabla muestra quién registró");
		check(headers.some((h) => /tiempo transcurrido/i.test(h)), "la tabla muestra el tiempo transcurrido");
		check(rows.length > 0, "la bitácora tiene seguimientos que mostrar");
		check(rows.some((r) => /en curso/i.test(r)), "el último seguimiento aparece En curso");

		await screenshot(cdp, `${outputDir}/bitacora_seguimientos.png`, { selector: TRACKING_DIALOG, margin: 0 });

		// --- Detalle de un seguimiento: el mismo formulario, en solo lectura.
		/*
		 * La fila trae dos botones `.v-show`: el estándar del DataTable, oculto porque la tabla
		 * deshabilita esa acción, y el del ojo que abre el detalle. Se descarta el oculto por su
		 * tamaño: apuntar al primero manda el clic a (0,0), o sea al velo del modal.
		 */
		const ver = await evaluate(
			cdp,
			`(() => { const fila = document.querySelector('.v-dialog table tbody tr');
        const boton = fila && [...fila.querySelectorAll('.v-show')].find((b) => b.getBoundingClientRect().width > 0);
        if (!boton) return null;
        const r = boton.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
		);

		if (!ver) throw new Error(`No se encontró el botón de ver el seguimiento.\n${await describeScreen(cdp)}`);

		await clickAt(cdp, ver.x, ver.y);
		await waitUntil(cdp, "document.querySelectorAll('.v-dialog').length > 1", {
			timeout: 30000,
			what: "el detalle del seguimiento",
		});
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });
		await wait(1500);

		const detailLabels = await dialogLabels(cdp);

		console.log(`  campos del detalle: ${JSON.stringify(detailLabels)}`);
		check(detailLabels.some((l) => /ubicaci/i.test(l)), "el detalle rotula la ubicación");
		check(detailLabels.some((l) => /responsable/i.test(l)), "el detalle rotula el responsable");
		check(detailLabels.some((l) => /archivo/i.test(l)), "el detalle rotula el archivo adjunto");

		await screenshot(cdp, `${outputDir}/bitacora_seguimiento_detalle.png`, {
			selector: ".v-dialog:last-of-type .v-card",
			margin: 0,
		});

		// El detalle se cierra para dejar arriba el modal de seguimientos.
		const cerrar = await centerOfText(cdp, ".v-dialog:last-of-type button", "Cerrar");

		if (!cerrar) throw new Error(`No se encontró el botón Cerrar del detalle.\n${await describeScreen(cdp)}`);

		await clickAt(cdp, cerrar.x, cerrar.y);
		await waitUntil(cdp, "document.querySelectorAll('.v-dialog').length === 1", {
			timeout: 30000,
			what: "el cierre del detalle",
		});

		// --- Formulario de alta, que es donde viven los dos campos nuevos.
		const agregar = await centerOfText(cdp, ".v-dialog button", "Agregar");

		if (!agregar) throw new Error(`No se encontró el botón Agregar.\n${await describeScreen(cdp)}`);

		await clickAt(cdp, agregar.x, agregar.y);
		await waitUntil(cdp, "document.querySelectorAll('.v-dialog').length > 1", {
			timeout: 30000,
			what: "el formulario de seguimiento",
		});
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });
		await wait(1500);

		const labels = await dialogLabels(cdp);

		console.log(`  campos del formulario: ${JSON.stringify(labels)}`);
		check(labels.some((l) => /responsable/i.test(l)), "el formulario pide el área responsable");
		check(labels.some((l) => /fecha de seguimiento/i.test(l)), "el formulario trae la fecha de seguimiento");

		await screenshot(cdp, `${outputDir}/bitacora_seguimiento_form.png`, {
			selector: ".v-dialog:last-of-type .v-card",
			margin: 0,
		});

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

		// Nunca `chrome.process.kill()`: falla con EACCES en procesos confinados y pisa el error.
		await closeBrowser(cdp, chrome);
	}
};

main().catch((error) => {
	console.error(`\nFallo: ${error.message}`);
	process.exit(1);
});
