/**
 * Capturas de la Autorizacion de fidelizacion (Respel > Clientes > Gestiones > Fidelizacion).
 *
 * La decision de la Direccion Comercial se toma en una ventana propia que solo aparece sobre
 * acuerdos en "Pendiente de Autorizacion", y solo si el usuario tiene marcada la clasificacion
 * de Director Comercial. Sin esas dos condiciones el candado no se pinta y no hay nada que
 * capturar: el flujo lo comprueba y lo dice, en vez de fallar con un timeout.
 *
 * Uso:
 *   node --experimental-websocket modules/respel/client-loyalties/capture.mjs --salida <carpeta>
 *        [--empresa "PROMOCALI"] [--cliente "Prueba Catastro"]
 *        [--solo tabla|aprobar|rechazar|todo|sin-elementos] [--acuerdo 5]
 *
 * Solo lee: abre la ventana y la fotografia, nunca confirma la decision. Los valores
 * presentables del acuerdo los deja `seed.sql`, que hay que aplicar antes.
 */

import {
	clearHighlights,
	closeBrowser,
	evaluate,
	highlight,
	screenshot,
	wait,
	waitForSelector,
} from "../../../lib/browser.mjs";
import { clickChecked, shotTopDialog } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	type as typeInto,
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
const company = arg("empresa", "PROMOCALI");
const clientName = arg("cliente", "Prueba Catastro");
const only = arg("solo", "todo");
const agreementId = arg("acuerdo", "5");

/** Boton del candado. Las acciones de la fila ya no llevan `title`: el nombre va en `aria-label`. */
const AUTHORIZE_BUTTON = 'button[aria-label="Autorización de fidelización"]';

/** Contenedor del formulario de la ventana. `.v-dialog` no sirve para esperar: es `position: fixed`. */
const DIALOG_FORM = ".authorization-form";

const wants = (name) => only === "todo" || only === name;


/**
 * Filtra el listado de clientes por nombre con el buscador de la tabla.
 * Hace falta porque el listado tiene 126 paginas y el cliente del escenario no cae en la primera.
 *
 * @param {object} cdp - Conexion al navegador.
 * @param {string} name - Nombre por el que filtrar.
 */
async function searchClient(cdp, name) {
	await evaluate(
		cdp,
		`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Buscar')?.click()`,
	);
	await waitForSelector(cdp, ".v-dialog .v-card", { timeout: 20000 });
	await wait(1200);

	// Los campos del buscador llevan `id` con el patron `app-text-field-<campo>-<hash>`.
	const NAME_FIELD = '.v-dialog [id^="app-text-field-name-"]';

	await waitForSelector(cdp, NAME_FIELD, { timeout: 20000 });

	await typeInto(cdp, NAME_FIELD, name);

	await evaluate(
		cdp,
		`(() => {
			const dialog = document.querySelector('.v-dialog .v-card');
			const button = [...dialog.querySelectorAll('button')].find(b => b.innerText.trim() === 'Buscar');

			button?.click();
		})()`,
	);

	await wait(2500);
	await waitForTableSettled(cdp);
}

/**
 * Abre el asistente de gestiones del cliente indicado desde el listado de clientes.
 * Falla con un mensaje propio si el cliente no esta en la primera pagina del listado.
 *
 * @param {object} cdp - Conexion al navegador.
 * @param {string} name - Razon social del cliente, tal como se lee en la tabla.
 */
async function openClientManagements(cdp, name) {
	await goTo(cdp, base, "/respel/clients", { selector: "table tbody tr" });
	await waitForTableSettled(cdp);
	await searchClient(cdp, name);

	// El menu de acciones de la fila es un IconBtn `tabler-dots` con clase `.v-info`.
	const opened = await evaluate(
		cdp,
		`(() => {
			const row = [...document.querySelectorAll('table tbody tr')]
				.find(r => r.innerText.includes(${JSON.stringify(name)}));

			if (!row) return 'sin-fila';

			const button = row.querySelector('.v-info');

			if (!button) return 'sin-boton';

			button.click();

			return 'ok';
		})()`,
	);

	if (opened !== "ok") {
		throw new Error(
			`No se pudo abrir el menu de acciones del cliente "${name}" (${opened}). ` +
				`Usa --cliente con uno que aparezca en la primera pagina del listado.`,
		);
	}

	await wait(800);

	const entered = await evaluate(
		cdp,
		`(() => {
			const item = [...document.querySelectorAll('.v-list-item')]
				.find(e => e.innerText.trim().startsWith('Gestiones de'));

			if (!item) return false;

			item.click();

			return true;
		})()`,
	);

	if (!entered) throw new Error('No aparecio la opcion "Gestiones de Cliente" en el menu de la fila.');

	await wait(2500);
}

/**
 * Situa el asistente en el paso de Fidelizacion. Los pasos se pueden pulsar directamente:
 * `AppStepper` no valida el paso activo en esta pantalla.
 *
 * @param {object} cdp - Conexion al navegador.
 */
