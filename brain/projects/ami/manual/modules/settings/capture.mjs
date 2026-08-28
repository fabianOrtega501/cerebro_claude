/**
 * Genera las capturas de la configuración de empresa/servidor (Multi API Empresa) para el
 * manual de usuario.
 *
 * Es la pantalla que decide contra qué backend habla la app: se abre desde el botón `+` del
 * login, se busca la empresa por NIT y al guardarla queda como la API por defecto.
 *
 * Uso:
 *   node modules/settings/capture.mjs --salida <carpeta>
 *        [--base http://localhost:5180] [--nit 123456789-0] [--solo nuevo|configurado]
 *
 * A diferencia de los demás módulos **no necesita sesión ni token**: todo pasa en /login, y el
 * endpoint de búsqueda por NIT es público. Sí necesita el dev server arriba y el backend local
 * con la empresa del `--nit` en su tabla `company_endpoints`.
 */

import {
	clearHighlights,
	click,
	clickByText,
	connectPage,
	evaluate,
	highlight,
	launchChrome,
	screenshot,
	setViewport,
	wait,
	waitForText,
} from "../../lib/browser.mjs";
import { sql, waitForTable } from "../../lib/localdb.mjs";
import { DEFAULT_BASE, type } from "../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const only = arg("solo", null); // nuevo | configurado

/**
 * NIT de una empresa que exista en el backend local. Se parte en las dos casillas que muestra
 * la pantalla: el número y el dígito de verificación.
 */
const NIT = arg("nit", "123456789-0");

/** Un NIT que no existe, para la captura del mensaje de error. */
const NIT_UNKNOWN = arg("nitInexistente", "999999999-9");

/**
 * Empresas ya configuradas, para la captura del selector.
 *
 * Se siembran en la base local (que es lo que lista la pantalla) con los mismos nombres que ya
 * aparecen en las capturas publicadas del manual, para que el documento sea coherente.
 */
const CONFIGURED = [
	{ id: 1, identification_code: NIT, name: "EMPRESA DEMO S.A.S", api: "https://api.ejemplo.local/api", is_default: 1 },
	{ id: 2, identification_code: "800000000-0", name: "EMPRESA SECUNDARIA S.A E.S.P.", api: "https://api2.ejemplo.local/api", is_default: 0 },
];

/**
 * Viewports de este módulo: más anchos y más bajos que el de los demás.
 *
 * Los documentos de Login del manual no usan el viewport de teléfono de `lib/session.mjs`, sino
 * recortes de ~470-550 px de ancho y poca altura (`Login/login.png` es de 477x563,
 * `Login/select_company.png` de 472x582). El alto se ajusta al contenido de cada pantalla en vez
 * de recortar después: la pantalla llena el viewport y la captura sale sin franjas negras.
 *
 * El del modal es más bajo porque su contenido es corto, y así el toast —que Ionic ancla al
 * borde inferior— cae junto al formulario y no a 600 px de distancia.
 */
const LOGIN_VIEWPORT = { width: 480, height: 565, mobile: true };
const MODAL_VIEWPORT = { width: 480, height: 470, mobile: true };

/** Tarjeta del login. Es el recorte que usan las capturas publicadas de esta sección. */
const LOGIN_CARD = ".div-login";

/**
 * Recorta el modal desde su borde superior hasta el último elemento útil.
 *
 * El modal ocupa toda la pantalla, así que una captura del viewport deja media imagen en negro.
 * `includeHeader` extiende el recorte hasta arriba para que salga la barra con la flecha de
 * volver, que es parte de la pantalla.
 *
 * No sirve para las capturas del toast: Ionic lo ancla al borde inferior, fuera del recorte.
 */
const modalClip = (lastSelector) => ({ selector: lastSelector, includeHeader: true, margin: 16 });

const cdpRef = {};

/**
 * Deja el documento listo para capturar.
 *
 * La preferencia de ubicación en segundo plano evita la alerta de `App.vue`, que trae
 * `backdropDismiss: false` y bloquea todos los clicks.
 */
async function prepareDocument(cdp) {
	await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
		source: `
      localStorage.setItem('CapacitorStorage.BACKGROUND_LOCATION_PERMISSION', '1');
    `,
	});
}

/**
 * Carga /login y espera a que la vista termine de arrancar.
 *
 * `LoginPage` corre en su `onMounted` las migraciones, la validación de versión y la de la API
 * por defecto; hasta que no acaba, el modal todavía no está en su estado final.
 *
 * Hay que esperar el final de verdad, no un tiempo fijo: mientras la vista está migrando, una
 * consulta desde afuera le cierra la conexión a medias ("Database closed", "no such table") y la
 * base queda sin las tablas. El indicador es el spinner que la vista muestra con `loading`.
 */
