/**
 * Captura del formulario de alta de una sucursal (Clientes > fila > Sucursales > Agregar), con los
 * campos Comuna y Barrio.
 *
 * Uso:
 *   node --experimental-websocket modules/respel/branches/capture-form.mjs --salida <carpeta>
 *        [--empresa "PROMOCALI"] [--cliente 9] [--nombre-cliente "CLINICA VERSALLES"]
 *        [--municipio CALI] [--comuna "Comuna 2"] [--barrio Versalles]
 *
 * No guarda nada: llena el primer paso del asistente para que se vea la cascada Municipio ->
 * Comuna -> Barrio, captura y cierra.
 */

import { clickAt, closeBrowser, evaluate, screenshot, setViewport, wait, waitUntil } from "../../../lib/browser.mjs";
import { TOP_DIALOG, clickChecked, dialogCount, waitForDialogAbove } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	VIEWPORT,
	describeScreen,
	goTo,
	openSession,
	searchFetcherSelect,
	testCredentials,
	type,
} from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "PROMOCALI");
const clientId = Number(arg("cliente", "9"));
const clientName = arg("nombre-cliente", "CLINICA VERSALLES");
const municipality = arg("municipio", "CALI");
const commune = arg("comuna", "Comuna 2");
const neighborhood = arg("barrio", "Versalles");

/** Datos de ejemplo de la sucursal. No se guardan: solo llenan la captura. */
const SAMPLE = {
	Nombre: "CLINICA VERSALLES - SEDE NORTE",
	"Dirección": "AV 5AN # 23 - 70",
	Telefono: "6024860808",
	Correo: "sedenorte@clinicaversalles.com.co",
};

/**
 * Marca el `input` que sigue a una etiqueta del diálogo más alto y devuelve un selector para él.
 *
 * En este formulario las etiquetas son `<label class="v-label">` hermanas del campo, tanto en los
 * `AppTextField` como en los `AioDataFetcherSelect`, y los `id` cambian en cada render. Compara sin
 * tildes ni mayúsculas: las traducciones cambian de "Telefono" a "Teléfono" sin aviso.
 *
 * @param {object} cdp - Conexión al navegador.
 * @param {string} label - Texto exacto de la etiqueta.
 * @returns {Promise<string>} Selector del `input`. Lanza si la etiqueta no está en el diálogo.
 */
async function fieldByLabel(cdp, label) {
	const mark = `branch-${label.normalize("NFD").replace(/[^\w]/g, "")}`;
	const found = await evaluate(
		cdp,
		`(() => {
			const dialog = ${TOP_DIALOG};
			if (!dialog) return false;
			const norm = t => t.normalize("NFD").replace(/\\p{Diacritic}/gu, "").trim().toLowerCase();
			const etiqueta = [...dialog.querySelectorAll('label.v-label')]
				.find(e => norm(e.textContent) === norm(${JSON.stringify(label)}));
			const input = etiqueta?.nextElementSibling?.querySelector('input')
				?? etiqueta?.parentElement?.querySelector('input');
			if (!input) return false;
			input.setAttribute('data-captura', ${JSON.stringify(mark)});

			return true;
		})()`,
	);

	if (!found) throw new Error(`No se encontró el campo "${label}" en el formulario de sucursal`);

	return `[data-captura="${mark}"]`;
}

/**
 * Elige una opción exacta en un `AioDataFetcherSelect` del formulario.
 *
 * @param {object} cdp - Conexión al navegador.
 * @param {string} label - Etiqueta del campo.
 * @param {string} option - Texto exacto de la opción; también es lo que se teclea.
 * @returns {Promise<void>} Lanza si el buscador no ofrece la opción.
 */
async function pickFetcher(cdp, label, option) {
	const selector = await fieldByLabel(cdp, label);
	const options = await searchFetcherSelect(cdp, selector, option);

	if (!options.some((text) => text.trim() === option))
		throw new Error(`"${label}" no ofreció "${option}". Devolvió: ${options.join(" | ")}`);

	// Exacta, no por inclusión: buscando "CALI" la primera coincidencia es "SAN CALIXTO".
	const point = await evaluate(
		cdp,
		`(() => {
			const item = [...document.querySelectorAll('.v-overlay--active .v-list-item')]
				.find(e => e.textContent.trim() === ${JSON.stringify(option)});
			if (!item) return '';
			const r = item.getBoundingClientRect();

			return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
		})()`,
	);

	if (!point) throw new Error(`La opción "${option}" de "${label}" no está en el menú abierto`);

	const { x, y } = JSON.parse(point);

	await clickAt(cdp, x, y);
	await wait(900);
}

