/**
 * Capturas de "Reciclaje y voluminosos" del Portal Ciudadano.
 *
 * Es la única vista del portal que **sí** necesita el backend: las empresas publicadas, los puntos,
 * sus tipos y la plantilla del enlace "Cómo llegar". Sigue sin necesitar sesión.
 *
 * Uso:
 *   node modules/public/citizen-portal/capture-recycling.mjs --salida <carpeta>
 *        [--token <token del QR>] [--lat 8.97] [--lng -79.525]
 *        [--base http://localhost:5173] [--puerto 9222]
 *
 * Antes de correr, comprobar que el ambiente local tiene puntos publicados:
 *   curl -s "$AIO_API_URL/companies/v0/get-public-citizen-portal-companies"
 *   curl -s "$AIO_API_URL/items/v0/get-public-collection-points?company_id=<id>"
 * Documentar un mapa vacío es peor que no documentarlo.
 *
 * Las coordenadas por defecto caen en Ciudad de Panamá, que es donde están los puntos de los datos
 * de prueba. Con otro juego de datos hay que pasar `--lat` y `--lng`.
 */

import {
	clearHighlights,
	click,
	clickByText,
	closeBrowser,
	evaluate,
	highlight,
	screenshot,
	setGeolocation,
	setViewport,
	wait,
	waitUntil,
} from "../../../lib/browser.mjs";
import { DEFAULT_BASE, VIEWPORT, describeScreen, openPublicPage, refreshMap } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const port = Number(arg("puerto", 9222));
const token = arg("token", "");

/** Ubicación simulada del ciudadano. Por defecto, Ciudad de Panamá. */
const userLocation = {
	latitude: Number(arg("lat", 8.97)),
	longitude: Number(arg("lng", -79.525)),
};

const RECYCLING_VIEW = "/public/citizen-portal/recycling-bulky";

/**
 * Más alta que el resto del manual, y a propósito.
 *
 * El mapa mide el 60% del alto de la ventana y debajo lleva su lista, así que con los 795 px de
 * `VIEWPORT` la pantalla no cabe: la captura corta el mapa por la mitad y la lista no sale. El
 * ancho **sí** es el de siempre, que es lo que hace que las imágenes se vean parejas en el manual.
 */
const TALL_VIEWPORT = { width: VIEWPORT.width, height: 1200 };

/** Ancho y alto de un celular de gama media, para la captura de cómo se ve al escanear. */
const PHONE_VIEWPORT = { width: 390, height: 844 };

/**
 * Espera a que el mapa tenga puntos dibujados y las teselas cargadas.
 *
 * No basta con que exista `.leaflet-container`: se monta vacío y los puntos llegan después de
 * varias consultas encadenadas. Capturar antes deja un mapa gris con "Cargando puntos de acopio…".
 *
 * @returns {Promise<number>} Cuántos pines y grupos hay dibujados
 */
const waitForPoints = async (cdp) => {
	await waitUntil(cdp, `document.querySelectorAll('.cp-map__pin, .cp-map__cluster').length > 0`, {
		timeout: 90000,
		what: "los puntos de acopio en el mapa",
	});

	await waitUntil(cdp, `[...document.querySelectorAll('.leaflet-tile')].every(t => t.complete)`, {
		timeout: 60000,
		what: "las teselas del mapa",
	});
	await wait(1200);

	return evaluate(cdp, `document.querySelectorAll('.cp-map__pin, .cp-map__cluster').length`);
};

/** Deja el mapa quieto y del tamaño de su contenedor antes de capturar. */
const settleMap = async (cdp) => {
	if (!(await refreshMap(cdp)))
		console.log("  AVISO: el mapa no llegó a ocupar todo su contenedor");

	await waitForPoints(cdp);
};

/** Texto del recuento de la lista, para dejar constancia de qué se capturó. */
const readCount = (cdp) => evaluate(cdp, `document.querySelector('.cp-view__count')?.textContent.trim()`);

/** Espera a que el globo de un punto esté abierto y pintado. */
const waitForPopup = async (cdp) => {
	await waitUntil(cdp, `document.querySelector('.leaflet-popup .cp-popup')`, {
		timeout: 20000,
		what: "el globo del punto",
	});
	await wait(1200);
};

