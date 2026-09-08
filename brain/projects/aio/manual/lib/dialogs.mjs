/**
 * Diálogos y tablas del AIO: lo que hace falta para conducir un `DialogComponent` y un
 * `DataTable` desde cualquier módulo.
 *
 * Vive aparte de `session.mjs` porque no tiene nada que ver con abrir la sesión: son gestos de
 * pantalla —apuntar a un botón, capturar el diálogo de arriba, bajar el scroll— que casi todos
 * los flujos necesitan y que antes cada módulo se copiaba.
 *
 * Lo genérico del navegador sigue en `browser.mjs`; lo que sabe del login y de la navegación,
 * en `session.mjs`.
 */

import { clickAt, evaluate, screenshot, wait } from "./browser.mjs";

/**
 * Lo que hay que esperar de un `DialogComponent`.
 *
 * **No sirve esperar `.v-dialog`**: `waitForSelector` comprueba `offsetParent !== null` y el
 * diálogo es `position: fixed`, así que su `offsetParent` siempre es `null` y la espera se agota
 * aunque el modal esté abierto. Hay que esperar algo de adentro.
 */
export const DIALOG = ".v-dialog .v-card";

/**
 * Expresión que resuelve al diálogo más alto de la pila.
 *
 * Se acota a los overlays que contengan un `.v-card` a propósito: los tooltips de las celdas
 * también son `.v-overlay--active`, y uno que quede abierto se llevaría el papel de "diálogo más
 * alto", con lo que a partir de ahí no se encuentra ningún botón.
 */
export const TOP_DIALOG = `(() => {
  const l = [...document.querySelectorAll('.v-overlay--active > .v-overlay__content')]
    .filter(e => e.querySelector('.v-card'));
  return l[l.length - 1] ?? null;
})()`;

/**
 * Cuántos diálogos hay abiertos. Sirve para confirmar que uno abrió o que se cerró, en vez de
 * suponerlo por una espera fija.
 *
 * @returns {Promise<number>}
 */
export const dialogCount = (cdp) =>
	evaluate(
		cdp,
		`[...document.querySelectorAll('.v-overlay--active > .v-overlay__content')].filter(e => e.querySelector('.v-card')).length`,
	);

/**
 * Espera a que se abra un diálogo **más** de los que había.
 *
 * Es la forma de confirmar que un click abrió algo, en vez de suponerlo con una espera fija: el
 * click puede haber caído sobre un velo o sobre la barra fija del pie, y entonces el fallo sale
 * pasos después y en otro sitio.
 *
 * @param {number} count - Cuántos diálogos había antes del click (`dialogCount`)
 * @param {object} [options]
 * @param {number} [options.timeout=20000] - Tiempo máximo en milisegundos
 * @returns {Promise<boolean>} `false` si se agotó el tiempo. **Hay que comprobarlo**
 */
export async function waitForDialogAbove(cdp, count, { timeout = 20000 } = {}) {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		if (await dialogCount(cdp) > count) return true;
		await wait(300);
	}

	return false;
}

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
 * Hace click en un elemento por selector, comprobando antes que el punto no esté tapado.
 *
 * Media docena de corridas fallidas de esta skill fueron clicks que caían sobre un velo, un
 * tooltip o la barra fija del pie del diálogo: el click no hace nada y el error sale pasos
 * después, lejos de su causa. Aquí falla en el sitio.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} selector - Selector del elemento
 * @param {object} [options]
 * @param {number} [options.index=0] - Cuál de los elementos que cumplen el selector
 * @param {string} [options.what] - Nombre del elemento para el mensaje de error
 * @returns {Promise<void>}
 * @throws {Error} Si el elemento no está, no tiene tamaño, o el punto lo ocupa otro elemento
 */
