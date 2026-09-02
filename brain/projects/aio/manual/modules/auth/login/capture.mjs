/**
 * Capturas de la pantalla de Inicio de Sesión: la vista completa y el recorte del formulario con
 * sus campos señalados.
 *
 * Es una vista pública, así que no hace falta sesión ni empresa. Lo único que exige es que el
 * bloque de verificación de seguridad esté montado —el `.captcha` del rediseño (ticket 10898)—,
 * porque es justo lo que estas capturas documentan.
 *
 * Uso:
 *   node modules/auth/login/capture.mjs --salida <carpeta>
 *        [--base http://localhost:5173] [--puerto 9222]
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
import { DEFAULT_BASE, describeScreen, openPublicPage } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const port = Number(arg("puerto", 9222));

/**
 * Viewport de las capturas del login, más alto que el estándar del manual.
 * Sale de medir `IniciarSesion/view.png`, que se publicó a 1875x863: el formulario creció con el
 * bloque de verificación y con el alto de siempre queda cortado por abajo.
 */
const LOGIN_VIEWPORT = { width: 1875, height: 863 };

/**
 * Recorte del formulario: la tarjeta de la derecha, sin la ilustración.
 * Es la tarjeta entera y no su `.v-card-text`, porque la vista tiene dos —el encabezado y el
 * formulario— y quedarse con el primero recorta solo el logo.
 */
const FORM_SELECTOR = ".v-card";

/**
 * Los tres campos que el manual señala con recuadro, en el orden en que se llenan.
 *
 * Los `AppTextField` del login no llevan `id`, así que se localizan por el tipo de su input. Se
 * señala el `.v-field` y no el `input`: el de contraseña lleva el icono del ojo por dentro, y un
 * recuadro sobre el input lo parte por la mitad.
 */
const HIGHLIGHTED_FIELDS = [
	{ selector: '.v-field:has(input[type="email"])', index: 0 },
	{ selector: '.v-field:has(input[type="password"])', index: 0 },
	{ selector: ".captcha__field .v-field", index: 0 },
];

const main = async () => {
	const { cdp, chrome } = await openPublicPage({
		base,
		path: "/login",
		selector: ".captcha",
		port,
		width: LOGIN_VIEWPORT.width,
		height: LOGIN_VIEWPORT.height,
	});

	try {
		// El canvas se dibuja al montar; sin esta espera la imagen del código sale en blanco
		await waitForSelector(cdp, ".captcha__canvas");
		await wait(1500);

		const actions = await evaluate(cdp, `document.querySelectorAll('.captcha__action').length`);

		if (Number(actions) < 2) {
			console.log(`  AVISO: solo ${actions} acción(es) en el bloque de verificación.`);
			console.log("  El navegador no publica voces y la de escuchar el código no se muestra.");
			console.log("  Para documentarla hay que capturar con un navegador que las tenga.");
		}

		await evaluate(cdp, `document.activeElement?.blur(); 'ok'`);
		await screenshot(cdp, `${outputDir}/view.png`);
		console.log("  view.png");

		// Recorte del formulario con los campos que hay que llenar señalados
		for (const field of HIGHLIGHTED_FIELDS)
			await highlight(cdp, field.selector, { padding: 6, index: field.index });

		await screenshot(cdp, `${outputDir}/form.png`, { selector: FORM_SELECTOR, margin: 24 });
		await clearHighlights(cdp);
		console.log("  form.png");

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