async function goToLogin(cdp) {
	await cdp.send("Page.navigate", { url: `${base}/login` });
	await waitForText(cdp, "Inicia sesión para comenzar", { timeout: 90000 });

	const deadline = Date.now() + 120000;
	while (Date.now() < deadline) {
		if (!(await evaluate(cdp, "!!document.querySelector('#box-spinner')"))) {
			await wait(1500);
			return;
		}
		await wait(500);
	}

	throw new Error("La pantalla de login no terminó de cargar (el spinner sigue visible)");
}

/** Reemplaza las empresas configuradas en la base local por las que reciba. */
async function setEndpoints(cdp, endpoints) {
	await sql(cdp, "DELETE FROM company_endpoints;");

	for (const endpoint of endpoints) {
		await sql(cdp, "INSERT INTO company_endpoints (id, identification_code, name, api, is_default) VALUES (?,?,?,?,?);", [
			endpoint.id,
			endpoint.identification_code,
			endpoint.name,
			endpoint.api,
			endpoint.is_default,
		]);
	}
}

/**
 * Prepara la base local y deja las empresas configuradas que pida el escenario.
 *
 * A propósito **no** corre las migraciones a mano: esta pantalla vive en `/login`, y
 * `LoginPage` ya las corre en su `onMounted` (migraciones, seeders y migraciones nuevas, en ese
 * orden). Repetirlas desde afuera rompe con "duplicate column name": los seeders dejan la tabla
 * `migrations` sin las claves, pero las columnas ya están puestas, así que la segunda pasada
 * intenta agregarlas de nuevo. Basta con esperar a que la app termine.
 */
async function prepareDatabase(cdp, endpoints) {
	await goToLogin(cdp);
	await waitForTable(cdp, "company_endpoints");
	await setEndpoints(cdp, endpoints);
}

/**
 * Escribe el NIT en las dos casillas de la pantalla: el número y el dígito de verificación.
 *
 * Se apunta por índice y no por la columna que las contiene porque Ionic Vue no refleja `size`
 * como atributo: `ion-col[size="8"]` no coincide con nada. Son los dos únicos campos del modal.
 */
async function typeNit(cdp, nit) {
	const [code, dv] = nit.split("-");
	await type(cdp, "ion-modal ion-input input", code, { index: 0 });
	await type(cdp, "ion-modal ion-input input", dv, { index: 1 });
	await wait(500);
}

/** Espera a que el modal esté visible. */
async function waitForModal(cdp, { timeout = 30000 } = {}) {
	// `waitForSelector` comprueba `offsetParent`, que siempre es null en un ion-modal (va con
	// position: fixed), así que se espera por el contenido.
	await waitForText(cdp, "Código Identificación", { timeout });
	await wait(1200);
}

/** Abre el modal con el botón `+` del login. */
async function openModal(cdp) {
	await click(cdp, "ion-fab-button");
	await waitForModal(cdp);
}

/**
 * Captura el toast que confirma o rechaza la búsqueda.
 *
 * `notify()` los crea con `duration: 2000`, así que no hay margen para esperas fijas: se sondea
 * cada 100 ms y se captura en cuanto aparece.
 */
async function captureToast(cdp, target, { timeout = 20000 } = {}) {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		const visible = await evaluate(cdp, "!!document.querySelector('ion-toast')");
		if (visible) return screenshot(cdp, target);
		await wait(100);
	}

	throw new Error("Timeout esperando el toast de la búsqueda");
}

const done = [];
const failed = [];

async function step(name, fn) {
	try {
		await fn();
		done.push(name);
		console.log(`  OK   ${name}`);
	}
	catch (error) {
		failed.push(`${name}: ${error.message}`);
		console.log(`  FALLA ${name} -> ${error.message.split(String.fromCharCode(10))[0]}`);
		try {
			await screenshot(cdpRef.cdp, `${outputDir}/_falla_${name}.png`);
			const text = await evaluate(cdpRef.cdp, "document.body.innerText.slice(0, 400)");
			console.log(`         pantalla: ${JSON.stringify(text)}`);
		}
		catch {
			// sin diagnóstico disponible
		}
	}
}

// ------------------------------------------------- dispositivo sin configurar

/**
 * Escenario del dispositivo nuevo: sin empresas configuradas, `LoginPage` abre el modal solo y
 * no deja iniciar sesión hasta que se guarde una.
 */