const main = async () => {
	const { cdp, chrome } = await openPublicPage({
		base,
		path: RECYCLING_VIEW,
		selector: ".cp-map",
		port,
		...TALL_VIEWPORT,
	});

	try {
		/*
		 * Primero el camino sin ubicación y sin QR, que es el de quien entra por la portada: el mapa
		 * se encuadra en toda la zona de la empresa y las tarjetas salen sin distancia.
		 */
		await settleMap(cdp);
		console.log(`  sin ubicación: ${await readCount(cdp)} punto(s) en la lista`);
		await screenshot(cdp, `${outputDir}/reciclaje.png`);

		// Los filtros por tipo son la parte menos evidente de la pantalla.
		await highlight(cdp, ".cp-view__filters", { padding: 8 });
		await screenshot(cdp, `${outputDir}/reciclaje-filtros.png`);
		await clearHighlights(cdp);

		/*
		 * Un tipo apagado: la píldora queda tachada y el recuento baja. Se apaga el tipo con **más**
		 * puntos, no el primero de la fila: apagar uno con un solo punto deja el recuento casi igual
		 * y la captura no enseña el efecto que el documento describe.
		 */
		const busiestType = await evaluate(
			cdp,
			`(() => {
        const counts = {};
        for (const card of document.querySelectorAll('.cp-view__point')) {
          const type = card.querySelectorAll('.cp-view__point-line')[0]?.textContent.trim();
          if (type) counts[type] = (counts[type] ?? 0) + 1;
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      })()`,
		);

		const filterOff = busiestType && (await clickByText(cdp, ".cp-view__filter", busiestType));

		if (!filterOff) await click(cdp, ".cp-view__filter");
		await wait(1500);
		console.log(`  apagado "${filterOff ? busiestType : "el primer tipo"}": ${await readCount(cdp)} punto(s)`);
		await screenshot(cdp, `${outputDir}/reciclaje-filtro-apagado.png`);

		if (filterOff) await clickByText(cdp, ".cp-view__filter", busiestType);
		else await click(cdp, ".cp-view__filter");
		await wait(1500);

		await highlight(cdp, ".cp-map__actions", { padding: 8 });
		await screenshot(cdp, `${outputDir}/reciclaje-controles.png`);
		await clearHighlights(cdp);

		/*
		 * Pulsar una tarjeta acerca el mapa al punto y abre su globo. El globo se abre al terminar el
		 * movimiento, así que hay que esperarlo y no capturar en cuanto se hace click.
		 */
		await click(cdp, ".cp-view__point");
		await waitForPopup(cdp);
		await screenshot(cdp, `${outputDir}/reciclaje-punto.png`);

		// Y el globo de cerca, que es donde se leen sus filas y el enlace de "Cómo llegar".
		await screenshot(cdp, `${outputDir}/reciclaje-globo.png`, { selector: ".leaflet-popup", margin: 14 });

		/*
		 * Ahora el camino con ubicación. Se recarga: el permiso se pide al montar la vista, así que
		 * concederlo con la vista ya montada no cambiaría nada.
		 */
		await setGeolocation(cdp, { origin: base, ...userLocation, accuracy: 40 });
		await cdp.send("Page.navigate", { url: `${base}${RECYCLING_VIEW}` });
		await wait(2500);
		await settleMap(cdp);

		if (!(await evaluate(cdp, `!!document.querySelector('.cp-map__me')`)))
			throw new Error("No apareció el marcador del ciudadano: la ubicación simulada no llegó a la vista");

		console.log(`  con ubicación: ${await readCount(cdp)} punto(s) en la lista`);
		await screenshot(cdp, `${outputDir}/reciclaje-ubicacion.png`);

		// En el celular las dos columnas se apilan: el mapa arriba y la lista debajo.
		await setViewport(cdp, { ...PHONE_VIEWPORT, mobile: true });
		await wait(1500);
		await settleMap(cdp);

		/*
		 * Bajar hasta el mapa. En una pantalla de celular el título, la introducción y las píldoras
		 * de los tipos ocupan la primera pantalla entera, así que sin desplazar solo saldría el borde
		 * superior del mapa, que es justo lo que esta captura tiene que mostrar apilado con la lista.
		 */
		await evaluate(cdp, `(() => { document.querySelector('.cp-view__layout')?.scrollIntoView(); return true; })()`);
		await wait(1200);
		await screenshot(cdp, `${outputDir}/reciclaje-movil.png`);
		await setViewport(cdp, TALL_VIEWPORT);

		/*
		 * Y la entrada desde el código QR: el mapa abre sobre el contenedor escaneado, que se dibuja
		 * con su propio marcador, más grande y con anillo, fuera de la agrupación.
		 */
		if (token) {
			await cdp.send("Page.navigate", { url: `${base}${RECYCLING_VIEW}?item=${encodeURIComponent(token)}` });
			await wait(2500);
			await settleMap(cdp);

			await waitUntil(cdp, `document.querySelector('.cp-map__pin--scanned')`, {
				timeout: 20000,
				what: "el marcador del punto escaneado (¿el token no resuelve?)",
			});

			await click(cdp, ".cp-map__pin--scanned");
			await waitForPopup(cdp);
			await screenshot(cdp, `${outputDir}/reciclaje-escaneado.png`);
			await screenshot(cdp, `${outputDir}/reciclaje-globo-escaneado.png`, { selector: ".leaflet-popup", margin: 14 });
		}
		else {
			console.log("  AVISO: sin --token no se generan las capturas del punto escaneado");
		}

		console.log(`\nCapturas en ${outputDir}`);
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		console.error(`Pantalla:\n${await describeScreen(cdp).catch(() => "(no se pudo leer)")}`);
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
