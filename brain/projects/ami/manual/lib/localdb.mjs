/**
 * Acceso a la base local (SQLite) de la app desde el navegador, para preparar el estado que
 * hace falta capturar.
 *
 * Vive en `lib/` porque lo necesita cualquier módulo: todos guardan en local y todos tienen
 * que sembrar algo antes de tomar la captura. Lo específico de un módulo (qué filas sembrar)
 * va en `modules/<modulo>/capture.mjs`.
 *
 * Es específico de esta app —importa su `DatabaseService`—, así que no va en `browser.mjs`.
 */

import { evaluate, wait } from "./browser.mjs";

/**
 * Reintenta una operación contra la base local.
 *
 * `DatabaseService` abre y cierra la conexión en cada consulta, así que si la vista está
 * consultando al mismo tiempo una de las dos se queda sin conexión ("Database closed").
 * Reintentar es más simple que sincronizarse con el ciclo de vida de la vista.
 *
 * @param {Function} fn - Operación a ejecutar. Se llama tantas veces como haga falta, así que
 *        **no debe tener efectos que se acumulen** (un INSERT sin control se repetiría)
 * @param {object} [options]
 * @param {number} [options.attempts=6] - Cuántos intentos antes de rendirse
 * @param {number} [options.delay=2000] - Espera entre intentos, en milisegundos
 * @param {string} [options.label="operación"] - Nombre para el mensaje de error
 * @returns {Promise<*>} Lo que devuelva `fn` en el primer intento que funcione
 * @throws {Error} Reintenta **solo los fallos transitorios** de SQLite (`Database closed`,
 *         `no such table`, `database is locked`…). Cualquier otro error se propaga de inmediato
 */
export async function withRetries(fn, { attempts = 6, delay = 2000, label = "operación" } = {}) {
	let lastError;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fn();
		}
		catch (error) {
			lastError = error;
			const transient = /Database closed|no such table|database is locked|reading 'open'|GetVersion/i.test(error.message);
			if (!transient) throw error;
			if (attempt < attempts) await wait(delay);
		}
	}

	throw new Error(`${label} falló tras ${attempts} intentos: ${lastError.message.split(String.fromCharCode(10))[0]}`);
}

/**
 * Ejecuta SQL de escritura contra la base local, sin agregar código de siembra al repo.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} query - Sentencia SQL, con `?` para los parámetros
 * @param {Array} [params=[]] - Valores de los `?`
 * @returns {Promise<string>} El objeto `changes` de SQLite serializado como JSON. Casi nunca
 *          se usa: la sentencia se lanza por su efecto, no por su resultado
 * @throws {Error} Si la sentencia falla por algo que no sea un fallo transitorio de conexión
 */
export async function sql(cdp, query, params = []) {
	return withRetries(
		() =>
			evaluate(
				cdp,
				`(async () => {
      const mod = await import('/src/services/app/DatabaseService.ts');
      const db = new mod.default();
      await db.init();
      const r = await db.runQuery(${JSON.stringify(query)}, ${JSON.stringify(params)});
      return JSON.stringify(r?.changes ?? {});
    })()`,
				{ awaitPromise: true },
			),
		{ label: "consulta local" },
	);
}

/**
 * Cuenta filas de la base local.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} query - Consulta que **debe devolver una columna llamada `total`**, por
 *        ejemplo `SELECT COUNT(*) AS total FROM visits`. Con otro nombre devuelve 0 en silencio
 * @param {object} [options] - Los mismos que `withRetries`
 * @returns {Promise<number>} El conteo, ya convertido a número
 */
export async function countRows(cdp, query, options = {}) {
	const value = await withRetries(
		() =>
			evaluate(
				cdp,
				`(async () => {
        const mod = await import('/src/services/app/DatabaseService.ts');
        const db = new mod.default();
        await db.init();
        const r = await db.executeQuery(${JSON.stringify(query)});
        return String(r?.[0]?.total ?? 0);
      })()`,
				{ awaitPromise: true },
			),
		{ label: "conteo local", ...options },
	);

	return Number(value);
}

