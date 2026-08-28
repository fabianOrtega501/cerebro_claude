/**
 * Genera las capturas del módulo de Censo de app-movil para el manual de usuario.
 *
 * Uso:
 *   node modules/censo/capture.mjs --salida <carpeta> --token <token>
 *        [--base http://localhost:5180] [--email <usuario>] [--password <clave>]
 *        [--solo import|programado|formulario|envio] [--estadoPredio <nombre>]
 *
 * Requiere el dev server de app-movil arriba y el backend local respondiendo.
 * El dev server y el usuario de pruebas salen de AMI_WEB_URL, AMI_TEST_EMAIL y
 * AMI_TEST_PASSWORD, que cada desarrollador define en su `.claude/settings.local.json`.
 * Ver SKILL.md para la preparación de datos.
 */

import {
	click,
	clickByText,
	connectPage,
	evaluate,
	launchChrome,
	screenshot,
	setViewport,
	wait,
	waitForSelector,
	waitForText,
} from "../../lib/browser.mjs";
import { apiGet } from "../../lib/api.mjs";
import { countRows, ensureCurrentVersion, runLocalMigrations, selectRows, sql } from "../../lib/localdb.mjs";
import { DEFAULT_BASE, VIEWPORT, testCredentials, type } from "../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const token = arg("token", process.env.API_TOKEN ?? "");
const only = arg("solo", null); // import | programado | formulario | envio

// Cuál de los estados de predio del maestro sale seleccionado en la captura del formulario.
// Sin él se usa el primero, que no siempre es el ejemplo que conviene mostrar.
const propertyStatusName = arg("estadoPredio", null);

const credentials = testCredentials({ email: arg("email"), password: arg("password") });

const AUTH_USER = {
	id: Number(arg("userId", 1)),
	document: 1,
	first_name: "John",
	last_name: "Sotfware",
	username: "john.sotfware1",
	email: credentials.email,
	password: credentials.password,
	expires_password: "2026-12-31",
	phone_number: "",
	address: "",
	token,
	current: 1,
	biometric: 0,
	company_id: Number(arg("companyId", 0)),
	municipalitie_id: null,
	company_name: arg("companyName", "Empresa Demo"),
	menus: [],
};

const SEND_ENDPOINT = "/visits/v0/store-mobile-data";

/** Endpoint del que salen los detalles de los maestros (Uso y Estrato, Estado de Predio). */
const MASTERS_ENDPOINT = "/details-masters/v0/custom-get-select-data";

/** Código del maestro de Estado de Predio, el mismo que consultan las dos vistas del censo. */
const PROPERTY_STATUS_CODE = "MTMV-002";

const cdpRef = {};

/**
 * Instala en cada documento lo necesario para que la app arranque lista para capturar:
 *
 * - authUserMenus, que la app espera en localStorage junto a la cookie de sesión.
 * - La preferencia de ubicación en segundo plano: sin ella App.vue muestra una alerta
 *   con backdropDismiss: false que bloquea todos los clicks.
 * - Un fetch parcheado que devuelve una sola empresa, para que la barra superior muestre
 *   el título como en el resto del manual y no el selector de empresas. El mismo parche
 *   permite forzar fallos del endpoint de envío leyendo window.__cdpConfig.
 */
