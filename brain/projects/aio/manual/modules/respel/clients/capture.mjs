/**
 * Capturas de la pestana Mapa de Clientes (Respel > Comercial > Clientes).
 *
 * La pestana pinta sobre Leaflet los clientes y prospectos que tienen geolocalizacion, con un
 * panel de filtros en cascada a la izquierda, un control de capas por tipo y un globo por punto.
 *
 * Uso:
 *   node --experimental-websocket modules/respel/clients/capture.mjs --salida <carpeta>
 *        --empresa "PROMOCALI" [--solo general|capas|filtros|globo|completa|todo]
 *        [--municipio CAL] [--comuna "Comuna 2"] [--barrio San]
 *
 * No modifica nada: solo consulta y captura. Los datos presentables los deja `seed.sql`, que hay
 * que aplicar antes o el globo sale con la mitad de sus filas en guion.
 */

import {
	clearHighlights,
	clickAt,
	clickByText,
	closeBrowser,
	evaluate,
	highlight,
	moveMouseTo,
	screenshot,
	scrollWheel,
	setViewport,
	wait,
	waitForSelector,
	waitUntil,
} from "../../../lib/browser.mjs";
import { clickChecked } from "../../../lib/dialogs.mjs";
import {
	DEFAULT_BASE,
	VIEWPORT,
	describeScreen,
	goTo,
	openSession,
	searchFetcherSelect,
	selectOption,
	settleRequests,
	testCredentials,
} from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "PROMOCALI");
const only = arg("solo", "todo");

/** Zona con la que se acota el mapa para poder abrir un globo concreto. */
const municipality = arg("municipio", "CALI");
const commune = arg("comuna", "Comuna 2");
const neighborhood = arg("barrio", "San Vicente");

const CLIENTS_VIEW = "/respel/clients";
const MAP = ".client-map.leaflet-container";
const LAYER_CONTROL = ".leaflet-control-layers.custom-icon-control";
const FULLSCREEN_BUTTON = ".client-map__card .v-toolbar button";

/**
 * La vista no cabe en los 795 px del manual: el panel lleva siete filtros, los botones, los dos
 * contadores y el aviso del tope. Se sube el alto y se conserva el ancho de siempre.
 */
const TALL = { width: VIEWPORT.width, height: 1250 };

const wants = (name) => only === "todo" || only === name;

/**
 * Espera a que el mapa tenga marcadores pintados.
 *
 * @param {object} cdp - Conexion al navegador.
 * @param {number} [timeout] - Tope en milisegundos.
 * @returns {Promise<void>} - Lanza si el mapa se queda vacio.
 */
const waitForMarkers = (cdp, timeout = 90000) =>
	waitUntil(
		cdp,
		`document.querySelectorAll('.client-map-marker, .client-map-cluster').length > 0`,
		{ timeout, what: "los marcadores del mapa" },
	);

/**
 * Cuenta lo que hay pintado, sumando lo que representan los grupos.
 *
 * @param {object} cdp - Conexion al navegador.
 * @returns {Promise<object>} - `{ clientes, prospectos, totales }` para poder decidir si la
 *   captura muestra algo o documentaria una pantalla vacia.
 */
const painted = (cdp) =>
	evaluate(
		cdp,
		`(() => {
			const suma = (sel) => [...document.querySelectorAll(sel)]
				.reduce((t, e) => t + (Number(e.textContent.trim()) || 0), 0);

			return JSON.stringify({
				clientes: document.querySelectorAll('.client-map-marker--client').length + suma('.client-map-cluster--client'),
				prospectos: document.querySelectorAll('.client-map-marker--prospect').length + suma('.client-map-cluster--prospect'),
				totales: [...document.querySelectorAll('.client-map-count')].map(e => e.innerText.replace(/\\s+/g, ' ').trim()),
			});
		})()`,
	).then((raw) => JSON.parse(raw));

/**
 * Elige un valor en uno de los buscadores de tres caracteres del panel.
 *
 * @param {object} cdp - Conexion al navegador.
 * @param {string} label - Etiqueta que precede al campo (Municipio, Comuna, Barrio).
 * @param {string} term - Texto que se teclea; tiene que tener tres caracteres o mas.
 * @param {string} option - Texto exacto de la opcion a elegir.
 * @returns {Promise<void>} - Lanza si el buscador no devuelve la opcion pedida.
 */
/**
 * Elige la opcion cuyo texto coincide **exacto**.
 *
 * `selectOption` compara por inclusion, y en los maestros de zona eso falla: buscando "CALI" la
 * primera coincidencia es "SAN CALIXTO".
 *
 * @param {object} cdp - Conexion al navegador.
 * @param {string} text - Texto exacto de la opcion.
 * @returns {Promise<void>} - Lanza si ninguna opcion coincide exactamente.
 */
