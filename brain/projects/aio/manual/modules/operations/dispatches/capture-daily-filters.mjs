/**
 * Captura de los filtros de la Gestion Diaria (Operaciones > Despachos > Gestion Diaria).
 *
 * Los filtros se limpian en cascada: al cambiar la fecha o el turno se descarta la ruta, y al
 * **vaciar** el codigo del vehiculo tambien. La ruta solo acota la busqueda, y dejarla puesta
 * restringe el listado por algo que el usuario cree haber quitado.
 *
 * Eso aplica a la modalidad por vehiculo, que es la que cubre este flujo. En la modalidad por
 * usuario/operador la ruta **no** se limpia al vaciar la tripulacion, porque ahi es un criterio
 * de busqueda por si sola: basta indicar tripulacion o ruta, y se exige al menos una de las dos.
 *
 * Sirve sobre todo como prueba de esa cascada:
 *   1. Con vehiculo y ruta puestos, borrar el vehiculo deja la ruta vacia.
 *   2. Reemplazarlo por otro sin vaciarlo **conserva** la ruta: se esta refinando, no quitando.
 *   3. Cambiar el turno descarta la ruta (lo que ya hacia antes).
 * Una corrida limpia termina en `hallazgos (0)`.
 *
 * Uso:
 *   node modules/operations/dispatches/capture-daily-filters.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" [--turno "DEMO-Tarde"] [--vehiculo V-027] [--otro-vehiculo V-014]
 *
 * `--turno` tiene que ser uno con rutas cuya frecuencia cubra hoy, o el buscador de ruta vuelve
 * vacio y no hay nada que comprobar.
 */

