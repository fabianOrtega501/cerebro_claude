/**
 * Captura y prueba la acción **Reabrir Despacho** (HU 11298), en la tabla y en la Gestión Diaria.
 *
 * Comprueba:
 *  1. en la tabla, que las acciones secundarias vayan al menú de puntos y que Reabrir solo lo
 *     ofrezca un despacho Cerrado, abriendo su modal desde la fila;
 *  2. en la Gestión Diaria, cargando cada despacho por el mismo camino que usa la pantalla
 *     (`dispatchService.show`), que el botón aparezca en el Cerrado en el lugar de Cerrar y no en
 *     uno abierto (CA002), y que abra el modal con el aviso y el motivo.
 * **Nunca confirma la reapertura**: cierra el modal con Cerrar.
 *
 * Uso:
 *   node --experimental-websocket modules/operations/dispatches/capture-reopen.mjs \
 *        --salida <carpeta> --empresa "<empresa>" --despacho 41 [--abierto 10]
 *
 * Requisitos: el usuario de pruebas con el permiso `/operations/reopen-dispatch` en la empresa
 * (se resuelve al iniciar sesión), `--despacho` Cerrado y en la primera página de la tabla, y
 * `--abierto` Programado o En operación.
 */

import { clearHighlights, clickAt, closeBrowser, evaluate, highlight, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { DIALOG, dialogCount, waitForDialogAbove } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	describeScreen,
	goTo,
	openSession,
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
const closedId = Number(arg("despacho", "41"));
const openId = Number(arg("abierto", "10"));
const moduleName = arg("modulo", "Operacion");

const findings = [];
const check = (ok, what) => {
	console.log(`  ${ok ? "OK   " : "FALLA"} ${what}`);
	if (!ok) findings.push(what);

	return ok;
};

/** Cierra el modal de reapertura de arriba con su botón Cerrar, sin confirmar. */
const closeReopenModal = async (cdp) => {
	await evaluate(cdp, `(() => { const cards = [...document.querySelectorAll('.v-overlay--active .v-card')].filter(c => /Reabrir Despacho/.test(c.textContent));
    [...(cards[cards.length - 1]?.querySelectorAll('button') ?? [])].find(x => /Cerrar/i.test(x.textContent))?.click(); })()`);
	await wait(800);
};

/** Título "Reabrir Despacho <n>" del modal abierto, o `null`. */
const reopenModalTitle = (cdp) =>
	evaluate(cdp, `[...document.querySelectorAll('.v-overlay--active .v-card')].map(c => c.textContent.match(/Reabrir Despacho\\s*\\d+/)?.[0]).find(Boolean) ?? null`);

/**
 * Acciones de cada fila visible de la tabla de despachos: los íconos a la vista y su estado. La
 * fila se reconoce por la celda que es exactamente su número; buscar el número como texto de la
 * fila casaría también con fechas y códigos de ruta.
 */
const tableRows = (cdp) =>
	evaluate(
		cdp,
		`(() => [...document.querySelectorAll('tbody tr')]
      .filter(tr => tr.getClientRects().length > 0 && tr.querySelector('button.v-process'))
      .map(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        const icons = [...tr.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0)
          .map(b => [...b.querySelectorAll('i')].map(i => [...i.classList].find(c => c.startsWith('tabler-'))).find(Boolean));
        return { cells, icons, status: cells.find(c => /Cerrado|Programado|En Operaci|Anulado/i.test(c)) ?? null };
      }))()`,
	);

/**
 * Abre el menú de puntos de la fila del despacho y devuelve los títulos de sus opciones.
 *
 * @returns {Promise<string[]|null>} `null` si la fila no está en la página o no tiene menú.
 */
const openRowMenu = async (cdp, id) => {
	const dots = await evaluate(
		cdp,
		`(() => {
      const tr = [...document.querySelectorAll('tbody tr')]
        .filter(r => r.getClientRects().length > 0 && r.querySelector('button.v-process'))
        .find(r => [...r.querySelectorAll('td')].some(td => td.textContent.trim() === '${id}'));
      const b = tr && [...tr.querySelectorAll('button')].find(x => x.querySelector('i.tabler-dots') && x.getBoundingClientRect().width > 0);
      if (!b) return null;
      b.scrollIntoView({ block: 'nearest' });
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
	);

	if (!dots) return null;

	await clickAt(cdp, dots.x, dots.y);
	await wait(600);

	return evaluate(cdp, `[...document.querySelectorAll('.v-overlay--active .v-list-item')].filter(o => o.getBoundingClientRect().width > 0).map(o => o.textContent.trim())`);
};

/** Íconos visibles de la tarjeta Información del Despacho, en orden, con su centro en pantalla. */
const cardButtons = (cdp) =>
	evaluate(
		cdp,
		`(() => {
      const card = [...document.querySelectorAll('.v-card')].find(c => /Informaci[oó]n del Despacho/i.test(c.textContent));
      if (!card) return null;
      return [...card.querySelectorAll('.position-absolute button')].map(b => {
        const icon = [...b.querySelectorAll('i')].map(i => [...i.classList].find(c => c.startsWith('tabler-'))).find(Boolean);
        const r = b.getBoundingClientRect();
        return { icon, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), visible: r.width > 0 };
      }).filter(b => b.visible);
    })()`,
	);

/**
 * Carga un despacho en la Gestión Diaria por el servicio de la propia pantalla, que es lo mismo
 * que pasa al elegir una tarjeta del listado, sin depender de la fecha y el turno de la búsqueda.
 *
 * @returns {Promise<string>} `ok:<estado>` o el motivo por el que no cargó.
 */
const loadDispatch = async (cdp, id) => {
	let result = null;

	await settleRequests(cdp, async () => {
		result = await evaluate(
			cdp,
			`(async () => {
        const node = document.querySelector('${DIALOG} form');
        let i = node && node.__vueParentComponent;
        while (i && !(i.setupState && 'selectedDispatch' in i.setupState && i.setupState.dispatchService)) i = i.parent;
        if (!i) return 'sin-componente';
        const r = await i.setupState.dispatchService.show(${id});
        if (!r?.data) return 'sin-despacho';
        i.setupState.dataDispatches = [r.data];
        i.setupState.selectedDispatch = r.data;
        return 'ok:' + r.data.dispatch_status;
      })()`,
			{ awaitPromise: true },
		);
	}, { what: `el despacho ${id}` });
	await wait(800);

	return result;
};

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
		module: moduleName,
	});

	try {
		await goTo(cdp, base, "/operations/dispatches", { selector: ".v-data-table" });
		await waitForTableSettled(cdp);

		// 1. Tabla: las acciones secundarias van al menú de puntos, y Reabrir solo en los Cerrados.
		// Si el despacho no está en la primera página, se pasa a 100 filas por el estado de la tabla,
		// que es lo que hace el selector de filas por página.
		const onPage = async () => (await tableRows(cdp)).some(r => r.cells.includes(String(closedId)));

		if (!(await onPage())) {
			await settleRequests(cdp, () => evaluate(
				cdp,
				`(() => {
          let i = document.querySelector('.v-data-table').__vueParentComponent;
          while (i && !(i.setupState && i.setupState.itemsMeta && i.setupState.handleItemsPerPageChange)) i = i.parent;
          if (!i) return false;
          i.setupState.itemsMeta.per_page = 100;
          i.setupState.handleItemsPerPageChange(100);
          return true;
        })()`,
			), { what: "la tabla con 100 filas" });
			await waitForTableSettled(cdp);
		}

		const rows = await tableRows(cdp);
		console.log(`Tabla: ${rows.length} filas`);

		const inlineCounts = rows.map(r => r.icons.filter(i => i !== "tabler-dots" && i !== "tabler-scale-outline").length);
		check(Math.max(...inlineCounts) <= 4, `ninguna fila muestra más de 4 acciones sueltas (máximo ${Math.max(...inlineCounts)})`);
		check(rows.every(r => !r.icons.includes("tabler-lock-open") || /Cerrado/i.test(r.status ?? "")), "Reabrir a la vista solo en filas Cerradas");

		const closedRow = rows.find(r => r.cells.includes(String(closedId)));

		if (check(!!closedRow, `el despacho ${closedId} está en la primera página`)) {
			console.log(`  íconos de la fila ${closedId}: ${closedRow.icons.join(", ")}`);

			const inlineReopen = closedRow.icons.includes("tabler-lock-open");
			const menu = inlineReopen ? null : await openRowMenu(cdp, closedId);

			console.log(`  menú: ${menu ? JSON.stringify(menu) : "(sin menú)"}`);

			if (check(inlineReopen || !!menu?.some(m => /Reabrir Despacho/.test(m)), `la fila del despacho ${closedId} ofrece Reabrir`)) {
				await screenshot(cdp, `${outputDir}/reabrir-tabla.png`);

				const before = await dialogCount(cdp);

				if (menu) {
					await evaluate(cdp, `[...document.querySelectorAll('.v-overlay--active .v-list-item')].find(o => /Reabrir Despacho/.test(o.textContent))?.click()`);
				}
				else {
					await evaluate(cdp, `[...document.querySelectorAll('tbody tr')].find(r => [...r.querySelectorAll('td')].some(td => td.textContent.trim() === '${closedId}'))?.querySelector('button.v-reopen')?.click()`);
				}

				await waitForDialogAbove(cdp, before);
				await wait(600);

				check((await reopenModalTitle(cdp)) === `Reabrir Despacho ${closedId}`, `desde la tabla abre "Reabrir Despacho ${closedId}"`);
				await closeReopenModal(cdp);
			}
		}

		// 2. Gestión Diaria.
		const dailyButton = await evaluate(
			cdp,
			`(() => { const b = [...document.querySelectorAll('button')]
          .find(e => /gesti[oó]n diaria/i.test(e.textContent) && e.getBoundingClientRect().width > 0);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
		);

		if (!dailyButton) throw new Error(`No se encontró el botón de Gestión Diaria.\n${await describeScreen(cdp)}`);

		await clickAt(cdp, dailyButton.x, dailyButton.y);
		await waitUntil(cdp, `document.querySelector('${DIALOG} form')`, { timeout: 60000, what: "la Gestión Diaria" });
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });

		// CA002: en un despacho que no está Cerrado no hay botón de reabrir.
		const openLoaded = await loadDispatch(cdp, openId);
		console.log(`Despacho ${openId}: ${openLoaded}`);
		const openIcons = ((await cardButtons(cdp)) ?? []).map(b => b.icon);
		console.log(`  íconos: ${openIcons.join(", ")}`);
		check(openLoaded !== "ok:2", `el despacho ${openId} no está Cerrado`);
		check(!openIcons.includes("tabler-lock-open"), `sin botón Reabrir en el despacho ${openId}`);

		// CA001: en el Cerrado sí, y en el lugar de Cerrar.
		const closedLoaded = await loadDispatch(cdp, closedId);
		console.log(`Despacho ${closedId}: ${closedLoaded}`);
		check(closedLoaded === "ok:2", `el despacho ${closedId} está Cerrado`);

		const buttons = (await cardButtons(cdp)) ?? [];
		const icons = buttons.map(b => b.icon);
		console.log(`  íconos: ${icons.join(", ")}`);

		const reopenIndex = icons.indexOf("tabler-lock-open");

		if (!check(reopenIndex >= 0, "el botón Reabrir aparece en la Gestión Diaria")) {
			throw new Error("Sin botón: revisar el permiso /operations/reopen-dispatch del usuario (volver a iniciar sesión) y el estado del despacho.");
		}

		check(!icons.includes("tabler-lock"), "no aparece Cerrar a la vez");

		await highlight(cdp, ".v-card .position-absolute button:has(i.tabler-lock-open)", { padding: 6 });
		await screenshot(cdp, `${outputDir}/reabrir-boton.png`);
		await clearHighlights(cdp);

		const before = await dialogCount(cdp);

		await clickAt(cdp, buttons[reopenIndex].x, buttons[reopenIndex].y);
		await waitForDialogAbove(cdp, before);
		await wait(600);

		const modal = await evaluate(
			cdp,
			`(() => {
        const cards = [...document.querySelectorAll('.v-overlay--active .v-card')].filter(c => /Reabrir Despacho/.test(c.textContent));
        const c = cards[cards.length - 1];
        if (!c) return null;
        return {
          title: c.textContent.match(/Reabrir Despacho\\s*\\d+/)?.[0] ?? null,
          warning: c.querySelector('.v-alert')?.textContent.trim() ?? null,
          reason: !!c.querySelector('textarea[name="reopen_reason"]'),
        };
      })()`,
		);

		check(modal?.title === `Reabrir Despacho ${closedId}`, `el modal se titula "Reabrir Despacho ${closedId}"`);
		check(!!modal?.warning, `muestra el aviso (${modal?.warning ?? "sin aviso"})`);
		check(!!modal?.reason, "trae el campo Motivo de la Reapertura");

		await screenshot(cdp, `${outputDir}/reabrir-modal.png`, { selector: ".v-overlay--active:last-of-type .v-card", margin: 10 }).catch(() =>
			screenshot(cdp, `${outputDir}/reabrir-modal.png`));

		await closeReopenModal(cdp);
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		throw error;
	}
	finally {
		await closeBrowser(cdp, chrome);
	}

	console.log(`\nhallazgos (${findings.length})${findings.length ? `:\n - ${findings.join("\n - ")}` : ""}`);
	if (findings.length) process.exitCode = 1;
};

main().catch((error) => {
	console.error(`Falló: ${error.message}`);
	process.exit(1);
});