async function captureNew(cdp) {
	console.log("\n[dispositivo sin configurar]");
	await setViewport(cdp, MODAL_VIEWPORT);
	await prepareDatabase(cdp, []);

	await step("auto_open", async () => {
		await goToLogin(cdp);
		await waitForModal(cdp, { timeout: 60000 });
		await screenshot(cdp, `${outputDir}/auto_open.png`, modalClip("ion-modal ion-grid"));
	});

	// La misma pantalla, con los tres pasos señalados en el orden en que los explica el documento:
	// el NIT, el dígito de verificación y el botón de buscar.
	//
	// Se señala el `ion-item`, no el `ion-input`: el borde redondeado que ve el usuario es del
	// item, y el del input va desplazado hacia adentro, así que el recuadro queda torcido.
	await step("auto_open_steps", async () => {
		await highlight(cdp, "ion-modal ion-item:has(ion-input)", { index: 0, label: "1" });
		await highlight(cdp, "ion-modal ion-item:has(ion-input)", { index: 1, label: "2" });
		await highlight(cdp, "ion-modal ion-grid ion-button", { label: "3" });
		await screenshot(cdp, `${outputDir}/auto_open_steps.png`, modalClip("ion-modal ion-grid"));
		await clearHighlights(cdp);
	});

	await step("required", async () => {
		await clickByText(cdp, "ion-modal ion-button", "buscar");
		await waitForText(cdp, "Este campo es requerido", { timeout: 15000 });
		await wait(500);
		await screenshot(cdp, `${outputDir}/required.png`, modalClip("ion-modal ion-grid"));
	});

	await step("not_found", async () => {
		await typeNit(cdp, NIT_UNKNOWN);
		await clickByText(cdp, "ion-modal ion-button", "buscar");
		await captureToast(cdp, `${outputDir}/not_found.png`);
	});

	// Búsqueda correcta. Al ser la primera empresa, la app la guarda y aplica sola: no hay que
	// tocar "Guardar" y la pantalla vuelve al login recargada.
	await step("found", async () => {
		await wait(2500);
		await typeNit(cdp, NIT);
		await clickByText(cdp, "ion-modal ion-button", "buscar");
		await captureToast(cdp, `${outputDir}/found.png`);
	});
}

// ------------------------------------------------- dispositivo ya configurado

/**
 * Escenario con empresas ya configuradas: el login funciona normal, el botón `+` sigue
 * disponible y el modal muestra el selector para cambiar de empresa.
 */
async function captureConfigured(cdp) {
	console.log("\n[dispositivo ya configurado]");
	await setViewport(cdp, LOGIN_VIEWPORT);
	await prepareDatabase(cdp, CONFIGURED);
	await goToLogin(cdp);

	// El botón `+` es chico y está en una esquina: sin el recuadro no se encuentra en la captura.
	await step("fab", async () => {
		await highlight(cdp, "ion-fab-button", { padding: 8 });
		await screenshot(cdp, `${outputDir}/fab.png`, { selector: LOGIN_CARD });
		await clearHighlights(cdp);
	});

	await step("select", async () => {
		await openModal(cdp);
		// Las capturas del modal van todas al mismo tamaño, sin importar de qué escenario vengan.
		await setViewport(cdp, MODAL_VIEWPORT);
		await wait(800);
		// Los dos controles que se usan para cambiar de empresa, en el orden del documento.
		await highlight(cdp, "ion-modal ion-item:has(ion-select)", { label: "1" });
		await highlight(cdp, "ion-modal ion-grid ion-button", { index: 1, label: "2" });
		await screenshot(cdp, `${outputDir}/select.png`, modalClip("ion-modal ion-grid"));
		await clearHighlights(cdp);
	});

	// El popover del selector se monta fuera del modal, así que el recorte se cierra con él.
	await step("select_open", async () => {
		await click(cdp, "ion-modal ion-select");
		await waitForText(cdp, CONFIGURED[1].name, { timeout: 15000 });
		await wait(1000);
		await screenshot(cdp, `${outputDir}/select_open.png`, modalClip("ion-popover"));
	});
}

// ---------------------------------------------------------------- principal

const { process: chromeProcess, port } = await launchChrome();
const cdp = await connectPage(port);
cdpRef.cdp = cdp;

await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Network.enable");

await prepareDocument(cdp);

cdp.on("Runtime.exceptionThrown", (params) => {
	const description = params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? "";
	if (description) console.log("  [excepción en la página] " + description.split("\n")[0]);
});

try {
	if (!only || only === "nuevo") await captureNew(cdp);
	if (!only || only === "configurado") await captureConfigured(cdp);
}
finally {
	console.log(`\nGeneradas: ${done.length} -> ${done.join(", ")}`);
	if (failed.length) console.log(`Fallidas: ${failed.length}\n  ` + failed.join("\n  "));
	cdp.close();
	chromeProcess.kill();
}
