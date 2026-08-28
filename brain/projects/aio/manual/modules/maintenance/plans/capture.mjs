/**
 * Capturas del wizard de Planes de Mantenimiento (Mantenimiento > Maestros > Planes).
 *
 * El wizard se abre desde la acción Editar de una fila y monta sus pasos en un `AppStepper`:
 * Planes, Actividades, Puestos de Trabajo, Herramientas, Suministros y Costeo. Este flujo
 * captura los cuatro pasos de líneas, que son los que tienen tabla paginada y buscador.
 *
 * Para las capturas de cada operación del CRUD está `capture-crud.mjs`, en esta misma carpeta.
 *
 * Uso:
 *   node modules/maintenance/plans/capture.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" [--plan "DEMO Plan"]
 *        [--base http://localhost:5173] [--email <usuario>] [--password <clave>]
 *
 * Necesita un plan con líneas en sus cuatro pestañas:
 *   node lib/api.mjs count "maintenance-plans/v0/get-all"
 */

import { closeBrowser, screenshot, setViewport, wait } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, goTo, openSession, testCredentials, waitForTableSettled } from "../../../lib/session.mjs";
import { PLANS_VIEW, goToStep, openPlansTab, openWizardFor, shot, waitForPlanRow } from "./wizard.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "Empresa Demo");
// La celda trunca el nombre ("DEMO Plan con mucha  linea"): se busca por un fragmento
const planName = arg("plan", "DEMO Plan");

/**
 * Los pasos que se capturan, con el rótulo que muestra el `AppStepper`.
 * El de Planes y el de Costeo se omiten: no tienen tabla de líneas.
 */
const STEPS = [
	["Actividades", "actividades"],
	["Puestos de Trabajo", "puestos-de-trabajo"],
	["Herramientas", "herramientas"],
	["Suministros", "suministros"],
];

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
	});

	try {
		await goTo(cdp, base, PLANS_VIEW, { selector: ".v-data-table" });

		if (!await openPlansTab(cdp))
			throw new Error(`No se encontró la pestaña Planes. Pantalla:
${await describeScreen(cdp)}`);

		const rows = await waitForPlanRow(cdp, planName);

		console.log(`  tabla de planes con ${rows} fila(s)`);

		await openWizardFor(cdp, planName, "update");

		// El wizard con su tabla no cabe en los 795 px del manual: se sube el alto y se deja
		// el ancho de siempre, que es lo que mantiene parejas las imágenes.
		await setViewport(cdp, { width: 1486, height: 1100 });
		await wait(800);

		for (const [label, name] of STEPS) {
			if (!await goToStep(cdp, label)) {
				console.log(`  ${name}: AVISO: no se pudo llegar al paso`);
				continue;
			}

			// La tabla se monta, pide los datos y solo después pinta los skeletons: hay que
			// exigir filas + sin skeletons + sin overlay, sostenido.
			await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
			await wait(1200);
			await shot(cdp, `${outputDir}/${name}.png`);

			console.log(`  ${name}: capturado`);
		}

		console.log(`\nCapturas en ${outputDir}`);
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		console.error(await describeScreen(cdp).catch(() => "no se pudo describir la pantalla"));
		throw error;
	}
	finally {
		// Nunca `chrome.process.kill()`: falla con EACCES en procesos confinados y pisa el
		// error real desde el `finally`.
		await closeBrowser(cdp, chrome);
	}
};

main().catch((error) => {
	console.error(`\nFalló: ${error.message}`);
	process.exit(1);
});
