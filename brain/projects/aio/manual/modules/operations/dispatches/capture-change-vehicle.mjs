/**
 * Capturas del cambio de vehículo de un despacho (Operaciones > Despachos).
 *
 * La acción vive en el grupo de íconos de la tarjeta «Información del Despacho», junto a Cerrar y
 * Anular, y abre un diálogo con el vehículo actual, el desplegable del nuevo y el motivo.
 *
 * Uso:
 *   node modules/operations/dispatches/capture-change-vehicle.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" [--despacho 22]
 *        [--base http://localhost:5173] [--email <usuario>] [--password <clave>]
 *
 * El despacho tiene que estar **Programado o En Operación** y **con vehículo**: en cualquier otro
 * caso el botón no existe y el flujo lo dice en vez de capturar una pantalla sin la acción.
 *
 * El botón depende del permiso `/operations/change-dispatch-vehicle`, que se resuelve al iniciar
 * sesión: si se acaba de crear la fila en `menus`, hay que volver a entrar para que aparezca.
 */

import { clickAt, evaluate, screenshot, wait, waitForSelector } from "../../../lib/browser.mjs";
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
const dispatchId = arg("despacho", null);

/** La vista de despachos del módulo de Operaciones. */
const DISPATCHES_VIEW = "/operations/dispatches";

/** El botón de gestión de la fila, que es el que monta `DailyCaptureForm`. */
const PROCESS_BUTTON = "tbody tr button.v-process";

/**
 * Espera a que la tabla traiga filas de verdad.
 *
 * @param {object} cdp Conexión del navegador.
 * @returns {Promise<number>} Cuántas filas con acción de gestión hay.
 * @throws Si no cargan datos dentro del tiempo previsto.
 */
const waitForRows = async (cdp) => {
	const deadline = Date.now() + 60000;

	while (Date.now() < deadline) {
		const rows = await evaluate(cdp, `document.querySelectorAll('${PROCESS_BUTTON}').length`);
		if (rows > 0) return rows;
		await wait(500);
	}

	throw new Error(`La tabla de despachos no cargó datos. Pantalla:\n${await describeScreen(cdp)}`);
};

/** Centro en pantalla de un elemento, o `null` si no está. */
const centerOf = (cdp, selector, index = 0) =>
	evaluate(
		cdp,
		`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

/**
 * Abre la gestión del despacho indicado, o la del primero de la tabla.
 *
 * @param {object} cdp Conexión del navegador.
 * @returns {Promise<void>}
 * @throws Si no encuentra el botón de gestión de esa fila.
 */
const openDispatchManagement = async (cdp) => {
	const button = await evaluate(
		cdp,
		`(() => {
      const rows = [...document.querySelectorAll('tbody tr')]
        ${dispatchId ? `.filter(r => r.textContent.includes(${JSON.stringify(dispatchId)}))` : ""};
      for (const row of rows) {
        const b = row.querySelector('button.v-process');
        if (b) { const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }
      }
      return null;
    })()`,
	);

	if (!button) {
		throw new Error(
			`No se encontró el botón de gestión${dispatchId ? ` para el despacho ${dispatchId}` : ""}.\n` +
				`Pantalla:\n${await describeScreen(cdp)}`,
		);
	}

	await clickAt(cdp, button.x, button.y);
	await waitForSelector(cdp, ".v-dialog .v-card", { timeout: 60000 });
	await waitForSelector(cdp, ".v-dialog .custom-tabs", { timeout: 60000 });

	if (!(await waitForTableSettled(cdp, { within: ".v-dialog " }))) {
		console.log("  AVISO: la pestaña no terminó de cargar dentro del tiempo esperado");
	}
};

/**
 * Localiza el botón de cambio de vehículo por su ícono.
 *
 * Los botones del encabezado no tienen id, así que el ancla estable es el ícono: `tabler-truck-
 * delivery` solo lo usa esta acción dentro del diálogo.
 *
 * @param {object} cdp Conexión del navegador.
 * @returns {Promise<{x:number,y:number}|null>} Centro del botón, o `null` si no está en pantalla
 *   —que es lo que pasa sin el permiso, o si el despacho está Cerrado, Anulado o sin vehículo—.
 */
const changeVehicleButton = (cdp) =>
	evaluate(
		cdp,
		`(() => {
      const icon = document.querySelector('.v-dialog .v-card .i-tabler-truck-delivery, .v-dialog .v-card [class*="truck-delivery"]');
      const button = icon ? icon.closest('button') : null;
      if (!button) return null;
      const r = button.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
	);

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
	});

	try {
		await goTo(cdp, base, DISPATCHES_VIEW, { selector: ".v-data-table" });
		await waitForRows(cdp);
		await waitForNoSkeletons(cdp);

		await openDispatchManagement(cdp);

		/*
		 * La tarjeta de «Información del Despacho» recortada, que es la imagen con la que el
		 * documento explica el grupo de acciones. Se encuadra en la tarjeta y no en la ventana
		 * porque el resto de la pantalla no aporta nada a esa lista de botones.
		 */
		await screenshot(cdp, `${outputDir}/despacho_acciones.png`, {
			selector: ".dispatch-content-panel .v-card",
			margin: 0,
		});

		// El encabezado completo, para ver el botón nuevo en su contexto.
		await screenshot(cdp, `${outputDir}/cambio_vehiculo_boton.png`);

		const button = await changeVehicleButton(cdp);
		if (!button) {
			throw new Error(
				"No apareció el botón de cambio de vehículo. Comprueba que el usuario tenga el permiso\n" +
					"/operations/change-dispatch-vehicle (se resuelve al iniciar sesión: si la fila de `menus`\n" +
					"es nueva, hay que volver a entrar) y que el despacho esté Programado o En Operación con vehículo.\n" +
					`Pantalla:\n${await describeScreen(cdp)}`,
			);
		}

		await clickAt(cdp, button.x, button.y);
		await waitForSelector(cdp, ".v-dialog #vehicle_id, .v-dialog [id^='app-autocomplete-vehicle_id']", { timeout: 30000 });
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });
		await wait(500);

		await screenshot(cdp, `${outputDir}/cambio_vehiculo_formulario.png`);

		console.log(`\nCapturas en ${outputDir}`);
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		throw error;
	}
	finally {
		cdp.close();
		chrome.process.kill();
	}
};

main().catch((error) => {
	console.error(`\nFalló: ${error.message}`);
	process.exit(1);
});
