/**
 * Captura el formulario de búsqueda de las órdenes de trabajo (Mantenimiento > Órdenes de Trabajo).
 *
 * El buscador ganó el campo **Estado**, que antes estaba excluido: se podía filtrar por tipo de
 * mantenimiento, vehículo, elemento, fechas y número de orden, pero no por el estado de la orden.
 *
 * Sirve también de prueba: comprueba que el campo esté, que ofrezca los tres estados por los que
 * pasa una orden y que al buscar por uno la tabla se quede solo con las órdenes de ese estado.
 *
 * Uso:
 *   node modules/maintenance/work-orders/capture-search.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" [--estado Ejecutada]
 *
 * `--estado` tiene que ser uno que exista en los datos y **no** en todas las órdenes, o la
 * comprobación de que el filtro acota no demuestra nada.
 */

import { clickAt, closeBrowser, evaluate, requestCount, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { DIALOG, centerOfText } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	appField,
	describeScreen,
	goTo,
	openSelect,
	openSession,
	pickOptionByName,
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
const status = arg("estado", "Ejecutada");

/** En los datos de prueba la tarjeta del módulo dice "Mantenimiento". */
const moduleName = arg("modulo", "Mantenimiento");

const WORK_ORDERS_VIEW = "/maintenance/work-orders";

const findings = [];
const check = (ok, what) => {
	console.log(`  ${ok ? "OK   " : "FALLA"} ${what}`);
	if (!ok) findings.push(what);
};

/** Filas visibles de la tabla, sin la fila de "no hay datos". */
const tableRows = (cdp) =>
	evaluate(
		cdp,
		`(() => [...document.querySelectorAll('table tbody tr')]
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
		await goTo(cdp, base, WORK_ORDERS_VIEW, { selector: ".v-data-table" });
		await waitForTableSettled(cdp);

		// La tabla repinta una vez más tras asentarse y el conteo se lee a medias: se espera a
		// que haya filas antes de tomar el total contra el que se compara el filtro.
		await waitUntil(cdp, "document.querySelectorAll('table tbody tr').length > 0", {
			timeout: 30000,
			what: "las órdenes del listado",
		});
		await wait(800);

		const before = await tableRows(cdp);

		console.log(`  órdenes sin filtrar: ${before.length}`);

		const searchButton = await centerOfText(cdp, "button", "Buscar");

		if (!searchButton) throw new Error(`No se encontró el botón Buscar.\n${await describeScreen(cdp)}`);

		await clickAt(cdp, searchButton.x, searchButton.y);
		await waitUntil(cdp, `document.querySelector('${DIALOG} form')`, {
			timeout: 30000,
			what: "el formulario de búsqueda",
		});
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });
		await wait(1200);

		const labels = await evaluate(
			cdp,
			`[...document.querySelectorAll('${DIALOG} label')]
        .map((l) => l.textContent.replace(/\\s+/g, ' ').trim())
        .filter(Boolean)`,
		);

		console.log(`  criterios del buscador: ${JSON.stringify(labels)}`);
		check(labels.some((label) => /^estado$/i.test(label)), "el buscador incluye el criterio Estado");

		// Se captura con el desplegable abierto: la imagen del manual tiene que mostrar los
		// estados, que es lo que el usuario no sabe hasta que lo despliega.
		await openSelect(cdp, `${DIALOG} ${appField("status")}`);

		const options = await evaluate(
			cdp,
			`[...document.querySelectorAll('.v-overlay--active .v-list-item')].map((i) => i.textContent.trim())`,
		);

		console.log(`  estados que ofrece: ${JSON.stringify(options)}`);
		check(options.length === 3, "ofrece los tres estados de la orden");

		await screenshot(cdp, `${outputDir}/orden_trabajo_buscar.png`);

		// --- Comprobación de que el criterio acota de verdad.
		await pickOptionByName(cdp, `${DIALOG} ${appField("status")}`, status);
		await wait(600);

		const requestsBefore = await requestCount(cdp);
		const confirm = await centerOfText(cdp, `${DIALOG} button`, "Buscar");

		await clickAt(cdp, confirm.x, confirm.y);
		await waitUntil(cdp, `document.querySelectorAll('${DIALOG}').length === 0`, {
			timeout: 20000,
			what: "que se cierre el buscador",
		});
		await wait(2500);

		const filtered = await tableRows(cdp);

		console.log(`  peticiones ${requestsBefore} -> ${await requestCount(cdp)} | órdenes filtradas: ${filtered.length}`);
		check(filtered.length > 0 && filtered.length < before.length, "el filtro acota el listado");
		check(filtered.every((row) => row.includes(status)), `todas las órdenes quedan en estado ${status}`);

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