async function run() {
	const { email, password } = testCredentials();
	let cdp;
	let chrome;

	try {
		({ cdp, chrome } = await openSession({
			base,
			email,
			password,
			company,
			module: "Green",
			width: VIEWPORT.width,
			height: VIEWPORT.height,
		}));

		await goTo(cdp, base, "/respel/clients", { selector: "tbody tr" });
		await wait(2500);

		// El cliente puede estar en cualquiera de las miles de páginas. Se llama a la misma función
		// que usa la opción Sucursales del menú de la fila, con el mismo diálogo.
		const before = await dialogCount(cdp);
		const opened = await evaluate(
			cdp,
			`(() => {
				let c = document.querySelector('tbody tr')?.__vueParentComponent;
				while (c && typeof c.setupState?.openBranchesModal !== 'function') c = c.parent;
				if (!c) return false;
				c.setupState.openBranchesModal({ id: ${clientId}, name: ${JSON.stringify(clientName)} });

				return true;
			})()`,
		);

		if (!opened) throw new Error("No se encontró openBranchesModal en la vista de clientes");
		if (!(await waitForDialogAbove(cdp, before))) throw new Error("El diálogo de sucursales no abrió");

		await waitUntil(cdp, `!!document.querySelector('.v-dialog #Agregar')`, {
			timeout: 30000,
			what: "el botón Agregar de sucursales",
		});
		await wait(2000);

		const withList = await dialogCount(cdp);

		await clickChecked(cdp, ".v-dialog #Agregar", { what: "el botón Agregar de sucursales" });

		if (!(await waitForDialogAbove(cdp, withList))) throw new Error("El asistente de sucursal no abrió");

		await waitUntil(
			cdp,
			`(() => { const d = ${TOP_DIALOG}; return !!d && [...d.querySelectorAll('label.v-label')].some(e => e.textContent.trim() === 'Barrio'); })()`,
			{ timeout: 30000, what: "el campo Barrio del formulario de sucursal" },
		);
		await wait(1000);

		for (const [label, value] of Object.entries(SAMPLE)) await type(cdp, await fieldByLabel(cdp, label), value);

		await pickFetcher(cdp, "Municipio", municipality);
		await pickFetcher(cdp, "Comuna", commune);
		await pickFetcher(cdp, "Barrio", neighborhood);

		// Se confirma en el estado del formulario, no en el input: Vuetify vacía el input al salir.
		const chosen = await evaluate(
			cdp,
			`(() => {
				const d = ${TOP_DIALOG};
				let c = d?.querySelector('form')?.__vueParentComponent;
				while (c && !c.setupState?.branchInfoCopy) c = c.parent;
				const b = c?.setupState?.branchInfoCopy;

				return JSON.stringify(b ? { municipality_id: b.municipality_id, commune_id: b.commune_id, neighborhood_id: b.neighborhood_id } : null);
			})()`,
		);

		console.log("seleccion en el formulario:", chosen);

		const parsed = JSON.parse(chosen ?? "null");

		if (!parsed?.municipality_id || !parsed?.commune_id || !parsed?.neighborhood_id)
			throw new Error(`La cascada no quedó completa: ${chosen}`);

		await evaluate(cdp, `document.activeElement && document.activeElement.blur()`);
		await wait(800);

		// El formulario no cabe en los 795 px: se sube el alto y se recorta al asistente.
		await setViewport(cdp, { width: VIEWPORT.width, height: 1100 });
		await wait(1200);
		await screenshot(cdp, `${outputDir}/sucursal-formulario.png`, {
			clip: JSON.parse(
				await evaluate(
					cdp,
					`(() => { const r = ${TOP_DIALOG}.querySelector('.v-card').getBoundingClientRect();
						return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }); })()`,
				),
			),
		});
		console.log("captura: sucursal-formulario");
	} catch (error) {
		console.error("\nFallo:", error.message);

		if (cdp) {
			await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
			console.error("\nEstado de la pantalla:\n", await describeScreen(cdp).catch(() => "(no se pudo leer)"));
		}

		process.exitCode = 1;
	} finally {
		if (cdp) await closeBrowser(cdp, chrome).catch(() => {});
	}
}

run();
