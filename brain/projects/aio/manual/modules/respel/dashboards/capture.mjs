/**
 * Capturas de los permisos por dashboard de Green (Reportes > Dashboard > Operaciones y Comercial).
 *
 * Uso:
 *   node modules/respel/dashboards/capture.mjs --salida <carpeta> --escena completo|sin-dashboards [--empresa "Empresa Demo"]
 *
 * Cada escena necesita un usuario con permisos distintos: se pasan con AIO_TEST_EMAIL / AIO_TEST_PASSWORD.
 * - completo: Leer en las dos páginas y en los siete dashboards, y Crear en Usuarios (solo para abrir Agregar rol).
 * - sin-dashboards: Leer solo en las dos páginas. No guarda nada: Agregar rol se cierra sin guardar.
 */
import { clearHighlights, closeBrowser, evaluate, highlight, insertText, screenshot, wait, waitForText } from "../../../lib/browser.mjs";
import { DEFAULT_BASE, goTo, openSession, testCredentials } from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};
const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const scene = arg("escena", "completo");
const company = arg("empresa", "Empresa Demo");

/** Despliega el grupo Dashboard del menú lateral si está cerrado. */
const openDashboardGroup = (cdp) =>
	evaluate(cdp, `(() => { const g = [...document.querySelectorAll('.layout-vertical-nav .nav-group')].find(e => e.querySelector('.nav-group-label, a')?.textContent.trim().startsWith('Dashboard')); if (!g) return false; if (!g.classList.contains('open')) g.querySelector('.nav-group-label, a').click(); return true; })()`);

const { cdp, chrome } = await openSession({ base, ...testCredentials(), company, module: "Green" });
try {
	await goTo(cdp, base, "/reports/dashboard-commercial");
	await wait(12000);
	await openDashboardGroup(cdp);
	await wait(1200);

	if (scene === "sin-dashboards") {
		await waitForText(cdp, "No tiene dashboards asignados", { timeout: 20000 });
		await highlight(cdp, ".v-alert", { padding: 8 });
		await screenshot(cdp, `${outputDir}/sin-dashboards.png`);
		await clearHighlights(cdp);
	} else {
		await highlight(cdp, ".layout-vertical-nav .nav-group.open", { padding: 6 });
		await screenshot(cdp, `${outputDir}/menu.png`);
		await clearHighlights(cdp);

		await goTo(cdp, base, "/settings/users");
		await wait(6000);
		await evaluate(cdp, `[...document.querySelectorAll('.v-tab, button')].find(e => e.textContent.trim() === 'Roles y Permisos')?.click()`);
		await wait(5000);
		const opened = await evaluate(cdp, `(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim().toLowerCase() === 'agregar rol'); if (!b) return false; b.click(); return true; })()`);
		if (!opened) throw new Error("No está el botón Agregar rol: el usuario necesita Crear sobre Usuarios");
		await waitForText(cdp, "Permisos de rol", { timeout: 20000 });
		await wait(3000);
		await evaluate(cdp, `document.querySelectorAll('.Toastify__toast').forEach(t => t.remove())`);
		await evaluate(cdp, `document.querySelector('.v-dialog input[placeholder="Buscar"]')?.focus()`);
		await insertText(cdp, "Comercial /");
		await wait(2500);
		const row = `[...document.querySelectorAll('.v-dialog *')].find(e => e.children.length === 0 && /Reportes \\/ Comercial \\//.test(e.textContent))`;
		if (!(await evaluate(cdp, `!!${row}`))) throw new Error("El buscador no devolvió permisos de dashboards");
		await evaluate(cdp, `${row}.scrollIntoView({ block: 'center' })`);
		await wait(1000);
		await screenshot(cdp, `${outputDir}/permisos.png`);
	}
} catch (error) {
	await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
	console.error(`Falló: ${error.message}`);
	process.exitCode = 1;
} finally {
	await closeBrowser(cdp, chrome);
}
