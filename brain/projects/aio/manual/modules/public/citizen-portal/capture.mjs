/**
 * Capturas del Portal Ciudadano: la portada a la que llega quien escanea el QR de un elemento y
 * su menú de accesibilidad.
 *
 * Es una vista pública —`meta.public` + `layout: 'blank'`—: sin login, sin empresa y sin módulo.
 * Con `--token` se captura además la entrada real del QR, que es la que muestra en el encabezado
 * la empresa y los datos del elemento escaneado; sin él solo la entrada por enlace directo.
 *
 * Uso:
 *   node modules/public/citizen-portal/capture.mjs --salida <carpeta>
 *        [--token <token del QR>] [--base http://localhost:5173] [--puerto 9222]
 *
 * El token se saca del backend con el mismo codificador que imprime el QR:
 *   docker exec <contenedor> php artisan tinker --execute="echo \App\Helpers\QrIdCodec::encode(<id>);"
 */

import {
	clearHighlights,
	click,
	closeBrowser,
	evaluate,
	highlight,
	pressEscape,
	screenshot,
	setViewport,
	wait,
	waitForSelector,
	waitUntil,
} from "../../../lib/browser.mjs";
import { DEFAULT_BASE, VIEWPORT, describeScreen, openPublicPage } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const port = Number(arg("puerto", 9222));
const token = arg("token", "");

/** Portada del portal, tal como se abre por enlace directo. */
const LANDING_VIEW = "/public/citizen-portal";

/** Ancho y alto de un celular de gama media, para la captura de cómo se ve al escanear. */
const PHONE_VIEWPORT = { width: 390, height: 844 };

/**
 * Atributo que `useAccessibilityPreferences` cuelga del `<html>` por cada preferencia activa.
 * Es lo que se comprueba para saber que el ajuste se aplicó de verdad, en vez de suponerlo por
 * haber hecho click.
 */
const PREFERENCE_ATTRIBUTES = {
	highContrast: "data-a11y-contrast",
	highlightLinks: "data-a11y-links",
	readableFont: "data-a11y-font",
	textSpacing: "data-a11y-spacing",
	reduceMotion: "data-a11y-motion",
};

/**
 * Selector del interruptor de una preferencia dentro del panel.
 *
 * Se ancla al **final** del `aria-describedby` porque el panel prefija sus ids con un identificador
 * único por instancia (`${uid}-hint-highContrast`): el prefijo cambia en cada montaje, el sufijo no.
 */
const toggleSelector = (key) => `.a11y-widget__option[aria-describedby$="hint-${key}"]`;

/** Abre el menú de accesibilidad y espera a que termine la transición del diálogo. */
const openPanel = async (cdp) => {
	await click(cdp, ".a11y-widget__fab");
	await waitUntil(cdp, `document.querySelector('.a11y-widget__panel')`, { what: "el menú de accesibilidad" });

	// La transición de entrada de VDialog: capturar antes deja el panel a medio desplegar.
	await wait(600);
};

/**
 * Cierra el menú de accesibilidad.
 *
 * Espera a que el panel salga del DOM y no solo a que se dispare el cierre: VDialog lo desmonta al
 * terminar la transición, y capturar en ese hueco deja el fondo con el velo puesto.
 */
const closePanel = async (cdp) => {
	await pressEscape(cdp);
	await waitUntil(cdp, `!document.querySelector('.a11y-widget__panel')`, { what: "que se cierre el menú de accesibilidad" });

	// Al cerrarse, VDialog devuelve el foco al botón que lo abrió y este queda con su anillo de
	// foco puesto. Es correcto para quien navega con teclado, pero en la captura se lee como si el
	// botón estuviera activado.
	await evaluate(cdp, `(() => { document.activeElement?.blur(); return true; })()`);
	await wait(400);
};

/**
 * Deja una preferencia de sí/no en el estado pedido. Con el panel ya abierto.
 *
 * @throws {Error} Si el interruptor no está, o si tras pulsarlo el `<html>` no quedó con el
 *         atributo esperado: sin esa comprobación la captura sale sin el ajuste puesto
 */