async function selectExactOption(cdp, text) {
	const point = await evaluate(
		cdp,
		`(() => {
			const item = [...document.querySelectorAll('.v-list-item')]
				.find(e => e.textContent.trim() === ${JSON.stringify(text)});
			if (!item) return '';
			const r = item.getBoundingClientRect();

			return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
		})()`,
	);

	if (!point) throw new Error(`Ninguna opcion dice exactamente "${text}"`);

	const { x, y } = JSON.parse(point);

	await clickAt(cdp, x, y);
	await wait(400);
}

async function pickZone(cdp, label, term, option) {
	// Los campos del panel no tienen id: se llega por la etiqueta hermana que los precede.
	const selector = await evaluate(
		cdp,
		`(() => {
			const etiquetas = [...document.querySelectorAll('.v-card .v-label')];
			const etiqueta = etiquetas.find(e => e.textContent.trim() === ${JSON.stringify(label)});
			if (!etiqueta) return '';
			const campo = etiqueta.nextElementSibling?.querySelector('input');
			if (!campo) return '';
			campo.setAttribute('data-captura', ${JSON.stringify(label)});

			return '[data-captura="' + ${JSON.stringify(label)} + '"]';
		})()`,
	);

	if (!selector) throw new Error(`No se encontro el filtro "${label}" en el panel`);

	const options = await searchFetcherSelect(cdp, selector, term);

	if (!options.some((text) => text.trim() === option))
		throw new Error(`El filtro "${label}" no ofrecio "${option}". Devolvio: ${options.join(" | ")}`);

	await selectExactOption(cdp, option);
	await wait(600);
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
			width: TALL.width,
			height: TALL.height,
		}));

		await goTo(cdp, base, CLIENTS_VIEW, { selector: ".v-tab" });
		await wait(1500);

		await settleRequests(cdp, () => clickByText(cdp, ".v-tab", "Mapa"), {
			what: "la carga del mapa",
			timeout: 120000,
		});
		await waitForSelector(cdp, MAP, { timeout: 60000 });
		await waitForMarkers(cdp);
		await wait(3500);

		const inicial = await painted(cdp);

		console.log("pintado al abrir:", JSON.stringify(inicial));

		if (!inicial.clientes && !inicial.prospectos)
			throw new Error("El mapa abrio sin puntos: no tiene sentido capturar la vista vacia");

		// El primer encuadre abarca desde Mexico hasta Peru: un cliente de la empresa tiene una
		// coordenada fuera de Colombia y estira el fitBounds. Asi la captura saldria con medio
		// oceano, de modo que se acerca sobre el grueso de los puntos antes de capturar.
		await zoomOverPoints(cdp);

		if (wants("general")) {
			await screenshot(cdp, `${outputDir}/mapa-general.png`);
			console.log("captura: mapa-general");
		}

		if (wants("capas")) {
			// El control se despliega con el mouseenter real, como el del AVL.
			const box = await evaluate(
				cdp,
				`(() => {
					const c = document.querySelector('${LAYER_CONTROL}');
					if (!c) return '';
					const r = c.getBoundingClientRect();

					return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
				})()`,
			);

			if (!box) throw new Error("No se encontro el control de capas del mapa");

			const { x, y } = JSON.parse(box);

			await moveMouseTo(cdp, x, y);
			await wait(1500);
			await screenshot(cdp, `${outputDir}/mapa-capas.png`, { selector: MAP });
			console.log("captura: mapa-capas");

			// Se saca el cursor para que el panel se recoja antes de la siguiente captura.
			await moveMouseTo(cdp, 40, 40);
			await wait(1200);
		}

		if (wants("filtros") || wants("globo")) {
			await pickZone(cdp, "Municipio", municipality, municipality);
			await pickZone(cdp, "Comuna", commune, commune);
			await pickZone(cdp, "Barrio", neighborhood, neighborhood);

			await settleRequests(cdp, () => clickByText(cdp, ".v-card button", "Buscar"), {
				what: "la busqueda con filtros",
				timeout: 90000,
			});
			await wait(4000);
			await waitForMarkers(cdp);
			await wait(2500);

			const filtrado = await painted(cdp);

			console.log("pintado tras filtrar:", JSON.stringify(filtrado));

			if (wants("filtros")) {
				// Sin esto el ultimo filtro tocado se queda con su anillo de foco, que en la captura
				// se lee como un campo marcado en rojo.
				await evaluate(cdp, `document.activeElement && document.activeElement.blur()`);
				await wait(600);
				await screenshot(cdp, `${outputDir}/mapa-filtros.png`);
				console.log("captura: mapa-filtros");
			}

			if (wants("globo")) {
				const abierto = await openClientPopup(cdp);

				if (!abierto) throw new Error("No se pudo abrir el globo de ningun cliente");

				await wait(1500);
				await screenshot(cdp, `${outputDir}/mapa-globo.png`, { selector: MAP });
				console.log("captura: mapa-globo");
			}
		}

		if (wants("completa")) {
			await evaluate(cdp, `document.querySelector('.leaflet-popup-close-button')?.click()`);
			await wait(800);

			// Se quitan los filtros de la zona: la pantalla completa se documenta con el mapa lleno,
			// no con los tres puntos de un barrio.
			await settleRequests(cdp, () => clickByText(cdp, ".v-card button", "Limpiar"), {
				what: "la limpieza de filtros",
				timeout: 90000,
			});
			await wait(4000);
			await waitForMarkers(cdp);

			await clickChecked(cdp, FULLSCREEN_BUTTON, { what: "el boton de pantalla completa" });
			await wait(6000);
			await waitForSelector(cdp, ".v-dialog .client-map", { timeout: 60000 });
			await waitForMarkers(cdp);
			await wait(3500);

			// El dialogo monta **otra** instancia del mapa, que arranca en su propio encuadre: el
			// acercamiento hay que hacerlo aqui dentro, no sobre el mapa de la pagina.
			await zoomOverPoints(cdp, 6, ".v-dialog ");

			// El dialogo ocupa toda la ventana, asi que la ventana **es** el encuadre. Recortar por
			// ".v-dialog .v-card" agarraba la tarjeta de filtros, que es la primera de adentro.
			await screenshot(cdp, `${outputDir}/mapa-pantalla-completa.png`);
			console.log("captura: mapa-pantalla-completa");
		}

		console.log("\nListo. Capturas en", outputDir);
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

