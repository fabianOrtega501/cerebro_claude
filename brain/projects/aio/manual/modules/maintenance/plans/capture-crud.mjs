/**
 * Recorrido del CRUD de las cuatro pestañas de líneas del wizard de Planes de Mantenimiento
 * (Actividades, Puestos de Trabajo, Herramientas y Suministros), con una captura por
 * operación.
 *
 * Las pestañas cambian de comportamiento según cómo se abrió el wizard:
 *
 * | Modo | Cómo se abre | Qué hacen las líneas |
 * | --- | --- | --- |
 * | `edicion` | acción Editar de la fila | cada línea se persiste sola y la tabla pagina contra el backend |
 * | `creacion` | botón Agregar de la vista | las líneas viven en memoria y se envían todas al guardar |
 * | `consulta` | acción Ver de la fila | todo bloqueado, sin Agregar ni acciones de fila |
 *
 * Uso:
 *   node modules/maintenance/plans/capture-crud.mjs --salida <carpeta>
 *        --empresa "Empresa Demo" [--plan "DEMO Plan"]
 *        [--modo edicion|creacion|consulta|todos] [--tab actividades|puestos|herramientas|suministros]
 *        [--base http://localhost:5173] [--email <usuario>] [--password <clave>]
 *
 * Las líneas que crea llevan valores reconocibles (`MARCA_CREAR` / `MARCA_EDITAR`) para
 * poder confirmarlas después en la base de datos.
 */

import { clickAt, closeBrowser, evaluate, moveMouseTo, pressEscape, screenshot, setViewport, wait, waitUntil } from "../../../lib/browser.mjs";
import {
	DEFAULT_BASE,
	describeScreen,
	goTo,
	openSession,
	testCredentials,
	waitForTableSettled,
} from "../../../lib/session.mjs";
import {
	PLANS_VIEW,
	centerOfText,
	goToStep,
	openPlansTab,
	openWizardFor,
	rowActionButton,
	scrollDialogToBottom,
	shot,
	stepperState,
	waitForPlanRow,
	waitForWizard,
} from "./wizard.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);

	return index >= 0 ? args[index + 1] : fallback;
};

const base = arg("base", DEFAULT_BASE);
const outputDir = arg("salida", "./capturas");
const company = arg("empresa", "Empresa Demo");
const planName = arg("plan", "DEMO Plan");
const modo = arg("modo", "edicion");
const soloTab = arg("tab", null);

/** Valor que se escribe al crear una línea; sirve para reconocerla en la tabla y en la base. */
const MARCA_CREAR = "4321";

/** Valor al que se cambia al editarla. */
const MARCA_EDITAR = "1234";

/**
 * Cantidad de Suministros está validada entre 0 y 999, así que esa pestaña necesita marcas
 * propias: con las generales el formulario se niega a guardar y la prueba mide el validador,
 * no el CRUD.
 */
const MARCA_CREAR_CORTA = "321";
const MARCA_EDITAR_CORTA = "123";

/**
 * El wizard con su tabla no cabe en la ventana estándar del manual y, si el botón Siguiente
 * cae en la franja inferior, se lo come el `.footer-dialog` fijo del diálogo. Con esta altura
 * la tabla completa entra en la captura.
 */
const VENTANA = { width: 1486, height: 1300 };

/**
 * Las pestañas de líneas, con el rótulo de su paso y los valores que se escriben en cada
 * campo de texto de su diálogo, por etiqueta.
 *
 * `editable` es la etiqueta del campo que se modifica en la prueba de edición: tiene que ser
 * un campo de texto, porque los selects arrastran recargas encadenadas.
 */
const TABS = [
	{
		key: "actividades",
		paso: "Actividades",
		valores: { "Duración estimada en minutos": MARCA_CREAR, "Orden de Ejecución": "987" },
		editable: "Duración estimada en minutos",
	},
	{
		key: "puestos",
		paso: "Puestos de Trabajo",
		valores: { "Cantidad de personal": "3", "Tiempo estimado en minutos": MARCA_CREAR },
		editable: "Tiempo estimado en minutos",
	},
	{
		key: "herramientas",
		paso: "Herramientas",
		valores: { "Tiempo estimado en minutos": MARCA_CREAR },
		editable: "Tiempo estimado en minutos",
	},
	{
		key: "suministros",
		paso: "Suministros",
		valores: { Cantidad: MARCA_CREAR_CORTA },
		editable: "Cantidad",
		marcaCrear: MARCA_CREAR_CORTA,
		marcaEditar: MARCA_EDITAR_CORTA,
	},
];

/** Los hallazgos de la corrida, que se imprimen al final. */
const hallazgos = [];

/**
 * Anota algo que no cuadró, sin cortar la corrida.
 *
 * @param {string} donde - Pestaña u operación
 * @param {string} texto - Qué se esperaba y qué pasó
 * @returns {void}
 */
const anotar = (donde, texto) => {
	hallazgos.push(`${donde}: ${texto}`);
	console.log(`    ! ${texto}`);
};

/**
 * Expresión que resuelve el contenido del diálogo más alto de la pila.
 *
 * Con dos diálogos abiertos —el wizard y el de la línea— el de arriba es el **último** del
 * DOM, así que todo lo que toque el formulario tiene que acotarse a él.
 */
const TOP = `(() => {
  const l = [...document.querySelectorAll('.v-overlay--active > .v-overlay__content')]
    .filter(e => e.querySelector('.v-card'));
  return l[l.length - 1] ?? null;
})()`;

/** Cuántos diálogos hay abiertos. Sirve para confirmar que uno abrió o cerró. */
const dialogCount = (cdp) =>
	evaluate(
		cdp,
		`[...document.querySelectorAll('.v-overlay--active > .v-overlay__content')].filter(e => e.querySelector('.v-card')).length`,
	);

/**
 * Centro en pantalla de un botón del diálogo más alto, buscado por texto exacto.
 *
 * @param {string} text - Texto del botón, sin distinguir mayúsculas
 * @returns {Promise<{x: number, y: number}|null>} `null` si no está visible
 */