const setPreference = async (cdp, key, on) => {
	const selector = toggleSelector(key);
	const current = await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-checked')`);

	if (current === null || current === undefined) throw new Error(`No está el interruptor de "${key}" en el panel`);

	if ((current === "true") !== on) {
		await click(cdp, selector);
		await wait(300);
	}

	await waitUntil(cdp, `document.documentElement.hasAttribute('${PREFERENCE_ATTRIBUTES[key]}') === ${on}`, {
		timeout: 5000,
		what: `que "${key}" quedara en ${on}`,
	});
};

/** Aplica una preferencia, captura la portada con ella puesta y la vuelve a quitar. */
const capturePreference = async (cdp, key, file) => {
	await openPanel(cdp);
	await setPreference(cdp, key, true);
	await closePanel(cdp);

	await screenshot(cdp, `${outputDir}/${file}`);

	await openPanel(cdp);
	await setPreference(cdp, key, false);
	await closePanel(cdp);
};

/**
 * Baja el panel hasta el final de su propio scroll.
 *
 * El cuerpo del menú es `overflow-y: auto` con un alto máximo del 85% de la ventana, así que a la
 * altura del manual (795 px) el botón de restablecer queda debajo del pliegue.
 */
const scrollPanelToBottom = async (cdp) => {
	await evaluate(
		cdp,
		`(() => { const body = document.querySelector('.a11y-widget__body');
      if (body) body.scrollTop = body.scrollHeight; return true; })()`,
	);
	await wait(400);
};

/** Los tres botones "A" del tamaño de texto, en orden: normal, grande y muy grande. */
const SIZE_STEPS = ".a11y-widget__sizes .a11y-widget__size-step";

/**
 * Elige uno de los tres niveles de tamaño de texto. Con el panel ya abierto.
 *
 * @param {number} index - 0 normal, 1 grande, 2 muy grande
 * @returns {Promise<string>} La etiqueta accesible del nivel aplicado, en el idioma de la página
 * @throws {Error} Si el nivel no queda marcado, que es lo que delata un cambio en el control
 */
const setFontScale = async (cdp, index) => {
	await click(cdp, SIZE_STEPS, { index });
	await waitUntil(cdp, `document.querySelectorAll('${SIZE_STEPS}')[${index}]?.getAttribute('aria-pressed') === 'true'`, {
		timeout: 5000,
		what: `el nivel de tamaño de texto ${index}`,
	});

	// El cambio de `font-size` del <html> rehace el layout de toda la página, panel incluido.
	await wait(500);

	return evaluate(cdp, `document.querySelectorAll('${SIZE_STEPS}')[${index}]?.getAttribute('aria-label')`);
};

/**
 * Cambia el idioma del portal.
 *
 * @throws {Error} Si el `<html lang>` no queda en ese idioma, que es el efecto que hace que un
 *         lector de pantalla cambie de voz y lo que de verdad hay que comprobar
 */
const setLanguage = async (cdp, code) => {
	await click(cdp, `.cp-header__language[lang="${code}"]`);
	await waitUntil(cdp, `document.documentElement.lang === '${code}'`, { timeout: 5000, what: `el idioma ${code}` });
	await wait(300);
};

