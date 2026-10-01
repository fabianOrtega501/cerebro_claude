/**
 * Capturas de la auditoría de firmas del acuerdo de fidelización (Respel > Comercial > Clientes >
 * Gestiones de Cliente > Fidelización).
 *
 * Uso:
 *   node --experimental-websocket modules/respel/client-loyalties/capture-signature-audit.mjs
 *        --salida <carpeta> [--empresa "La Fabrica de Software"]
 *        [--cliente "Conjunto Residencial Villa Campestre"] [--acuerdo 5]
 *        [--solo acciones|auditoria|todo]
 *
 * No modifica nada: solo consulta y captura. Necesita un acuerdo con firmas suficientes para que la
 * barra del quórum diga algo; el manual explica el ejemplo de 102 firmas de 120 suscriptores, y el
 * flujo avisa si el resumen que lee no cuadra con eso.
 */

import {
	clearHighlights,
	clickAt,
	closeBrowser,
	evaluate,
	highlight,
	screenshot,
	setViewport,
	wait,
	waitUntil,
} from "../../../lib/browser.mjs";
import { TOP_DIALOG, dialogCount, shotTopDialog, waitForDialogAbove } from "../../../lib/dialogs.mjs";
import { runSql } from "../../../lib/seed.mjs";
import {
	DEFAULT_BASE,
	VIEWPORT,
	describeScreen,
	goTo,
	openSession,
	testCredentials,
	waitForTableSettled,
} from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "La Fabrica de Software");
const clientName = arg("cliente", "Conjunto Residencial Villa Campestre");
const agreementId = String(arg("acuerdo", "5"));
const only = arg("solo", "todo");

const wants = (name) => only === "todo" || only === name;

/** Lo que el manual cuenta del ejemplo: 102 firmas de 120 suscriptores. */
const EXPECTED = { total: "120", signed: "102" };

/**
 * La auditoría es un modal de 1300 px con el resumen, diez firmantes y la paginación: no cabe en
 * los 795 px del manual. Se sube el alto y se conserva el ancho de siempre.
 */
const TALL = { width: VIEWPORT.width, height: 1250 };

/**
 * Marca la fila del acuerdo en el listado de Fidelización del diálogo de arriba.
 *
 * Se ubica por la columna ID y no por el texto de la fila: los números sueltos (24 meses, 120
 * suscriptores) aparecen en varias celdas y un `includes` agarraría la fila equivocada.
 *
 * @returns {Promise<boolean>} - `false` si el acuerdo no está en la página visible del listado.
 */
const markAgreementRow = (cdp) =>
	evaluate(
		cdp,
		`(() => {
			const d = ${TOP_DIALOG};
			if (!d) return false;
			const table = [...d.querySelectorAll('table')].find(t => t.getClientRects().length > 0);
			if (!table) return false;
			const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim().toUpperCase());
			const column = headers.indexOf('ID');
			if (column < 0) return false;
			const row = [...table.querySelectorAll('tbody tr')]
				.find(tr => tr.children[column]?.textContent.trim() === ${JSON.stringify(agreementId)});
			if (!row) return false;
			row.setAttribute('data-capture-row', '1');

			return true;
		})()`,
	);

/**
 * Centro del botón de auditoría de la fila marcada, si está suelto y no dentro del menú de puntos.
 *
 * La tabla estándar solo desborda a partir de la quinta acción visible, y cuántas se ven depende
 * del estado del acuerdo y del usuario.
 *
 * @returns {Promise<{x: number, y: number}|null>} - `null` si la acción quedó en el menú.
 */
const inlineAuditButton = (cdp) =>
	evaluate(
		cdp,
		`(() => {
			const btn = [...document.querySelectorAll('[data-capture-row] .v-signature-audit')]
				.find(b => b.getBoundingClientRect().width > 0);
			if (!btn) return null;
			const r = btn.getBoundingClientRect();

			return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
		})()`,
	);

/**
 * Abre la auditoría desde la fila marcada, esté la acción suelta o en el menú de tres puntos.
 *
 * @returns {Promise<void>} - Lanza si no encuentra la acción o si el diálogo no abre.
 */