async function prepareDocument(cdp, companyName) {
	await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
		source: `
      localStorage.setItem('authUserMenus', btoa(JSON.stringify([])));
      localStorage.setItem('CapacitorStorage.BACKGROUND_LOCATION_PERMISSION', '1');

      window.__cdpConfig = window.__cdpConfig || { pattern: null, mode: 'none', from: 1, delayMs: 0 };
      window.__fetchCount = 0;

      if (!window.__originalFetch) {
        window.__originalFetch = window.fetch;
        window.fetch = async (resource, options) => {
          const url = typeof resource === 'string' ? resource : resource.url;

          if (url.includes('/users/v0/select-user-company/')) {
            return new Response(JSON.stringify({
              status: 'success', message: 'ok',
              data: [{ id: ${AUTH_USER.company_id}, name: ${JSON.stringify(companyName)} }]
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }

          const config = window.__cdpConfig;
          if (config.pattern && url.includes(config.pattern) && config.mode !== 'none') {
            window.__fetchCount++;
            if (config.delayMs) await new Promise(resolve => setTimeout(resolve, config.delayMs));

            if (config.mode === 'offline') throw new TypeError('Failed to fetch');

            // 'slow' solo retrasa: la respuesta la sigue dando el backend real. Sirve para
            // alcanzar a capturar un estado que de otro modo pasa en milisegundos.
            if (config.mode === 'slow') return window.__originalFetch(resource, options);

            const shouldFail = config.mode === 'serverError'
              || (config.mode === 'failFrom' && window.__fetchCount >= config.from);

            if (shouldFail) {
              return new Response(JSON.stringify({ message: 'Error del servidor' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } });
            }

            // Respuesta exitosa simulada: devuelve como procesados los ids del lote, que
            // es lo que hace el backend. Permite capturar el estado final de la pantalla
            // sin depender de que esas visitas existan en el servidor.
            if (config.mode === 'success' || config.mode === 'failFrom') {
              const ids = JSON.parse(options.body).map(v => v.id);
              return new Response(JSON.stringify({ status: 'success', message: 'ok', data: ids }),
                { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
          }
          return window.__originalFetch(resource, options);
        };
      }
    `,
	});
}

/** Configura qué endpoint se simula y cómo, para el siguiente click. */
async function configureFetch(cdp, { pattern, mode = "none", from = 1, delayMs = 0 } = {}) {
	await evaluate(
		cdp,
		`(() => { window.__fetchCount = 0;
      window.__cdpConfig = { pattern: ${JSON.stringify(pattern)}, mode: ${JSON.stringify(mode)},
        from: ${from}, delayMs: ${delayMs} }; return true; })()`,
	);
}

/** Configura el comportamiento del endpoint de envío para el siguiente click. */
async function configureSend(cdp, options = {}) {
	await configureFetch(cdp, { pattern: SEND_ENDPOINT, ...options });
}

/** Autentica escribiendo la cookie que genera setUserAth y navega a la ruta. */
async function goTo(cdp, path, { waitForCard = true } = {}) {
	const cookie = Buffer.from(JSON.stringify(AUTH_USER)).toString("base64");
	await cdp.send("Network.setCookie", { name: "authUser", value: cookie, url: base, path: "/" });
	await cdp.send("Page.navigate", { url: `${base}${path}` });
	if (waitForCard) await waitForSelector(cdp, "ion-card", { timeout: 90000 });
	await wait(1500);
}

/**
 * Navega a /login y espera. Ahí la app no consulta la base, así que es el momento seguro
 * para correr migraciones o sembrar: DatabaseService abre y cierra la conexión en cada
 * query y dos accesos en paralelo se cierran la conexión entre sí.
 */
async function goToNeutral(cdp) {
	await cdp.send("Page.navigate", { url: `${base}/login` });
	await wait(6000);
}