async function goToLoyaltyStep(cdp) {
	const clicked = await evaluate(
		cdp,
		`(() => {
			const title = [...document.querySelectorAll('.step-title, .stepper-title')]
				.find(e => e.textContent.trim() === 'Fidelización');

			if (!title) return false;

			const step = title.closest('.cursor-pointer') || title.parentElement;

			step.click();

			return true;
		})()`,
	);

	if (!clicked) throw new Error('No se encontro el paso "Fidelización" en el asistente de gestiones.');

	await wait(2500);
	await waitForTableSettled(cdp);
}

/**
 * Comprueba que hay al menos un acuerdo con el candado visible.
 * Sin el, el usuario no es Director Comercial o ningun acuerdo esta pendiente.
 *
 * @param {object} cdp - Conexion al navegador.
 * @returns {Promise<number>} - Cuantos acuerdos admiten decision.
 */
const authorizableRows = (cdp) =>
	evaluate(cdp, `document.querySelectorAll('${AUTHORIZE_BUTTON}').length`).then(Number);

async function run() {
	const { email, password } = testCredentials();
	let cdp = null;
	let chrome = null;

	try {
		({ cdp, chrome } = await openSession({ base, email, password, company }));

		await openClientManagements(cdp, clientName);
		await goToLoyaltyStep(cdp);

		const pending = await authorizableRows(cdp);

		console.log("acuerdos con decision pendiente:", pending);

		if (!pending) {
			throw new Error(
				"Ningun acuerdo muestra el candado de autorizacion. Comprueba que el usuario tenga " +
					'marcada la clasificacion "Director Comercial" y que exista un acuerdo en ' +
					'"Pendiente de Autorización" para este cliente.',
			);
		}

		if (wants("tabla")) {
			// La tabla desborda a lo ancho y la columna de acciones queda fuera de vista: sin este
			// desplazamiento la captura sale con el encabezado y sin el candado que hay que senalar.
			await evaluate(
				cdp,
				`(() => {
					const wrapper = document.querySelector('.v-table__wrapper');

					if (wrapper) wrapper.scrollLeft = wrapper.scrollWidth;
				})()`,
			);
			await wait(900);

			await highlight(cdp, AUTHORIZE_BUTTON, { label: "1", padding: 8 });
			await screenshot(cdp, `${outputDir}/acciones-tabla.png`);
			await clearHighlights(cdp);
		}

		// Vista aparte, fuera de "todo": abre un acuerdo concreto sin elementos pactados, cuya ventana no
		// ofrece decidir. La fila se elige por su id, porque el primer candado puede ser de otro acuerdo.
		if (only === "sin-elementos") {
			const opened = await evaluate(
				cdp,
				`(() => {
					const row = [...document.querySelectorAll('.v-dialog tbody tr')]
						.find(r => [...r.querySelectorAll('td')].some(td => td.textContent.trim() === ${JSON.stringify(agreementId)}));
					const button = row && [...row.querySelectorAll('${AUTHORIZE_BUTTON}')]
						.find(b => b.getBoundingClientRect().width > 0);

					if (!button) return false;

					button.click();

					return true;
				})()`,
			);

			if (!opened) throw new Error(`El acuerdo ${agreementId} no muestra el candado de autorizacion.`);

			await waitForSelector(cdp, DIALOG_FORM, { timeout: 30000 });
			await wait(2500);

			const radios = await evaluate(cdp, `document.querySelectorAll('.v-overlay--active .v-radio').length`);

			if (radios > 0) throw new Error(`El acuerdo ${agreementId} ofrece decidir: ¿tiene elementos pactados?`);

			await shotTopDialog(cdp, `${outputDir}/modal-sin-elementos.png`);
			console.log("listo:", outputDir);

			return;
		}

		// La ventana se abre una sola vez y se fotografia en sus dos estados.
		await clickChecked(cdp, AUTHORIZE_BUTTON, { what: "candado de autorizacion" });
		await waitForSelector(cdp, DIALOG_FORM, { timeout: 30000 });
		await wait(1200);

		if (wants("aprobar")) await shotTopDialog(cdp, `${outputDir}/modal-aprobar.png`);

		if (wants("rechazar")) {
			const switched = await evaluate(
				cdp,
				`(() => {
					const label = [...document.querySelectorAll('.v-radio label, .v-label')]
						.find(e => e.textContent.trim() === 'Rechazar');

					if (!label) return false;

					label.click();

					return true;
				})()`,
			);

			if (!switched) throw new Error('No se encontro la opcion "Rechazar" en la ventana.');

			// El campo de notas se muestra al marcar Rechazar; sin el, la captura no prueba nada.
			await waitForSelector(cdp, "textarea", { timeout: 15000 });
			await wait(900);
			await shotTopDialog(cdp, `${outputDir}/modal-rechazar.png`);
		}

		console.log("listo:", outputDir);
	} catch (error) {
		if (cdp) {
			await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
			console.error("pantalla:", await describeScreen(cdp).catch(() => "no disponible"));
		}

		console.error("Fallo:", error.message);
		process.exitCode = 1;
	} finally {
		if (cdp || chrome) await closeBrowser(cdp, chrome);
	}
}

run();
