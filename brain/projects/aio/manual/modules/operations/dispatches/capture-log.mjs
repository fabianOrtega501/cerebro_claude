/**
 * Captura del Log de Despacho (Operaciones > Despachos), el historial de cambios del despacho.
 *
 * El log se abre desde la columna de acciones de la tabla y es un diálogo con una línea de
 * tiempo: una entrada por operación, con el usuario, la fecha y el detalle de los campos
 * registrados o modificados.
 *
 * Uso:
 *   node modules/operations/dispatches/capture-log.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" [--despacho 22]
 *        [--base http://localhost:5173] [--email <usuario>] [--password <clave>]
 *
 * El despacho debe tener movimientos registrados en su log. Para saber cuáles tienen:
 *   node lib/api.mjs get "dispatch-audit-logs/v0/get-all-by-dispatch/22"
 */

import { clickAt, closeBrowser, evaluate, screenshot, wait } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, goTo, openSession, testCredentials, waitForNoSkeletons } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "Empresa Demo");
const dispatchId = arg("despacho", "22");

/** La vista de despachos del módulo de Operaciones. */
const DISPATCHES_VIEW = "/operations/dispatches";

/**
 * Espera a que la tabla tenga filas de verdad.
 *
 * La tabla pinta una fila incluso sin datos (la de "No data available"), así que esperar
 * `tbody tr` se cumple de inmediato. Lo que solo existe con datos son los botones de acción.
 */
const waitForRows = async (cdp) => {
	const deadline = Date.now() + 60000;

	while (Date.now() < deadline) {
		const rows = await evaluate(cdp, `document.querySelectorAll('tbody tr button.v-log').length`);
		if (rows > 0) return rows;
		await wait(500);
	}

	throw new Error(`La tabla de despachos no cargó datos. Pantalla:\n${await describeScreen(cdp)}`);
};

/**
 * Espera a que existan elementos que cumplan el selector, contándolos.
 *
 * Alternativa a `waitForSelector` para lo que vive dentro de un diálogo: aquel exige
 * `offsetParent !== null`, y en un contenedor `position: fixed` eso es null también para los hijos.
 *
 * @param {object} cdp Conexión al navegador.
 * @param {string} selector Selector CSS a contar.
 * @param {number} timeout Milisegundos antes de rendirse.
 * @returns {Promise<number>} Cuántos elementos hay. Lanza si se agota el tiempo.
 */
const waitForCount = async (cdp, selector, timeout = 60000) => {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const count = await evaluate(cdp, `document.querySelectorAll(${JSON.stringify(selector)}).length`);
		if (count > 0) return count;
		await wait(400);
	}

	throw new Error(`Se agotó la espera de "${selector}". Pantalla:\n${await describeScreen(cdp)}`);
};

/**
 * Centro en pantalla del botón que abre el log del despacho indicado.
 *
 * Dos botones de la fila comparten la clase `v-log`: el del historial y el de Novedades. Se
 * distinguen por el ícono (`tabler-file-description` es el del log). Además cada fila trae sus
 * acciones por duplicado —escritorio y tarjeta móvil—, y la oculta mide 0x0: hay que quedarse
 * con la que tenga tamaño o el click cae sobre cualquier otra cosa.
 *
 * @param {object} cdp Conexión al navegador.
 * @param {string} id Identificador del despacho, tal como sale en la primera columna.
 * @returns {Promise<{x:number,y:number}|null>} Centro del botón, o `null` si no está.
 */
const logButtonOf = (cdp, id) =>
	evaluate(
		cdp,
		`(() => {
      const rows = [...document.querySelectorAll('tbody tr')]
        .filter(r => [...r.querySelectorAll('td')].some(c => c.textContent.trim() === ${JSON.stringify(String(id))}));
      for (const row of rows) {
        for (const b of row.querySelectorAll('button.v-log')) {
          if (!b.querySelector('.tabler-file-description')) continue;
          const r = b.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }
      }
      return null;
    })()`,
	);

/** Título del diálogo abierto, para confirmar que es el log y no otro. */
const dialogTitle = (cdp) =>
	evaluate(
		cdp,
		`(() => { const t = document.querySelector('.v-dialog .v-card-title, .v-dialog .v-toolbar-title');
      return t ? t.textContent.trim() : ''; })()`,
	);

/**
 * Etiquetas de los campos que pinta la línea de tiempo, sin repetir.
 *
 * Sirve para comprobar que la traducción se aplicó: si vuelve algo con guion bajo, esa llave
 * se quedó sin clave en el archivo de idioma y saldría en inglés en la captura.
 */
const fieldLabels = (cdp) =>
	evaluate(
		cdp,
		`(() => {
      const labels = [...document.querySelectorAll('.v-dialog .v-timeline-item strong')]
        .map(e => e.textContent.replace(/:\\s*$/, '').trim());
      return [...new Set(labels)];
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

		const button = await logButtonOf(cdp, dispatchId);
		if (!button) {
			throw new Error(
				`No se encontró el botón de log del despacho ${dispatchId}.\n` +
					`Puede que no esté en la página actual de la tabla. Pantalla:\n${await describeScreen(cdp)}`,
			);
		}

		await clickAt(cdp, button.x, button.y);

		// `waitForSelector` no sirve aquí: comprueba `offsetParent`, y dentro de un diálogo
		// `position: fixed` eso es null también para los hijos. Se cuentan los elementos.
		await waitForCount(cdp, ".v-dialog .v-timeline-item");
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });

		// La línea de tiempo pide sus datos al abrir: sin esta pausa se captura a medio pintar.
		await wait(1500);

		const title = await dialogTitle(cdp);
		const labels = await fieldLabels(cdp);
		const untranslated = labels.filter(l => /_/.test(l));

		console.log(`  diálogo: "${title}"`);
		console.log(`  campos distintos en la línea de tiempo: ${labels.length}`);

		if (untranslated.length > 0)
			console.log(`  AVISO: ${untranslated.length} campo(s) sin traducir: ${untranslated.join(", ")}`);
		else console.log("  todos los campos salieron traducidos");

		if (labels.length === 0) {
			throw new Error(
				`El log del despacho ${dispatchId} no tiene detalle que mostrar: la captura saldría vacía.\n` +
					"Elige otro despacho con --despacho.",
			);
		}

		await screenshot(cdp, `${outputDir}/despacho_log.png`);

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