async function openAudit(cdp) {
	const before = await dialogCount(cdp);
	const inline = await inlineAuditButton(cdp);

	if (inline) {
		console.log("accion de auditoria: boton suelto en la fila");
		await clickAt(cdp, inline.x, inline.y);
	}
	else {
		console.log("accion de auditoria: dentro del menu de tres puntos");

		const dots = await evaluate(
			cdp,
			`(() => {
				const b = [...document.querySelectorAll('[data-capture-row] .v-info')].find(e => e.getBoundingClientRect().width > 0);
				if (!b) return null;
				const r = b.getBoundingClientRect();

				return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
			})()`,
		);

		if (!dots) throw new Error(`La fila del acuerdo #${agreementId} no tiene la accion de auditoria: revisar su estado`);

		await clickAt(cdp, dots.x, dots.y);
		await wait(700);

		const item = await evaluate(
			cdp,
			`(() => {
				const e = [...document.querySelectorAll('.v-list-item')]
					.filter(x => x.getClientRects().length > 0)
					.find(x => x.textContent.trim().toLowerCase().includes('auditoría de firmas'));
				if (!e) return null;
				const r = e.getBoundingClientRect();

				return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
			})()`,
		);

		if (!item) throw new Error("El menu de tres puntos no trae la opcion Auditoria de firmas");

		await clickAt(cdp, item.x, item.y);
	}

	if (!await waitForDialogAbove(cdp, before)) throw new Error("La auditoria de firmas no abrio");
}