/** Deja visitas finalizadas pendientes por enviar, de los dos tipos de censo. */
async function preparePending(cdp, scheduled, created) {
	if (scheduled > 0) {
		await sql(
			cdp,
			`UPDATE visits SET is_completed = 1, data_policy = 0, execution_date = datetime('now'),
        witness_type = 'Propietario', witness_name = 'JUAN PEREZ', witness_identification = 123456789,
        witness_phone_number = 3001234567, witness_email = ''
       WHERE id IN (
         SELECT id FROM visits WHERE visit_type_id = 1 AND is_new IS NULL AND sync = 0 AND is_completed = 0
         ORDER BY id LIMIT ?
       );`,
			[scheduled],
		);
	}

	// Si no había suficientes visitas importadas por marcar (por ejemplo después de un
	// envío exitoso, que las borra), se completan con registros sintéticos. Llevan un
	// visit_id del rango de pruebas: sirven para los escenarios donde la respuesta del
	// endpoint se simula.
	if (scheduled > 0) {
		const pending = await countRows(
			cdp,
			"SELECT COUNT(*) AS total FROM visits WHERE visit_type_id = 1 AND is_new IS NULL AND sync = 0 AND is_completed = 1",
		);

		for (let index = pending; index < scheduled; index++) {
			await sql(
				cdp,
				`INSERT INTO visits
          (visit_id, account_contract, name, address, phone_number, type_producer, email, company_id,
           date_visit, pqr_code, user_id, sync, data_policy, created_by, active, type_activity,
           is_completed, execution_date, latitude, longitude, visit_type_id)
         VALUES (?,?,?,?,?,?,?,?,datetime('now'),?,?,0,0,?,1,'Censo',1,datetime('now'),'','',1);`,
				[
					990000 + index,
					820000 + index,
					`CLIENTE PROGRAMADO ${index + 1}`,
					`CRA ${5 + index} # 20-10`,
					`30${3000000 + index}`,
					"RESIDENCIAL",
					`prog${index}@prueba.local`,
					AUTH_USER.company_id,
					`PQR-${990000 + index}`,
					AUTH_USER.id,
					AUTH_USER.id,
				],
			);
		}
	}

	for (let index = 0; index < created; index++) {
		await sql(
			cdp,
			`INSERT INTO visits
        (account_contract, name, address, phone_number, type_producer, email, company_id, date_visit,
         pqr_code, user_id, sync, data_policy, created_by, active, type_activity, is_completed, is_new,
         execution_date, latitude, longitude, visit_type_id)
       VALUES (?,?,?,?,?,?,?,datetime('now'),?,?,0,0,?,1,'Censo',1,1,datetime('now'),'','',1);`,
			[
				910000 + index,
				`CLIENTE NUEVO ${index + 1}`,
				`CALLE ${10 + index} # 5-20`,
				`30${2000000 + index}`,
				"RESIDENCIAL",
				`nuevo${index}@prueba.local`,
				AUTH_USER.company_id,
				`PQR-N-${910000 + index}`,
				AUTH_USER.id,
				AUTH_USER.id,
			],
		);
	}
}

/**
 * Deja la base local lista para capturar: tablas creadas, la empresa de la sesión y una
 * versión vigente. Es idempotente, así que se puede llamar en cada escenario.
 */
async function prepareDatabase(cdp) {
	await runLocalMigrations(cdp);

	// visits tiene FOREIGN KEY(company_id) REFERENCES companies(id) y el plugin de SQLite
	// las aplica, así que la empresa de la sesión debe existir en la base local.
	await sql(cdp, `INSERT OR REPLACE INTO companies (id, name) VALUES (?, ?);`, [
		AUTH_USER.company_id,
		AUTH_USER.company_name,
	]);

	await ensureCurrentVersion(cdp);
}

/** Borra las visitas locales para volver a un estado limpio. */
async function clearLocalData(cdp) {
	for (const query of [
		`DELETE FROM attachments;`,
		`DELETE FROM units;`,
		`DELETE FROM extra_data_tables;`,
		`DELETE FROM visits WHERE visit_type_id = 1;`,
	]) {
		try {
			await sql(cdp, query);
		} catch (error) {
			console.log(`  (aviso) no se pudo limpiar con "${query}": ${error.message.split("\n")[0]}`);
		}
	}
}

const done = [];
const failed = [];

async function step(name, fn) {
	try {
		await fn();
		done.push(name);
		console.log(`  OK   ${name}`);
	} catch (error) {
		failed.push(`${name}: ${error.message}`);
		console.log(`  FALLA ${name} -> ${error.message.split(String.fromCharCode(10))[0]}`);
		try {
			await screenshot(cdpRef.cdp, `${outputDir}/_falla_${name}.png`);
			const text = await evaluate(cdpRef.cdp, "document.body.innerText.slice(0, 400)");
			console.log(`         pantalla: ${JSON.stringify(text)}`);
		} catch {
			// sin diagnóstico disponible
		}
	}
}

// ---------------------------------------------------------------- importación