const main = async () => {
	const { cdp, chrome } = await openPublicPage({
		base,
		path: LANDING_VIEW,
		selector: ".cp-option",
		port,
	});

	try {
		// La portada tal como llega quien abre el enlace sin escanear: sin empresa ni elemento.
		await screenshot(cdp, `${outputDir}/landing.png`);

		// El selector de idioma es un par de botones pequeños en una esquina: señalado.
		await highlight(cdp, ".cp-header__languages", { padding: 8 });
		await screenshot(cdp, `${outputDir}/idioma.png`);
		await clearHighlights(cdp);

		await setLanguage(cdp, "en");
		await screenshot(cdp, `${outputDir}/landing-ingles.png`);
		await setLanguage(cdp, "es");

		// Las opciones sin vista propia responden con un aviso. La primera es "Horarios y rutas".
		await click(cdp, ".cp-option");
		await waitForSelector(cdp, ".v-snackbar__content", { timeout: 10000 });
		await wait(400);
		await screenshot(cdp, `${outputDir}/opcion-proximamente.png`);

		// El aviso se va solo a los 3,5 s; capturar encima dejaría el velo en la siguiente imagen.
		await waitUntil(cdp, `!document.querySelector('.v-snackbar__content')`, {
			timeout: 12000,
			what: "que se cierre el aviso",
		});

		// El botón de accesibilidad está pegado al borde derecho y es fácil de pasar por alto.
		await highlight(cdp, ".a11y-widget__fab", { padding: 8 });
		await screenshot(cdp, `${outputDir}/boton-accesibilidad.png`);
		await clearHighlights(cdp);

		await openPanel(cdp);
		await screenshot(cdp, `${outputDir}/panel-accesibilidad.png`);

		// Los tres botones "A" son el control menos evidente del panel: señalado aparte.
		await highlight(cdp, ".a11y-widget__sizes", { padding: 8 });
		await screenshot(cdp, `${outputDir}/control-tamano.png`);
		await clearHighlights(cdp);

		const level = await setFontScale(cdp, 2);

		console.log(`  tamaño de texto: "${level}"`);
		await closePanel(cdp);
		await screenshot(cdp, `${outputDir}/texto-ampliado.png`);

		await openPanel(cdp);
		await setFontScale(cdp, 0);
		await closePanel(cdp);

		await capturePreference(cdp, "readableFont", "fuente-legible.png");
		await capturePreference(cdp, "textSpacing", "espaciado-texto.png");
		await capturePreference(cdp, "highlightLinks", "resaltar-enlaces.png");

		// El alto contraste se deja puesto para capturar también el panel en negro y amarillo, que
		// es donde aparece el botón de restablecer.
		await openPanel(cdp);
		await setPreference(cdp, "highContrast", true);
		await closePanel(cdp);
		await screenshot(cdp, `${outputDir}/alto-contraste.png`);

		await openPanel(cdp);
		await scrollPanelToBottom(cdp);
		await waitUntil(cdp, `document.querySelector('.a11y-widget__reset')`, {
			timeout: 5000,
			what: "el botón de restablecer (solo aparece cuando algo dejó de estar en su valor inicial)",
		});
		await screenshot(cdp, `${outputDir}/panel-restablecer.png`);

		await click(cdp, ".a11y-widget__reset");
		await waitUntil(cdp, `!document.documentElement.hasAttribute('data-a11y-contrast')`, {
			timeout: 5000,
			what: "que el restablecer dejara la página como estaba",
		});
		await closePanel(cdp);

		// Cómo se ve en el celular, que es de donde se escanea el QR.
		await setViewport(cdp, { ...PHONE_VIEWPORT, mobile: true });
		await wait(1000);
		await screenshot(cdp, `${outputDir}/landing-movil.png`);
		await setViewport(cdp, VIEWPORT);

		/*
		 * La entrada de verdad del QR. Va al final porque deja el elemento cargado en el estado
		 * compartido del portal, y con él el encabezado ya no vuelve al caso "sin elemento".
		 */
		if (token) {
			await cdp.send("Page.navigate", { url: `${base}${LANDING_VIEW}/view/${encodeURIComponent(token)}` });
			await waitForSelector(cdp, ".cp-option", { timeout: 60000 });
			await waitUntil(cdp, `document.querySelector('.cp-header__company')`, {
				timeout: 20000,
				what: "los datos del elemento escaneado (¿el token no resuelve?)",
			});
			await wait(800);
			await screenshot(cdp, `${outputDir}/landing-qr.png`);
		}
		else {
			console.log("  AVISO: sin --token no se genera landing-qr.png (la entrada por código QR)");
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