/**
 * Acerca el mapa sobre la zona donde esta el grueso de los puntos.
 *
 * Se apunta al grupo mas numeroso que haya en pantalla y se gira la rueda encima: Leaflet acerca
 * hacia el cursor, asi que el encuadre termina sobre la ciudad en vez de sobre el oceano.
 *
 * @param {object} cdp - Conexion al navegador.
 * @param {number} [steps] - Cuantas vueltas de rueda.
 * @returns {Promise<void>} - No lanza si no hay grupos: deja el mapa como estaba.
 */
async function zoomOverPoints(cdp, steps = 6, scope = "") {
	const point = await evaluate(
		cdp,
		`(() => {
			const grupos = [...document.querySelectorAll('${scope}.client-map-cluster')]
				.map(e => ({ n: Number(e.textContent.trim()) || 0, r: e.getBoundingClientRect() }))
				.filter(g => g.r.width > 0)
				.sort((a, b) => b.n - a.n);
			if (!grupos.length) return '';
			const r = grupos[0].r;

			return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
		})()`,
	);

	if (!point) return;

	const { x, y } = JSON.parse(point);

	for (let i = 0; i < steps; i++) {
		await scrollWheel(cdp, x, y, -240);
		await wait(1200);
	}

	// Al acercarse se sale de lo ya consultado y la vista vuelve a pedir puntos.
	await wait(4000);
	await waitForMarkers(cdp);
	await wait(2000);
}

/**
 * Abre el globo de un cliente probando los marcadores azules que haya en pantalla.
 *
 * Se prueban varios porque un marcador puede quedar debajo de otro: los prospectos se pintan en un
 * grupo aparte que va encima del de clientes.
 *
 * @param {object} cdp - Conexion al navegador.
 * @returns {Promise<boolean>} - Falso si ninguno abrio globo; hay que comprobarlo.
 */
async function openClientPopup(cdp) {
	const raw = await evaluate(
		cdp,
		`JSON.stringify([...document.querySelectorAll('.client-map-marker--client')].map(e => {
			const r = e.getBoundingClientRect();

			return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
		}))`,
	);

	const markers = JSON.parse(raw);

	console.log("marcadores de cliente en pantalla:", markers.length);

	for (const { x, y } of markers) {
		await clickAt(cdp, x, y);
		await wait(1800);

		// El globo monta MapPopupCard, que no es un VCard: su marca es .map-popup-card.
		const open = await evaluate(cdp, `!!document.querySelector('.leaflet-popup-content .map-popup-card')`);

		if (open) return true;
	}

	return false;
}

run();