async function run() {
	const { email, password } = testCredentials();
	let cdp;
	let chrome;

	try {
		const clientId = Number(await runSql(
			`select id from clients where name = '${clientName.replace(/'/g, "''")}' order by id limit 1;`,
			{ tuplesOnly: true },
		));

		if (!clientId) throw new Error(`No hay un cliente llamado "${clientName}" en la base local`);

		({ cdp, chrome } = await openSession({
			base,
			email,
			password,
			company,
			module: "Green",
			width: TALL.width,
			height: TALL.height,
		}));

		await goTo(cdp, base, "/respel/clients", { selector: "tbody tr" });

		if (!await waitForTableSettled(cdp)) throw new Error("El listado de clientes no termino de cargar");

		// El cliente puede estar en cualquier página del listado. En vez de paginar o filtrar, se
		// llama a la misma función que usa la opción Gestiones de Cliente del menú de la fila: abre
		// el mismo diálogo, con el mismo cliente, sin depender del orden de la tabla.
		const opened = await evaluate(
			cdp,
			`(() => {
				let c = document.querySelector('tbody tr')?.__vueParentComponent;
				while (c && typeof c.setupState?.openClientManagements !== 'function') c = c.parent;
				if (!c) return false;
				c.setupState.openClientManagements(${clientId});

				return true;
			})()`,
		);

		if (!opened) throw new Error("No se encontro openClientManagements en la vista de clientes");
		if (!await waitForDialogAbove(cdp, 0)) throw new Error("Gestiones de Cliente no abrio");

		// El @click del paso está en un div de Vue: con el velo entrando, el ratón no siempre llega.
		// Un click sintético sí lo dispara, y después se confirma que el paso cambió.
		await waitUntil(
			cdp,
			`(() => { const d = ${TOP_DIALOG}; return !!d && d.textContent.includes('Fidelización'); })()`,
			{ timeout: 30000, what: "los pasos de Gestiones de Cliente" },
		);
		await wait(1000);
		await evaluate(
			cdp,
			`(() => {
				const d = ${TOP_DIALOG};
				const t = [...d.querySelectorAll('*')]
					.find(e => e.children.length === 0 && e.textContent.trim() === 'Fidelización');
				t?.click();

				return !!t;
			})()`,
		);
		await waitUntil(
			cdp,
			`(() => { const d = ${TOP_DIALOG}; return !!d && d.textContent.includes('Fidelización del Cliente'); })()`,
			{ timeout: 30000, what: "el paso Fidelizacion" },
		);

		if (!await waitForTableSettled(cdp, { within: ".v-dialog" })) throw new Error("El listado de acuerdos no termino de cargar");

		// La tabla de acuerdos llega después de montar el paso: se reintenta un rato antes de rendirse.
		let marked = false;

		for (let attempt = 0; attempt < 20 && !marked; attempt++) {
			marked = await markAgreementRow(cdp);
			if (!marked) await wait(500);
		}

		if (!marked) throw new Error(`El acuerdo #${agreementId} no aparece en la primera pagina de Fidelizacion`);

		if (wants("acciones")) {
			if (await inlineAuditButton(cdp)) {
				await highlight(cdp, "[data-capture-row] .v-signature-audit", { padding: 6 });
				await shotTopDialog(cdp, `${outputDir}/acciones.png`, 0);
				await clearHighlights(cdp);
				console.log("captura: acciones");
			}
			else {
				console.log("aviso: la accion esta en el menu de tres puntos; acciones.png no se genera");
			}
		}

		if (!wants("auditoria")) return;

		await openAudit(cdp);

		// La tabla de firmantes pinta un esqueleto hasta su primera respuesta: se espera a que haya
		// filas con datos y no quede ningún esqueleto, sostenido un momento.
		const loaded = `(() => {
			const d = ${TOP_DIALOG};
			if (!d || d.querySelector('.v-skeleton-loader')) return false;
			const rows = [...d.querySelectorAll('tbody tr')]
				.filter(tr => tr.getClientRects().length > 0)
				.filter(tr => !/no data available|sin datos|no hay datos/i.test(tr.textContent));

			return rows.length > 0;
		})()`;

		await waitUntil(cdp, loaded, { timeout: 60000, what: "la tabla de firmantes" });
		await wait(1500);
		await waitUntil(cdp, loaded, { timeout: 30000, what: "la tabla de firmantes, sostenida" });

		const state = await evaluate(
			cdp,
			`(() => {
				const d = ${TOP_DIALOG};
				const r = d.getBoundingClientRect();
				const card = d.querySelector('.v-card');

				return {
					cards: [...d.querySelectorAll('.text-h4')].map(e => e.textContent.trim()),
					expandable: !!d.querySelector('.v-dialog-expand-btn'),
					width: Math.round(r.width),
					overflow: card ? card.scrollHeight - card.clientHeight : 0,
					scrollHeight: card ? card.scrollHeight : 0,
				};
			})()`,
		);

		console.log("resumen leido:", JSON.stringify(state));

		// Comprobación del ajuste: la auditoría es un modal con expandir, no una pantalla completa.
		if (state.width >= TALL.width - 20)
			throw new Error(`La auditoria abrio a pantalla completa (${state.width} px): la rama no tiene el modal expandible`);
		if (!state.expandable) throw new Error("La auditoria no trae el boton de expandir");

		if (state.cards[0] !== EXPECTED.total || state.cards[1] !== EXPECTED.signed)
			console.log(`aviso: el resumen dice ${state.cards[1]} de ${state.cards[0]}; el manual explica ${EXPECTED.signed} de ${EXPECTED.total}`);

		// Si el contenido no cabe, la tarjeta hace scroll por dentro y el recorte saldría cortado:
		// se agranda la ventana lo justo, sin tocar el ancho.
		if (state.overflow > 0) {
			await setViewport(cdp, { width: TALL.width, height: Math.min(TALL.height + state.overflow + 60, 2400) });
			await wait(1200);
		}

		// Los botones de expandir y cerrar asoman por la esquina superior derecha de la tarjeta: el
		// recorte se amplía solo por arriba y por la derecha. Un margen parejo metería por la
		// izquierda y por abajo la vista de clientes que queda detrás del velo.
		await evaluate(cdp, `document.activeElement?.blur()`);

		const clip = await evaluate(
			cdp,
			`(() => { const r = (${TOP_DIALOG}).getBoundingClientRect();
				return { x: Math.floor(r.x), y: Math.max(0, Math.floor(r.y - 12)),
					width: Math.ceil(r.width + 12), height: Math.ceil(r.height + 12) }; })()`,
		);

		await screenshot(cdp, `${outputDir}/auditoria-firmas.png`, { clip });
		console.log("captura: auditoria-firmas");

		// Expandido: a 1300 px las últimas columnas quedan tras el scroll horizontal, y ver la
		// tabla completa es justo para lo que está el botón. Se usa el alto del contenido para no
		// dejar una franja en blanco debajo.
		await setViewport(cdp, { width: TALL.width, height: Math.min(state.scrollHeight, TALL.height) });
		await wait(800);
		await evaluate(cdp, `(${TOP_DIALOG})?.querySelector('.v-dialog-expand-btn')?.click()`);
		await waitUntil(
			cdp,
			`(() => { const d = ${TOP_DIALOG}; return !!d && d.getBoundingClientRect().width >= window.innerWidth - 2; })()`,
			{ timeout: 10000, what: "el modal expandido" },
		);
		await wait(1200);
		await evaluate(cdp, `document.activeElement?.blur()`);
		await screenshot(cdp, `${outputDir}/auditoria-firmas-expandida.png`);
		console.log("captura: auditoria-firmas-expandida");

		console.log("\nListo. Capturas en", outputDir);
	}
	catch (error) {
		console.error("\nFallo:", error.message);

		if (cdp) {
			await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
			console.error("\nEstado de la pantalla:\n", await describeScreen(cdp).catch(() => "(no se pudo leer)"));
		}

		process.exitCode = 1;
	}
	finally {
		if (cdp) await closeBrowser(cdp, chrome).catch(() => {});
	}
}

run();
