/**
 * Captura del formulario Agregar Empresa del maestro de Empresas (Configuración > Sistema > Empresa).
 *
 * Uso:
 *   node modules/settings/companies/capture.mjs --salida <carpeta> [--empresa "Empresa Demo"] [--puerto 9222]
 */

import { clickByText, closeBrowser, evaluate, screenshot, wait, waitUntil } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, describeScreen, goTo, openSession, testCredentials, waitForTableSettled } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const port = Number(arg("puerto", 9222));
const company = arg("empresa", "Empresa Demo");

const { email, password } = testCredentials();
const { cdp, chrome } = await openSession({ base, email, password, company, module: "Configuración", port, height: 1000 });

try {
	await goTo(cdp, base, "/settings/companies", { text: "Agregar" });
	await waitForTableSettled(cdp).catch(() => {});

	if (!await clickByText(cdp, "button", "Agregar")) throw new Error("No está el botón Agregar");
	await waitUntil(cdp, `[...document.querySelectorAll('.v-overlay--active label')].some(l => l.textContent.includes('URL LinkedIn'))`, { what: "el formulario Agregar Empresa" });
	await wait(1000);
	await evaluate(cdp, `(() => { document.activeElement?.blur(); return true })()`);
	await wait(300);

	await screenshot(cdp, `${outputDir}/agregar-empresa.png`, { selector: ".v-overlay--active .v-overlay__content", margin: 0 });
	console.log(`Captura en ${outputDir}`);
}
catch (error) {
	console.error(`Falló: ${error.message}`);
	await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
	console.error(await describeScreen(cdp).catch(() => ""));
	process.exitCode = 1;
}
finally {
	await closeBrowser(cdp, chrome);
}
