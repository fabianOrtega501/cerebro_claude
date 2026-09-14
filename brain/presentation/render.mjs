#!/usr/bin/env node
/**
 * Captura una lamina HTML a PNG de 1920x1080, listo para insertar en Slides.
 *
 * Uso:
 *   node render.mjs                  renderiza cerebro.html junto a este script
 *   node render.mjs otra.html        renderiza otra
 *   node render.mjs --salida <dir>   donde dejar el PNG
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));

// Brave viene confinado por snap y no lee nada fuera de $HOME: ni el HTML de entrada ni el
// directorio temporal. Por eso se trabaja en una carpeta bajo el home y no en /tmp.
const STAGE = join(homedir(), "aio-shots", "pres");

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const entrada = resolve(HERE, args.find(a => !a.startsWith("--") && a.endsWith(".html")) ?? "cerebro.html");
const salida = resolve(flag("--salida") ?? STAGE);

/** Copia la lamina al area que Brave si puede leer y devuelve su ruta ahi. */
function stage(html) {
	mkdirSync(STAGE, { recursive: true });
	const destino = join(STAGE, basename(html));
	copyFileSync(html, destino);

	return destino;
}

const html = stage(entrada);
const png = join(salida, `${basename(entrada, ".html")}.png`);
mkdirSync(salida, { recursive: true });

process.env.CHROME_PATH ||= "/snap/bin/brave";
process.env.TMPDIR ||= join(homedir(), "aio-shots", "tmp");
mkdirSync(process.env.TMPDIR, { recursive: true });

const { launchChrome, connectPage, setViewport, screenshot, closeBrowser, waitUntil } =
	await import(join(HERE, "../../skills/update-manual/lib/browser.mjs"));

let chrome = null;
let cdp = null;

try {
	chrome = await launchChrome({ port: 9334 });
	cdp = await connectPage(chrome.port);
	await setViewport(cdp, { width: 1920, height: 1080 });
	await cdp.send("Page.navigate", { url: pathToFileURL(html).href });
	await waitUntil(cdp, "document.readyState === 'complete'", { what: "la carga de la lamina" });
	await new Promise(r => setTimeout(r, 900));

	const alto = await cdp.send("Runtime.evaluate", { expression: "document.body.scrollHeight", returnByValue: true });
	const px = alto.result.value;

	if (px < 1000) console.warn(`Aviso: el contenido mide ${px}px de 1080. Si salio casi vacio, Brave no pudo leer el HTML.`);
	else if (px > 1085) console.warn(`Aviso: el contenido mide ${px}px y el lienzo son 1080: hay algo cortado abajo.`);

	await screenshot(cdp, png, { clip: { x: 0, y: 0, width: 1920, height: 1080 } });
	console.log(`PNG listo: ${png}  (contenido ${px}px)`);
}
finally {
	await closeBrowser(cdp, chrome);
}
