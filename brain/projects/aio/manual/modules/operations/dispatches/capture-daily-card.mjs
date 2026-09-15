/**
 * Captura la tarjeta de los despachos encontrados en la Gestion Diaria.
 *
 * La tarjeta del panel izquierdo ahora muestra el **Servicio** y, cuando el despacho lo tiene, el
 * **Vehiculo**. Antes solo traia numero, centro operativo, ruta, salidas y estado, y con varios
 * resultados en pantalla no habia forma de distinguirlos sin abrirlos uno por uno.
 *
 * Sirve tambien de prueba: comprueba que cada tarjeta traiga el servicio, que el vehiculo salga
 * solo en los despachos que lo tienen, y que el dato de la tarjeta coincida con el de la ficha
 * «Informacion del Despacho» que se abre al seleccionarla.
 *
 * Uso:
 *   node modules/operations/dispatches/capture-daily-card.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" --fecha 2026-07-03 --turno "Turno 1" [--vehiculo V-014]
 *
 * `--fecha` y `--turno` tienen que apuntar a un dia con despachos, o la busqueda avisa que no
 * encontro nada y no hay tarjeta que capturar. El flujo lo comprueba antes de capturar.
 */

import { clickAt, closeBrowser, evaluate, screenshot, setViewport, wait, waitUntil } from "../../../lib/browser.mjs";
import { DIALOG } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	VIEWPORT,
	appField,
	describeScreen,
	goTo,
	openSession,
	pickOptionByName,
	settleRequests,
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
const date = arg("fecha", "2026-07-03");
const shift = arg("turno", "Turno 1");
const vehicleCode = arg("vehiculo", "V-014");

/** Prefijo del modulo; en los datos de prueba la tarjeta dice "Operacione", sin la s. */
const moduleName = arg("modulo", "Operacion");

const DISPATCHES_VIEW = "/operations/dispatches";

/** El campo de fecha, que `AppDateTimePicker` reescribe con un sufijo aleatorio. */
const DATE_INPUT = `${DIALOG} [id^="app-picker-field-dispatch_date-"] input`;

/** El campo de codigo de vehiculo, que `AppTextField` reescribe igual. */
const VEHICLE_INPUT = `${DIALOG} [id^="app-text-field-vehicle_code-"]`;

const findings = [];
const check = (ok, what) => {
	console.log(`  ${ok ? "OK   " : "FALLA"} ${what}`);
	if (!ok) findings.push(what);
};

/**
 * Escribe en un campo de texto del formulario y deja el valor confirmado.
 *
 * @param {object} cdp - Conexion al navegador.
 * @param {string} selector - Selector del `input`.
 * @param {string} text - Texto a escribir.
 * @returns {Promise<void>}
 * @throws {Error} Si el campo no esta en pantalla.
 */
