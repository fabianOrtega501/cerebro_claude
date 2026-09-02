/**
 * Captura del cierre del formulario público de Registro de Asistencia: la firma dibujada y el
 * bloque de verificación de seguridad con el código ya escrito.
 *
 * La pantalla es pública, pero cuelga de un evento: la URL lleva el id de la capacitación
 * **cifrado** con `QrIdCodec`, así que hay que pasar su token con `--token`. Se documenta la
 * variante de personal externo, que es la que muestra el formulario sin buscar personal antes.
 *
 * El código del captcha se lee del canvas con el hook de `session.mjs` y se escribe en el campo:
 * la captura publicada lo muestra resuelto, no vacío. **No se registra la asistencia**, así que
 * no crea ningún asistente.
 *
 * Uso:
 *   node modules/operations/training-records/capture.mjs --salida <carpeta> --token <token>
 *        [--base http://localhost:5173] [--puerto 9222]
 *
 * El token se saca del backend con el mismo codificador que arma el enlace del evento:
 *   ./vendor/bin/sail artisan tinker --execute="echo App\Helpers\QrIdCodec::encode(<id>);"
 */

import {
	clickAt,
	closeBrowser,
	evaluate,
	screenshot,
	wait,
	waitForSelector,
} from "../../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, openPublicPage, readCaptcha, type } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const port = Number(arg("puerto", 9222));
const token = arg("token", "");

/** Ancho y alto medidos sobre `RegistroEventos_14.png`, la captura que reemplaza. */
const VIEWPORT = { width: 1426, height: 900 };

/**
 * Lienzo del `SignaturePad`. Hay que apuntar al suyo y no a un `canvas` cualquiera: el primero
 * del DOM es el del codigo de verificacion, y arrastrar ahi no dibuja nada.
 */
const SIGNATURE_CANVAS = ".div-firma canvas";

/** Trazo de la firma: puntos relativos dentro del lienzo, para que parezca escrita a mano. */
const SIGNATURE_STROKE = [
	{ x: 0.12, y: 0.65 }, { x: 0.22, y: 0.3 }, { x: 0.32, y: 0.72 },
	{ x: 0.44, y: 0.28 }, { x: 0.55, y: 0.7 }, { x: 0.66, y: 0.35 },
	{ x: 0.78, y: 0.6 },
];

/** Dibuja la firma arrastrando el ratón sobre el lienzo del `SignaturePad`. */
const drawSignature = async (cdp, selector) => {
	// El lienzo queda al borde inferior de la ventana: sin desplazarlo, los puntos del trazo caen
	// fuera del viewport y los eventos de raton no llegan a ninguna parte.
	await evaluate(cdp, `(() => {
		const el = document.querySelector(${JSON.stringify(selector)})
		el?.scrollIntoView({ block: 'center', behavior: 'instant' })
		return 'ok'
	})()`);
	await wait(400);

	const box = JSON.parse(await evaluate(cdp, `(() => {
		const el = document.querySelector(${JSON.stringify(selector)})
		if (!el) return 'null'
		const r = el.getBoundingClientRect()
		return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height })
	})()`));

	if (!box)
		throw new Error(`No se encontro el lienzo de la firma: ${selector}`);

	const points = SIGNATURE_STROKE.map(p => ({
		x: Math.round(box.x + box.width * p.x),
		y: Math.round(box.y + box.height * p.y),
	}));

	// `buttons: 1` es imprescindible: sin el mapa de botones pulsados, signature_pad da el
	// movimiento por un desplazamiento sin trazo y el lienzo queda vacio.
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: points[0].x, y: points[0].y });
	await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: points[0].x, y: points[0].y, button: "left", buttons: 1, clickCount: 1 });

	for (const point of points.slice(1)) {
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, button: "left", buttons: 1 });
		await wait(40);
	}

	const last = points[points.length - 1];

	await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last.x, y: last.y, button: "left", buttons: 0, clickCount: 1 });

	// El arrastre selecciona el texto que cruza y sale resaltado en azul en la captura
	await evaluate(cdp, `window.getSelection()?.removeAllRanges(); 'ok'`);

	const drawn = await evaluate(cdp, `(() => {
		const el = document.querySelector(${JSON.stringify(selector)})
		const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data
		let ink = 0
		for (let i = 3; i < data.length; i += 4) if (data[i] > 0) ink++
		return String(ink)
	})()`);

	if (Number(drawn) === 0)
		console.log("  AVISO: el lienzo de la firma quedo vacio; la captura sale sin firma");
};

const main = async () => {
	if (!token) {
		console.error("Falta --token: la pantalla cuelga de un evento y su id viaja cifrado.");
		process.exit(1);
	}

	const { cdp, chrome } = await openPublicPage({
		base,
		path: `/public/training-records/view/${token}`,
		text: "REGISTRAR",
		captchaHook: true,
		port,
		width: VIEWPORT.width,
		height: VIEWPORT.height,
	});

	try {
		// Personal externo: muestra el formulario sin tener que buscar personal por documento
		await waitForSelector(cdp, "#isExternal");
		await cdp.send("Runtime.evaluate", { expression: `document.querySelector('#isExternal').click()`, userGesture: true });

		await waitForSelector(cdp, ".captcha", { timeout: 30000 });
		await waitForSelector(cdp, ".captcha__canvas");
		await wait(1500);

		const actions = await evaluate(cdp, `document.querySelectorAll('.captcha__action').length`);

		if (Number(actions) < 2)
			console.log(`  AVISO: ${actions} accion(es); el navegador no publica voces y falta la de escuchar`);

		await drawSignature(cdp, SIGNATURE_CANVAS);

		// El codigo se lee del canvas y se escribe, como en la captura que ya estaba publicada
		const code = await readCaptcha(cdp);

		if (String(code).length !== 5)
			console.log(`  AVISO: no se pudo leer el codigo del captcha (obtenido: "${code}")`);
		else
			await type(cdp, ".captcha__field input", String(code));

		await evaluate(cdp, `document.activeElement?.blur(); 'ok'`);

		// Captura de ventana, no recorte: la pagina tiene dos lienzos de firma en el arbol y el
		// rectangulo del primero cae fuera del viewport, con lo que el clip sale desencuadrado.
		// El ancho es el de la imagen que reemplaza, que es lo que mantiene el manual uniforme.
		await evaluate(cdp, `document.querySelector('.captcha').scrollIntoView({ block: 'center', behavior: 'instant' }); 'ok'`);
		await wait(600);
		await screenshot(cdp, `${outputDir}/RegistroEventos_14.png`);
		console.log("  RegistroEventos_14.png");

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
