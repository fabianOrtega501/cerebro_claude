/**
 * Capturas del asistente de la ruta abierto en modo consulta (botón Ver) en Operaciones > Rutas.
 *
 * Documenta que la columna Acciones está disponible en todas las pestañas y que en consulta solo
 * queda el botón de ver el detalle del registro.
 *
 * Uso:
 *   node modules/operations/routes/capture-read-only.mjs --salida <carpeta>
 *        [--base http://localhost:5173] [--empresa "Empresa Demo"] [--ruta MAR-01]
 *
 * La ruta debe tener registros en las pestañas: una ruta vacía documenta tablas en blanco.
 */

import { clickAt, closeBrowser, evaluate, screenshot, wait, waitForSelector } from "../../../lib/browser.mjs";
import {
	DEFAULT_BASE,
	describeScreen,
	goTo,
	openSession,
	testCredentials,
	waitForNoSkeletons,
} from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "Empresa Demo");
const routeCode = arg("ruta", "MAR-01");

/** Pestañas del asistente que tienen tabla, con el nombre del archivo de cada una. */
const TABS = [
	{ pattern: /personal/i, file: "consulta_personal.png" },
	{ pattern: /peaje/i, file: "consulta_peajes.png" },
	{ pattern: /punto/i, file: "consulta_puntos_control.png" },
	{ pattern: /suministro/i, file: "consulta_suministros.png" },
];

const centerOf = (cdp, selector, index = 0) =>
	evaluate(
		cdp,
		`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

/**
 * Deja visible el paso que coincide con el patrón y le hace click.
 *
 * Los pasos viven en un `VSlideGroup`: los últimos quedan fuera de la vista y su click no hace
 * nada, así que primero hay que correr el carrusel con la flecha.
 */
const openStep = async (cdp, pattern) => {
	const locate = () =>
		evaluate(
			cdp,
			`(() => { const e = [...document.querySelectorAll('.v-dialog .stepper-icon-step')]
        .find(x => ${pattern.toString()}.test(x.textContent));
        if (!e) return null;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.right > window.innerWidth || r.left < 0) return null;
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
		);

	let point = await locate();

	for (let attempt = 0; !point && attempt < 6; attempt++) {
		const arrow = await centerOf(cdp, ".v-dialog .v-slide-group__next");
		if (!arrow) break;
		await clickAt(cdp, arrow.x, arrow.y);
		await wait(700);
		point = await locate();
	}

	if (!point) return false;

	await clickAt(cdp, point.x, point.y);
	await wait(2500);
	await waitForNoSkeletons(cdp, { within: ".v-dialog" });

	return true;
};

/** Acciones visibles en la pestaña activa, para verificar que la captura muestra lo esperado. */
const visibleActions = (cdp) =>
	evaluate(
		cdp,
		`(() => {
      const visible = e => e && e.offsetParent !== null && !e.hidden;
      const d = document.querySelector('.v-dialog');
      return {
        columnaAcciones: [...d.querySelectorAll('thead th')].some(t => /acciones/i.test(t.textContent)),
        ver: [...d.querySelectorAll('.v-show')].filter(visible).length,
        editar: [...d.querySelectorAll('.v-update')].filter(visible).length,
        eliminar: [...d.querySelectorAll('.v-delete')].filter(visible).length,
        agregar: [...d.querySelectorAll('button')].filter(e => visible(e) && /agregar/i.test(e.textContent)).length,
      };
    })()`,
	);

const { cdp, chrome } = await openSession({
	base,
	...testCredentials({ email: arg("email"), password: arg("password") }),
	company,
});

try {
	await goTo(cdp, base, "/operations/operation-routes", { selector: ".v-data-table" });
	await wait(3000);

	const viewButton = await evaluate(
		cdp,
		`(() => {
      const row = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(${JSON.stringify(routeCode)}));
      const b = row && row.querySelector('button.v-show');
      if (!b) return null; const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!viewButton) throw new Error(`No se encontró la ruta ${routeCode} en la tabla. Pantalla:\n${await describeScreen(cdp)}`);

	await clickAt(cdp, viewButton.x, viewButton.y);
	await waitForSelector(cdp, ".v-dialog .stepper-icon-step", { timeout: 60000 });
	await waitForNoSkeletons(cdp, { within: ".v-dialog" });

	for (const tab of TABS) {
		if (!(await openStep(cdp, tab.pattern))) {
			console.log(`AVISO: no se pudo abrir la pestaña ${tab.pattern}`);
			continue;
		}

		const actions = await visibleActions(cdp);

		console.log(`${tab.file.padEnd(30)} ${JSON.stringify(actions)}`);

		if (actions.editar || actions.eliminar || actions.agregar)
			console.log("  AVISO: la pestaña muestra acciones de edición en modo consulta");

		await screenshot(cdp, `${outputDir}/${tab.file}`);
	}

	console.log("Capturas listas en", outputDir);
}
catch (error) {
	console.error("ERROR:", error.message);
	await screenshot(cdp, `${outputDir}/_fallo.png`);
}
finally {
	await closeBrowser(cdp, chrome);
}
