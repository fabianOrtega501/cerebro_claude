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
 *   node smoke-test.mjs --login --project aio     entra con las credenciales de ~/.claude/secrets.env
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { setting } from "../../update-manual/lib/config.mjs";

/*
 * `browser.mjs` busca el navegador en `process.env.CHROME_PATH`, no en los settings, y esa
 * variable solo existe si la sesion arranco en un repo que la declara. Trabajando desde el
 * cerebro no esta, y el fallo aparece como "no se encontro Chrome" aunque este configurado.
 *
 * Se resuelve aqui y se inyecta ANTES de cargar el modulo: su lista de candidatos se congela al
 * importarlo, de ahi que el import sea dinamico.
 */
if (!process.env.CHROME_PATH) {
	const chromePath = setting("CHROME_PATH");

	if (chromePath) process.env.CHROME_PATH = chromePath;
}

const { launchChrome, connectPage, closeBrowser, wait, evaluate } = await import("../../update-manual/lib/browser.mjs");

const args = process.argv.slice(2);
const arg = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const paths = args.reduce((acc, a, i) => (a === "--path" ? [...acc, args[i + 1]] : acc), []);
const base = (arg("--url") ?? process.env.AIO_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
const port = Number(arg("--port", "9222"));

const errors = [];
const failedRequests = [];
const visited = [];

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

/** Engancha los tres oidos que importan. Lo que ocurra ANTES de llamarla no se ve. */
async function watch(cdp) {
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
}

if (!(await isUp(base))) {
	console.log(JSON.stringify({ ok: false, reason: `Nada responde en ${base}. Levanta el dev server antes del humo test.` }, null, 2));
	process.exit(1);
}

let chrome = null;
let cdp = null;
let loggedIn = false;

try {
	if (args.includes("--login")) {
		/*
		 * `openSession` lanza SU navegador y devuelve la conexion; no acepta una de fuera. Por eso
		 * aqui no se abre Chrome antes: se delega y se engancha despues, aun a costa de perderse
		 * los errores del propio login (que igual se reportan, porque openSession lanza si falla).
		 *
		 * Que el login falle NO aborta el humo test: se sigue sin sesion. Un login roto tapando que
		 * la app ni siquiera carga es peor que no tener login.
		 */
		const project = arg("--project", "aio");

		try {
			const session = await import(join(homedir(), ".claude", "brain", "projects", project, "manual", "lib", "session.mjs"));

			if (typeof session.openSession !== "function")
				throw new Error(`El proyecto "${project}" no expone openSession() en manual/lib/session.mjs. No todos entran igual: AMI es offline-first y siembra la sesion por API, no por formulario.`);

			// Sin empresa no se cargan los permisos y toda ruta interna rebota a not-authorized.
			({ cdp, chrome } = await session.openSession({ base, ...session.testCredentials(), company: arg("--company", "Empresa Demo"), port }));
			loggedIn = true;
		}
		catch (error) {
			errors.push({ type: "login", text: `${error.message.split("\n")[0]} Se sigue sin sesion: solo se cubre lo que se ve sin entrar.` });
			await closeBrowser(cdp, chrome);
			cdp = null;
			chrome = null;
		}
	}

	if (!cdp) {
		chrome = await launchChrome({ port });
		cdp = await connectPage(chrome.port);
	}

	await watch(cdp);

	for (const path of paths.length ? paths : ["/"]) {
		await cdp.send("Page.navigate", { url: `${base}${path}` });
		await wait(Number(arg("--settle", "4000")));

		/*
		 * Un guard que rebota a `not-authorized` o `login` no lanza ningun error: la consola queda
		 * limpia y el humo test daria "ok" sin haber visto la pantalla. Se compara la ruta final.
		 */
		const landed = await evaluate(cdp, "location.pathname");

		visited.push({ path, landed, redirected: landed !== path });
	}
}
catch (error) {
	// El login ya tiene su propio catch: lo que llegue aqui es del driver o de la navegacion, y
	// etiquetarlo como "login" haria que no cuente como fallo bloqueante.
	errors.push({ type: "driver", text: error.message.split("\n").slice(0, 3).join(" | ").slice(0, 400) });
}
finally {
	await closeBrowser(cdp, chrome);
}

const blocking = errors.filter(e => e.type !== "login");

// Sin una sola ruta visitada no se comprobo nada, y decir que si es peor que fallar.
if (!visited.length) blocking.push({ type: "driver", text: "No se llego a visitar ninguna ruta: el humo test no comprobo nada." });

/*
 * Rebotar a not-authorized o login es un fallo aunque la consola este limpia: se pidio ver una
 * pantalla y no se vio. Sin esto el humo test da "ok" por rutas que nunca se abrieron.
 */
/*
 * Sin sesion, que la app mande al login no es un fallo: es lo que debe hacer. Contarlo como tal
 * deja el humo test en rojo permanente en los proyectos donde no se puede entrar, y un rojo que
 * siempre esta encendido no lo mira nadie.
 */
const bounced = visited.filter(v => v.redirected && !(!loggedIn && /login/i.test(v.landed)));

console.log(JSON.stringify({
	ok: blocking.length === 0 && bounced.length === 0,
	url: base,
	loggedIn,
	// Sin login solo se vio la pantalla publica: decirlo, para no dar por verificado lo que no se abrio.
	coverage: args.includes("--login") && !loggedIn ? "El login fallo: solo se cubrio la pantalla de acceso." : undefined,
	visited,
	redirected: bounced.length
		? { aviso: "No se llego a estas rutas; revisa permisos o la empresa seleccionada.", rutas: bounced }
		: undefined,
	errors,
	failedRequests: failedRequests.slice(0, 10),
}, null, 2));

process.exit(blocking.length === 0 && bounced.length === 0 ? 0 : 1);