async function captureImport(cdp) {
	console.log("\n[importación de datos]");
	await goTo(cdp, "/censo/importar-datos");
	await prepareDatabase(cdp);
	await clearLocalData(cdp);
	await goTo(cdp, "/censo/importar-datos");

	await step("imports", () => screenshot(cdp, `${outputDir}/imports.png`, { selector: "ion-card", includeHeader: true }));
	await step("buttons", () => screenshot(cdp, `${outputDir}/buttons.png`, { selector: "ion-card-header", includeHeader: true }));

	await step("visits", async () => {
		await click(cdp, "ion-card ion-item", { index: 0 });
		await confirmVisitInProgress(cdp);
		await waitForCompletedBars(cdp, 1);
		await wait(800);
		await screenshot(cdp, `${outputDir}/visits.png`, { selector: "ion-card", includeHeader: true });
	});

	// La tarjeta de Datos Generales va cambiando de título según lo que importa; "Maestros"
	// es el paso que trae Uso y Estrato y Estado de Predio. Se retrasa su endpoint porque de
	// otro modo el título dura milisegundos en pantalla.
	await step("masters", async () => {
		await configureFetch(cdp, { pattern: MASTERS_ENDPOINT, mode: "slow", delayMs: 5000 });
		await click(cdp, "ion-card ion-item", { index: 1 });
		await confirmVisitInProgress(cdp);
		await waitForText(cdp, "Maestros", { timeout: 120000 });
		await screenshot(cdp, `${outputDir}/masters.png`, { selector: "ion-card", includeHeader: true });
	});

	await step("status", async () => {
		await waitForCompletedBars(cdp, 2);
		await wait(800);
		await screenshot(cdp, `${outputDir}/status.png`, { selector: "ion-card", includeHeader: true });
	});

	await configureFetch(cdp, { mode: "none" });
}

/**
 * Si aparece la confirmación "Visita en Proceso", responde que sí.
 * Sale cuando hay visitas sin finalizar en la base local, que es lo normal tras importar.
 */
async function confirmVisitInProgress(cdp) {
	for (let attempt = 0; attempt < 12; attempt++) {
		const visible = await evaluate(cdp, `document.body.innerText.includes('Visita en Proceso')`);
		if (visible) {
			await clickByText(cdp, "ion-alert button", "sí");
			await wait(1200);
			return;
		}
		await wait(500);
	}
}

/** Espera a que haya al menos N tarjetas con la barra de progreso en verde. */
async function waitForCompletedBars(cdp, count, timeout = 240000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const completed = await evaluate(cdp, `document.querySelectorAll("ion-progress-bar[color='success']").length`);
		if (completed >= count) return;
		await wait(500);
	}
	throw new Error(`Timeout: no se completaron ${count} importaciones`);
}

// ---------------------------------------------------------------- programado

/**
 * Garantiza que haya visitas programadas en la base local para el listado.
 *
 * Los nombres incluyen tildes y Ñ porque la captura de la búsqueda filtra por "muñoz".
 */
async function ensureScheduledVisits(cdp, minimum = 25) {
	const names = ["JUAN PEREZ", "MARÍA O'BRIEN", "CARLOS MUÑOZ", "ana lópez", "Luis Ramírez"];
	const addresses = ["CRA 5 # 20-10", "CALLE 8 # 3-45", "AV BOYACÁ 100", "BOGOTÁ NORTE"];

	const total = await countRows(cdp, "SELECT COUNT(*) AS total FROM visits WHERE visit_type_id = 1 AND is_new IS NULL");

	for (let index = total; index < minimum; index++) {
		await sql(
			cdp,
			`INSERT INTO visits
        (visit_id, account_contract, name, address, phone_number, type_producer, email, company_id,
         date_visit, pqr_code, user_id, sync, data_policy, created_by, active, type_activity,
         is_completed, latitude, longitude, visit_type_id)
       VALUES (?,?,?,?,?,?,?,?,datetime('now'),?,?,0,0,?,1,'Censo',0,'','',1);`,
			[
				950000 + index,
				840000 + index,
				names[index % names.length],
				addresses[index % addresses.length],
				`30${4000000 + index}`,
				"RESIDENCIAL",
				`visita${index}@prueba.local`,
				AUTH_USER.company_id,
				`PQR-${950000 + index}`,
				AUTH_USER.id,
				AUTH_USER.id,
			],
		);
	}
}

