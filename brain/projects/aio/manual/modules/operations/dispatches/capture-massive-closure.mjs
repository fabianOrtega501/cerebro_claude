/**
 * Capturas del cierre masivo de despachos (Operaciones > Despachos).
 *
 * Documenta el botón nuevo de la barra, el panel de filtros con los candidatos, el bloque de
 * tripulación que se despliega por despacho y el modal que pide la fecha de cierre del lote.
 *
 * Solo entran despachos **sin vehículo** y **en operación** (los programados no se ofrecen), así
 * que la empresa que se use tiene que tener alguno; si la tabla sale vacía el flujo avisa en vez
 * de publicar una pantalla en blanco.
 *
 * El panel exige **todos** los filtros: sin fecha, centro, servicio y turno la búsqueda ni
 * siquiera se dispara. Servicio y turno se toman del parámetro, y si no viene, la primera opción
 * del menú.
 *
 * Uso:
 *   node modules/operations/dispatches/capture-massive-closure.mjs --salida <carpeta>
 *        [--empresa "La Fabrica de Software S.A.S"] [--centro "CO Norte"]
 *        [--servicio "Barrido"] [--turno "Diurno"]
 *        [--solo boton|pantalla|tripulacion|modal]
 */

import { clickAt, closeBrowser, evaluate, screenshot, setViewport, wait, waitForSelector, waitUntil } from "../../../lib/browser.mjs";
import { DIALOG } from "../../../lib/dialogs.mjs";
import { appField, DEFAULT_BASE, describeScreen, openSelect, openSession, pickOptions, pickOptionByName, selectOption, testCredentials, VIEWPORT } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "La Fabrica de Software S.A.S");
const center = arg("centro", "CO Norte");
const service = arg("servicio");
const shift = arg("turno");
const only = arg("solo", "todo");

/**
 * Pulsa con el ratón real, que es lo que escucha Vuetify, y comprueba que el punto sea del
 * elemento: el pie de los diálogos es `position: fixed` y se lleva los clicks de esa franja.
 */
