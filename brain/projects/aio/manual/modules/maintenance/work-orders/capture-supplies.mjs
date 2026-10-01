/**
 * Capturas del buscador de suministros de una orden de trabajo (Mantenimiento > Órdenes de trabajo).
 *
 * El campo Suministro del diálogo "Agregar Suministros" ahora encuentra por código interno,
 * código externo, nombre y descripción, y cada opción se lista como `(código) nombre`. Este flujo
 * abre el diálogo, escribe un término y captura el menú desplegado.
 *
 * Sirve además de prueba: comprueba que la búsqueda devuelva opciones y que vengan con el código
 * delante.
 *
 * Uso:
 *   node modules/maintenance/work-orders/capture-supplies.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" [--orden 2] [--termino DEMO-EXT]
 *        [--base http://localhost:5173] [--email <usuario>] [--password <clave>]
 *
 * La orden tiene que estar **activa y editable**: en una Ejecutada el botón de la tarjeta dice
 * Ver y no hay Agregar. Para ver cuáles hay:
 *   node lib/api.mjs get "maintenance-work-orders/v0/get-all"
 */

import { clickAt, closeBrowser, evaluate, screenshot, wait, waitForSelector } from "../../../lib/browser.mjs";
import { DIALOG, clickChecked, dialogCount, waitForDialogAbove } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	describeScreen,
	goTo,
	openSession,
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
const orderNumber = arg("orden", null);
const term = arg("termino", "DEMO-EXT");
// Hay que entrar por la tarjeta del módulo: navegando directo, la ruta responde 401 porque los
// permisos se cargan con la aplicación activa.
const moduleName = arg("modulo", "Mantenimien");

/** La vista de órdenes de trabajo. */
const WORK_ORDERS_VIEW = "/maintenance/work-orders";

/** El `input` del buscador: `AioDataFetcherSelect` pone su `name` como `id`. */
const SUPPLY_INPUT = "#supply_name";

/**
 * Pulsa el botón de editar de una fila de la tabla.
 *
 * Cada fila trae sus acciones por duplicado —tabla y tarjeta móvil—, así que hay que quedarse con
 * el botón que tenga tamaño: el oculto mide 0x0 y su click cae en el vacío.
 *
 * @param {string|null} order - Texto de la fila; con `null` se usa la primera editable
 * @returns {Promise<void>}
 * @throws {Error} Si ninguna fila tiene el botón de editar
 */
const openWorkOrder = async (cdp, order) => {
	const button = await evaluate(
		cdp,
		`(() => {
      const rows = [...document.querySelectorAll('tbody tr')]
        .filter(tr => tr.getClientRects().length > 0)
        ${order ? `.filter(tr => tr.textContent.includes(${JSON.stringify(order)}))` : ""};
      for (const row of rows) {
        for (const btn of row.querySelectorAll('.v-update')) {
          const r = btn.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }
      }
      return null;
    })()`,
	);

	if (!button) {
		throw new Error(
			`No se encontró el botón de editar${order ? ` de la orden ${order}` : ""}: la orden tiene que ` +
				`estar activa y no Ejecutada.\nPantalla:\n${await describeScreen(cdp)}`,
		);
	}

	await clickAt(cdp, button.x, button.y);
};

/**
 * Espera el botón de la tarjeta de Suministros del formulario.
 *
 * La vista no navega ni abre un diálogo: cambia `showForm` y reemplaza la tabla en la misma
 * página, así que esperar `.v-card` se cumple de inmediato con el listado todavía en pantalla.
 * Lo que sí distingue al formulario es esta tarjeta, que además es el siguiente paso del flujo.
 * El botón dice **Gestionar** cuando la orden admite cambios y **Ver** cuando no.
 *
 * @param {number} [timeout=60000] - Tiempo máximo en milisegundos
 * @returns {Promise<object>} `{ x, y, label }` del botón
 * @throws {Error} Si el formulario no monta a tiempo
 */