async function captureScheduled(cdp) {
	console.log("\n[censo programado]");
	await goToNeutral(cdp);
	await prepareDatabase(cdp);
	await ensureScheduledVisits(cdp);
	await goTo(cdp, "/censo/programado");
	await waitForSelector(cdp, ".card_visit", { timeout: 60000 });

	await step("visits_list", () => screenshot(cdp, `${outputDir}/visits_list.png`));

	await step("buscar", async () => {
		await type(cdp, "ion-input.custom input", "muñoz");
		await wait(2500);
		await screenshot(cdp, `${outputDir}/buscar.png`);
	});

	await step("sin_resultados", async () => {
		await type(cdp, "ion-input.custom input", "zzzzzz");
		await wait(2500);
		await screenshot(cdp, `${outputDir}/sin_resultados.png`);
	});
}

// ------------------------------------------------------- datos complementarios

/** Valores del formulario. Son los de las capturas ya publicadas, para no cambiar el ejemplo. */
const COMPLEMENT_DATA = {
	timbres: 3,
	mediAgua: 2,
	mediEnergy: 1,
	mediGas: 3,
	otras_direcciones: "Carrera 10 # 18 - 40",
	observaciones: "ejemplo",
};

/**
 * Siembra en la base local los detalles del maestro de Estado de Predio.
 *
 * Se traen del backend en vez de inventarlos: es un maestro configurable y el manual tiene
 * que mostrar los valores que ve el usuario. Si el maestro está vacío no hay nada que
 * documentar y la fase se detiene.
 *
 * @returns {Promise<object>} El detalle que queda seleccionado en la captura: el de
 *          `--estadoPredio`, o el primero del maestro
 */
async function seedPropertyStatuses(cdp) {
	const body = await apiGet(`details-masters/v0/custom-get-select-data?code=${PROPERTY_STATUS_CODE}&company_id=-1`, {
		token,
	});
	const details = body?.data ?? [];

	if (details.length === 0) {
		throw new Error(`El maestro ${PROPERTY_STATUS_CODE} (Estado de Predio) no tiene detalles en el backend local`);
	}

	await sql(cdp, "DELETE FROM masters_details WHERE code = ?;", [PROPERTY_STATUS_CODE]);

	for (const detail of details) {
		await sql(cdp, "INSERT INTO masters_details (masters_details_id, name, master_id, code) VALUES (?, ?, ?, ?);", [
			detail.id,
			detail.name,
			detail.master_id ?? 0,
			PROPERTY_STATUS_CODE,
		]);
	}

	const chosen = details.find((detail) => detail.name?.toLowerCase() === propertyStatusName?.toLowerCase()) ?? details[0];

	console.log(`  Estado de Predio: ${details.map((detail) => detail.name).join(", ")} (se usa "${chosen.name}")`);

	return chosen;
}

/**
 * Avanza a la siguiente sección del formulario.
 *
 * Se apunta al botón por el slot del `ion-buttons`: las secciones intermedias tienen también
 * una flecha de retroceso, y es la primera del pie.
 */
async function nextSection(cdp) {
	await click(cdp, 'ion-card ion-footer ion-buttons[slot="end"] ion-icon');
	await wait(1500);
}

/** Deja en localStorage el borrador del censo nuevo, ya diligenciado. */
async function seedNewCensoForm(cdp, propertyStatus) {
	const data = {
		visit: {
			account_contract: 910001,
			name: "CLIENTE NUEVO 1",
			address: "CALLE 10 # 5 - 20",
			phone_number: "3002000001",
			email: "nuevo@prueba.local",
			type_activity: "Residencial",
			type_producer: "RESIDENCIAL",
			company_id: AUTH_USER.company_id,
			user_id: AUTH_USER.id,
			property_status_id: propertyStatus.id,
		},
		complement_data: COMPLEMENT_DATA,
	};

	await evaluate(
		cdp,
		`(() => { localStorage.setItem('newCensoData', btoa(JSON.stringify(${JSON.stringify(data)}))); return true; })()`,
	);
}

