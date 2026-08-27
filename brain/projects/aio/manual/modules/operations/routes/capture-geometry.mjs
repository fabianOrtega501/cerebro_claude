/**
 * Capturas de la consulta geográfica de una ruta (módulo Operaciones > Rutas).
 *
 * Documenta el modal "Información geográfica de la ruta": el mapa con la geometría de línea, el
 * polígono operativo y los puntos de control, la leyenda de capas, los popups de cada capa y el
 * modo ampliado.
 *
 * Uso:
 *   node modules/operations/routes/capture-geometry.mjs --salida <carpeta>
 *        [--base http://localhost:5173] [--empresa "Empresa Demo"] [--ruta MAR-02]
 */

import { clickAt, closeBrowser, evaluate, pressEscape, screenshot, wait, waitForSelector } from "../../../lib/browser.mjs";
import {
	DEFAULT_BASE,
	describeScreen,
	goTo,
	openSession,
	pointOnPath,
	testCredentials,
	waitForNoSkeletons,
} from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "Empresa Demo");
const routeCode = arg("ruta", null);

/** La vista de rutas del módulo de Operaciones. */
const ROUTES_VIEW = "/operations/operation-routes";

/**
 * Espera a que la tabla tenga filas de verdad.
 *
 * La tabla pinta una fila incluso cuando no hay datos (la de "No data available"), así que
 * esperar `tbody tr` se cumple de inmediato. Lo que solo existe con datos es el botón de
 * consulta geográfica de cada fila.
 */
const waitForRows = async (cdp) => {
	const deadline = Date.now() + 60000;
	while (Date.now() < deadline) {
		const rows = await evaluate(cdp, `document.querySelectorAll('tbody tr button[title]').length`);
		if (rows > 0) return true;
		await wait(500);
	}
	throw new Error(`La tabla de rutas no cargó datos. Pantalla:\n${await describeScreen(cdp)}`);
};

