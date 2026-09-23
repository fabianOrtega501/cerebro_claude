/**
 * Capturas de Gestion de Tramites.
 *
 * El escenario lo deja `seed.sql`: un tramite con tres formularios de periodicidades distintas
 * y dos formatos afectados. Sin el, la base local solo tiene tramites migrados con un formulario
 * cada uno, que no muestran lo que hace el modulo.
 *
 * Uso: node modules/gestion-tramites/capture.mjs --salida <carpeta> [--empresa "..."]
 */

import { mkdirSync } from "node:fs";
import {
  openSession,
  selectOption,
  pulsarBoton,
  esperarTexto,
  esperarPopup,
  describeScreen,
} from "../../lib/session.mjs";
import { evaluate, closeBrowser, wait, screenshot } from "../../lib/browser.mjs";

const args = process.argv.slice(2);
const opcion = (nombre, pordefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : pordefecto;
};

const salida = opcion("salida");
const empresa = opcion("empresa", "SERVICIOS AMBIENTALES S.A.S E.S.P.");
const base = opcion("base", "http://localhost:8086");
const radicado = opcion("radicado", "SUI-2026-0458");

if (!salida) {
  console.error("Falta --salida <carpeta>.");
  process.exit(1);
}

mkdirSync(salida, { recursive: true });

const RUTA = "/Gestor/GestionTramites/main";
const POPUP_TRAMITE = ".popup-tramite .vs-popup";
const POPUP_FORMULARIO = ".popup-formatos .vs-popup";

// El manual publica estas pantallas a ventana completa, no recortadas a la tarjeta.
const ANCHO = 1900;
const ALTO = 1200;

let cdp, chrome;

try {
  ({ cdp, chrome } = await openSession({ base, company: empresa, width: ANCHO, height: ALTO }));

  await cdp.send("Page.navigate", { url: `${base}${RUTA}` });
  await esperarTexto(cdp, "GESTIÓN DE TRÁMITES");
  await wait(3000);

  // 1. Listado. La columna Formularios es la que cambio con el desarrollo.
  await screenshot(cdp, `${salida}/listado.png`);

  // 2. Ventana de creacion, con el encabezado del tramite.
  await pulsarBoton(cdp, "Crear trámite");
  await esperarPopup(cdp, POPUP_TRAMITE);
  await wait(1500);
  await screenshot(cdp, `${salida}/crear-tramite.png`, { selector: POPUP_TRAMITE });

  // 3. Con empresa elegida se habilita Agregar formulario: sin ella no hay formularios que
  //    ofrecer, porque dependen de la aplicabilidad de la empresa.
  if (!(await selectOption(cdp, `${POPUP_TRAMITE} .campo--empresa .v-select`, empresa))) {
    throw new Error(`No se pudo elegir la empresa "${empresa}" en la ventana de creacion.`);
  }
  await wait(2000);
  await screenshot(cdp, `${salida}/crear-tramite-empresa.png`, { selector: POPUP_TRAMITE });

  // 4. Ventana de captura del formulario del tramite.
  await pulsarBoton(cdp, "Agregar formulario", POPUP_TRAMITE);
  await esperarPopup(cdp, POPUP_FORMULARIO);
  await wait(1500);
  await screenshot(cdp, `${salida}/agregar-formulario.png`, { selector: POPUP_FORMULARIO });

  // 5. Edicion del tramite del seed: es el unico con varios formularios y con formatos, asi que
  //    sirve para ensenar la tabla llena sin tener que diligenciar nada.
  // Los dos popups se cierran de adentro hacia afuera: el hijo queda por encima y, si se deja
  // abierto, tapa lo que se capture despues.
  await cerrarPopup(cdp, POPUP_FORMULARIO);
  await wait(800);
  await cerrarPopup(cdp, POPUP_TRAMITE);
  await wait(1200);
  await pulsarIconoEnFila(cdp, radicado, "Editar formatos y trámites afectados");
  await esperarPopup(cdp, POPUP_TRAMITE);
  await esperarTexto(cdp, "FORMULARIOS DEL TRÁMITE");
  await wait(2000);
  await screenshot(cdp, `${salida}/editar-tramite.png`, { selector: POPUP_TRAMITE });

  // 6. Un formulario con sus formatos afectados, abierto desde la tabla.
  await pulsarIconoEnFila(cdp, "PROY-ING", "Editar", POPUP_TRAMITE);
  await esperarPopup(cdp, POPUP_FORMULARIO);
  await wait(2000);
  await screenshot(cdp, `${salida}/formulario-con-formatos.png`, { selector: POPUP_FORMULARIO });

  // 6b. Campos con los que se captura un formato afectado.
  await pulsarBoton(cdp, "Agregar formato", POPUP_FORMULARIO);
  await wait(1500);
  await screenshot(cdp, `${salida}/formato-campos.png`, { selector: POPUP_FORMULARIO });

  // 7. Seguimientos del tramite.
  await cerrarPopup(cdp, POPUP_FORMULARIO);
  await wait(800);
  await cerrarPopup(cdp, POPUP_TRAMITE);
  await wait(1200);
  await pulsarIconoEnFila(cdp, radicado, "Ingresar Seguimiento");
  await esperarPopup(cdp, ".popup-seguimiento .vs-popup");
  await wait(1800);
  await screenshot(cdp, `${salida}/seguimientos.png`, { selector: ".popup-seguimiento .vs-popup" });

  console.log("Capturas en", salida);
} catch (error) {
  if (cdp) {
    await screenshot(cdp, `${salida}/_fallo.png`).catch(() => {});
    console.error("Pantalla al fallar:\n" + (await describeScreen(cdp).catch(() => "sin diagnostico")));
  }
  console.error("Fallo:", error.message);
  process.exitCode = 1;
} finally {
  if (cdp) await closeBrowser(cdp, chrome);
}

/**
 * Pulsa el icono con el `title` indicado dentro de la fila que contiene un texto.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} textoFila Texto que identifica la fila
 * @param {string} title Tooltip del icono
 * @param {string} [ambito] Selector que acota la busqueda
 * @returns {Promise<void>}
 */
async function pulsarIconoEnFila(cdp, textoFila, title, ambito = "body") {
  const ok = await evaluate(
    cdp,
    `(() => {
      const raiz = document.querySelector(${JSON.stringify(ambito)});
      if (!raiz) return false;
      const fila = [...raiz.querySelectorAll('tr')]
        .find(f => f.innerText.includes(${JSON.stringify(textoFila)}));
      if (!fila) return false;
      const icono = [...fila.querySelectorAll('[title]')]
        .find(i => i.getAttribute('title') === ${JSON.stringify(title)});
      if (!icono) return false;
      (icono.closest('button') || icono).click();
      return true;
    })()`
  );

  if (!ok) throw new Error(`No se encontro el icono "${title}" en la fila "${textoFila}".`);
}

/**
 * Cierra un popup con su boton de aspa.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} selector Selector del popup
 * @returns {Promise<void>}
 */
async function cerrarPopup(cdp, selector) {
  await evaluate(
    cdp,
    `(() => {
      const popup = document.querySelector(${JSON.stringify(selector)});
      const aspa = popup && popup.closest('.con-vs-popup').querySelector('.vs-popup--close');
      if (aspa) aspa.click();
      return !!aspa;
    })()`
  );
}