/**
 * Siembra la visita del censo programado y deja su borrador en localStorage.
 *
 * El borrador se escribe con el helper de la app, y con el `id` real de la fila:
 * `ScheduledVisits` solo conserva lo que ya había si el id coincide con el de la visita que
 * se toca; con otro, empieza el formulario en blanco. De paso preselecciona la búsqueda por
 * cuenta contrato, así que el listado queda con esa sola visita.
 */
async function seedScheduledForm(cdp, propertyStatus) {
	const accountContract = 860001;

	await sql(cdp, "DELETE FROM visits WHERE account_contract = ?;", [accountContract]);
	await sql(
		cdp,
		`INSERT INTO visits
      (visit_id, account_contract, name, address, phone_number, type_producer, email, company_id,
       date_visit, pqr_code, user_id, sync, data_policy, created_by, active, type_activity,
       is_completed, latitude, longitude, visit_type_id)
     VALUES (?,?,?,?,?,?,?,?,datetime('now'),?,?,0,0,?,1,'Censo',0,'','',1);`,
		[
			960001,
			accountContract,
			"CLIENTE PROGRAMADO 1",
			"CRA 5 # 20-10",
			"3004000001",
			"RESIDENCIAL",
			"programado@prueba.local",
			AUTH_USER.company_id,
			`PQR-${960001}`,
			AUTH_USER.id,
			AUTH_USER.id,
		],
	);

	const [visit] = await selectRows(cdp, "SELECT * FROM visits WHERE account_contract = ? ORDER BY id DESC LIMIT 1;", [
		accountContract,
	]);

	if (!visit) throw new Error("No se pudo sembrar la visita programada del formulario");

	const draft = {
		visit: { ...visit, property_status_id: propertyStatus.id },
		complement_data: COMPLEMENT_DATA,
	};

	await evaluate(
		cdp,
		`(async () => {
      const mod = await import('/src/composables/Modules/Censo/useFunction.ts');
      mod.setLocalScheduledVisitData(${JSON.stringify(draft)});
      return true;
    })()`,
		{ awaitPromise: true },
	);
}

async function captureForm(cdp) {
	console.log("\n[datos complementarios]");

	await goToNeutral(cdp);
	await prepareDatabase(cdp);

	const propertyStatus = await seedPropertyStatuses(cdp);

	await step("datos_nuevo", async () => {
		await seedNewCensoForm(cdp, propertyStatus);
		await goTo(cdp, "/censo/nuevo");

		// Información del Usuario, Evidencias, Unidades Residenciales y No Residenciales.
		for (let section = 0; section < 4; section++) await nextSection(cdp);

		await waitForSelector(cdp, "ion-card", { text: "Datos Complementarios", timeout: 30000 });
		await wait(1000);
		await screenshot(cdp, `${outputDir}/datos_nuevo.png`, { selector: "ion-card" });
	});

	await step("datos_programado", async () => {
		await goToNeutral(cdp);
		await seedScheduledForm(cdp, propertyStatus);
		await goTo(cdp, "/censo/programado");

		await waitForSelector(cdp, ".card_visit", { timeout: 60000 });
		await click(cdp, ".card_visit");
		await wait(1500);

		// Evidencias, Unidades Residenciales y No Residenciales.
		for (let section = 0; section < 3; section++) await nextSection(cdp);

		await waitForSelector(cdp, "ion-card", { text: "Datos Complementarios", timeout: 30000 });
		await wait(1000);
		await screenshot(cdp, `${outputDir}/datos_programado.png`, { selector: "ion-card" });
	});
}

// ---------------------------------------------------------------- envío

/**
 * Deja la pantalla de envío con visitas pendientes.
 *
 * Rearma la base en cada escenario: entre navegaciones se ha visto perder el esquema, y
 * repetir las migraciones es barato e idempotente.
 */
async function sendScenario(cdp, scheduled, created) {
	await goToNeutral(cdp);
	await prepareDatabase(cdp);
	await preparePending(cdp, scheduled, created);
	await goTo(cdp, "/censo/enviar-datos");
}

