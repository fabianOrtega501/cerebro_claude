/**
 * Captura la lista de Servicios Programados de Green ordenada por secuencia, con la fila Secuencia
 * de la primera tarjeta señalada.
 *
 * Uso:
 *   node modules/respel/service-provision/capture-sequence.mjs --salida <carpeta>
 *        [--base http://localhost:8100] [--codigo 123456789-2] [--empresa "PROMOCALI S.A.S. E.S.P"]
 *        [--lat 3.4372 --lng -76.5225] [--puerto 9333]
 *
 * Con `--puerto` se conecta a un navegador abierto con una sesión del AMI ya iniciada y no hace
 * login: en un perfil nuevo el AMI puede quedar sin menús y sin la opción de importar.
 *
 * Requiere una programación aprobada de hoy cuyo conductor sea el usuario de `--credenciales` (por
 * defecto las de AIO en secrets.env), con inspección aprobada y solicitudes con secuencia. El código
 * de empresa es el de `company_endpoints` que apunta al backend local.
 */

import { clickAt, closeBrowser, connectPage, evaluate, highlight, clearHighlights, launchChrome, screenshot, setGeolocation, setViewport, wait } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, VIEWPORT } from "../../../lib/session.mjs";
import { credentialsFor } from "../../../../../../lib/credentials.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const [code, digit] = arg("codigo", "123456789-2").split("-");
const company = arg("empresa", "PROMOCALI S.A.S. E.S.P");
const coords = { latitude: Number(arg("lat", "3.4372")), longitude: Number(arg("lng", "-76.5225")) };

/** Espera hasta que la expresión sea verdadera; lanza con `what` si se agota. */
async function waitFor(cdp, expression, what, timeout = 30000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await evaluate(cdp, expression)) return;
		await wait(400);
	}
	throw new Error(`Timeout esperando ${what}`);
}

/** Clic de ratón real sobre el elemento visible cuyo texto es exactamente `text`. Lanza si no está. */
async function clickText(cdp, text) {
	const point = await evaluate(cdp, `(() => {
		const el = [...document.querySelectorAll('ion-item, ion-button, button, ion-label, div, span')]
			.filter(e => e.innerText?.trim() === ${JSON.stringify(text)} && e.getClientRects().length)
			.map(e => ({ e, r: e.getBoundingClientRect() }))
			.filter(({ r }) => r.width > 0 && r.height > 0)
			.sort((a, b) => a.r.width * a.r.height - b.r.width * b.r.height)[0];
		return el ? { x: el.r.x + el.r.width / 2, y: el.r.y + el.r.height / 2 } : null;
	})()`);
	if (!point) throw new Error(`No está visible «${text}»`);
	await clickAt(cdp, point.x, point.y);
}

/** Escribe en el `ion-input` por su nombre interno, disparando los eventos que escucha Ionic. */
const fill = (cdp, name, value) => evaluate(cdp, `(() => {
	const input = document.querySelector('input[name=${name}]');
	input.value = ${JSON.stringify(value)};
	input.dispatchEvent(new Event('input', { bubbles: true }));
	const host = input.closest('ion-input');
	host.value = ${JSON.stringify(value)};
	host.dispatchEvent(new CustomEvent('ionInput', { detail: { value: ${JSON.stringify(value)} }, bubbles: true }));
})()`);

/** Cierra el aviso de permiso de ubicación en segundo plano si está abierto. */
const dismissAlerts = (cdp) => evaluate(cdp, `document.querySelectorAll('ion-alert button').forEach(b => /^(OK|NO PERMITIR)$/i.test(b.innerText.trim()) && b.click())`);