/**
 * Devuelve filas de la base local.
 *
 * Hace falta cuando la captura necesita un dato que genera la propia base —el `id`
 * autoincremental de una fila recién sembrada, por ejemplo— para poder referirse a ella
 * después desde la interfaz.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} query - Consulta de lectura, con `?` para los parámetros
 * @param {Array} [params=[]] - Valores de los `?`
 * @returns {Promise<Array<object>>} Las filas, ya parseadas. Vacío si la consulta no devuelve nada
 * @throws {Error} Si la consulta falla por algo que no sea un fallo transitorio de conexión
 */
export async function selectRows(cdp, query, params = []) {
	const rows = await withRetries(
		() =>
			evaluate(
				cdp,
				`(async () => {
        const mod = await import('/src/services/app/DatabaseService.ts');
        const db = new mod.default();
        await db.init();
        const r = await db.executeQuery(${JSON.stringify(query)}, ${JSON.stringify(params)});
        return JSON.stringify(r ?? []);
      })()`,
				{ awaitPromise: true },
			),
		{ label: "consulta local" },
	);

	return JSON.parse(rows ?? "[]");
}

/**
 * Espera a que exista una tabla de la base local.
 *
 * Sirve para los flujos que entran por `/login` y dejan que la app corra sus propias
 * migraciones: hay que esperar a que terminen antes de sembrar. `countRows` reintenta mientras
 * la tabla no existe, así que basta con contar.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @param {string} table - Nombre de la tabla. **Se interpola en el SQL sin escapar**: solo
 *        pasarle literales del código, nunca algo que venga de un parámetro del usuario
 * @returns {Promise<void>} Espera hasta 30 s (20 intentos cada 1,5 s)
 * @throws {Error} Si la tabla no aparece en ese tiempo
 */
export async function waitForTable(cdp, table) {
	await countRows(cdp, `SELECT COUNT(*) AS total FROM ${table}`, { attempts: 20, delay: 1500, label: `tabla ${table}` });
}

/**
 * Crea las tablas de la base local.
 *
 * La app corre las migraciones dentro de `LoginPage`, y los flujos de captura que entran por
 * cookie no pasan por el formulario, así que hay que dispararlas a mano. Son idempotentes.
 *
 * OJO: a propósito no se llama a `runSeeders()` ni a `runNewSeeders()`. En el entorno web
 * (jeep-sqlite sobre IndexedDB) `runSeeders` deja la base en dos tablas y se pierde todo lo
 * que crearon las migraciones. Para las capturas no hace falta la data de referencia.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @returns {Promise<void>} Es idempotente: se puede llamar en cada escenario sin problema
 * @throws {Error} Si las migraciones no terminan tras 8 intentos (20 s). Conviene llamarla desde
 *         `/login`, donde la app no está consultando la base
 */
export async function runLocalMigrations(cdp) {
	await withRetries(
		() =>
			evaluate(
				cdp,
				`(async () => {
      const mod = await import('/src/services/app/DatabaseService.ts');
      const db = new mod.default();
      await db.init();
      await db.runMigrations();
      await db.runNewMigrations();
      return true;
    })()`,
				{ awaitPromise: true },
			),
		{ label: "migraciones", attempts: 8, delay: 2500 },
	);
}

/**
 * Deja una versión marcada como vigente.
 *
 * Sin una fila en `versions` con `current = 1`, las vistas muestran la alerta "Versión
 * desactualizada", que tapa el contenido a capturar.
 *
 * @param {object} cdp - Conexión devuelta por `connectPage`
 * @returns {Promise<void>} **Borra las versiones que hubiera** antes de insertar la suya, así
 *          que no conserva el estado previo de esa tabla
 */
export async function ensureCurrentVersion(cdp) {
	await sql(cdp, "DELETE FROM versions;");
	await sql(
		cdp,
		`INSERT INTO versions (identifier, name, model, platform, os_version, date, app_version, current)
     VALUES ('manual', 'AIO', 'web', 'web', '1', datetime('now'), '1.0.0', 1);`,
	);
}
