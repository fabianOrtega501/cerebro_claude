/**
 * Capturas del bloque de verificación de seguridad en las dos pantallas del Portal Ciudadano que
 * lo piden: Consultar mi radicado y Reportar una queja (paso 4).
 *
 * Las dos son vistas públicas, así que no hace falta sesión. Del formulario de queja se recorren
 * los pasos previos **sin enviarlo**: la captura documenta la pantalla, no radica nada.
 *
 * Uso:
 *   node modules/public/citizen-portal/capture-verification.mjs --salida <carpeta>
 *        [--radicado PQR-2026-27] [--base http://localhost:5173] [--puerto 9222]
 */

import {
	closeBrowser,
	evaluate,
	insertText,
	screenshot,
	setViewport,
	wait,
	waitForSelector,
} from "../../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, openPublicPage, type } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const port = Number(arg("puerto", 9222));

/** Número que se escribe en el formulario de consulta. Solo es de muestra: no se consulta. */
const SAMPLE_TRACKING_NUMBER = arg("radicado", "PQR-2026-27");

/**
 * Viewport de la consulta de radicado. Sale de medir `formulario-consulta.png`: la captura es la
 * ventana completa, con el encabezado del portal incluido.
 */
const TRACKING_VIEWPORT = { width: 1031, height: 765 };

/**
 * La queja necesita más alto: su captura abarca los pasos 3 y 4 juntos.
 * El alto está medido para que el corte caiga justo después del botón de enviar, sin arrastrar
 * el pie de página.
 */
const COMPLAINT_VIEWPORT = { width: 1180, height: 900 };

/** Margen que se deja alrededor de los pasos recortados, para no pegar el corte al borde. */
const COMPLAINT_MARGIN = 21;

/**
 * El botón flotante de accesibilidad queda fijo sobre el borde derecho y tapa el campo que hay
 * detrás. Se oculta solo en estas capturas: el manual ya lo documenta con su propia imagen
 * (`boton-accesibilidad.png`), donde sí es el protagonista.
 */
const HIDE_A11Y_FAB = `.a11y-widget__fab { display: none !important; }`;

const hideAccessibilityFab = (cdp) => evaluate(cdp, `(() => {
	const style = document.createElement('style')
	style.textContent = ${JSON.stringify(HIDE_A11Y_FAB)}
	document.head.appendChild(style)
	return 'ok'
})()`);

const main = async () => {
	const { cdp, chrome } = await openPublicPage({
		base,
		path: "/public/citizen-portal/track-request",
		selector: ".captcha",
		port,
		width: TRACKING_VIEWPORT.width,
		height: TRACKING_VIEWPORT.height,
	});

	try {
		await waitForSelector(cdp, ".captcha__canvas");
		await hideAccessibilityFab(cdp);
		await wait(1500);

		const actions = await evaluate(cdp, `document.querySelectorAll('.captcha__action').length`);

		if (Number(actions) < 2)
			console.log(`  AVISO: ${actions} acción(es); el navegador no publica voces y falta la de escuchar`);

		// El número va escrito para que la captura muestre el formulario como lo ve quien consulta
		await type(cdp, ".cp-tracking__number input", SAMPLE_TRACKING_NUMBER);
		await evaluate(cdp, `document.activeElement?.blur(); 'ok'`);
		await wait(400);
		await screenshot(cdp, `${outputDir}/formulario-consulta.png`);
		console.log("  formulario-consulta.png");

		// Paso 4 de la queja: se llega recorriendo el formulario, sin enviarlo
		await setViewport(cdp, COMPLAINT_VIEWPORT);
		await cdp.send("Page.navigate", { url: `${base}/public/citizen-portal/report-complaint` });
		await waitForSelector(cdp, ".captcha", { timeout: 90000 });
		await waitForSelector(cdp, ".captcha__canvas");
		await hideAccessibilityFab(cdp);
		await wait(1500);
		await evaluate(cdp, `document.activeElement?.blur(); 'ok'`);

		// La captura abarca dos pasos —contacto y verificación— y ningún elemento los envuelve.
		// Se desplaza la página hasta el de contacto y se captura la ventana: un clip calculado
		// sobre coordenadas que quedan fuera del viewport sale en blanco.
		const scrolled = await evaluate(cdp, `(() => {
			const sections = [...document.querySelectorAll('.cp-complaint__section')]
			const contact = sections[sections.length - 2]
			if (!contact) return 'sin secciones'
			contact.scrollIntoView({ block: 'start', behavior: 'instant' })
			window.scrollBy(0, -${COMPLAINT_MARGIN})
			return String(Math.round(window.scrollY))
		})()`);

		if (scrolled === "sin secciones" || Number(scrolled) === 0)
			throw new Error(`La pagina no se desplazo hasta el paso de contacto (scrollY=${scrolled})`);

		await wait(600);
		await screenshot(cdp, `${outputDir}/contacto-verificacion.png`);
		console.log("  contacto-verificacion.png");

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
