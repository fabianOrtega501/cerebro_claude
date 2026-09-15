/**
 * Captura el formulario de busqueda de la Bitacora de Mantenimiento.
 *
 * El buscador perdio el campo **Tipo de Equipo**: no era un criterio real —el backend lo ignoraba,
 * porque el tipo sale del vehiculo y no es columna de la bitacora— y ademas se mostraba
 * deshabilitado. Los criterios que quedan son los que si filtran.
 *
 * Sirve tambien de prueba: comprueba que Tipo de Equipo ya no este entre los campos y que el
 * filtro por vehiculo deje la tabla solo con las bitacoras de ese vehiculo.
 *
 * Uso:
 *   node modules/maintenance/logbook/capture-search.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" [--vehiculo "V-027/PMR973"]
 *
 * `--vehiculo` es la etiqueta tal como sale en el desplegable (codigo/placa) y tiene que apuntar a
 * un vehiculo **con** bitacoras, o la comprobacion del filtro no demuestra nada.
 */

import { clickAt, closeBrowser, evaluate, requestCount, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { DIALOG, centerOfText } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	appField,
	describeScreen,
	goTo,
	openSession,
	pickOptionByName,
	testCredentials,
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
const vehicle = arg("vehiculo", "V-027/PMR973");

/** En los datos de prueba la tarjeta del modulo dice "Mantenimiento". */
const moduleName = arg("modulo", "Mantenimiento");

const LOGBOOK_VIEW = "/maintenance/logbook";

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

/** Etiquetas de los campos del dialogo, que es lo que el manual enumera. */
const dialogLabels = (cdp) =>
	evaluate(
		cdp,
		`[...document.querySelectorAll('${DIALOG} label')]
      .map((l) => l.textContent.replace(/\\s+/g, ' ').trim())
      .filter(Boolean)`,
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

		const antes = await tableRows(cdp);

		console.log(`  filas sin filtrar: ${antes.length}`);

		const searchButton = await centerOfText(cdp, "button", "Buscar");

		if (!searchButton) throw new Error(`No se encontro el boton Buscar.\n${await describeScreen(cdp)}`);

		await clickAt(cdp, searchButton.x, searchButton.y);
		await waitUntil(cdp, `document.querySelector('${DIALOG} form')`, {
			timeout: 30000,
			what: "el formulario de busqueda",
		});
		await wait(1200);

		const labels = await dialogLabels(cdp);

		console.log(`  campos del buscador: ${JSON.stringify(labels)}`);
		check(!labels.some((label) => /tipo de equipo/i.test(label)), "Tipo de Equipo ya no sale en la busqueda");

		// El dialogo no llena la ventana: se recorta a la tarjeta, como la imagen ya publicada.
		await screenshot(cdp, `${outputDir}/bitacora_buscar.png`, { selector: DIALOG, margin: 0 });

		// --- Comprobacion del filtro que se acaba de arreglar.
		await pickOptionByName(cdp, `${DIALOG} ${appField("vehicle_id")}`, vehicle);

		const antesDeBuscar = await requestCount(cdp);
		const confirm = await centerOfText(cdp, `${DIALOG} button`, "Buscar");

		await clickAt(cdp, confirm.x, confirm.y);
		await waitUntil(cdp, `document.querySelectorAll('${DIALOG}').length === 0`, {
			timeout: 20000,
			what: "que se cierre el dialogo de busqueda",
		});
		await wait(2500);

		const despues = await requestCount(cdp);
		const filtradas = await tableRows(cdp);

		console.log(`  peticiones ${antesDeBuscar} -> ${despues} | filas filtradas: ${filtradas.length}`);
		check(despues > antesDeBuscar, "pulsar Buscar dispara la consulta");
		check(filtradas.length > 0 && filtradas.length < antes.length, "el filtro reduce el listado");
		check(
			filtradas.every((row) => row.includes(vehicle)),
			`todas las filas son del vehiculo ${vehicle}`,
		);

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
