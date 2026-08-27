/**
 * Capturas de Móvil > Censo: la tabla de visitas y el asistente abierto en modo consulta.
 *
 * Uso:
 *   node modules/mobile/visits/capture.mjs --salida <carpeta>
 *        [--base http://localhost:5173] [--empresa "Empresa Demo"] [--visita 76]
 *        [--solo tabla|detalle]
 *
 * La visita debe estar sincronizada y tener Estado de Predio: una visita sin ese dato deja el
 * formulario del manual con el campo en blanco, que es justo lo que la imagen documenta.
 */

import { clickAt, closeBrowser, evaluate, screenshot, setViewport, wait, waitForSelector } from "../../../lib/browser.mjs";
import {
	DEFAULT_BASE,
	describeScreen,
	goTo,
	openSession,
	testCredentials,
	waitForNoSkeletons,
	waitForTableSettled,
	VIEWPORT,
} from "../../../lib/session.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "Empresa Demo");
const visitId = arg("visita", null);
const only = arg("solo", null);

/**
 * Alto de ventana para capturar el asistente.
 *
 * El diálogo limita su alto al de la ventana y el resto del formulario queda en un scroll
 * interno: con el viewport estándar el recorte de la tarjeta corta la mitad de los campos, entre
 * ellos el Estado de Predio, que está al final de Datos Cliente.
 */
const DIALOG_HEIGHT = Number(arg("alto-detalle", 1500));

/** Índice de la columna Estado de Predio, para verificar que la tabla la muestra. */
const propertyStatusColumn = (cdp) =>
	evaluate(
		cdp,
		`(() => { const th = [...document.querySelectorAll('thead th')];
      return th.findIndex(t => /estado\\s+de\\s+predio/i.test(t.textContent)); })()`,
	);

/**
 * Fila de una visita concreta, o la primera que tenga Estado de Predio si no se pide ninguna.
 *
 * El ojo de "Ver" va dentro de un `IconBtn` anidado en otro, así que `button.v-show` aparece dos
 * veces por fila: se ubica por el ícono y se sube al botón que lo contiene.
 */
const rowWithPropertyStatus = (cdp, statusColumn, id) =>
	evaluate(
		cdp,
		`(() => {
      const rows = [...document.querySelectorAll('tbody tr')].filter(r => r.querySelectorAll('td').length > 3);
      const id = ${id ? JSON.stringify(String(id)) : "null"};
      const row = id
        ? rows.find(r => r.querySelectorAll('td')[1]?.textContent.trim() === id)
        : rows.find(r => (r.querySelectorAll('td')[${statusColumn}]?.textContent || '').trim().length > 1);
      if (!row) return null;
      const icon = row.querySelector('.tabler-eye, i[class*="tabler-eye"]');
      const button = icon && icon.closest('button');
      if (!button) return null;
      const r = button.getBoundingClientRect();
      return {
        id: row.querySelectorAll('td')[1]?.textContent.trim(),
        status: (row.querySelectorAll('td')[${statusColumn}]?.textContent || '').trim(),
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
      };
    })()`,
	);

/** Valor del campo Estado de Predio dentro del asistente, para verificar antes de capturar. */
const propertyStatusField = (cdp) =>
	evaluate(
		cdp,
		`(() => { const label = [...document.querySelectorAll('.v-dialog label, .v-dialog .v-label')]
      .find(e => /estado\\s+de\\s+predio/i.test(e.textContent));
      if (!label) return null;
      const input = label.closest('.v-input')?.querySelector('input');
      return { value: input ? input.value : '' }; })()`,
	);

const { cdp, chrome } = await openSession({
	base,
	...testCredentials({ email: arg("email"), password: arg("password") }),
	company,
});

try {
	await goTo(cdp, base, "/mobile/visits", { selector: ".v-data-table" });

	if (!(await waitForTableSettled(cdp)))
		throw new Error(`La tabla de visitas no terminó de cargar. Pantalla:\n${await describeScreen(cdp)}`);

	const statusColumn = await propertyStatusColumn(cdp);
	if (statusColumn < 0) {
		const headers = await evaluate(cdp, `[...document.querySelectorAll('thead th')].map(t => t.textContent.trim())`);

		throw new Error(`La tabla no muestra la columna Estado de Predio. Cabeceras: ${JSON.stringify(headers)}`);
	}
	console.log(`Columna "Estado de Predio" en la posición ${statusColumn}`);

	// La tabla es más alta que el viewport estándar: capturarla a secas corta la última fila y
	// deja fuera la paginación, que también es parte de lo que documenta la imagen.
	if (only !== "detalle")
		await screenshot(cdp, `${outputDir}/tabla_visitas.png`, { selector: ".v-data-table", includeHeader: true, margin: 30 });

	if (only === "tabla") {
		console.log("Capturas listas en", outputDir);
		await closeBrowser(cdp, chrome);
		process.exit(0);
	}

	const row = await rowWithPropertyStatus(cdp, statusColumn, visitId);
	if (!row) throw new Error(`No hay ninguna visita con Estado de Predio en la página. Pantalla:\n${await describeScreen(cdp)}`);

	console.log(`Visita ${row.id} con Estado de Predio "${row.status}"`);

	await clickAt(cdp, row.x, row.y);

	// `waitForSelector` no sirve con `.v-dialog`: es `position: fixed`, su `offsetParent` siempre
	// es null y la espera se agota aunque el modal esté abierto. Hay que esperar algo de adentro.
	await waitForSelector(cdp, ".v-dialog .stepper-icon-step", { timeout: 60000 });
	await waitForNoSkeletons(cdp, { within: ".v-dialog" });

	await setViewport(cdp, { width: VIEWPORT.width, height: DIALOG_HEIGHT });
	await wait(1500);

	const field = await propertyStatusField(cdp);
	if (!field) throw new Error(`El formulario no muestra el campo Estado de Predio. Pantalla:\n${await describeScreen(cdp)}`);
	if (!field.value) console.log("  AVISO: el campo Estado de Predio salió vacío");
	console.log(`Campo "Estado de Predio" en el formulario con valor "${field.value}"`);

	await screenshot(cdp, `${outputDir}/tab1.png`, { selector: ".v-dialog .v-card", margin: 0 });

	console.log("Capturas listas en", outputDir);
}
catch (error) {
	console.error("ERROR:", error.message);
	await screenshot(cdp, `${outputDir}/_fallo.png`);
}
finally {
	await closeBrowser(cdp, chrome);
}