/** Centro en pantalla del primer elemento que cumple el selector. */
const centerOf = (cdp, selector, index = 0) =>
	evaluate(
		cdp,
		`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

/**
 * Espera a que el mapa del modal esté dibujado.
 *
 * No basta con que exista el contenedor de Leaflet: las capas se dibujan cuando el contenedor
 * ya tiene tamaño, y los tiles llegan después. Capturar antes deja el mapa gris.
 */
const waitForMap = async (cdp, { timeout = 60000 } = {}) => {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const ready = await evaluate(
			cdp,
			`(() => {
        const c = document.querySelector('.v-dialog .leaflet-container');
        if (!c) return false;
        const r = c.getBoundingClientRect();
        if (r.width < 200 || r.height < 200) return false;
        const tiles = [...document.querySelectorAll('.v-dialog .leaflet-tile-loaded')];
        const shapes = document.querySelectorAll('.v-dialog .leaflet-overlay-pane path').length;
        return tiles.length > 8 && shapes > 0;
      })()`,
		);
		if (ready) {
			// Un respiro para que terminen de aparecer los tiles del borde.
			await wait(1500);

			return true;
		}
		await wait(500);
	}

	return false;
};

/** Cierra el popup abierto sobre el mapa. */
const closePopup = async (cdp) => {
	const button = await centerOf(cdp, ".v-dialog .leaflet-popup-close-button");
	if (button) await clickAt(cdp, button.x, button.y);
	await wait(600);
};

const { cdp, chrome } = await openSession({
	base,
	...testCredentials({ email: arg("email"), password: arg("password") }),
	company,
});

try {
	await goTo(cdp, base, ROUTES_VIEW, { selector: ".v-data-table" });
	await waitForRows(cdp);
	await waitForNoSkeletons(cdp);

	// La tabla de rutas con la columna de acciones, donde está el botón nuevo.
	await screenshot(cdp, `${outputDir}/tabla_rutas.png`);

	// El botón se identifica por su tooltip; con --ruta se elige la fila por su macro ruta.
	const mapButton = await evaluate(
		cdp,
		`(() => {
      const rows = [...document.querySelectorAll('tbody tr')]
        ${routeCode ? `.filter(r => r.textContent.includes(${JSON.stringify(routeCode)}))` : ""};
      for (const row of rows) {
        const b = [...row.querySelectorAll('button[title]')].find(e => /geogr/i.test(e.getAttribute('title')));
        if (b) { const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }
      }
      return null;
    })()`,
	);

	if (!mapButton) throw new Error(`No se encontró el botón de información geográfica${routeCode ? ` en la ruta ${routeCode}` : ""}.`);

	await clickAt(cdp, mapButton.x, mapButton.y);
	await waitForSelector(cdp, ".v-dialog .v-card", { timeout: 30000 });

	if (!(await waitForMap(cdp))) throw new Error("El mapa del modal no terminó de dibujarse.");

	// El modal con las tres capas visibles y la leyenda.
	await screenshot(cdp, `${outputDir}/modal_mapa.png`);

	/*
	 * Popup de la geometría. Este mapa usa el renderer SVG (no `preferCanvas`), así que las
	 * geometrías sí son `<path>` y se puede calcular un punto sobre el trazo. Aun así el click
	 * tiene que ser del ratón real: Leaflet ubica el popup con el `clientX/clientY` del evento.
	 */
	const LAYERS = [
		{ index: 1, file: "popup_geometria.png", title: "nea", name: "geometría de línea" },
		{ index: 0, file: "popup_poligono.png", title: "gono", name: "polígono" },
	];

	/*
	 * Un solo punto del trazo no basta: en el punto medio de la línea suele haber encima un
	 * marcador de punto de control, que está en un panel superior y se lleva el click. Se prueban
	 * varias fracciones del trazo y se valida que el popup abierto sea el de la capa buscada.
	 */
	const FRACTIONS = [0.5, 0.35, 0.65, 0.2, 0.8, 0.45, 0.9];

	for (const layer of LAYERS) {
		let opened = false;

		for (const fraction of FRACTIONS) {
			const point = await pointOnPath(cdp, ".v-dialog .leaflet-overlay-pane path", { index: layer.index, fraction });

			await clickAt(cdp, point.x, point.y);
			await wait(1000);

			const title = await evaluate(cdp, `(document.querySelector('.v-dialog .leaflet-popup h6') || {}).textContent || ''`);

			if (title.includes(layer.title)) {
				await screenshot(cdp, `${outputDir}/${layer.file}`);
				opened = true;
				await closePopup(cdp);
				break;
			}

			await closePopup(cdp);
		}

		if (!opened) console.log(`AVISO: no abrió el popup de la ${layer.name}`);
	}

	// Popup de un punto de control: los marcadores son divIcon, así que están en el DOM.
	const checkpoint = await centerOf(cdp, ".v-dialog .route-map-checkpoint", 2);
	if (checkpoint) {
		await clickAt(cdp, checkpoint.x, checkpoint.y);
		await wait(1200);
		if (await evaluate(cdp, `!!document.querySelector('.v-dialog .leaflet-popup')`))
			await screenshot(cdp, `${outputDir}/popup_punto_control.png`);
		else console.log("AVISO: no abrió el popup del punto de control");
		await closePopup(cdp);
	}
	else { console.log("AVISO: la ruta no tiene puntos de control dibujados"); }

	// Una capa oculta desde la leyenda, para documentar el control de capas.
	const legendCheckbox = await centerOf(cdp, ".v-dialog .route-map-legend .v-checkbox input", 1);
	if (legendCheckbox) {
		await clickAt(cdp, legendCheckbox.x, legendCheckbox.y);
		await wait(1000);
		await screenshot(cdp, `${outputDir}/modal_mapa_capa_oculta.png`);
		await clickAt(cdp, legendCheckbox.x, legendCheckbox.y);
		await wait(1000);
	}

	// Modo ampliado.
	const expandButton = await centerOf(cdp, ".v-dialog-expand-btn");

	await clickAt(cdp, expandButton.x, expandButton.y);
	await wait(2500);
	await waitForMap(cdp);
	await screenshot(cdp, `${outputDir}/modal_mapa_ampliado.png`);

	// Se restaura y se cierra para dejar la pantalla lista para el resto del flujo.
	const restoreButton = await centerOf(cdp, ".v-dialog-expand-btn");

	await clickAt(cdp, restoreButton.x, restoreButton.y);
	await wait(1500);
	await pressEscape(cdp);

	const closeButton = await evaluate(
		cdp,
		`(() => { const e = [...document.querySelectorAll('.v-dialog-close-btn')].find(x => !x.classList.contains('v-dialog-expand-btn'));
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (closeButton) await clickAt(cdp, closeButton.x, closeButton.y);
	await wait(1500);

	/*
	 * El mismo botón existe por cada versión de la geometría, en el paso Geometrías del wizard
	 * de la ruta. Se documentan los dos modos del wizard: consulta (botón Ver), donde la fila
	 * solo tiene la consulta geográfica, y edición (botón Editar), donde además están editar y
	 * eliminar.
	 */
	const openGeometriesStep = async (buttonSelector) => {
		const rowButton = await evaluate(
			cdp,
			`(() => {
        const rows = [...document.querySelectorAll('tbody tr')]
          ${routeCode ? `.filter(r => r.textContent.includes(${JSON.stringify(routeCode)}))` : ""};
        for (const row of rows) {
          const b = row.querySelector(${JSON.stringify(buttonSelector)});
          if (b) { const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }
        }
        return null;
      })()`,
		);

		if (!rowButton) {
			console.log(`AVISO: no se encontró el botón ${buttonSelector} en la tabla de rutas`);

			return false;
		}

		await clickAt(cdp, rowButton.x, rowButton.y);
		await waitForSelector(cdp, ".v-dialog .stepper-icon-step", { timeout: 60000 });
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });

		/*
		 * Los pasos del wizard viven en un `VSlideGroup`: los últimos quedan fuera de la vista y
		 * hay que correrlos con la flecha para poder hacerles click.
		 */
		const locateStep = () =>
			evaluate(
				cdp,
				`(() => { const e = [...document.querySelectorAll('.v-dialog .stepper-icon-step')]
          .find(x => /geometr/i.test(x.textContent));
          if (!e) return null;
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.right > window.innerWidth) return null;
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
			);

		let step = await locateStep();

		for (let attempt = 0; !step && attempt < 5; attempt++) {
			const arrow = await centerOf(cdp, ".v-dialog .v-slide-group__next");
			if (!arrow) break;
			await clickAt(cdp, arrow.x, arrow.y);
			await wait(700);
			step = await locateStep();
		}

		if (!step) {
			console.log("AVISO: no se encontró el paso Geometrías del wizard");

			return false;
		}

		await clickAt(cdp, step.x, step.y);
		await wait(2500);
		await waitForNoSkeletons(cdp, { within: ".v-dialog" });

		return true;
	};

	/**
	 * Cierra el diálogo que está encima con el botón de su esquina.
	 *
	 * Cuando hay dos diálogos abiertos (el wizard y el mapa que se abre desde él) el DOM tiene
	 * varios botones de cerrar: hay que tomar el último, que es el del diálogo de arriba.
	 */
	const closeDialog = async () => {
		const button = await evaluate(
			cdp,
			`(() => { const e = [...document.querySelectorAll('.v-dialog-close-btn')]
        .filter(x => !x.classList.contains('v-dialog-expand-btn')).pop();
        if (!e) return null; const r = e.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
		);

		if (button) await clickAt(cdp, button.x, button.y);
		await wait(1500);
	};

	// Wizard en consulta: la tabla de versiones y el mapa de la versión seleccionada.
	if (await openGeometriesStep("button.v-show")) {
		await screenshot(cdp, `${outputDir}/tab_geometrias.png`);

		const versionButton = await evaluate(
			cdp,
			`(() => { const b = [...document.querySelectorAll('.v-dialog tbody button[title]')]
        .find(e => /geogr/i.test(e.getAttribute('title')));
        if (!b) return null; const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
		);

		if (versionButton) {
			await clickAt(cdp, versionButton.x, versionButton.y);
			await wait(1500);
			if (await waitForMap(cdp)) await screenshot(cdp, `${outputDir}/modal_mapa_version.png`);
			else console.log("AVISO: el mapa de la versión no terminó de dibujarse");
			await closeDialog();
		}
		else { console.log("AVISO: no se encontró el botón de consulta geográfica en la tabla de geometrías"); }
	}

	await closeDialog();

	// Wizard en edición: la columna de acciones completa (consulta geográfica, editar y eliminar).
	if (await openGeometriesStep("button.v-update")) {
		await screenshot(cdp, `${outputDir}/tab_geometrias_edicion.png`);
		await closeDialog();
	}

	console.log("Capturas listas en", outputDir);
}
catch (error) {
	console.error("ERROR:", error.message);
	await screenshot(cdp, `${outputDir}/_fallo.png`);
	console.log(
		await evaluate(
			cdp,
			`JSON.stringify({
        dialogos: document.querySelectorAll('.v-dialog').length,
        mapa: !!document.querySelector('.leaflet-container'),
        figuras: document.querySelectorAll('.leaflet-overlay-pane path').length,
        marcadores: document.querySelectorAll('.route-map-checkpoint').length,
        skeletons: document.querySelectorAll('.v-skeleton-loader').length,
        texto: document.body.innerText.slice(0, 600),
      }, null, 1)`,
		),
	);
}
finally {
	await closeBrowser(cdp, chrome);
}