const buttonInTop = (cdp, text) =>
	evaluate(
		cdp,
		`(() => {
      const root = ${TOP}; if (!root) return null;
      const b = [...root.querySelectorAll('.v-btn')].filter(x => x.getClientRects().length)
        .find(x => x.textContent.trim().toLowerCase() === ${JSON.stringify(text)}.toLowerCase());
      if (!b) return null; const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
	);

/**
 * Pulsa un botón del diálogo más alto.
 *
 * @param {string} text - Texto del botón
 * @returns {Promise<boolean>} `false` si no lo encontró; **no lanza**
 */
const clickInTop = async (cdp, text) => {
	const button = await buttonInTop(cdp, text);
	if (!button) {
		const visibles = await evaluate(
			cdp,
			`(() => { const root = ${TOP}; if (!root) return []; return [...root.querySelectorAll('.v-btn')]
        .filter(x => x.getClientRects().length).map(x => x.textContent.trim()).filter(Boolean).slice(0, 15); })()`,
		);

		console.log(`    (botones visibles: ${JSON.stringify(visibles)})`);

		return false;
	}

	// Un botón visible no siempre es alcanzable: el `.footer-dialog` fijo y los velos de los
	// diálogos se llevan el click sin dejar rastro. Se avisa en vez de dar el click por bueno.
	const encima = await evaluate(
		cdp,
		`(() => { const e = document.elementFromPoint(${button.x}, ${button.y});
      const b = e && e.closest('.v-btn');
      return b ? 'boton' : (e ? e.tagName + '.' + String(e.className || '') : 'nada'); })()`,
	);

	if (encima !== "boton") console.log(`    (el click en "${text}" cae sobre ${encima})`);

	await clickAt(cdp, button.x, button.y);
	await wait(600);

	return true;
};

/**
 * Selector de los campos de un formulario, y cómo se descartan los duplicados.
 *
 * Casi todo el proyecto usa los envoltorios `App*`, pero no todo: `Tipo Vehículo` del paso
 * Planes es un `VAutocomplete` pelado. Por eso se buscan también los componentes de Vuetify
 * sueltos y luego se descartan los que ya están dentro de un `App*`, que si no aparecerían
 * dos veces.
 */
const FIELD_SELECTOR = ".app-autocomplete, .app-select, .app-text-field, .app-textarea, .v-autocomplete, .v-select, .v-text-field, .v-textarea";

/** Fragmento que devuelve los envoltorios de campo de un contenedor, ya sin duplicados. */
const FIELDS_IN = `(root => [...root.querySelectorAll(${JSON.stringify(FIELD_SELECTOR)})]
  .filter(w => !w.parentElement?.closest('.app-autocomplete, .app-select, .app-text-field, .app-textarea'))
  .filter(w => w.getClientRects().length))`;

/**
 * Fragmento JavaScript que devuelve la etiqueta visible de un campo.
 *
 * No basta con mirar dentro del componente: varias vistas ponen el rótulo como un `<label>`
 * **hermano**, justo antes del `AppTextarea` o del `AppTextField` (así están Nombre y
 * Descripción del paso Planes). Y Vuetify añade su propia etiqueta flotante, vacía cuando el
 * componente recibe `label: undefined`, que hay que descartar.
 *
 * Se define como texto para poder incrustarlo en las dos expresiones que lo necesitan.
 */
const LABEL_OF = `(w => {
  const propia = [...w.querySelectorAll('.v-label')].map(e => e.textContent.trim()).find(Boolean);
  if (propia) return propia;
  const hermanos = [...(w.parentElement?.children ?? [])];
  const antes = hermanos.slice(0, hermanos.indexOf(w)).reverse()
    .map(e => e.matches('.v-label') ? e.textContent.trim() : '').find(Boolean);
  if (antes) return antes;
  return (w.querySelector('input, textarea')?.getAttribute('placeholder') ?? '').trim();
})`;

/**
 * Los campos del formulario del diálogo más alto, en orden de aparición.
 *
 * @returns {Promise<Array<{label: string, id: string|null, kind: string, value: string, chips: number}>>}
 *          `value` viene vacío en los selects múltiples, que muestran su selección como
 *          chips: por eso se devuelve también `chips`
 */
const fieldsInTop = (cdp) =>
	evaluate(
		cdp,
		`(() => {
      const root = ${TOP}; if (!root) return [];
      return (${FIELDS_IN})(root)
        .map(w => {
          const input = w.querySelector('input, textarea');
          return {
            label: (${LABEL_OF})(w),
            id: input?.id || null,
            // Ojo: un VAutocomplete de Vuetify lleva además la clase \`v-text-field\`, así que
            // el tipo se decide por lo que sí es exclusivo de un desplegable.
            kind: w.matches('.app-autocomplete, .app-select, .v-autocomplete, .v-select') ? 'select' : 'text',
            value: input?.value ?? '',
            disabled: !!input?.disabled,
            chips: w.querySelectorAll('.v-chip, .v-select__selection, .v-autocomplete__selection').length,
          };
        });
    })()`,
	);

/**
 * Elige la primera opción real del menú abierto de un select.
 *
 * Los selects de estas pestañas traen un `append-item` con el enlace "Agregar ..." que abre
 * otra modal: hay que saltarlo, igual que el "No data available".
 *
 * @returns {Promise<string|null>} El texto elegido, o `null` si el menú no traía opciones
 */
const selectFirstOption = async (cdp) => {
	const option = await evaluate(
		cdp,
		`(() => {
      const items = [...document.querySelectorAll('.v-overlay--active .v-list-item')]
        .filter(e => e.getClientRects().length)
        .filter(e => !/^agregar/i.test(e.textContent.trim()))
        .filter(e => !/no data available|sin datos|no hay datos/i.test(e.textContent.trim()));
      const e = items[0]; if (!e) return null;
      const r = e.getBoundingClientRect();
      return { texto: e.textContent.trim(), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
	);

	if (!option) return null;

	await clickAt(cdp, option.x, option.y);
	await wait(700);

	return option.texto;
};

/**
 * Expresión que resuelve el envoltorio de un campo del diálogo más alto por su etiqueta.
 *
 * **No se puede llegar por `id`.** `AppTextField` y `AppAutocomplete` calculan el suyo como
 * `app-<tipo>-<etiqueta>-<aleatorio>` dentro de un `computed`, así que el sufijo cambia en
 * **cada render**: un id leído antes de tocar un select ya no existe después.
 *
 * @param {string} label - Texto de la etiqueta, tal como se ve
 * @returns {string} Expresión JavaScript que devuelve el elemento, o `null`
 */
const wrapperByLabel = (label) => `(() => {
  const root = ${TOP}; if (!root) return null;
  return (${FIELDS_IN})(root).find(w => (${LABEL_OF})(w) === ${JSON.stringify(label)}) ?? null;
})()`;

/**
 * Escribe en un campo de texto del diálogo más alto, buscándolo por su etiqueta.
 *
 * Dispara `input`, `change` y `blur`, que son los que activan las reglas del `VForm`: sin
 * ellos el campo se queda sin validar y el guardado no hace nada.
 *
 * @param {string} label - Etiqueta del campo
 * @param {string} value - Valor a escribir; reemplaza el contenido
 * @returns {Promise<boolean>} `false` si no encontró el campo
 */
const typeByLabel = (cdp, label, value) =>
	evaluate(
		cdp,
		`(() => {
      const w = ${wrapperByLabel(label)}; if (!w) return false;
      const input = w.querySelector('input, textarea'); if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(
        input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    })()`,
	);

/**
 * Abre el menú de un select del diálogo más alto y espera a que traiga opciones.
 *
 * No se usa `openSelect` de `lib/session.mjs` porque aquí el campo se localiza por etiqueta
 * y el menú puede tardar en llegar por API mientras el diálogo sigue cargando.
 *
 * @param {string} label - Etiqueta del campo
 * @returns {Promise<boolean>} `false` si tras los reintentos el menú siguió vacío
 */
const openField = async (cdp, label) => {
	const rect = await evaluate(
		cdp,
		`(() => { const w = ${wrapperByLabel(label)}; if (!w) return null;
      const f = w.querySelector('.v-field'); if (!f) return null;
      const r = f.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
	);

	if (!rect) return false;

	for (let attempt = 0; attempt < 5; attempt++) {
		await clickAt(cdp, rect.x, rect.y);

		const ok = await waitUntil(
			cdp,
			`[...document.querySelectorAll('.v-overlay--active .v-list-item')]
        .filter(e => !/^agregar/i.test(e.textContent.trim()))
        .filter(e => !/no data available|sin datos/i.test(e.textContent.trim())).length > 0`,
			{ timeout: 8000 },
		).then(() => true).catch(() => false);

		if (ok) return true;

		await pressEscape(cdp);
		await wait(1200);
	}

	return false;
};

/**
 * Espera a que el formulario del diálogo más alto deje de ser esqueletos.
 *
 * Estos diálogos abren vacíos y pintan `VSkeletonLoader` mientras cargan sus selects: una
 * espera fija se cumple con la modal todavía en gris y todo lo que sigue corre en falso.
 *
 * @param {number} [timeout] - Tiempo máximo en milisegundos
 * @returns {Promise<boolean>} `false` si se agotó el tiempo con el formulario aún en gris
 */
const waitForFormReady = async (cdp, timeout = 40000) =>
	waitUntil(
		cdp,
		`(() => { const root = ${TOP}; if (!root) return false;
      return root.querySelectorAll('.v-skeleton-loader').length === 0
        && (${FIELDS_IN})(root).length > 0; })()`,
		{ timeout },
	).then(() => true).catch(() => false);

/**
 * Cierra el menú desplegable que haya quedado abierto.
 *
 * Un select múltiple —`Modelo Vehículo` en Suministros— deja su lista abierta después de
 * elegir, y esa lista tapa los botones del diálogo: el click en Guardar cae sobre el `.v-list`
 * y no pasa nada. Se usa la tecla real, porque un `KeyboardEvent` sintético sobre `document`
 * no lo cierra; los diálogos son `persistent`, así que el Escape no se lleva la modal.
 *
 * @returns {Promise<void>}
 */
const closeMenus = async (cdp) => {
	for (let intento = 0; intento < 4; intento++) {
		const abierto = await evaluate(cdp, `!!document.querySelector('.v-overlay--active .v-list')`);
		if (!abierto) return;

		await pressEscape(cdp);
		await wait(500);
	}
};

/**
 * Llena el formulario del diálogo más alto: cada select con su primera opción y cada campo
 * de texto con el valor que le corresponda.
 *
 * Se releen los campos después de cada uno porque llenar un select puede hacer aparecer otro
 * (el de Componente sale solo si el sistema elegido tiene definiciones) y porque los de
 * Actividad se cargan según el sistema.
 *
 * @param {object} valores - Valor por etiqueta para los campos de texto
 * @returns {Promise<string[]>} Las etiquetas que quedaron sin llenar
 */
const fillTopForm = async (cdp, valores) => {
	const intentados = new Set();

	for (let paso = 0; paso < 30; paso++) {
		// Elegir un valor en un select vuelve a poner el formulario en esqueletos mientras
		// recarga los que dependen de él (el de Actividad depende del Sistema). Sin esta
		// espera, la relectura cae en ese hueco y no ve ningún campo.
		if (!await waitForFormReady(cdp)) break;

		const campos = await fieldsInTop(cdp);
		const pendiente = campos.find((c) => c.label && !intentados.has(c.label) && !c.value && c.chips === 0);

		if (!pendiente) break;

		// El select de Actividad queda deshabilitado mientras carga la lista que depende del
		// Sistema. Marcarlo como intentado aquí lo dejaría vacío para siempre: se espera.
		if (pendiente.disabled) {
			await wait(1500);
			continue;
		}

		intentados.add(pendiente.label);

		if (pendiente.kind === "text") {
			if (!await typeByLabel(cdp, pendiente.label, valores[pendiente.label] ?? "5"))
				anotar(pendiente.label, "no se encontró el campo de texto");
			await wait(400);
			continue;
		}

		if (!await openField(cdp, pendiente.label)) {
			anotar(pendiente.label, "el select nunca cargó opciones");
			continue;
		}

		const elegido = await selectFirstOption(cdp);
		if (!elegido) anotar(pendiente.label, "el menú abrió sin opciones");
		else console.log(`    (${pendiente.label} = ${elegido})`);

		// Un select múltiple deja el menú abierto tras elegir.
		await closeMenus(cdp);
		await wait(500);
	}

	if (!await waitForFormReady(cdp)) return ["(el formulario quedó en esqueletos)"];

	const campos = await fieldsInTop(cdp);

	return campos.filter((c) => !c.value && c.chips === 0)
		.map((c) => `${c.label} [${c.kind}, intentado=${intentados.has(c.label)}]`);
};

/**
 * El texto de los toasts visibles.
 *
 * @returns {Promise<string[]>} Vacío si ya se fueron; los toasts duran pocos segundos
 */
const toasts = (cdp) =>
	evaluate(cdp, `[...document.querySelectorAll('.Toastify__toast')].map(e => e.textContent.trim())`);

/**
 * Fragmento que devuelve las filas **con datos** de la tabla del paso.
 *
 * Una tabla vacía no tiene cero filas: tiene la de "No hay datos disponibles". Contarla como
 * fila hace que una búsqueda sin resultados parezca un filtro que no funciona.
 */
const DATA_ROWS = `[...document.querySelectorAll('.v-dialog tbody tr')]
  .filter(tr => tr.getClientRects().length)
  .filter(tr => !/no hay datos|no data available|sin datos/i.test(tr.textContent))`;

/**
 * Celdas de la primera fila visible que contenga ese texto.
 *
 * Sirve para detectar columnas en blanco: una línea puede guardarse bien y aun así mostrarse
 * sin su nombre si la vista no resolvió la etiqueta del maestro.
 *
 * @param {string} texto - Fragmento que identifica la fila
 * @returns {Promise<string[]|null>} El texto de cada celda, o `null` si no hay esa fila
 */
const rowCells = (cdp, texto) =>
	evaluate(
		cdp,
		`(() => {
      const tr = [...document.querySelectorAll('.v-dialog tbody tr')]
        .filter(r => r.getClientRects().length)
        .find(r => r.textContent.includes(${JSON.stringify(texto)}));
      if (!tr) return null;
      return [...tr.querySelectorAll('td')].slice(1).map(td => td.textContent.trim());
    })()`,
	);

/**
 * Datos de la primera fila de la tabla del paso que contenga ese texto.
 *
 * @param {string} texto - Fragmento que identifica la fila
 * @returns {Promise<string|null>} El contenido de la fila, o `null` si no está
 */
const rowText = (cdp, texto) =>
	evaluate(
		cdp,
		`(() => {
      const tr = [...document.querySelectorAll('.v-dialog tbody tr')]
        .find(r => r.textContent.includes(${JSON.stringify(texto)}));
      return tr ? tr.innerText.replace(/\\s+/g, ' ').trim() : null;
    })()`,
	);

/**
 * Lleva la tabla del paso a su última página.
 *
 * Las líneas se listan por id ascendente, así que la que se acaba de crear cae al final:
 * comprobarla en la página 1 daría siempre negativo con un plan de cientos de líneas.
 *
 * @returns {Promise<boolean>} `false` si no hay paginación visible
 */
const goToLastPage = async (cdp) => {
	const boton = await evaluate(
		cdp,
		`(() => {
      const items = [...document.querySelectorAll('.v-dialog .v-pagination__item .v-btn')]
        .filter(b => /^\d+$/.test(b.textContent.trim()));
      const b = items[items.length - 1]; if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`,
	);

	if (!boton) return false;

	await clickAt(cdp, boton.x, boton.y);
	await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
	await wait(1200);

	return true;
};

/**
 * Captura el diálogo más alto de la pila, con un margen.
 *
 * No sirve un selector CSS: `.v-dialog:last-of-type` compara entre hermanos del mismo tipo y
 * los diálogos no siempre lo son, así que el recorte se calcula del elemento que resuelve
 * `TOP` y se le pasa a `screenshot` como `clip` explícito.
 *
 * @param {string} path - Ruta del PNG a escribir
 * @returns {Promise<void>} No lanza si no hay diálogo: captura la ventana completa
 */
const shotTop = async (cdp, path) => {
	await evaluate(cdp, `document.activeElement?.blur()`);

	const rect = await evaluate(
		cdp,
		`(() => { const e = ${TOP}; if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.x - 10)), y: Math.max(0, Math.floor(r.y - 10)),
               width: Math.ceil(r.width + 20), height: Math.ceil(r.height + 20) }; })()`,
	);

	await screenshot(cdp, path, rect ? { clip: rect } : {});
};

/**
 * Pulsa un botón de acción de una fila y espera a que el diálogo abra.
 *
 * Se reintenta porque las celdas de la tabla llevan tooltip: si el ratón viene de pasar por
 * encima de una, el globo queda pintado sobre la columna de acciones y se lleva el click. Por
 * eso se aparta el ratón y se espera a que no queden tooltips antes de apuntar.
 *
 * @param {string} marca - Fragmento que identifica la fila
 * @param {string} accion - Clase del botón: `.v-show`, `.v-update` o `.v-delete`
 * @param {boolean} [esperaDialogo] - Si la acción abre un diálogo; `eliminar` no abre ninguno
 * @returns {Promise<boolean>} `false` si no hay fila, no hay botón, o el diálogo no abrió
 */
const clickRowAction = async (cdp, marca, accion, esperaDialogo = true) => {
	const antes = await dialogCount(cdp);

	for (let intento = 0; intento < 3; intento++) {
		await moveMouseTo(cdp, 5, 5);
		await waitUntil(cdp, `document.querySelectorAll('.v-tooltip').length === 0`, { timeout: 4000 }).catch(() => {});
		await wait(400);

		const boton = await rowActionButton(cdp, marca, accion);
		if (!boton) {
			const filas = await evaluate(
				cdp,
				`[...document.querySelectorAll('tbody tr')]
          .filter(tr => tr.textContent.includes(${JSON.stringify(marca)}))
          .map(tr => ({ visible: tr.getClientRects().length > 0,
                        botones: [...tr.querySelectorAll('.v-btn')].map(b => b.className.split(' ').find(c => c.startsWith('v-show') || c.startsWith('v-update') || c.startsWith('v-delete')) ?? '?') }))`,
			);

			console.log(`    (no hay botón ${accion} en la fila "${marca}"; filas: ${JSON.stringify(filas)})`);

			return false;
		}

		const encima = await evaluate(
			cdp,
			`(() => { const e = document.elementFromPoint(${boton.x}, ${boton.y});
        return e && e.closest('.v-btn') ? 'boton' : (e ? e.tagName + '.' + String(e.className || '') : 'nada'); })()`,
		);

		if (encima !== "boton") console.log(`    (el click en ${accion} cae sobre ${encima})`);

		await clickAt(cdp, boton.x, boton.y);

		if (!esperaDialogo) {
			await wait(1200);

			return true;
		}

		const abrio = await waitUntil(
			cdp,
			`[...document.querySelectorAll('.v-overlay--active > .v-overlay__content')].filter(e => e.querySelector('.v-card')).length > ${antes}`,
			{ timeout: 8000 },
		).then(() => true).catch(() => false);

		if (abrio) return true;
	}

	return false;
};

/**
 * Cierra los diálogos que estén abiertos por encima del wizard.
 *
 * Un diálogo que se quedó abierto envenena todo lo que sigue: el "diálogo más alto" deja de
 * ser el wizard y a partir de ahí no se encuentra ningún botón del paso. Se llama después de
 * cada operación, aunque haya salido bien.
 *
 * @param {number} [objetivo] - Cuántos diálogos deben quedar; 1 es solo el wizard
 * @returns {Promise<void>} No lanza: si no logra cerrarlos, lo deja como esté
 */
const closeExtraDialogs = async (cdp, objetivo = 1) => {
	for (let intento = 0; intento < 5; intento++) {
		if (await dialogCount(cdp) <= objetivo) return;

		// El diálogo tiene su propio velo de carga (`vue-loading-overlay`), que tapa los
		// botones mientras dura la petición: pulsar Cerrar debajo de él no hace nada.
		await waitUntil(cdp, `document.querySelectorAll('.vl-overlay, .vl-background').length === 0`, { timeout: 15000 })
			.catch(() => {});

		if (!await clickInTop(cdp, "Cerrar"))
			await pressEscape(cdp);

		await wait(1200);
	}
};

/**
 * Recorre el CRUD de una pestaña contra el backend (wizard abierto en edición).
 *
 * @param {object} tab - Entrada de `TABS`
 * @returns {Promise<void>}
 */
const crudEnEdicion = async (cdp, tab) => {
	console.log(`\n  [${tab.key}]`);

	const marcaCrear = tab.marcaCrear ?? MARCA_CREAR;
	const marcaEditar = tab.marcaEditar ?? MARCA_EDITAR;

	await closeExtraDialogs(cdp);

	if (!await goToStep(cdp, tab.paso)) {
		anotar(tab.key, `no se pudo llegar al paso ${tab.paso}`);

		return;
	}

	await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
	await wait(1000);
	await shot(cdp, `${outputDir}/${tab.key}-01-listado.png`);

	// --- Crear -------------------------------------------------------------------------
	const antes = await dialogCount(cdp);

	if (!await clickInTop(cdp, "Agregar")) {
		anotar(tab.key, "no hay botón Agregar en el paso");

		return;
	}

	const abrio = await waitUntil(cdp, `[...document.querySelectorAll('.v-overlay--active > .v-overlay__content')].filter(e => e.querySelector('.v-card')).length > ${antes}`, { timeout: 15000 })
		.then(() => true).catch(() => false);

	if (!abrio) {
		anotar(tab.key, "el diálogo de Agregar no abrió");

		return;
	}

	if (!await waitForFormReady(cdp))
		anotar(tab.key, "el formulario de Agregar se quedó en esqueletos");

	await wait(600);

	const sinLlenar = await fillTopForm(cdp, tab.valores);
	if (sinLlenar.length) anotar(tab.key, `campos sin llenar al crear: ${sinLlenar.join(", ")}`);

	await closeMenus(cdp);
	await shotTop(cdp, `${outputDir}/${tab.key}-02-crear.png`);
	await scrollDialogToBottom(cdp);

	if (!await clickInTop(cdp, "Guardar")) anotar(tab.key, "no hay botón Guardar en el diálogo");

	await wait(2500);
	await closeExtraDialogs(cdp);
	console.log(`    toast: ${JSON.stringify(await toasts(cdp))}`);

	await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
	await wait(1200);

	// La línea nueva es la de mayor id y la tabla ordena ascendente: está en la última página.
	await goToLastPage(cdp);
	await shot(cdp, `${outputDir}/${tab.key}-03-creado.png`);

	const creada = await rowText(cdp, marcaCrear);

	console.log(`    fila creada: ${creada ?? "NO APARECE en la tabla"}`);
	if (!creada) anotar(tab.key, `la línea creada no aparece en la tabla (se buscó "${marcaCrear}")`);

	const celdas = creada ? await rowCells(cdp, marcaCrear) : null;
	if (celdas?.some((c) => c === "")) anotar(tab.key, `la fila creada tiene celdas vacías: ${JSON.stringify(celdas)}`);

	// --- Duplicado ---------------------------------------------------------------------
	// Repetir la misma línea tiene que rechazarse: el frontend solo ve la página cargada, así
	// que la unicidad la decide el backend sobre el plan completo.
	if (creada) {
		const filasAntes = await evaluate(cdp, `${DATA_ROWS}.length`);

		if (await clickInTop(cdp, "Agregar")) {
			await waitForFormReady(cdp);
			await wait(600);
			await fillTopForm(cdp, tab.valores);
			await closeMenus(cdp);
			await scrollDialogToBottom(cdp);
			await clickInTop(cdp, "Guardar");
			await wait(2500);

			const aviso = await toasts(cdp);

			console.log(`    duplicado: ${JSON.stringify(aviso)}`);
			await shotTop(cdp, `${outputDir}/${tab.key}-11-duplicado.png`);
			await closeExtraDialogs(cdp);
			await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
			await wait(1000);

			const filasDespues = await evaluate(cdp, `${DATA_ROWS}.length`);

			if (filasDespues > filasAntes) anotar(tab.key, "se pudo agregar la misma línea dos veces");
			else if (!aviso.length) anotar(tab.key, "el duplicado se rechazó sin avisar nada al usuario");
		}
	}

	// --- Ver ---------------------------------------------------------------------------
	if (creada) {
		if (!await clickRowAction(cdp, marcaCrear, ".v-show")) {
			anotar(tab.key, "el diálogo Ver no abrió desde la fila");
		}
		else {
			if (!await waitForFormReady(cdp)) anotar(tab.key, "el formulario de Ver se quedó en esqueletos");
			await wait(900);
			await shotTop(cdp, `${outputDir}/${tab.key}-04-ver.png`);

			// El `readonly` de un `VSwitch` no llega al `<input type=checkbox>` —el atributo no
			// existe para casillas—, así que se mira también la clase que Vuetify le pone al
			// contenedor; contarlo por el input daría siempre un falso positivo.
			const editables = await evaluate(
				cdp,
				`(() => { const root = ${TOP}; if (!root) return null;
          return [...root.querySelectorAll('input, textarea')]
            .filter(i => i.type !== 'hidden')
            .filter(i => !i.readOnly && !i.closest('.v-input--readonly'))
            .filter(i => i.type !== 'checkbox').length; })()`,
			);

			if (editables > 0) anotar(tab.key, `el diálogo Ver deja ${editables} campo(s) editable(s)`);

			await closeExtraDialogs(cdp);
		}
	}

	// --- Editar ------------------------------------------------------------------------
	if (creada) {
		if (!await clickRowAction(cdp, marcaCrear, ".v-update")) {
			anotar(tab.key, "el diálogo Editar no abrió desde la fila");
		}
		else {
			if (!await waitForFormReady(cdp)) anotar(tab.key, "el formulario de Editar se quedó en esqueletos");
			await wait(1200);

			const campos = await fieldsInTop(cdp);
			const campo = campos.find((c) => c.label === tab.editable);

			if (!campo) {
				anotar(tab.key, `el diálogo de edición no trae el campo "${tab.editable}"`);
				await closeExtraDialogs(cdp);
			}
			else {
				await typeByLabel(cdp, tab.editable, marcaEditar);
				await wait(600);
				await shotTop(cdp, `${outputDir}/${tab.key}-05-editar.png`);
				await scrollDialogToBottom(cdp);

				if (!await clickInTop(cdp, "Editar")) anotar(tab.key, "no hay botón Editar en el diálogo");

				await wait(2500);
				await closeExtraDialogs(cdp);
				console.log(`    toast: ${JSON.stringify(await toasts(cdp))}`);
				await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
				await wait(1200);
				await shot(cdp, `${outputDir}/${tab.key}-06-editado.png`);

				const editada = await rowText(cdp, marcaEditar);

				console.log(`    fila editada: ${editada ?? "NO APARECE"}`);
				if (!editada) anotar(tab.key, `tras editar, la fila con "${marcaEditar}" no aparece en la tabla`);
			}
		}
	}

	// --- Eliminar ----------------------------------------------------------------------
	// Va antes de Buscar: el filtro de la búsqueda deja la tabla en otra selección y la fila
	// de prueba se queda fuera de la página visible.
	const marca = await rowText(cdp, marcaEditar) ? marcaEditar : (await rowText(cdp, marcaCrear) ? marcaCrear : null);

	if (!marca) {
		anotar(tab.key, "no se pudo eliminar: la línea de prueba no está en la página visible");
	}
	else {
		const antesDeBorrar = await dialogCount(cdp);

		if (!await clickRowAction(cdp, marca, ".v-delete", false)) {
			anotar(tab.key, "la fila no tiene botón Eliminar");
		}
		else {
			// Eliminar tiene que pedir confirmación, como el resto del AIO.
			const abrio = await waitUntil(
				cdp,
				`[...document.querySelectorAll('.v-overlay--active > .v-overlay__content')].filter(e => e.querySelector('.v-card')).length > ${antesDeBorrar}`,
				{ timeout: 8000 },
			).then(() => true).catch(() => false);

			if (!abrio) {
				anotar(tab.key, "eliminar no pidió confirmación");
			}
			else {
				await wait(800);
				await shotTop(cdp, `${outputDir}/${tab.key}-09-eliminar.png`);

				if (!await clickInTop(cdp, "Eliminar")) anotar(tab.key, "el diálogo de confirmación no tiene botón Eliminar");

				await wait(2200);
				console.log(`    toast: ${JSON.stringify(await toasts(cdp))}`);
				await closeExtraDialogs(cdp);
				await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
				await wait(1200);

				const sigue = await rowText(cdp, marca);
				if (sigue) anotar(tab.key, "tras eliminar, la fila sigue en la tabla");

				await shot(cdp, `${outputDir}/${tab.key}-10-eliminado.png`);
			}
		}
	}
	// --- Buscar ------------------------------------------------------------------------
	const previos = await dialogCount(cdp);

	if (!await clickInTop(cdp, "Buscar")) {
		anotar(tab.key, "no hay botón Buscar en el paso");
	}
	else {
		const abrioBuscar = await waitUntil(cdp, `[...document.querySelectorAll('.v-overlay--active > .v-overlay__content')].filter(e => e.querySelector('.v-card')).length > ${previos}`, { timeout: 15000 })
			.then(() => true).catch(() => false);

		if (!abrioBuscar) {
			anotar(tab.key, "el diálogo de Buscar no abrió");
		}
		else {
			await waitForFormReady(cdp);
			await wait(800);

			// Solo el primer campo: llenar todos convierte la búsqueda en una consulta exacta
			// y la captura deja de parecerse a lo que hace el usuario.
			const campos = await fieldsInTop(cdp);
			const primero = campos.find((c) => c.kind === "select");

			let elegido = null;

			if (primero && await openField(cdp, primero.label)) {
				elegido = await selectFirstOption(cdp);
				await closeMenus(cdp);
			}
			// El select de Actividad tiene que llenarse con las del sistema elegido, no con
			// todas: una actividad solo existe dentro de un sistema.
			if (tab.key === "actividades" && elegido) {
				if (!await openField(cdp, "Actividad")) {
					anotar(tab.key, `el buscador no cargó actividades para "${elegido}"`);
				}
				else {
					const opciones = await evaluate(
						cdp,
						`[...document.querySelectorAll('.v-overlay--active .v-list-item')]
              .filter(e => e.getClientRects().length).map(e => e.textContent.trim()).slice(0, 4)`,
					);

					console.log(`    actividades de "${elegido}": ${JSON.stringify(opciones)}`);
					await closeMenus(cdp);
				}
			}

			await shotTop(cdp, `${outputDir}/${tab.key}-07-buscar.png`);
			await scrollDialogToBottom(cdp);
			await clickInTop(cdp, "Buscar");
			await wait(2500);
			await closeExtraDialogs(cdp);
			await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
			await wait(1000);
			await shot(cdp, `${outputDir}/${tab.key}-08-buscado.png`);

			const filas = await evaluate(cdp, `${DATA_ROWS}.length`);

			console.log(`    filas tras buscar: ${filas} (filtro: ${elegido})`);

			// No basta con que devuelva filas: todas tienen que corresponder al valor filtrado,
			// o el backend está ignorando el filtro y devolviendo el plan entero.
			if (elegido) {
				const ajenas = await evaluate(
					cdp,
					`${DATA_ROWS}.filter(tr => !tr.textContent.includes(${JSON.stringify(elegido)})).length`,
				);

				if (ajenas > 0) anotar(tab.key, `la búsqueda no filtró: ${ajenas} de ${filas} filas no corresponden a "${elegido}"`);
			}
		}
	}

};

/**
 * Recorre las pestañas con el wizard abierto en consulta y comprueba que no ofrezcan
 * ninguna acción de escritura.
 *
 * @returns {Promise<void>}
 */
const recorrerConsulta = async (cdp) => {
	for (const tab of TABS) {
		console.log(`\n  [${tab.key}] consulta`);

		if (!await goToStep(cdp, tab.paso)) {
			anotar(`${tab.key}/consulta`, `no se pudo llegar al paso ${tab.paso}`);
			continue;
		}

		await waitForTableSettled(cdp, { within: ".v-dialog" }).catch(() => {});
		await wait(1000);
		await shot(cdp, `${outputDir}/consulta-${tab.key}.png`);

		// Acotado al diálogo del wizard y a lo que de verdad se ve: la vista de Planes tiene
		// su propio botón Agregar montado detrás, y las acciones de fila existen por
		// duplicado (tabla de escritorio y tarjetas de móvil, una de las dos oculta).
		const acciones = await evaluate(
			cdp,
			`(() => {
        const root = ${TOP}; if (!root) return null;
        const visibles = (sel) => [...root.querySelectorAll(sel)].filter(e => e.getClientRects().length).length;
        return {
          agregar: [...root.querySelectorAll('.v-btn')]
            .filter(b => b.getClientRects().length).some(b => b.textContent.trim() === 'Agregar'),
          editar: visibles('tbody .v-update'),
          eliminar: visibles('tbody .v-delete'),
          ver: visibles('tbody .v-show'),
        };
      })()`,
		);

		console.log(`    acciones: ${JSON.stringify(acciones)}`);
		if (acciones.agregar) anotar(`${tab.key}/consulta`, "el botón Agregar sigue visible");
		if (acciones.editar) anotar(`${tab.key}/consulta`, `hay ${acciones.editar} botón(es) Editar en las filas`);
		if (acciones.eliminar) anotar(`${tab.key}/consulta`, `hay ${acciones.eliminar} botón(es) Eliminar en las filas`);
	}
};

/**
 * Crea un plan desde cero agregando una línea en cada pestaña y lo guarda desde Costeo.
 *
 * @returns {Promise<void>}
 */
const recorrerCreacion = async (cdp) => {
	console.log("\n  [creación] paso Planes");

	await waitForFormReady(cdp);
	await wait(600);

	const sinLlenar = await fillTopForm(cdp, {
		"Orden de Ejecución": "97",
		"Valor Tipo de frecuencia": "500",
		Nombre: `PRUEBA CRUD ${MARCA_CREAR}`,
		Descripción: "Plan creado por la validación automática del wizard",
	});

	if (sinLlenar.length) anotar("creación", `campos sin llenar en el paso Planes: ${sinLlenar.join(", ")}`);

	await shot(cdp, `${outputDir}/creacion-01-planes.png`);

	for (const tab of TABS) {
		console.log(`\n  [creación] ${tab.key}`);

		if (!await goToStep(cdp, tab.paso)) {
			anotar(`${tab.key}/creación`, `no se pudo llegar al paso ${tab.paso}`);

			return;
		}

		await wait(1500);

		const previos = await dialogCount(cdp);

		if (!await clickInTop(cdp, "Agregar")) {
			anotar(`${tab.key}/creación`, "no hay botón Agregar");
			continue;
		}

		const abrio = await waitUntil(cdp, `[...document.querySelectorAll('.v-overlay--active > .v-overlay__content')].filter(e => e.querySelector('.v-card')).length > ${previos}`, { timeout: 15000 })
			.then(() => true).catch(() => false);

		if (!abrio) {
			anotar(`${tab.key}/creación`, "el diálogo de Agregar no abrió");
			continue;
		}

		if (!await waitForFormReady(cdp)) anotar(`${tab.key}/creación`, "el formulario de Agregar se quedó en esqueletos");
		await wait(600);
		await fillTopForm(cdp, tab.valores);
		await closeMenus(cdp);
		await scrollDialogToBottom(cdp);
		await clickInTop(cdp, "Guardar");
		await wait(2000);
		console.log(`    toast: ${JSON.stringify(await toasts(cdp))}`);
		await wait(800);
		await shot(cdp, `${outputDir}/creacion-${tab.key}.png`);

		const fila = await rowText(cdp, tab.marcaCrear ?? MARCA_CREAR);

		console.log(`    fila en memoria: ${fila ?? "NO APARECE"}`);
		if (!fila) anotar(`${tab.key}/creación`, "la línea agregada no aparece en la tabla en memoria");

		const celdas = fila ? await rowCells(cdp, tab.marcaCrear ?? MARCA_CREAR) : null;
		if (celdas?.some((c) => c === ""))
			anotar(`${tab.key}/creación`, `la fila agregada tiene celdas vacías: ${JSON.stringify(celdas)}`);

		const buscar = await buttonInTop(cdp, "Buscar");
		if (buscar) anotar(`${tab.key}/creación`, "el botón Buscar aparece en creación, donde no aplica");
	}

	// --- Volver paso a paso ---------------------------------------------------------------
	// Al retroceder, cada paso se vuelve a montar y tiene que recuperar sus líneas de memoria.
	for (const tab of [...TABS].reverse()) {
		if (!await goToStep(cdp, tab.paso)) {
			anotar(`${tab.key}/creación`, `no se pudo volver al paso ${tab.paso}`);
			continue;
		}

		await wait(1800);

		const fila = await rowText(cdp, tab.marcaCrear ?? MARCA_CREAR);

		console.log(`    [volver] ${tab.key}: ${fila ?? "NO APARECE"}`);
		if (!fila) anotar(`${tab.key}/creación`, "al volver con Anterior la línea agregada ya no se ve");
	}

	await shot(cdp, `${outputDir}/creacion-volver.png`);

	if (!await goToStep(cdp, "Costeo")) {
		anotar("creación", "no se pudo llegar al paso Costeo");

		return;
	}

	await wait(2500);
	await shot(cdp, `${outputDir}/creacion-costeo.png`);
	await scrollDialogToBottom(cdp);

	if (!await clickInTop(cdp, "Guardar")) {
		anotar("creación", "el paso Costeo no tiene botón Guardar");

		return;
	}

	await wait(4000);
	console.log(`    toast: ${JSON.stringify(await toasts(cdp))}`);
	await screenshot(cdp, `${outputDir}/creacion-guardado.png`);
};

const main = async () => {
	const { cdp, chrome } = await openSession({
		base,
		...testCredentials({ email: arg("email"), password: arg("password") }),
		company,
	});

	try {
		// Un error de JavaScript en la vista se traga en silencio: el diálogo se queda abierto
		// y el fallo aparece tres pasos después. Aquí se anota en el momento.
		cdp.on("Runtime.exceptionThrown", (evento) => {
			const detalle = evento.exceptionDetails?.exception?.description ?? evento.exceptionDetails?.text ?? "";

			anotar("página", `error de JavaScript: ${detalle.split("\n")[0].slice(0, 200)}`);
		});
		await cdp.send("Runtime.enable");

		await goTo(cdp, base, PLANS_VIEW, { selector: ".v-data-table" });

		if (!await openPlansTab(cdp))
			throw new Error(`No se encontró la pestaña Planes. Pantalla:\n${await describeScreen(cdp)}`);

		await waitForPlanRow(cdp, planName);

		const modos = modo === "todos" ? ["edicion", "consulta", "creacion"] : [modo];

		for (const actual of modos) {
			console.log(`\n===== modo ${actual} =====`);

			if (actual === "creacion") {
				const agregar = await centerOfText(cdp, ".v-btn", "Agregar");
				if (!agregar) throw new Error("No se encontró el botón Agregar de la vista de Planes");
				await clickAt(cdp, agregar.x, agregar.y);
			}
			else {
				await openWizardFor(cdp, planName, actual === "consulta" ? "show" : "update");
			}

			await waitForWizard(cdp);
			await setViewport(cdp, VENTANA);
			await wait(1000);

			console.log(`  pasos: ${JSON.stringify((await stepperState(cdp)).labels)}`);

			if (actual === "consulta") await recorrerConsulta(cdp);
			else if (actual === "creacion") await recorrerCreacion(cdp);
			else for (const tab of TABS.filter((t) => !soloTab || t.key === soloTab)) await crudEnEdicion(cdp, tab);

			// Se cierra el wizard para volver a la tabla antes del siguiente modo.
			await scrollDialogToBottom(cdp);
			await clickInTop(cdp, "Cerrar");
			await wait(2000);
			await pressEscape(cdp);
			await wait(1500);
		}

		console.log(`\n===== hallazgos (${hallazgos.length}) =====`);
		for (const linea of hallazgos) console.log(`- ${linea}`);
		console.log(`\nCapturas en ${outputDir}`);
	}
	catch (error) {
		await screenshot(cdp, `${outputDir}/_fallo.png`).catch(() => {});
		console.error(`\nCaptura del fallo: ${outputDir}/_fallo.png`);
		console.error(await describeScreen(cdp).catch(() => "no se pudo describir la pantalla"));
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
