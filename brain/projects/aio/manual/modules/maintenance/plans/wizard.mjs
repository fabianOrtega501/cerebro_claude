/**
 * Navegación del wizard de Planes de Mantenimiento, compartida por los flujos del módulo.
 *
 * Aquí vive todo lo que sabe de la pantalla —cómo se llega a la pestaña Planes, cómo se abre
 * el wizard de una fila y cómo se salta entre pasos— para que `capture.mjs` y
 * `capture-crud.mjs` no lo dupliquen.
 */

import { clickAt, evaluate, screenshot, wait, waitForSelector, waitUntil } from "../../../lib/browser.mjs";
import { describeScreen } from "../../../lib/session.mjs";

/** La vista del maestro de Planes. */
export const PLANS_VIEW = "/maintenance/plans";

/** El diálogo es `position: fixed`: hay que esperar algo de adentro, no el contenedor. */
export const DIALOG = ".v-dialog .v-card";

/**
 * Rótulo de un paso del `AppStepper`.
 *
 * **No es `.stepper-icon-step`**: esa clase solo se pinta cuando el paso trae `icon`, y los
 * de este wizard no lo traen, así que caen en la rama numerada del componente. El elemento
 * que responde al click es el ancestro `.cursor-pointer`, pero el evento burbujea, así que
 * basta con hacer click sobre el propio rótulo.
 */
export const STEP_TITLE = ".app-stepper .step-title";

/**
 * Centro en pantalla del elemento, o `null` si no existe.
 *
 * @param {string} selector - Selector CSS
 * @param {number} [index] - Cuál de los elementos que cumplen el selector
 * @returns {Promise<{x: number, y: number}|null>} Coordenadas **de pantalla**, en píxeles
 */