async function captureSend(cdp) {
	console.log("\n[envío de datos]");

	// Tarjetas con pendientes de los dos tipos.
	await sendScenario(cdp, 6, 3);
	await step("cards", () => screenshot(cdp, `${outputDir}/cards.png`, { selector: "ion-card", includeHeader: true }));

	// Envío en curso: se retrasa la respuesta para alcanzar a capturar la barra, y al
	// terminar la tarjeta queda en verde, que es el estado que muestra el manual.
	await step("sending", async () => {
		await configureSend(cdp, { mode: "success", delayMs: 6000 });
		await click(cdp, "ion-card .card_visit", { index: 0 });
		await waitForSelector(cdp, "ion-progress-bar", { timeout: 30000 });
		await screenshot(cdp, `${outputDir}/sending.png`, { selector: "ion-card", includeHeader: true });
	});

	await step("success", async () => {
		await waitForText(cdp, "DATOS ENVIADOS", { timeout: 180000 });
		await wait(1000);
		await screenshot(cdp, `${outputDir}/success.png`, { selector: "ion-card", includeHeader: true });
	});

	// Aviso al intentar salir con un envío en curso: navegar por el menú lateral dispara
	// el guard de la vista, que cancela la salida.
	await step("in_process", async () => {
		await sendScenario(cdp, 6, 0);
		await configureSend(cdp, { mode: "success", delayMs: 12000 });
		await click(cdp, "ion-card .card_visit", { index: 0 });
		await waitForSelector(cdp, "ion-progress-bar", { timeout: 30000 });
		await clickByText(cdp, "ion-menu ion-item", "backup");
		await waitForText(cdp, "Sincronizaciones en proceso", { timeout: 25000 });
		await screenshot(cdp, `${outputDir}/in_process.png`, { selector: "ion-alert" });
		await clickByText(cdp, "ion-alert button", "ok");
		await wait(1500);
	});

	// Envío parcial: el primer lote pasa, el segundo falla.
	await step("partial", async () => {
		await sendScenario(cdp, 6, 0);
		await configureSend(cdp, { mode: "failFrom", from: 2 });
		await click(cdp, "ion-card .card_visit", { index: 0 });
		await waitForText(cdp, "Sincronización parcial", { timeout: 180000 });
		await screenshot(cdp, `${outputDir}/partial.png`);
	});

	// Envío fallido: todos los lotes fallan.
	await step("failed", async () => {
		await sendScenario(cdp, 4, 0);
		await configureSend(cdp, { mode: "serverError" });
		await click(cdp, "ion-card .card_visit", { index: 0 });
		await waitForText(cdp, "no fueron enviados", { timeout: 180000 });
		await screenshot(cdp, `${outputDir}/failed.png`);
	});

	// Sin conexión.
	await step("off_error", async () => {
		await sendScenario(cdp, 3, 0);
		await configureSend(cdp, { mode: "offline" });
		await click(cdp, "ion-card .card_visit", { index: 0 });
		await wait(6000);
		await screenshot(cdp, `${outputDir}/off_error.png`);
	});

	await configureSend(cdp, { mode: "none" });
}

// ---------------------------------------------------------------- principal

const { process: chromeProcess, port } = await launchChrome();
const cdp = await connectPage(port);
cdpRef.cdp = cdp;

await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Network.enable");
await setViewport(cdp, VIEWPORT);

await prepareDocument(cdp, AUTH_USER.company_name);

cdp.on("Runtime.exceptionThrown", (params) => {
	const description = params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? "";
	if (description) console.log("  [excepción en la página] " + description.split("\n")[0]);
});

try {
	if (!only || only === "import") await captureImport(cdp);
	if (!only || only === "programado") await captureScheduled(cdp);
	if (!only || only === "formulario") await captureForm(cdp);
	if (!only || only === "envio") await captureSend(cdp);
} finally {
	console.log(`\nGeneradas: ${done.length} -> ${done.join(", ")}`);
	if (failed.length) console.log(`Fallidas: ${failed.length}\n  ` + failed.join("\n  "));
	cdp.close();
	chromeProcess.kill();
}
