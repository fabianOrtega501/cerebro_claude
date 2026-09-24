/**
 * Sesion de Status: entra a la aplicacion y deja la pagina lista para trabajar.
 *
 * Lo especifico de este proyecto es el login en dos pasos —credenciales con captcha, y despues
 * empresa— y que la empresa NO se elige en una pantalla aparte como en el AIO: es parte del
 * propio formulario de acceso, y sin ella no se emite el menu.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import {
  launchChrome,
  connectPage,
  setViewport,
  evaluate,
  waitForSelector,
  wait,
} from "./browser.mjs";
import { credentialsFor } from "../../../../lib/credentials.mjs";

/** Tamano de ventana con el que se toman las capturas del manual. */
export const VIEWPORT = { width: 1486, height: 795 };

/**
 * Base por defecto: `status-frontend`, la aplicacion separada del monolito por el 7433.
 * El monolito sigue vivo en el 8086; capturar contra el documentaria la version vieja.
 */
export const DEFAULT_BASE = "http://localhost:8081";

/**
 * Credenciales del usuario de pruebas de Status.
 *
 * @param {object} [overrides] Valores explicitos que ganan a los de `secrets.env`
 * @returns {{email: string, password: string}}
 */
export function testCredentials({ email, password } = {}) {
  const propias = credentialsFor("status", { required: false });

  return { email: email ?? propias.email, password: password ?? propias.password };
}

/**
 * Escribe en un input disparando los eventos que Vue necesita para actualizar su modelo.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} selector Selector del input
 * @param {string} value Texto a escribir
 * @returns {Promise<void>}
 */
export async function type(cdp, selector, value) {
  await waitForSelector(cdp, selector);
  await evaluate(
    cdp,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`
  );
}

/**
 * Codigo del captcha, leido del componente Vue en vez de la imagen del canvas.
 *
 * @param {object} cdp Conexion CDP
 * @returns {Promise<string|null>} Los cinco digitos, o `null` si no hay captcha en pantalla
 */
export async function readCaptcha(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const cont = document.querySelector('.captcha');
      return cont && cont.__vue__ ? cont.__vue__.generatedCaptcha : null;
    })()`
  );
}

/**
 * Elige una opcion de un `v-select` de vue-select por su texto visible.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} selector Selector del control
 * @param {string} texto Texto de la opcion
 * @returns {Promise<boolean>} `false` si no habia ninguna opcion con ese texto
 */
export async function selectOption(cdp, selector, texto) {
  // vue-select abre la lista con el evento `focus` de su buscador. En headless la ventana no
  // tiene foco del sistema, asi que `focus()` no lo emite y hay que lanzarlo a mano.
  for (let intento = 0; intento < 5; intento++) {
    await evaluate(
      cdp,
      `(() => {
        const buscador = document.querySelector(${JSON.stringify(selector)} + ' .vs__search');
        if (!buscador) return false;
        buscador.focus();
        buscador.dispatchEvent(new Event('focus', { bubbles: true }));
        return true;
      })()`
    );
    await wait(600);
    const abierto = await evaluate(cdp, `document.querySelectorAll('.vs__dropdown-menu li').length > 0`);
    if (abierto) break;
  }

  await waitForSelector(cdp, ".vs__dropdown-menu li", { timeout: 15000 });

  return evaluate(
    cdp,
    `(() => {
      const buscado = ${JSON.stringify(texto)}.trim().toLowerCase();
      const opciones = [...document.querySelectorAll('.vs__dropdown-menu li')];
      const exacta = opciones.find(o => o.textContent.trim().toLowerCase() === buscado);
      const parcial = opciones.find(o => o.textContent.trim().toLowerCase().includes(buscado));
      const elegida = exacta || parcial;
      if (!elegida) return false;
      elegida.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      elegida.click();
      return true;
    })()`
  );
}

/** Texto de la pantalla, para que un fallo diga que se estaba viendo y no solo que fallo. */
export const describeScreen = (cdp) =>
  evaluate(cdp, `document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 800)`);

/**
 * Pulsa el boton cuyo texto empieza por el indicado.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} texto Comienzo del texto del boton
 * @param {string} [ambito] Selector que acota la busqueda
 * @returns {Promise<boolean>} `false` si no habia ningun boton con ese texto
 */
export async function pulsarBoton(cdp, texto, ambito = "body") {
  return evaluate(
    cdp,
    `(() => {
      const raiz = document.querySelector(${JSON.stringify(ambito)});
      if (!raiz) return false;
      const boton = [...raiz.querySelectorAll('button')]
        .find(b => b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(texto)}.toLowerCase()));
      if (!boton) return false;
      boton.click();
      return true;
    })()`
  );
}

/**
 * Abre Chrome, entra a Status y devuelve la conexion ya autenticada.
 *
 * @param {object} opciones
 * @param {string} [opciones.base] URL de la aplicacion
 * @param {string} [opciones.email] Usuario; por defecto el de `secrets.env`
 * @param {string} [opciones.password] Clave; por defecto la de `secrets.env`
 * @param {string} [opciones.company] Empresa a seleccionar; si falta se toma la primera
 * @param {number} [opciones.port] Puerto de depuracion de Chrome
 * @param {number} [opciones.width] Ancho de la ventana
 * @param {number} [opciones.height] Alto de la ventana
 * @returns {Promise<{cdp: object, chrome: object, empresa: string}>}
 */