export const centerOf = (cdp, selector, index = 0) =>
	evaluate(
		cdp,
		`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

/**
 * Centro en pantalla del primer elemento cuyo texto contenga `text`.
 *
 * @param {string} selector - Selector CSS de los candidatos
 * @param {string} text - Fragmento de texto, sin distinguir mayúsculas
 * @returns {Promise<{x: number, y: number}|null>} `null` si no hay ninguno visible
 */
export const centerOfText = (cdp, selector, text) =>
	evaluate(
		cdp,
		`(() => {
      const needle = ${JSON.stringify(text)}.toLowerCase();
      const e = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .filter(x => x.getClientRects().length > 0)
        .find(x => x.textContent.toLowerCase().includes(needle));
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

/**
 * Centro en pantalla del botón de acción de la fila cuyo texto contiene `text`.
 *
 * Solo mira filas y botones **visibles**: `DataTable` monta además una variante de tarjetas
 * para móvil que vive oculta en el DOM con las mismas clases, y sus botones devuelven un
 * rectángulo en 0,0 — el click cae entonces sobre el velo del diálogo y no pasa nada.
 *
 * @param {string} text - Parte del contenido de la fila, por ejemplo el nombre del plan
 * @param {string} [action] - Clase del botón: `.v-show`, `.v-update` o `.v-delete`
 * @returns {Promise<{x: number, y: number}|null>} `null` si no hay esa fila visible o no
 *          tiene ese botón
 */
export const rowActionButton = (cdp, text, action = ".v-update") =>
	evaluate(
		cdp,
		`(() => {
      const filas = [...document.querySelectorAll('tbody tr')]
        .filter(tr => tr.getClientRects().length > 0)
        .filter(tr => tr.textContent.includes(${JSON.stringify(text)}));
      // El encabezado del diálogo es \`position: fixed\`: una fila que quede debajo devuelve
      // coordenadas correctas pero el click se lo lleva la cabecera. Se centra la fila antes.
      if (filas[0]) filas[0].scrollIntoView({ block: 'center' });
      for (const row of filas) {
        // Cada fila trae el bloque de acciones dos veces —la tabla de escritorio y la
        // variante de tarjetas para móvil—, y una de las dos está oculta: hay que recorrer
        // todos los botones, no quedarse con el primero.
        for (const btn of row.querySelectorAll(${JSON.stringify(action)})) {
          const r = btn.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }
      }
      return null;
    })()`,
	);

/**
 * Activa la pestaña Planes de la vista.
 *
 * La vista monta dos pestañas y entra en Tipos de planes, que tiene su propia tabla: sin
 * este paso se busca el plan en la tabla equivocada. El rótulo de la otra pestaña también
 * contiene "Planes", así que la comparación es exacta.
 *
 * @returns {Promise<boolean>} `false` si no existe la pestaña; hay que comprobarlo
 */
export const openPlansTab = async (cdp) => {
	const tab = await evaluate(
		cdp,
		`(() => {
      const e = [...document.querySelectorAll('.v-tab')]
        .find(x => x.textContent.trim().toLowerCase() === 'planes');
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
	);

	if (!tab) return false;

	// Recién navegado el click no prende: hay que confirmar que la pestaña quedó activa.
	for (let attempt = 0; attempt < 6; attempt++) {
		await clickAt(cdp, tab.x, tab.y);
		await wait(1200);

		const active = await evaluate(cdp, `document.querySelector('.v-tab--selected')?.textContent?.trim().toLowerCase()`);
		if (active === "planes") return true;
	}

	return false;
};

/**
 * Espera a que la tabla traiga la fila del plan buscado.
 *
 * No basta con esperar filas: la pestaña de Tipos de planes tiene su propia tabla con las
 * mismas clases, así que una espera genérica se cumple sobre la tabla equivocada.
 *
 * @param {string} text - Fragmento del nombre del plan tal como lo pinta la celda
 * @returns {Promise<number>} Cuántas filas coinciden
 * @throws Si no aparece dentro del tiempo esperado
 */
export const waitForPlanRow = async (cdp, text) => {
	const deadline = Date.now() + 60000;

	while (Date.now() < deadline) {
		const rows = await evaluate(
			cdp,
			`[...document.querySelectorAll('tbody tr')].filter(tr => tr.textContent.includes(${JSON.stringify(text)})).length`,
		);

		if (rows > 0) return rows;
		await wait(500);
	}

	throw new Error(`No apareció el plan "${text}" en la tabla. Pantalla:
${await describeScreen(cdp)}`);
};

/**
 * Espera a que el wizard esté montado con sus pasos.
 *
 * @param {number} [timeout] - Tiempo máximo en milisegundos
 * @returns {Promise<void>}
 * @throws Si el wizard no monta a tiempo
 */
export const waitForWizard = async (cdp, timeout = 60000) => {
	await waitForSelector(cdp, DIALOG, { timeout });
	await waitUntil(cdp, `document.querySelectorAll('${STEP_TITLE}').length > 0`, {
		timeout,
		what: "los pasos del wizard",
	});
};

/**
 * Abre el wizard de un plan desde la tabla.
 *
 * @param {string} planName - Fragmento del nombre del plan
 * @param {"update"|"show"} [mode] - Cuál de los dos botones de la fila se pulsa
 * @returns {Promise<void>}
 * @throws Si no existe la fila, o si el wizard no monta
 */
export const openWizardFor = async (cdp, planName, mode = "update") => {
	const button = await rowActionButton(cdp, planName, mode === "show" ? ".v-show" : ".v-update");
	if (!button) throw new Error(`No se encontró la fila del plan "${planName}". Pantalla:\n${await describeScreen(cdp)}`);

	await clickAt(cdp, button.x, button.y);
	await waitForWizard(cdp);
};

/**
 * Baja hasta el final todo lo que tenga scroll dentro del diálogo abierto.
 *
 * Hace falta antes de pulsar Anterior / Siguiente: `DialogComponent` pinta su barra de
 * acciones con `.footer-dialog`, que es `position: fixed` a lo ancho de la ventana y con
 * `z-index: 999`, así que se lleva el click de cualquier botón que quede en esa franja. Con
 * el scroll abajo los botones del paso suben por encima de la barra y sí reciben el click.
 *
 * @returns {Promise<void>}
 */
export const scrollDialogToBottom = async (cdp) => {
	await evaluate(
		cdp,
		`(() => {
      document.querySelectorAll('.v-overlay__content, .v-dialog *').forEach(e => {
        if (e.scrollHeight > e.clientHeight + 20) e.scrollTop = e.scrollHeight;
      });
      return true;
    })()`,
	);
	await wait(500);
};

/**
 * Rótulos de los pasos, en orden, y cuál está activo.
 *
 * @returns {Promise<{labels: string[], active: number}>} `active` es `-1` si ninguno tiene
 *          la clase de paso activo, lo que solo pasa si el wizard todavía no montó
 */
export const stepperState = (cdp) =>
	evaluate(
		cdp,
		`(() => {
      const items = [...document.querySelectorAll('.app-stepper .v-slide-group-item, .app-stepper .v-slide-group__content > *')];
      const titles = [...document.querySelectorAll('${STEP_TITLE}')];
      const labels = titles.map(e => e.textContent.trim());
      const active = titles.findIndex(e => e.closest('.stepper-steps-active'));
      return { labels, active };
    })()`,
	);

/**
 * Lleva el wizard al paso con ese rótulo, avanzando o retrocediendo un paso a la vez.
 *
 * **Los pasos del `AppStepper` no son clicables aquí.** `PlansWizard` le pasa
 * `is-active-step-valid`, lo que activa su modo de validación y anula el `@click` de cada
 * paso: el único camino es el par de botones Siguiente / Anterior del formulario.
 *
 * Avanzar pasa por la validación del paso actual, así que desde el paso Planes solo se
 * sigue si sus campos obligatorios están completos.
 *
 * @param {string} label - Rótulo del paso tal como aparece en pantalla
 * @returns {Promise<boolean>} `false` si el paso no existe, o si tras varios intentos el
 *          wizard no se movió (típicamente porque la validación del paso actual lo frena)
 */
export const goToStep = async (cdp, label) => {
	for (let attempt = 0; attempt < 12; attempt++) {
		const { labels, active } = await stepperState(cdp);

		const target = labels.indexOf(label);
		if (target < 0) return false;
		if (active === target) return true;

		await scrollDialogToBottom(cdp);

		const button = await centerOfText(cdp, ".v-dialog .v-btn", active < target ? "Siguiente" : "Anterior");
		if (!button) return false;

		await clickAt(cdp, button.x, button.y);

		// El cambio de paso desmonta un formulario y monta otro: hay que esperar a que el
		// stepper lo refleje, no solo a que el click ocurra.
		const moved = await waitUntil(
			cdp,
			`(() => {
        const titles = [...document.querySelectorAll('${STEP_TITLE}')];
        return titles.findIndex(e => e.closest('.stepper-steps-active')) !== ${active};
      })()`,
			{ timeout: 15000, what: `el paso ${label}` },
		).then(() => true).catch(() => false);

		if (!moved) return false;

		await wait(900);
	}

	return false;
};

/**
 * Guarda una captura del diálogo abierto, quitando antes el anillo de foco.
 *
 * Vuetify devuelve el foco al botón que abrió el diálogo, y en la imagen ese anillo se lee
 * como si el botón estuviera activado.
 *
 * @param {string} path - Ruta del PNG a escribir
 * @param {string} [selector] - Qué recortar; por defecto el diálogo del wizard
 * @returns {Promise<void>}
 */
export const shot = async (cdp, path, selector = DIALOG) => {
	await evaluate(cdp, `document.activeElement?.blur()`);
	await screenshot(cdp, path, { selector });
};