const waitForSuppliesCard = async (cdp, timeout = 60000) => {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const target = await evaluate(
			cdp,
			`(() => {
        // Buscar tarjetas "que contengan la palabra" no sirve: la del formulario entero y la de
        // Actividades también la contienen, y el click termina en el recuadro equivocado. El ancla
        // estable es el elemento cuyo texto **es** Suministros, y desde ahí se sube a su tarjeta.
        const titles = [...document.querySelectorAll('.v-card *')]
          .filter(e => (e.textContent || '').trim().toLowerCase() === 'suministros' && e.children.length === 0);
        const cards = titles
          .map(t => t.closest('.v-card-item') || t.closest('.v-card'))
          .filter(Boolean);
        for (const card of cards) {
          const btn = [...card.querySelectorAll('.v-btn')]
            .find(b => /^(gestionar|ver)$/i.test((b.textContent || '').trim()) && b.getBoundingClientRect().width > 0);
          if (!btn) continue;
          btn.setAttribute('data-capture-supplies', '1');
          btn.scrollIntoView({ block: 'center' });
          return { label: btn.textContent.trim() };
        }
        return null;
      })()`,
		);

		if (target) {
			// El recuadro de Suministros queda debajo del pliegue: sin llevarlo a pantalla, su
			// rectángulo cae fuera del viewport y el click se pierde sin dejar rastro.
			await wait(600);

			const rect = await evaluate(
				cdp,
				`(() => { const b = document.querySelector('[data-capture-supplies]'); if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
			);

			if (rect) return { ...rect, label: target.label };
		}

		await wait(400);
	}

	throw new Error(`No montó la tarjeta de Suministros del formulario.\nPantalla:\n${await describeScreen(cdp)}`);
};

/**
 * Pulsa el botón Agregar del diálogo de suministros.
 *
 * @returns {Promise<void>}
 * @throws {Error} Si no está el botón o el formulario no abre
 */
const openAddForm = async (cdp) => {
	const before = await dialogCount(cdp);

	const marcado = await evaluate(
		cdp,
		`(() => {
      const dialogs = [...document.querySelectorAll('.v-dialog .v-card')];
      const top = dialogs[dialogs.length - 1];
      if (!top) return false;
      const btn = [...top.querySelectorAll('.v-btn')]
        .find(b => /agregar/i.test(b.textContent || '') && b.getBoundingClientRect().width > 0);
      if (!btn) return false;
      btn.setAttribute('data-capture-add', '1');
      return true;
    })()`,
	);

	if (!marcado) {
		throw new Error(
			"El diálogo de suministros no tiene botón Agregar: la orden no admite cambios.\n" +
				`Pantalla:\n${await describeScreen(cdp)}`,
		);
	}

	// `clickChecked` comprueba con `elementFromPoint` que el click llegue al botón: el velo del
	// diálogo se lo lleva sin dejar rastro y el fallo aparecería pasos después.
	await clickChecked(cdp, "[data-capture-add]", { what: "el botón Agregar del diálogo de suministros" });
	await waitForDialogAbove(cdp, before, { timeout: 30000 });
	await waitForNoSkeletons(cdp, { within: ".v-dialog" }).catch(() => {});
	await wait(1000);
};

/**
 * Espera a que el menú del buscador deje de cargar y traiga opciones reales.
 *
 * `searchFetcherSelect` devuelve lo que haya en el menú cuando se cumple su espera, y con el
 * servidor de desarrollo frío eso suele ser el rótulo "Cargando...": capturar ahí documenta un
 * menú vacío. Se espera a que aparezca alguna opción con el formato `(código) nombre`.
 *
 * @param {number} [timeout=30000] - Tiempo máximo en milisegundos
 * @returns {Promise<string[]>} Las opciones del menú. **Vacío si se agotó el tiempo**
 */
const waitForOptions = async (cdp, timeout = 30000) => {
	const deadline = Date.now() + timeout;
	let options = [];

	while (Date.now() < deadline) {
		options = await evaluate(
			cdp,
			`[...document.querySelectorAll('.v-overlay__content .v-list-item')]
        .map(e => e.textContent.trim()).filter(Boolean)`,
		);

		if (options.some(o => o.startsWith("("))) return options;
		await wait(500);
	}

	return options;
};

/**
 * Recorte que cubre la tarjeta del diálogo y el menú de opciones.
 *
 * Vuetify monta el menú fuera de la tarjeta, así que un recorte por selector deja las opciones
 * afuera: justo lo que hay que documentar.
 *
 * @returns {Promise<object|null>} `{ x, y, width, height }` o `null` si no hay tarjeta
 */
const cardAndMenuClip = (cdp) =>
	evaluate(
		cdp,
		`(() => {
      const dialogs = [...document.querySelectorAll('.v-dialog .v-card')];
      const card = dialogs[dialogs.length - 1];
      if (!card) return null;
      const rects = [card.getBoundingClientRect()];
      const menu = document.querySelector('.v-overlay__content .v-list');
      if (menu) rects.push(menu.getBoundingClientRect());
      const x = Math.min(...rects.map(r => r.left));
      const y = Math.min(...rects.map(r => r.top));
      const right = Math.max(...rects.map(r => r.right));
      const bottom = Math.max(...rects.map(r => r.bottom));
      return {
        x: Math.max(0, Math.floor(x - 10)),
        y: Math.max(0, Math.floor(y - 10)),
        width: Math.ceil(right - x + 20),
        height: Math.ceil(bottom - y + 20),
      };
    })()`,
	);

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
		module: moduleName,
	});

	const hallazgos = [];

	try {
		await goTo(cdp, base, WORK_ORDERS_VIEW, { selector: ".v-data-table" });
		await wait(1500);

		await openWorkOrder(cdp, orderNumber);

		const card = await waitForSuppliesCard(cdp);

		console.log(`  tarjeta de Suministros: botón "${card.label}"`);

		await clickAt(cdp, card.x, card.y);
		await waitForSelector(cdp, DIALOG, { timeout: 60000 });

		// El velo de la tabla cubre el diálogo entero, botón Agregar incluido: sin esperar a que se
		// quite, el click se lo lleva el velo.
		await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
		await wait(1200);

		await openAddForm(cdp);

		// Búsqueda por código externo: la que no encontraba nada antes del ajuste.
		await searchFetcherSelect(cdp, SUPPLY_INPUT, term).catch(() => []);

		const opciones = await waitForOptions(cdp);

		// Cuántas opciones trajo el backend, que no es lo mismo que cuántas pinta el menú: Vuetify
		// filtra la lista otra vez contra el texto escrito.
		const cargadas = await evaluate(
			cdp,
			`(() => { const el = document.querySelector("#supply_name"); let c = el.__vueParentComponent;
      while (c && !(c.setupState && c.setupState.itemsToList !== undefined)) c = c.parent;
      return c ? (c.setupState.itemsToList?.value ?? []).length : -1; })()`,
		);

		console.log(`  opciones traídas del backend: ${cargadas}`);

		console.log(`  "${term}" -> ${opciones.length} opción(es): ${JSON.stringify(opciones.slice(0, 3))}`);

		if (cargadas > 0 && !opciones.some(o => o.trim().startsWith("("))) {
			hallazgos.push(
				`el backend devolvió ${cargadas} suministros pero el menú no los pinta: Vuetify vuelve a ` +
					`filtrar la lista contra el texto escrito, y "${term}" no aparece en la etiqueta`,
			);
		}
		else if (opciones.length === 0) { hallazgos.push(`la búsqueda por "${term}" no devolvió opciones`); }

		const clip = await cardAndMenuClip(cdp);

		await screenshot(cdp, `${outputDir}/suministro-buscar.png`, { clip });
		console.log("  suministro-buscar: capturado");

		console.log(`\nCapturas en ${outputDir}`);

		if (hallazgos.length) {
			console.log(`\nhallazgos (${hallazgos.length}):`);
			for (const h of hallazgos) console.log(`  - ${h}`);
		}
		else { console.log("\nhallazgos (0)"); }
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		console.error(await describeScreen(cdp).catch(() => "no se pudo describir la pantalla"));
		throw error;
	}
	finally {
		// Nunca `chrome.process.kill()`: falla con EACCES en procesos confinados y pisa el error
		// real desde el `finally`.
		await closeBrowser(cdp, chrome);
	}
};

main().catch((error) => {
	console.error(`\nFalló: ${error.message}`);
	process.exit(1);
});
