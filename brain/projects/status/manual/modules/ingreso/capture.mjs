/**
 * Capturas del ingreso y de la navegacion general.
 *
 * Son las pantallas transversales del manual: las que ve cualquier usuario sin importar a que
 * modulo entre. Incluye el captcha rediseñado por el 7433 y el boton de tema claro/oscuro,
 * que no existian en el monolito.
 *
 * El login se hace a mano y no con `openSession` porque aqui la pantalla de ingreso **es** lo
 * que se documenta: hay que capturarla antes de atravesarla.
 *
 * Uso: node modules/ingreso/capture.mjs --salida <carpeta> [--empresa "..."]
 */

import { mkdirSync } from "node:fs";
import {
  testCredentials,
  readCaptcha,
  selectOption,
  pulsarBoton,
  describeScreen,
  type,
  DEFAULT_BASE,
  VIEWPORT,
} from "../../lib/session.mjs";
import {
  launchChrome,
  connectPage,
  setViewport,
  evaluate,
  closeBrowser,
  wait,
  screenshot,
  waitForSelector,
  highlight,
  clearHighlights,
} from "../../lib/browser.mjs";

const args = process.argv.slice(2);
const opcion = (nombre, pordefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : pordefecto;
};

const salida = opcion("salida");
const empresa = opcion("empresa", "SERVICIOS AMBIENTALES S.A.S E.S.P.");
const base = opcion("base", DEFAULT_BASE);
const puerto = Number(opcion("port", 9222));

if (!salida) {
  console.error("Falta --salida <carpeta>.");
  process.exit(1);
}

mkdirSync(salida, { recursive: true });

let cdp, chrome;

try {
  const credenciales = testCredentials();

  if (!credenciales.email || !credenciales.password) {
    throw new Error("Faltan STATUS_TEST_EMAIL y STATUS_TEST_PASSWORD en ~/.claude/secrets.env.");
  }

  chrome = await launchChrome({ port: puerto });
  cdp = await connectPage(puerto);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await setViewport(cdp, VIEWPORT);

  await cdp.send("Page.navigate", { url: `${base}/pages/login` });
  await waitForSelector(cdp, 'input[name="email"]', { timeout: 90000 });

  // Chrome reutiliza el perfil entre corridas: si queda una sesion abierta no hay formulario
  // que capturar. Y el tema se recuerda en localStorage, asi que una corrida anterior en
  // oscuro se lo pasaria a esta; el manual se publica en claro.
  await evaluate(
    cdp,
    `(() => {
      localStorage.removeItem('AppActiveUser');
      localStorage.removeItem('MainMenu');
      localStorage.setItem('temaStatus', 'light');
    })()`
  );
  await cdp.send("Page.reload");
  await waitForSelector(cdp, 'input[name="email"]', { timeout: 90000 });
  await wait(2500);

  // 1. La pantalla de ingreso completa.
  await screenshot(cdp, `${salida}/login.png`);

  // 2. El bloque del captcha, señalando sus acciones. El boton de escuchar el codigo solo
  //    existe si el navegador publica voces, que en headless no siempre pasa.
  const acciones = await evaluate(cdp, `document.querySelectorAll('.captcha__accion').length`);

  await highlight(cdp, ".captcha__accion", { label: "1", padding: 6, index: 0 });
  if (acciones > 1) await highlight(cdp, ".captcha__accion", { label: "2", padding: 6, index: 1 });
  await screenshot(cdp, `${salida}/captcha.png`, { selector: ".captcha" });
  await clearHighlights(cdp);

  console.log(`acciones del captcha visibles: ${acciones} (2 = con lectura en voz alta)`);

  // 3. El segundo paso: el mismo formulario pide ahora la empresa.
  await type(cdp, 'input[name="email"]', credenciales.email);
  await type(cdp, 'input[name="password"]', credenciales.password);

  const codigo = await readCaptcha(cdp);
  if (!codigo || String(codigo).length !== 5) {
    throw new Error(`No se pudo leer el captcha (leido: "${codigo}").\n${await describeScreen(cdp)}`);
  }

  await type(cdp, ".captcha input", String(codigo));
  await pulsarBoton(cdp, "Iniciar", ".captcha");

  await waitForSelector(cdp, ".v-select", { timeout: 60000 }).catch(async () => {
    throw new Error(`El login no paso del primer paso.\n${await describeScreen(cdp)}`);
  });
  await wait(1500);
  await screenshot(cdp, `${salida}/empresa.png`);

  // 4. Ya dentro: el tablero, que es donde aterriza todo el mundo.
  await selectOption(cdp, ".v-select", empresa);
  await pulsarBoton(cdp, "Ingresar");
  await wait(9000);
  await screenshot(cdp, `${salida}/tablero.png`);

  // 5. La barra superior, señalando el boton que cambia el tema. Se busca por su `title` y no
  //    por posicion: al lado tiene la campana y el perfil, que son otros feather-icon.
  const BOTON_TEMA = '[title="Cambiar al tema oscuro"], [title="Volver al tema claro"]';

  await waitForSelector(cdp, BOTON_TEMA, { timeout: 15000 }).catch(async () => {
    throw new Error(`No aparecio el boton de tema en la barra.\n${await describeScreen(cdp)}`);
  });

  await highlight(cdp, BOTON_TEMA, { label: "1", padding: 8 });
  await screenshot(cdp, `${salida}/barra-superior.png`, { selector: ".vx-navbar-wrapper" });
  await clearHighlights(cdp);

  // 6. El mismo tablero en oscuro, para mostrar que hace ese boton.
  await evaluate(
    cdp,
    `(() => {
      localStorage.setItem('temaStatus', 'dark');
      document.body.classList.add('theme-dark');
    })()`
  );
  await wait(2000);
  await screenshot(cdp, `${salida}/tablero-oscuro.png`);

  // Se devuelve a claro: si queda en oscuro, la proxima corrida arranca mal.
  await evaluate(
    cdp,
    `(() => {
      localStorage.setItem('temaStatus', 'light');
      document.body.classList.remove('theme-dark');
    })()`
  );

  console.log(`Capturas en ${salida}`);
} catch (error) {
  if (cdp) {
    await screenshot(cdp, `${salida}/_fallo.png`).catch(() => {});
    console.error(await describeScreen(cdp).catch(() => "(no se pudo describir la pantalla)"));
  }
  console.error(`Fallo: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeBrowser(cdp, chrome);
}
