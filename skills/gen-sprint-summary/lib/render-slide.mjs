/**
 * Maqueta el slide del sprint: de un JSON de desarrollos a `Retrospectiva_Sprint_<n>.html` y su
 * PNG de 1920x1080.
 *
 * Uso:
 *   node render-slide.mjs --entrada desarrollos.json --sprint 18
 *   node render-slide.mjs --entrada d.json --sprint 18 --salida <otro-dir>
 *   node render-slide.mjs --entrada d.json --sprint 18 --solo-html    sin abrir Chrome
 *
 * Sin `--salida` escribe en `~/.claude/brain/sprints/Sprint_<n>`.
 *
 * El JSON de entrada:
 *   {
 *     "author": "Fabian",
 *     "sprint": "18",
 *     "showTickets": false,
 *     "developments": [
 *       { "project": "AIO", "ticket": "9357", "problem": "...", "value": "...",
 *         "decision": "...", "learning": "...", "improvement": "..." }
 *     ]
 *   }
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Colores de cada seccion, en el orden en que aparecen los proyectos. */
const ACCENTS = ["#2f5fd0", "#2f8f4e", "#b4600f", "#7a3fb0", "#0f7f8f"];

const FIELDS = [
	["problem", "🛠️", "Problema abordado"],
	["value", "❇️", "Valor generado"],
	["decision", "📚", "Decisión técnica relevante"],
	["learning", "✅", "Aprendizaje clave"],
	["improvement", "🚀", "Mejora futura"],
];