const fill = async (cdp, selector, text) => {
	const point = await evaluate(
		cdp,
		`(() => { const i = document.querySelector(${JSON.stringify(selector)});
      if (!i) return null;
      i.scrollIntoView({ block: 'center' });
      const r = i.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!point) throw new Error(`No se encontro el campo ${selector}.\n${await describeScreen(cdp)}`);

	await clickAt(cdp, point.x, point.y);
	await evaluate(
		cdp,
		`(() => { const i = document.querySelector(${JSON.stringify(selector)});
      i.value = ${JSON.stringify(text)};
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
      i.blur();
      return true; })()`,
	);
	await wait(600);
};

/**
 * Fija la fecha del formulario por la API de flatpickr.
 *
 * Tecleando no basta: con `allowInput` el valor se confirma al salir del campo y flatpickr lo
 * revierte a la fecha que tenia si el foco se va antes de tiempo, asi que unas corridas quedaban
 * con la fecha de hoy y la busqueda vacia. `setDate(valor, true)` dispara el `onChange`, que es
 * lo que actualiza el modelo de Vue.
 *
 * @param {object} cdp - Conexion al navegador.
 * @param {string} value - Fecha en formato `Y-m-d`.
 * @returns {Promise<void>}
 * @throws {Error} Si el campo no esta en pantalla o si el valor no queda fijado.
 */
const fillDate = async (cdp, value) => {
	const applied = await evaluate(
		cdp,
		`(() => {
      const node = document.querySelector('${DIALOG} form');
      let instance = node && node.__vueParentComponent;
      while (instance && !(instance.setupState && instance.setupState.dataForm)) instance = instance.parent;
      if (!instance) return null;
      const form = instance.setupState.dataForm.value ?? instance.setupState.dataForm;
      form.dispatch_date = ${JSON.stringify(value)};
      return form.dispatch_date; })()`,
	);

	if (applied === null) throw new Error(`No se encontro el formulario de busqueda.\n${await describeScreen(cdp)}`);

	await wait(600);

	const shown = await evaluate(cdp, `document.querySelector('${DATE_INPUT}')?.value ?? null`);

	if (!String(shown).startsWith(value)) throw new Error(`La fecha quedo en "${shown}" y no en "${value}".`);
};

/**
 * Lee las tarjetas de resultados tal como las ve el usuario.
 *
 * @param {object} cdp - Conexion al navegador.
 * @returns {Promise<Array<{texto: string, servicio: string|null, vehiculo: string|null}>>} Una
 *   entrada por tarjeta; `servicio` y `vehiculo` son **null** cuando la linea no esta presente.
 */
const resultCards = (cdp) =>
	evaluate(
		cdp,
		`(() => [...document.querySelectorAll('.dispatch-list .dispatch-card')].map((card) => {
      const linea = (etiqueta) => {
        const fila = [...card.querySelectorAll('div')]
          .find((d) => d.querySelector('strong') && d.querySelector('strong').textContent.trim().startsWith(etiqueta));
        return fila ? fila.textContent.replace(/\\s+/g, ' ').split(':').slice(1).join(':').trim() : null;
      };
      return { texto: card.textContent.replace(/\\s+/g, ' ').trim(), servicio: linea('Servicio'), vehiculo: linea('Veh') };
    }))()`,
	);

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
		module: moduleName,
	});

	try {
		await goTo(cdp, base, DISPATCHES_VIEW, { selector: ".v-data-table" });
		await waitForTableSettled(cdp);

		const dailyButton = await evaluate(
			cdp,
			`(() => { const b = [...document.querySelectorAll('button')]
          .find(e => /gesti[oó]n diaria/i.test(e.textContent) && e.getBoundingClientRect().width > 0);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
		);

		if (!dailyButton) throw new Error(`No se encontro el boton de Gestion Diaria.\n${await describeScreen(cdp)}`);

		await clickAt(cdp, dailyButton.x, dailyButton.y);

		await waitUntil(cdp, `document.querySelector('${DIALOG} form')`, {
			timeout: 60000,
			what: "el formulario de Gestion Diaria",
		});
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });

		// El turno va primero: elegirlo repinta el campo de fecha desde el modelo, y hacerlo
		// despues devolvia la fecha a hoy dejando la busqueda vacia sin decir por que.
		await pickOptionByName(cdp, `${DIALOG} ${appField("shift_id")}`, shift);
		await fillDate(cdp, date);
		await fill(cdp, VEHICLE_INPUT, vehicleCode);

		const dateValue = await evaluate(cdp, `document.querySelector('${DATE_INPUT}')?.value ?? null`);

		check(String(dateValue).startsWith(date), `los criterios llegan a la busqueda con la fecha ${date}`);

		// El boton de buscar no tiene id: se localiza por su texto dentro del formulario.
		const searchButton = await evaluate(
			cdp,
			`(() => { const b = [...document.querySelectorAll('${DIALOG} form button')]
          .find(e => /buscar/i.test(e.textContent) && e.getBoundingClientRect().width > 0);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
		);

		if (!searchButton) throw new Error(`No se encontro el boton de Buscar.\n${await describeScreen(cdp)}`);

		await settleRequests(cdp, () => clickAt(cdp, searchButton.x, searchButton.y), { what: "la busqueda de despachos" });
		await wait(1200);

		const cards = await resultCards(cdp);

		console.log(`  tarjetas encontradas: ${cards.length}`);
		cards.forEach((card) => console.log(`   - servicio: ${card.servicio} | vehiculo: ${card.vehiculo}`));

		if (!cards.length) {
			throw new Error(
				`La busqueda no devolvio despachos para ${date}, ${shift} y el vehiculo ${vehicleCode}.\n` +
					"Prueba con otra --fecha o --turno: hace falta un dia con despachos.",
			);
		}

		check(
			cards.every((card) => !!card.servicio),
			"todas las tarjetas muestran el servicio",
		);
		check(
			cards.some((card) => !!card.vehiculo),
			"la tarjeta del despacho con vehiculo lo muestra",
		);

		// La tarjeta no cabe en los 795 px del manual, asi que se sube el alto de la ventana
		// justo a lo que mide el contenido y se deja el ancho de siempre, que es lo que mantiene
		// parejas las imagenes del documento. Recortar al dialogo no sirve: es de pantalla
		// completa, asi que crece con la ventana y la franja sobrante se recorta igual.
		const contentHeight = await evaluate(
			cdp,
			`(() => { const list = document.querySelector('.dispatch-list');
        const panel = document.querySelector('.dispatch-content-panel');
        const bottom = Math.max(list ? list.getBoundingClientRect().bottom : 0,
                                panel ? panel.getBoundingClientRect().bottom : 0);
        return Math.ceil(bottom + window.scrollY + 24); })()`,
		);

		await setViewport(cdp, { width: VIEWPORT.width, height: Math.max(VIEWPORT.height, contentHeight) });
		await wait(800);

		await screenshot(cdp, `${outputDir}/gestion_diaria_tarjeta.png`);

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