const realClick = async (cdp, selector, index = 0) => {
	const point = await evaluate(
		cdp,
		`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!e) return null; const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!point) throw new Error(`No se encontró (o no tiene tamaño) ${selector} [${index}]`);

	await clickAt(cdp, point.x, point.y);
};

/**
 * Elige un filtro obligatorio del panel: el valor pedido, o el primero del menú si no se pidió.
 *
 * Espera a que el campo deje de estar deshabilitado: el de servicios lo está mientras recarga su
 * lista por el centro operativo, y elegir en ese hueco deja el filtro vacío al llegar la lista
 * nueva —el flujo moría después, con una tabla sin candidatos y sin decir por qué—.
 *
 * @param {object} cdp - Conexión del navegador
 * @param {string} field - Id del campo, tal como lo espera `appField` (`service_id`, `shift_id`)
 * @param {string} [name] - Texto exacto de la opción; sin él se toma la primera del menú
 * @returns {Promise<string[]>} Los textos elegidos. Con `name` devuelve ese mismo texto; **puede
 *          venir vacío** si el menú no traía opciones, y entonces la búsqueda no se disparará
 * @throws {Error} Si se pidió un `name` que no está en el menú, o si el select nunca se habilita
 */
const chooseFilter = async (cdp, field, name) => {
	const selector = `.v-dialog ${appField(field)}`;

	await waitUntil(
		cdp,
		`(() => { const i = document.querySelector(${JSON.stringify(selector)});
      return i && !i.disabled; })()`,
		{ what: `que se habilite el filtro ${field}` },
	);

	const chosen = name ? (await pickOptionByName(cdp, selector, name), [name]) : await pickOptions(cdp, selector, 1);

	// Lo elegido se comprueba en la pantalla, no solo en `input.value`, que Vuetify vacía al
	// perder el foco. La selección vive dentro de `.v-field__input` —como `.v-select__selection`
	// o `.v-autocomplete__selection`, según el campo—, así que se lee su texto. Un filtro que se
	// elige y se deshace solo dejaba la tabla vacía sin decir por qué, y el fallo aparecía dos
	// pasos más allá.
	const shown = await evaluate(
		cdp,
		`(() => { const i = document.querySelector(${JSON.stringify(selector)});
      const field = i && i.closest('.v-input');
      if (!field) return '';

      return ((field.querySelector('.v-field__input')?.textContent || '') + (i.value || '')).trim(); })()`,
	);

	if (!shown) throw new Error(`El filtro ${field} quedó vacío después de elegir ${JSON.stringify(chosen)}`);

	return chosen;
};

/**
 * Deja la fecha del filtro en el día de hoy.
 *
 * El campo es un flatpickr sin id estable —`AppDateTimePicker` lo genera con sufijo aleatorio—,
 * así que se llega por el marcador de posición y se elige el día desde el calendario en vez de
 * escribirlo.
 *
 * @param {object} cdp - Conexión del navegador
 * @returns {Promise<boolean>} `false` si no encontró el campo o el día de hoy
 */
const pickToday = async (cdp) => {
	const abierto = await evaluate(cdp, `
    (() => {
      const campo = [...document.querySelectorAll('.v-dialog input')]
        .find(i => (i.placeholder || '').toLowerCase().includes('fecha'));
      if (!campo) return false;
      campo.click();
      return true;
    })()
  `);

	if (!abierto) return false;

	await wait(1200);

	const elegido = await evaluate(cdp, `
    (() => {
      const dia = [...document.querySelectorAll('.flatpickr-calendar.open .flatpickr-day.today')][0];
      if (!dia) return false;
      dia.click();
      return true;
    })()
  `);

	await wait(1200);

	return elegido;
};

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
		module: "Operacion",
		port: 9233,
	});

	try {
		await cdp.send("Page.navigate", { url: `${base}/operations/dispatches` });
		await waitForSelector(cdp, "#massiveDispatchClosure", { timeout: 60000 });
		await wait(3000);

		if (only === "todo" || only === "boton") {
			// El encabezado completo de la tarjeta: el título y la barra donde está el botón nuevo.
			// Recortar solo la barra deja una tira de 80 px que el copiador descarta por tamaño.
			const clip = await evaluate(
				cdp,
				`(() => {
          const barra = document.querySelector('#massiveDispatchClosure')?.closest('.v-row');
          if (!barra) return null;
          const r = barra.getBoundingClientRect();
          return JSON.stringify({ x: 0, y: Math.max(0, Math.round(r.top) - 24), width: Math.round(window.innerWidth), height: Math.round(r.height) + 60, scale: 1 });
        })()`,
			);

			if (clip) {
				await screenshot(cdp, `${outputDir}/cierre_masivo_boton.png`, { clip: JSON.parse(clip) });
				console.log("  capturada la barra con el botón");
			}
		}

		await realClick(cdp, "#massiveDispatchClosure");
		await waitForSelector(cdp, `.v-dialog ${appField("operational_center_id")}`, { timeout: 60000 });
		await wait(2000);

		// La fecha de hoy y un centro con despachos de barrido: sin acotar, la primera página se
		// llena con los de días anteriores y las capturas no muestran el caso que se documenta.
		console.log(`  fecha de hoy: ${await pickToday(cdp) ? "puesta" : "no se pudo poner"}`);

		await openSelect(cdp, `.v-dialog ${appField("operational_center_id")}`);
		await selectOption(cdp, center);
		await wait(1500);

		// Servicio y turno también son obligatorios. Sin `--servicio` / `--turno` se toma la
		// primera opción: sirve para que la búsqueda se dispare, pero si la tabla sale vacía es
		// justamente lo primero que hay que fijar a mano.
		console.log(`  servicio: ${JSON.stringify(await chooseFilter(cdp, "service_id", service))}`);
		console.log(`  turno: ${JSON.stringify(await chooseFilter(cdp, "shift_id", shift))}`);

		await realClick(cdp, "#searchCloseableDispatches");

		// La tabla pinta una fila de "sin datos" mientras no hay resultados: se espera a que
		// aparezca una fila con casilla, que solo existe con datos reales.
		await waitForSelector(cdp, ".v-dialog tbody tr td input[type=checkbox]", { timeout: 25000 }).catch(() => {});
		await wait(1500);

		const rows = await evaluate(cdp, "document.querySelectorAll('.v-dialog tbody tr td input[type=checkbox]').length");

		console.log(`  candidatos en la tabla: ${rows}`);
		if (!rows)
			console.log("  AVISO: sin candidatos. Usa una empresa con despachos sin vehículo abiertos.");

		if (only === "todo" || only === "pantalla") {
			await screenshot(cdp, `${outputDir}/cierre_masivo_pantalla.png`, { selector: DIALOG, margin: 0 });
			console.log("  capturada la pantalla del cierre masivo");
		}

		if ((only === "todo" || only === "tripulacion") && rows) {
			// El bloque de la tripulación es más alto que la ventana del manual: con el alto de
			// siempre, la captura recorta a media tarjeta y deja ver la página de atrás. Se sube el
			// alto y se mantiene el ancho, que es lo que hace que las imágenes se vean parejas.
			await setViewport(cdp, { width: VIEWPORT.width, height: 1500 });
			await wait(1200);

			// La flecha de la última columna despliega la tripulación del despacho.
			await realClick(cdp, ".v-dialog tbody tr:first-child td:last-child button");
			await waitForSelector(cdp, ".v-dialog tbody tr td[colspan] .v-chip", { timeout: 20000 }).catch(() => {});
			await wait(2000);

			await screenshot(cdp, `${outputDir}/cierre_masivo_tripulacion.png`, {
				selector: ".v-dialog tbody tr td[colspan]",
				margin: 0,
			});
			console.log("  capturado el bloque de tripulación");

			// Se vuelve a plegar para que la tabla quede limpia en las siguientes capturas.
			await realClick(cdp, ".v-dialog tbody tr:first-child td:last-child button");
			await wait(1200);

			await setViewport(cdp, VIEWPORT);
			await wait(1200);
		}

		if ((only === "todo" || only === "modal") && rows) {
			await realClick(cdp, ".v-dialog thead input[type=checkbox]");
			await wait(1500);

			// El cierre se confirma desde el botón de acción del pie del diálogo.
			await evaluate(cdp, `
        (() => {
          const boton = [...document.querySelectorAll('.v-dialog .v-card-actions button')]
            .find(b => b.textContent.trim() === 'Guardar');
          boton?.click();
        })()
      `);
			await wait(4000);

			// El diálogo de confirmación es el último de la pila de superposiciones; el panel es el
			// primero, y apuntar a la tarjeta sin acotar devuelve la del panel entero.
			await screenshot(cdp, `${outputDir}/cierre_masivo_modal.png`, {
				selector: ".v-overlay-container > .v-overlay:last-of-type .v-card",
				margin: 0,
			});
			console.log("  capturado el modal de la fecha de cierre");
		}

		console.log(`\nCapturas en ${outputDir}`);
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		console.error(`Pantalla:\n${await describeScreen(cdp).catch(() => "(no disponible)")}`);
		throw error;
	}
	finally {
		await closeBrowser(cdp, chrome);
	}
};

main().catch((error) => {
	console.error(`\nFallo: ${error.message}`);
	process.exit(1);
});