export async function clickChecked(cdp, selector, { index = 0, what = null } = {}) {
	const label = what ?? selector;

	const point = await evaluate(
		cdp,
		`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!e) return null; const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!point) throw new Error(`No se encontró (o no tiene tamaño) ${label}`);

	const onTop = await evaluate(
		cdp,
		`(() => { const t = document.elementFromPoint(${point.x}, ${point.y});
      const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      return !!(t && e && (e === t || e.contains(t) || t.contains(e))); })()`,
	);

	if (!onTop) throw new Error(`El punto de ${label} está tapado por otro elemento`);

	await clickAt(cdp, point.x, point.y);
}

/**
 * Centro en pantalla del primer elemento **visible** cuyo texto contenga `text`.
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
 * Centro en pantalla del botón de acción de la fila de un `DataTable` cuyo texto contiene `text`.
 *
 * Solo mira filas y botones **visibles**: `DataTable` monta además una variante de tarjetas para
 * móvil que vive oculta en el DOM con las mismas clases, y sus botones devuelven un rectángulo en
 * 0,0 — el click cae entonces sobre el velo del diálogo y no pasa nada.
 *
 * Desplaza la fila lo mínimo cuando queda tapada por la cabecera fija del diálogo.
 *
 * @param {string} text - Parte del contenido de la fila, por ejemplo el nombre del registro
 * @param {string} [action] - Clase del botón: `.v-show`, `.v-update`, `.v-delete`, `.v-process`…
 * @param {string} [scope] - Selector que acota dónde buscar las filas, por ejemplo `.v-dialog`
 * @returns {Promise<{x: number, y: number}|null>} `null` si no hay esa fila visible o no tiene
 *          ese botón
 */
export const rowActionButton = (cdp, text, action = ".v-update", scope = "") =>
	evaluate(
		cdp,
		`(() => {
      const filas = [...document.querySelectorAll('${scope ? `${scope} ` : ""}tbody tr')]
        .filter(tr => tr.getClientRects().length > 0)
        .filter(tr => tr.textContent.includes(${JSON.stringify(text)}));
      // El encabezado del diálogo es \`position: fixed\` y ocupa la franja superior: una fila
      // que quede debajo devuelve coordenadas correctas pero el click se lo lleva la cabecera.
      // Solo se desplaza cuando hace falta —centrar una fila que ya se ve la mete justo debajo
      // de esa cabecera— y se deja \`nearest\`, que la acerca lo mínimo.
      if (filas[0]) {
        const r = filas[0].getBoundingClientRect();
        if (r.top < 200 || r.bottom > window.innerHeight - 40)
          filas[0].scrollIntoView({ block: 'nearest' });
      }
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
 * Texto de la primera fila **con datos** de una tabla.
 *
 * Descarta la fila de "No data available", que `DataTable` pinta incluso vacía: una espera o una
 * comprobación sobre `tbody tr` se cumple con la tabla en blanco.
 *
 * @param {string} [scope] - Selector que acota la tabla, por ejemplo `.v-dialog`
 * @returns {Promise<string|null>} La fila en una línea, o `null` si la tabla no tiene datos
 */
export const firstRowText = (cdp, scope = "") =>
	evaluate(
		cdp,
		`(() => {
      const rows = [...document.querySelectorAll('${scope ? `${scope} ` : ""}tbody tr')]
        .filter(tr => tr.getClientRects().length > 0)
        .filter(tr => !/no data available|sin datos|no hay datos/i.test(tr.textContent));
      return rows[0] ? rows[0].innerText.replace(/\\s+/g, ' ').trim() : null;
    })()`,
	);

/**
 * Baja hasta el final todo lo que tenga scroll dentro del diálogo abierto.
 *
 * Hace falta antes de pulsar un botón del formulario: `DialogComponent` pinta su barra de acciones
 * con `.footer-dialog`, que es `position: fixed` a lo ancho de la ventana y con `z-index: 999`,
 * así que se lleva el click de cualquier botón que quede en esa franja y el síntoma es que no pasa
 * nada. Con el scroll abajo los botones suben por encima de la barra y sí reciben el click.
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
 * Devuelve el diálogo al principio de su scroll.
 *
 * Va con `scrollDialogToBottom`: bajar para que el pie fijo no tape la última fila deja los campos
 * de arriba fuera de la pantalla, y cualquier click posterior sobre ellos falla en silencio.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @returns {Promise<void>} No comprueba que hubiera algo que desplazar
 */
export const scrollDialogToTop = async (cdp) => {
	await evaluate(
		cdp,
		`(() => {
      document.querySelectorAll('.v-overlay__content, .v-dialog *').forEach(e => {
        if (e.scrollHeight > e.clientHeight + 20) e.scrollTop = 0;
      });
      return true;
    })()`,
	);
	await wait(500);
};

/**
 * Guarda una captura del diálogo abierto, quitando antes el anillo de foco.
 *
 * Vuetify devuelve el foco al botón que abrió el diálogo, y en la imagen ese anillo se lee como si
 * el botón estuviera activado.
 *
 * @param {string} path - Ruta del PNG a escribir
 * @param {string} [selector] - Qué recortar; por defecto el diálogo
 * @param {number} [margin=10] - Margen alrededor del recorte, en píxeles. **En un diálogo a
 *   pantalla completa hay que pasar `0`**: el diálogo ya ocupa la ventana, así que esos 10 px se
 *   llenan con la vista que quedó detrás y la imagen sale con una franja de otra pantalla.
 * @returns {Promise<void>}
 */
export const shotDialog = async (cdp, path, selector = DIALOG, margin = 10) => {
	await evaluate(cdp, `document.activeElement?.blur()`);
	await screenshot(cdp, path, { selector, margin });
};

/**
 * Captura el diálogo más alto de la pila, con un margen.
 *
 * No sirve un selector CSS: `.v-dialog:last-of-type` compara entre hermanos del mismo tipo y los
 * diálogos no siempre lo son, así que el recorte se calcula del elemento que resuelve `TOP_DIALOG`
 * y se le pasa a `screenshot` como `clip` explícito.
 *
 * @param {string} path - Ruta del PNG a escribir
 * @param {number} [margin=10] - Margen alrededor del diálogo, en píxeles
 * @returns {Promise<void>} No lanza si no hay diálogo: en ese caso captura la ventana completa
 */
export const shotTopDialog = async (cdp, path, margin = 10) => {
	await evaluate(cdp, `document.activeElement?.blur()`);

	const rect = await evaluate(
		cdp,
		`(() => { const e = ${TOP_DIALOG}; if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.x - ${margin})), y: Math.max(0, Math.floor(r.y - ${margin})),
               width: Math.ceil(r.width + ${margin * 2}), height: Math.ceil(r.height + ${margin * 2}) }; })()`,
	);

	await screenshot(cdp, path, rect ? { clip: rect } : {});
};
