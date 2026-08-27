/**
 * Capturas de la gestión de un despacho (Operaciones > Despachos), pestaña Movimientos.
 *
 * La gestión del despacho se abre con el botón de proceso de cada fila y es un diálogo a
 * pantalla completa con las pestañas del día: Movimientos, Tripulación, Descargues, Peajes,
 * Tanqueos, Soportes y Novedades. Movimientos es la pestaña activa al abrir.
 *
 * Uso:
 *   node modules/operations/dispatches/capture-movements.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" [--despacho 22]
 *        [--base http://localhost:5173] [--email <usuario>] [--password <clave>]
 *
 * El despacho debe tener movimientos registrados: uno vacío documentaría una tabla en blanco.
 * Se puede verificar antes con:
 *   node lib/api.mjs get "dispatch-movements/v0/get-all"
 */

import { clickAt, closeBrowser, evaluate, screenshot, wait, waitForSelector } from "../../../lib/browser.mjs";
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

/**
 * Espera a que la tabla tenga filas de verdad.
 *
 * La tabla pinta una fila incluso sin datos (la de "No data available"), así que esperar
 * `tbody tr` se cumple de inmediato. Lo que solo existe con datos es el botón de gestión.
 */
const waitForRows = async (cdp) => {
	const deadline = Date.now() + 60000;

	while (Date.now() < deadline) {
		const rows = await evaluate(cdp, `document.querySelectorAll('tbody tr button.v-process').length`);
		if (rows > 0) return rows;
		await wait(500);
	}

	throw new Error(`La tabla de despachos no cargó datos. Pantalla:\n${await describeScreen(cdp)}`);
};

/** Centro en pantalla de un elemento. */
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
 * El botón de la fila lleva la clase `v-process` y es el que monta `DailyCaptureForm`.
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

	// El diálogo es `position: fixed`, así que hay que esperar algo de adentro y no el
	// contenedor: `waitForSelector` comprueba `offsetParent`, que en fixed siempre es null.
	await waitForSelector(cdp, ".v-dialog .v-card", { timeout: 60000 });

	// Las pestañas se montan cuando responde la consulta del despacho.
	await waitForSelector(cdp, ".v-dialog .custom-tabs", { timeout: 60000 });

	// Y la tabla de la pestaña pide sus datos después: hay que esperar a que cargue de
	// verdad, no solo a que no haya skeletons en ese instante.
	if (!(await waitForTableSettled(cdp, { within: ".v-dialog " }))) {
		console.log("  AVISO: la tabla de la pestaña no terminó de cargar dentro del tiempo esperado");
	}
};

/** Nombre y estado de la pestaña activa, para confirmar que se capturó la correcta. */
const activeTab = (cdp) =>
	evaluate(
		cdp,
		`(() => { const t = document.querySelector('.v-dialog .custom-tabs .v-tab--selected, .v-dialog .custom-tabs .v-tab[aria-selected="true"]');
      return t ? t.textContent.trim() : ''; })()`,
	);

/** Cuántas filas con datos tiene la tabla de la pestaña activa. */
const rowsInActiveTab = (cdp) =>
	evaluate(
		cdp,
		`(() => {
      const rows = [...document.querySelectorAll('.v-dialog .v-window-item--active tbody tr')];
      return rows.filter(r => !/no data available|sin datos|no hay datos/i.test(r.textContent)).length;
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

		// La tabla de despachos, donde está el botón que abre la gestión.
		await screenshot(cdp, `${outputDir}/despachos_tabla.png`);

		await openDispatchManagement(cdp);

		const tab = await activeTab(cdp);
		const rows = await rowsInActiveTab(cdp);

		console.log(`  pestaña activa: "${tab}" con ${rows} fila(s)`);

		// En la interfaz la pestaña se llama "Desplazamientos"; en el código, `movements`.
		if (!/desplazamiento/i.test(tab)) {
			console.log("  AVISO: la pestaña activa no es Desplazamientos; la captura puede no ser la esperada");
		}

		if (rows === 0) {
			throw new Error(
				"El despacho abierto no tiene desplazamientos: la tabla saldría vacía y eso no se documenta.\n" +
					'Elige otro con --despacho. Para ver cuáles tienen: node lib/api.mjs get "dispatch-movements/v0/get-all"',
			);
		}

		await screenshot(cdp, `${outputDir}/despacho_movimientos.png`);

		/*
		 * El formulario de registro, que es lo que el usuario llena en campo.
		 *
		 * El botón conserva su id (`#addMovement`): a diferencia de `AppSelect`, los `VBtn` no
		 * lo reescriben. Solo existe con permiso de creación sobre /operations/dispatches y
		 * cuando la pestaña no está en solo lectura.
		 */
		const addButton = await centerOf(cdp, ".v-dialog #addMovement");
		if (addButton) {
			await clickAt(cdp, addButton.x, addButton.y);
			await wait(2000);
			await waitForNoSkeletons(cdp, { within: ".v-dialog" });
			await screenshot(cdp, `${outputDir}/despacho_movimiento_form.png`);
		}
		else {
			console.log("  AVISO: no apareció #addMovement (¿sin permiso de creación, o el despacho está cerrado?)");
		}

		console.log(`\nCapturas en ${outputDir}`);
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		throw error;
	}
	finally {
		await closeBrowser(cdp, chrome);
	}
};

main().catch((error) => {
	console.error(`\nFalló: ${error.message}`);
	process.exit(1);
});