/** Inicia sesión: código de empresa, credenciales y empresa. */
async function login(cdp) {
	const { email, password } = credentialsFor(arg("credenciales", "aio"));
	await cdp.send("Page.navigate", { url: `${base}/login` });
	await waitFor(cdp, `!!document.querySelector('input[name=ion-input-2]')`, "el código de empresa del login", 45000);
	await fill(cdp, "ion-input-2", code);
	await fill(cdp, "ion-input-3", digit);
	await clickText(cdp, "BUSCAR");
	await wait(3000);
	await dismissAlerts(cdp);
	await fill(cdp, "ion-input-0", email);
	await fill(cdp, "ion-input-1", password);
	await clickText(cdp, "INICIAR SESIÓN");
	await waitFor(cdp, `!!document.querySelector('ion-select')`, "el selector de empresa");
	await dismissAlerts(cdp);
	await wait(800);
	await evaluate(cdp, `document.querySelector('ion-select').click()`);
	await wait(1200);
	await clickText(cdp, company);
	await waitFor(cdp, `document.querySelector('ion-select')?.value?.name === ${JSON.stringify(company)}`, `la empresa ${company} en el selector`, 10000);
	await wait(800);
	await dismissAlerts(cdp);
	await clickText(cdp, "INICIAR SESIÓN");
	await waitFor(cdp, `location.pathname.includes('/home')`, "la pantalla de inicio", 45000);
}

/** Importa Prestación de Servicio desde Green. */
async function importServices(cdp) {
	for (let attempt = 0; attempt < 3; attempt++) {
		await cdp.send("Page.navigate", { url: `${base}/respel/import-data` });
		await wait(5000);
		await dismissAlerts(cdp);
		if (await evaluate(cdp, `document.body.innerText.includes('Prestación de Servicio')`)) break;
		await clickText(cdp, company);
		await wait(1200);
		await clickText(cdp, company).catch(() => {});
		await wait(6000);
	}
	await waitFor(cdp, `document.body.innerText.includes('Prestación de Servicio')`, "la importación de Prestación de Servicio", 5000);
	await wait(1500);
	await dismissAlerts(cdp);
	await wait(500);
	await clickText(cdp, "Prestación de Servicio");
	await wait(8000);
}

/** Abre la lista con ubicación simulada, señala la secuencia de la primera tarjeta y captura. */
async function captureList(cdp) {
	await setGeolocation(cdp, { origin: base, ...coords });
	await cdp.send("Page.navigate", { url: `${base}/respel/service-provision` });
	await waitFor(cdp, `document.body.innerText.includes('SECUENCIA')`, "tarjetas con secuencia", 45000);
	await wait(2500);
	await dismissAlerts(cdp);
	await wait(600);
	await evaluate(cdp, `(() => {
		const label = [...document.querySelectorAll('ion-row')].find(r => r.innerText.trim().startsWith('SECUENCIA'));
		label.setAttribute('data-captura', 'secuencia');
	})()`);
	await highlight(cdp, '[data-captura="secuencia"]', { label: "1", padding: 3 });
	await screenshot(cdp, `${outputDir}/list_sequence.png`);
	await clearHighlights(cdp);
}

const port = arg("puerto", null);
const chrome = port ? null : await launchChrome({ port: 9446 });
const cdp = await connectPage(port ? Number(port) : 9446);

try {
	await cdp.send("Page.enable");
	await setViewport(cdp, VIEWPORT);
	if (!port) await login(cdp);
	await importServices(cdp);
	await captureList(cdp);
	console.log(`Captura en ${outputDir}`);
} catch (error) {
	await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
	console.error(`Falló: ${error.message}`);
	console.error(await evaluate(cdp, `Object.keys(localStorage).map(k => k + '=' + String(localStorage.getItem(k)).length).join(' | ') + ' || menus respel: ' + JSON.stringify((JSON.parse(localStorage.getItem('authUser') || localStorage.getItem('CapacitorStorage.authUser') || '{}').menus || []).map(m => m.url).filter(u => /respel/.test(u || '')))`).catch(e => e.message));
	process.exitCode = 1;
} finally {
	if (chrome) await closeBrowser(cdp, chrome);
	else cdp.close();
}
