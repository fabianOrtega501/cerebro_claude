/**
 * Capturas de Variables Tecnicas SD (Certificacion de variables).
 *
 * Toma la tabla de informacion de rellenos sanitarios y el formulario de registro. Ambas se
 * recortan al elemento, no a la ventana, porque asi estan las que ya publica el manual.
 *
 * Uso: node modules/certificacion-variables/capture.mjs --salida <carpeta> [--empresa "..."]
 */

import { mkdirSync } from "node:fs";
import { openSession, selectOption, DEFAULT_BASE } from "../../lib/session.mjs";
import { evaluate, closeBrowser, wait, screenshot, waitForSelector } from "../../lib/browser.mjs";

const args = process.argv.slice(2);
const opcion = (nombre, pordefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : pordefecto;
};

const salida = opcion("salida");
const empresa = opcion("empresa", "SER AMBIENTAL SAS ESP.");
const base = opcion("base", DEFAULT_BASE);

if (!salida) {
  console.error("Falta --salida <carpeta>.");
  process.exit(1);
}

mkdirSync(salida, { recursive: true });

const RUTA = "/Gestor-variables-tecnicas-certificacion/sd";

let cdp, chrome;

try {
  ({ cdp, chrome } = await openSession({ base, company: empresa }));

  await cdp.send("Page.navigate", { url: `${base}${RUTA}` });
  await waitForSelector(cdp, ".v-select", { timeout: 60000 });
  await wait(3000);

  if (!(await selectOption(cdp, ".v-select", empresa))) {
    throw new Error(`No se pudo elegir la empresa "${empresa}" en el filtro de la pantalla.`);
  }

  // La tabla llega por AJAX despues de resolver aplicabilidad y ultimo registro.
  await esperarTexto(cdp, "INFORMACIÓN RELLENOS SANITARIOS");
  await wait(3000);

  // El recorte es la tarjeta de la tabla: se marca por su titulo, que es lo unico estable.
  await marcar(cdp, "INFORMACIÓN RELLENOS SANITARIOS", "captura-tabla");
  await screenshot(cdp, `${salida}/tabla-rellenos-sanitarios.png`, { selector: "#captura-tabla" });

  await pulsar(cdp, "Agregar");
  await esperarPopup(cdp, ".modal-variables-sd .vs-popup");
  await wait(1500);
  await screenshot(cdp, `${salida}/registrar-variables-sd.png`, { selector: ".modal-variables-sd .vs-popup" });

  console.log("Capturas en", salida);
} catch (error) {
  if (cdp) await screenshot(cdp, `${salida}/_fallo.png`).catch(() => {});
  console.error("Fallo:", error.message);
  process.exitCode = 1;
} finally {
  if (cdp) await closeBrowser(cdp, chrome);
}

/**
 * Espera a que un texto aparezca en la pagina.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} texto Texto a esperar
 * @param {number} [timeout] Milisegundos
 * @returns {Promise<void>}
 */
async function esperarTexto(cdp, texto, timeout = 60000) {
  const limite = Date.now() + timeout;

  while (Date.now() < limite) {
    if (await evaluate(cdp, `document.body.innerText.includes(${JSON.stringify(texto)})`)) return;
    await wait(500);
  }

  throw new Error(`No aparecio "${texto}" en la pantalla.`);
}

/**
 * Pone un id a la tarjeta que contiene un titulo, para poder recortarla.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} titulo Texto del encabezado
 * @param {string} id Identificador a asignar
 * @returns {Promise<boolean>}
 */
async function marcar(cdp, titulo, id) {
  return evaluate(
    cdp,
    `(() => {
      const h = [...document.querySelectorAll('h4')].find(e => e.textContent.trim().startsWith(${JSON.stringify(titulo)}));
      const tarjeta = h && h.closest('.vx-card');
      if (!tarjeta) return false;
      tarjeta.id = ${JSON.stringify(id)};
      return true;
    })()`
  );
}

/**
 * Pulsa el boton cuyo texto empieza por el indicado.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} texto Comienzo del texto
 * @returns {Promise<void>}
 */
async function pulsar(cdp, texto) {
  const ok = await evaluate(
    cdp,
    `(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.textContent.trim().toLowerCase().startsWith(${JSON.stringify(texto)}.toLowerCase()));
      if (!b) return false;
      b.click();
      return true;
    })()`
  );

  if (!ok) throw new Error(`No se encontro el boton "${texto}".`);
}

/**
 * Espera a que un popup sea visible. `waitForSelector` no sirve: al ser `position: fixed`, su
 * `offsetParent` es siempre null y la espera se agota con el modal abierto.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} selector Selector del popup
 * @param {number} [timeout] Milisegundos
 * @returns {Promise<void>}
 */
async function esperarPopup(cdp, selector, timeout = 30000) {
  const limite = Date.now() + timeout;

  while (Date.now() < limite) {
    const visible = await evaluate(
      cdp,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const caja = el.getBoundingClientRect();
        return caja.width > 100 && caja.height > 100;
      })()`
    );
    if (visible) return;
    await wait(400);
  }

  throw new Error(`El popup "${selector}" no se abrio.`);
}