import { clickAt, closeBrowser, evaluate, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { DIALOG, clickChecked } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	appField,
	describeScreen,
	goTo,
	menuMessages,
	openSession,
	pickOptionByName,
	searchFetcherSelect,
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
const shift = arg("turno", "DEMO-Tarde");
const vehicleCode = arg("vehiculo", "V-027");
const otherVehicleCode = arg("otro-vehiculo", "V-014");

/** Prefijo del modulo; en los datos de prueba la tarjeta dice "Operacione", sin la s. */
const moduleName = arg("modulo", "Operacion");

const DISPATCHES_VIEW = "/operations/dispatches";

/** El buscador de ruta del formulario. `AioDataFetcherSelect` conserva el `name` como `id`. */
const ROUTE_INPUT = `${DIALOG} #route_select`;

/** El campo de codigo de vehiculo, que `AppTextField` reescribe con un sufijo aleatorio. */
const VEHICLE_INPUT = `${DIALOG} [id^="app-text-field-vehicle_code-"]`;

const findings = [];
const check = (ok, what) => {
	console.log(`  ${ok ? "OK   " : "FALLA"} ${what}`);
	if (!ok) findings.push(what);
};

/**
 * Estado de los filtros, leido del componente y no del DOM.
 *
 * La ruta es un objeto en `dataForm.selectedRoute`: en el DOM Vuetify la pinta en un
 * `.v-select__selection` y el `input` queda vacio al perder el foco, con lo que mirar el input
 * daria un falso "se limpio".
 *
 * @returns {Promise<{vehicle_code: string|null, route: string|null, shift_id: number|null}|null>}
 */
const filterState = (cdp) =>
	evaluate(
		cdp,
		`(() => {
      const node = document.querySelector('${DIALOG} form');
      let instance = node && node.__vueParentComponent;
      while (instance && !(instance.setupState && instance.setupState.dataForm)) instance = instance.parent;
      if (!instance) return null;
      const form = instance.setupState.dataForm.value ?? instance.setupState.dataForm;
      return {
        vehicle_code: form.vehicle_code ?? null,
        route: form.selectedRoute ? (form.selectedRoute.route_data ?? String(form.selectedRoute.id)) : null,
        shift_id: form.shift_id ?? null,
      };
    })()`,
	);

/**
 * Escribe en el campo de codigo de vehiculo.
 *
 * El reemplazo va en **un solo** evento, sin pasar por vacio: es lo que hace un select-all y
 * teclear encima. Vaciarlo primero disparia la cascada y limpiaria la ruta, que es justo lo que
 * la comprobacion 3 quiere descartar.
 */
const typeVehicle = async (cdp, text) => {
	const point = await evaluate(
		cdp,
		`(() => { const i = document.querySelector('${VEHICLE_INPUT}');
      if (!i) return null;
      i.scrollIntoView({ block: 'center' });
      const r = i.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!point) throw new Error(`No se encontro el campo de codigo de vehiculo.\n${await describeScreen(cdp)}`);

	await clickAt(cdp, point.x, point.y);
	await evaluate(
		cdp,
		`(() => { const i = document.querySelector('${VEHICLE_INPUT}');
      i.value = ${JSON.stringify(text)};
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true; })()`,
	);
	await wait(600);
};

/**
 * Vacia el campo de codigo de vehiculo con su boton de limpiar, que es lo que hace el usuario.
 *
 * Se usa el boton y no un `input` vacio a proposito: el `clearable` de Vuetify deja el modelo en
 * `null` y teclear hasta borrar lo deja en `''`. La cascada tiene que funcionar con los dos, y este
 * es el camino real.
 */
const clearVehicle = async (cdp) => {
	const point = await evaluate(
		cdp,
		`(() => { const i = document.querySelector('${VEHICLE_INPUT}');
      const clear = i && i.closest('.v-field')?.querySelector('.v-field__clearable .v-icon, .v-field__clearable');
      if (!clear) return null;
      const r = clear.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!point) throw new Error("No se encontro el boton de limpiar del codigo de vehiculo");

	await clickAt(cdp, point.x, point.y);
	await wait(700);
};

/** Elige una ruta en el buscador, tecleando un termino. */
const pickRoute = async (cdp, term) => {
	const options = await searchFetcherSelect(cdp, ROUTE_INPUT, term);

	if (!options.length) {
		throw new Error(
			`El buscador de ruta no ofrecio nada para "${term}". Menu: ${JSON.stringify(await menuMessages(cdp))}\n` +
				"Prueba con otro --turno: hace falta uno con rutas cuya frecuencia cubra hoy.",
		);
	}

	const point = await evaluate(
		cdp,
		`(() => { const item = document.querySelector('.v-overlay--active .v-list-item');
      if (!item) return null;
      const r = item.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	await clickAt(cdp, point.x, point.y);
	await wait(700);

	return options[0];
};

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

		await clickChecked(cdp, "button:has(.tabler-clipboard-text), button:has(.tabler-calendar-event)", {
			what: "el boton de Gestion Diaria",
		}).catch(async () => {
			// El boton no tiene una clase de icono fija: se busca por su texto.
			const point = await evaluate(
				cdp,
				`(() => { const b = [...document.querySelectorAll('button')]
            .find(e => /gesti[oó]n diaria/i.test(e.textContent) && e.getBoundingClientRect().width > 0);
          if (!b) return null;
          const r = b.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
			);

			if (!point) throw new Error(`No se encontro el boton de Gestion Diaria.\n${await describeScreen(cdp)}`);

			await clickAt(cdp, point.x, point.y);
		});

		await waitUntil(cdp, `document.querySelector('${DIALOG} form')`, {
			timeout: 60000,
			what: "el formulario de Gestion Diaria",
		});
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });

		await pickOptionByName(cdp, `${DIALOG} ${appField("shift_id")}`, shift);

		// --- 1. Vehiculo y ruta puestos.
		await typeVehicle(cdp, vehicleCode);

		const route = await pickRoute(cdp, "DEMO");

		console.log(`  ruta elegida: ${route}`);

		const conAmbos = await filterState(cdp);

		console.log(`  con ambos: ${JSON.stringify(conAmbos)}`);
		check(!!conAmbos.vehicle_code && !!conAmbos.route, "el formulario queda con vehiculo y ruta");

		await screenshot(cdp, `${outputDir}/gestion_diaria_filtros.png`);

		// --- 2. Al vaciar el vehiculo se limpia la ruta.
		await clearVehicle(cdp);

		const trasLimpiar = await filterState(cdp);

		console.log(`  tras limpiar el vehiculo: ${JSON.stringify(trasLimpiar)}`);
		check(trasLimpiar.route === null, "al vaciar el codigo de vehiculo se limpia la ruta");

		// --- 3. Cambiar el vehiculo por otro conserva la ruta.
		await typeVehicle(cdp, vehicleCode);
		await pickRoute(cdp, "DEMO");
		await typeVehicle(cdp, otherVehicleCode);

		const trasCambiar = await filterState(cdp);

		console.log(`  tras cambiar de vehiculo: ${JSON.stringify(trasCambiar)}`);
		check(trasCambiar.route !== null, "reemplazar el vehiculo sin vaciarlo conserva la ruta");

		// --- 4. Cambiar el turno sigue descartando la ruta.
		await pickOptionByName(cdp, `${DIALOG} ${appField("shift_id")}`, shift === "DEMO-Tarde" ? "DEMO-Mañana" : shift);

		const trasTurno = await filterState(cdp);

		console.log(`  tras cambiar el turno: ${JSON.stringify(trasTurno)}`);
		check(trasTurno.route === null, "cambiar el turno sigue descartando la ruta");

		// --- 5. Cambiar la modalidad descarta la ruta, que es de la otra clase de servicio.
		await typeVehicle(cdp, vehicleCode);
		await pickRoute(cdp, "DEMO");
		await clickChecked(cdp, `${DIALOG} #dispatch_modality`, { what: "el interruptor de modalidad" });
		await wait(700);

		const trasModalidad = await filterState(cdp);

		console.log(`  tras cambiar la modalidad: ${JSON.stringify(trasModalidad)}`);
		check(trasModalidad.route === null, "cambiar la modalidad descarta la ruta");
		check(trasModalidad.vehicle_code === null, "cambiar la modalidad descarta el codigo de vehiculo");

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