/** Escapa lo que va dentro del HTML: el texto lo escribe una persona y trae `<`, `&` y comillas. */
function escapeHtml(text) {
	return String(text ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Cuantas columnas por fila y cuanto encoger la letra, segun cuantas cajas tenga la seccion mas
 * poblada. Con mas de seis cajas el texto deja de leerse en proyeccion, y eso se avisa.
 *
 * @param {number} maxPerSection - Cajas de la seccion mas poblada
 * @param {number} sections - Cuantas secciones hay
 * @returns {{cols: number, scale: number, warn: string|null}}
 */
function layoutFor(maxPerSection, total) {
	const cols = Math.min(Math.max(maxPerSection, 1), 4);
	const scale = total <= 3 ? 1 : total <= 6 ? 0.9 : total <= 9 ? 0.8 : 0.7;
	const warn = total > 6
		? `Son ${total} desarrollos: el texto va a quedar chico en proyección. Conviene dejar los 5 o 6 más relevantes.`
		: null;

	return { cols, scale, warn };
}

/** HTML de una caja de desarrollo. */
function cardHtml(dev, showTickets) {
	const lines = FIELDS
		.filter(([key]) => dev[key])
		.map(([key, icon, label]) =>
			`<div class="line"><span class="icon">${icon}</span><b>${label}:</b> ${escapeHtml(dev[key])}</div>`)
		.join("\n\t\t\t\t");

	const ticket = showTickets && dev.ticket ? `<div class="ticket">#${escapeHtml(dev.ticket)}</div>\n\t\t\t\t` : "";

	return `\t\t\t<div class="card">\n\t\t\t\t${ticket}${lines}\n\t\t\t</div>`;
}

/** HTML completo del slide, ya con la plantilla rellenada. */
function buildHtml({ author = "Fabian", showTickets = false, developments = [] }) {
	const names = [...new Set(developments.map(d => d.project ?? "Otros"))];
	const grouped = names.map(name => ({ name, items: developments.filter(d => (d.project ?? "Otros") === name) }));
	const { cols, scale, warn } = layoutFor(Math.max(...grouped.map(g => g.items.length), 1), developments.length);

	const sections = grouped.map((group, index) => {
		const accent = ACCENTS[index % ACCENTS.length];
		const cards = group.items.map(dev => cardHtml(dev, showTickets)).join("\n");

		return `\t\t<div class="section" style="--accent: ${accent}; --cols: ${Math.min(cols, group.items.length)}">\n`
			+ `\t\t\t<div class="section-name">${escapeHtml(group.name)}</div>\n`
			+ `\t\t\t<div class="cards">\n${cards}\n\t\t\t</div>\n\t\t</div>`;
	}).join("\n");

	const html = readFileSync(join(HERE, "slide-template.html"), "utf8")
		.replace("{{AUTHOR}}", escapeHtml(author))
		.replace("{{SCALE}}", String(scale))
		.replace("{{SECTIONS}}", `\n${sections}\n\t\t`);

	return { html, warn, scale };
}

/**
 * Encoge la letra hasta que todo el contenido quepa en la diapositiva, midiendo en la pagina.
 *
 * Hace falta porque el desborde de una caja **no se ve**: CSS recorta la ultima linea y el slide
 * sale con "Mejora futura" a medias sin que nadie avise.
 *
 * @param {object} cdp - Conexion CDP
 * @param {number} from - Escala de partida
 * @returns {Promise<{scale: number, fits: boolean}>} `fits` en false si ni al minimo cabe
 */
async function fitToSlide(cdp, from) {
	const { evaluate } = await import("../../update-manual/lib/browser.mjs");
	const overflows = `(() => document.body.scrollHeight > 1081
		|| [...document.querySelectorAll(".card")].some(c => c.scrollHeight > c.clientHeight + 1))()`;

	for (let scale = from; scale >= 0.5; scale -= 0.04) {
		await evaluate(cdp, `document.documentElement.style.setProperty("--scale", "${scale.toFixed(2)}")`);

		if (!await evaluate(cdp, overflows)) return { scale: Number(scale.toFixed(2)), fits: true };
	}

	return { scale: 0.5, fits: false };
}

/** Captura el HTML a PNG de 1920x1080 con el Chrome que ya maneja `update-manual`. */
async function renderPng(htmlPath, pngPath, scale) {
	const { launchChrome, connectPage, setViewport, screenshot, closeBrowser, waitUntil } =
		await import("../../update-manual/lib/browser.mjs");

	let chrome = null;
	let cdp = null;

	try {
		chrome = await launchChrome({ port: 9333 });
		cdp = await connectPage(chrome.port);
		await setViewport(cdp, { width: 1920, height: 1080 });
		await cdp.send("Page.navigate", { url: pathToFileURL(htmlPath).href });
		// Sin esperar a que las fuentes esten listas la captura sale con la letra de reserva.
		await waitUntil(cdp, "document.readyState === 'complete'", { what: "la carga del slide" });
		await new Promise(r => setTimeout(r, 400));

		const fit = await fitToSlide(cdp, scale);

		if (!fit.fits) {
			console.warn("Aviso: ni encogiendo la letra al mínimo cabe todo; hay texto cortado. Quita desarrollos o acorta las frases.");
		}
		else if (fit.scale < scale) {
			console.log(`La letra se encogió a ${fit.scale} para que cupiera todo.`);
		}

		await screenshot(cdp, pngPath, { clip: { x: 0, y: 0, width: 1920, height: 1080 } });

		return { path: pngPath, ...fit };
	}
	finally {
		await closeBrowser(cdp, chrome);
	}
}

/**
 * Deja el numero del sprint utilizable como nombre de archivo.
 *
 * @param {string} value - Lo que escribio el usuario
 * @returns {string} Solo letras, digitos, guion y guion bajo. Vacio si no queda nada aprovechable
 */
function cleanSprint(value) {
	return String(value ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "");
}

function parseArgs(argv) {
	const options = { entrada: null, salida: null, sprint: null, soloHtml: false };

	for (let i = 0; i < argv.length; i++) {
		const [flag, inline] = argv[i].split("=");
		const take = () => (inline ?? argv[++i]);

		if (flag === "--entrada") options.entrada = take();
		else if (flag === "--salida") options.salida = take();
		else if (flag === "--sprint") options.sprint = take();
		else if (flag === "--solo-html") options.soloHtml = true;
	}

	return options;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));

	if (!options.entrada) {
		console.error("Falta --entrada <json>.");
		process.exit(1);
	}

	const data = JSON.parse(readFileSync(resolve(options.entrada), "utf8"));
	const sprint = cleanSprint(options.sprint ?? data.sprint);

	// Sin numero de sprint el archivo no se identifica solo, que es justo para lo que sirve el
	// nombre: el PNG viaja a la presentacion sin la carpeta que lo ubicaba.
	if (!sprint) {
		console.error("Falta --sprint <numero>. Es lo que da nombre a los archivos: Retrospectiva_Sprint_18.png");
		process.exit(1);
	}

	if (!/^\d+$/.test(sprint)) console.warn(`Aviso: "${sprint}" no es un número de sprint; se usa igual en el nombre.`);

	const { html, warn, scale } = buildHtml(data);
	const outDir = resolve((options.salida ?? join(process.env.HOME, ".claude", "brain", "sprints", `Sprint_${sprint}`)).replace(/^~/, process.env.HOME));
	const htmlPath = join(outDir, `Retrospectiva_Sprint_${sprint}.html`);

	mkdirSync(outDir, { recursive: true });
	writeFileSync(htmlPath, html);
	console.log(`HTML: ${htmlPath}`);

	if (warn) console.warn(`Aviso: ${warn}`);

	if (options.soloHtml) return;

	const png = await renderPng(htmlPath, join(outDir, `Retrospectiva_Sprint_${sprint}.png`), scale);

	// El HTML se reescribe con la escala que de verdad se uso, para que abrirlo a mano muestre lo
	// mismo que el PNG.
	if (png.scale !== scale) writeFileSync(htmlPath, html.replace(`--scale: ${scale};`, `--scale: ${png.scale};`));

	console.log(`PNG:  ${png.path}`);
	console.log("En Google Slides: Insertar > Imagen > Subir de tu computadora.");
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