export async function openSession({
  base = DEFAULT_BASE,
  email,
  password,
  company,
  port = 9222,
  width = VIEWPORT.width,
  height = VIEWPORT.height,
} = {}) {
  const credenciales = testCredentials({ email, password });

  if (!credenciales.email || !credenciales.password) {
    throw new Error(
      `Faltan las credenciales de Status. Agrega STATUS_TEST_EMAIL y STATUS_TEST_PASSWORD en ${join(homedir(), ".claude", "secrets.env")}.`
    );
  }

  const chrome = await launchChrome({ port });
  const cdp = await connectPage(port);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await setViewport(cdp, { width, height });

  await cdp.send("Page.navigate", { url: `${base}/pages/login` });
  await wait(1500);

  // Chrome puede reutilizar el perfil: si la sesion anterior sigue en localStorage no hay
  // formulario que rellenar y buscarlo termina en un timeout confuso.
  if (await evaluate(cdp, `!!localStorage.getItem('AppActiveUser') && !!localStorage.getItem('MainMenu')`)) {
    return { cdp, chrome, empresa: company ?? null };
  }

  await waitForSelector(cdp, 'input[name="email"]', { timeout: 90000 });

  await type(cdp, 'input[name="email"]', credenciales.email);
  await type(cdp, 'input[name="password"]', credenciales.password);

  // El captcha son cinco digitos dibujados en un canvas; el valor esperado vive en el
  // componente, asi que no hay que reconocer la imagen.
  const codigo = await readCaptcha(cdp);

  if (!codigo || String(codigo).length !== 5) {
    throw new Error(`No se pudo leer el captcha (leido: "${codigo}"). Pantalla:\n${await describeScreen(cdp)}`);
  }

  await type(cdp, ".captcha input", String(codigo));

  // Dentro del bloque hay dos botones sin texto —regenerar el codigo y escucharlo en voz alta—
  // y pulsar el primero invalida el captcha que se acaba de escribir. Hay que ir por texto.
  await pulsarBoton(cdp, "Iniciar", ".captcha");

  // Paso dos: el mismo formulario muestra el selector de empresa. Sin empresa el backend no
  // devuelve el menu, y toda ruta interna rebota al home.
  await waitForSelector(cdp, ".v-select", { timeout: 60000 }).catch(async () => {
    throw new Error(`El login no paso del primer paso. Pantalla:\n${await describeScreen(cdp)}`);
  });

  await wait(1200);

  const empresas = await evaluate(
    cdp,
    `(() => {
      const sel = document.querySelector('.v-select');
      return sel && sel.__vue__ ? (sel.__vue__.options || []).map(o => o.empresa) : [];
    })()`
  );

  const elegida = company ?? empresas[0];

  if (!(await selectOption(cdp, ".v-select", elegida))) {
    throw new Error(`No esta la empresa "${elegida}". Disponibles: ${JSON.stringify(empresas)}`);
  }

  await pulsarBoton(cdp, "Ingresar");

  // El menu se guarda en localStorage al entrar: es la senal de que la sesion sirve.
  const entro = await esperarSesion(cdp);

  if (!entro) {
    throw new Error(`No se completo el ingreso. Pantalla:\n${await describeScreen(cdp)}`);
  }

  return { cdp, chrome, empresa: elegida };
}

/**
 * Espera a que la aplicacion deje la sesion en `localStorage`.
 *
 * @param {object} cdp Conexion CDP
 * @param {number} [timeout] Milisegundos a esperar
 * @returns {Promise<boolean>} `false` si se agoto el tiempo
 */
async function esperarSesion(cdp, timeout = 60000) {
  const limite = Date.now() + timeout;

  while (Date.now() < limite) {
    const listo = await evaluate(cdp, `!!localStorage.getItem('AppActiveUser') && !!localStorage.getItem('MainMenu')`);
    if (listo) return true;
    await wait(500);
  }

  return false;
}

/**
 * Espera a que un texto aparezca en la pantalla.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} texto Texto a esperar
 * @param {number} [timeout] Milisegundos
 * @returns {Promise<void>}
 */
export async function esperarTexto(cdp, texto, timeout = 60000) {
  const limite = Date.now() + timeout;

  while (Date.now() < limite) {
    if (await evaluate(cdp, `document.body.innerText.includes(${JSON.stringify(texto)})`)) return;
    await wait(500);
  }

  throw new Error(`No aparecio "${texto}" en la pantalla.`);
}

/**
 * Espera a que un popup de vuesax sea visible, midiendo su caja.
 *
 * `waitForSelector` no sirve con los popups: al ser `position: fixed` su `offsetParent` es
 * siempre null y la espera se agota con el modal abierto y a la vista.
 *
 * @param {object} cdp Conexion CDP
 * @param {string} selector Selector del popup
 * @param {number} [timeout] Milisegundos
 * @returns {Promise<void>}
 */
export async function esperarPopup(cdp, selector, timeout = 30000) {
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
