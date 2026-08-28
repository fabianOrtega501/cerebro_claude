/**
 * Humo test: abre la app en Chrome y recoge lo que se rompe al cargar.
 *
 * Que compile no significa que arranque. Un import roto, un plugin que lanza o un endpoint caido
 * pasan `typecheck` y `build` sin despeinarse y revientan en el navegador. Esto los ve.
 *
 * NO es una suite de pruebas y no debe venderse como tal: confirma que la app carga y que las
 * rutas indicadas no tiran errores. Nada mas.
 *
 * Uso:
 *   node smoke-test.mjs --url http://localhost:5173
 *   node smoke-test.mjs --path /maintenance/work-orders --path /tires/tires
 *   node smoke-test.mjs --login --project aio     entra con las credenciales del settings.local
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { launchChrome, connectPage, closeBrowser, wait } from "../../update-manual/lib/browser.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const paths = args.reduce((acc, a, i) => (a === "--path" ? [...acc, args[i + 1]] : acc), []);
const base = (arg("--url") ?? process.env.AIO_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");

/** `true` si algo contesta en la URL. Sin esto el fallo aparece como pantalla en blanco. */
async function isUp(url) {
	try {
		await fetch(url, { signal: AbortSignal.timeout(5000) });

		return true;
	}
	catch {
		return false;
	}
}

/** Ruido conocido del navegador que no dice nada del codigo propio. */
function isNoise(text) {
	return /favicon|DevTools|Download the Vue Devtools|sourcemap|Lit is in dev mode|ERR_INTERNET_DISCONNECTED/i.test(text);
}

if (!(await isUp(base))) {
	console.log(JSON.stringify({ ok: false, reason: `Nada responde en ${base}. Levanta el dev server antes del humo test.` }, null, 2));
	process.exit(1);
}

const errors = [];
const failedRequests = [];
let chrome = null;
let cdp = null;

try {
	chrome = await launchChrome({ port: Number(arg("--port", "9222")) });
	cdp = await connectPage(chrome.port);

	await cdp.send("Runtime.enable");
	await cdp.send("Page.enable");
	await cdp.send("Network.enable");

	cdp.on("Runtime.exceptionThrown", (params) => {
		const text = params?.exceptionDetails?.exception?.description ?? params?.exceptionDetails?.text ?? "excepcion sin descripcion";

		if (!isNoise(text)) errors.push({ type: "exception", text: text.split("\n")[0].slice(0, 300) });
	});

	cdp.on("Runtime.consoleAPICalled", (params) => {
		if (params.type !== "error") return;

		const text = (params.args ?? []).map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300);

		if (text && !isNoise(text)) errors.push({ type: "console.error", text });
	});

	cdp.on("Network.loadingFailed", (params) => {
		if (params.type === "Image" || isNoise(params.errorText ?? "")) return;

		failedRequests.push({ error: params.errorText, type: params.type });
	});

	// Opcional y por proyecto: si el proyecto trae sesion propia, se usa; si no, se mira solo el login.
	if (args.includes("--login")) {
		const project = arg("--project", "aio");
		const sessionPath = join(homedir(), ".claude", "brain", "projects", project, "manual", "lib", "session.mjs");

		try {
			const session = await import(sessionPath);

			session.testCredentials();
			await session.openSession({ cdp, base });
		}
		catch (error) {
			errors.push({ type: "login", text: `No se pudo abrir sesion: ${error.message.split("\n")[0]}. Sin credenciales el humo test solo cubre la pantalla de login.` });
		}
	}

	for (const path of paths.length ? paths : ["/"]) {
		await cdp.send("Page.navigate", { url: `${base}${path}` });
		await wait(Number(arg("--settle", "4000")));
	}
}
catch (error) {
	errors.push({ type: "driver", text: error.message.split("\n")[0] });
}
finally {
	await closeBrowser(cdp, chrome);
}

const blocking = errors.filter(e => e.type !== "login");

console.log(JSON.stringify({
	ok: blocking.length === 0,
	url: base,
	visited: paths.length ? paths : ["/"],
	errors,
	failedRequests: failedRequests.slice(0, 10),
}, null, 2));

process.exit(blocking.length === 0 ? 0 : 1);
