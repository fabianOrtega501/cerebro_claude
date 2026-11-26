# AMI — perfil del manual

Lo específico de la app móvil para la skill `update-manual`. El procedimiento general está en
`~/.claude/skills/update-manual/SKILL.md`. Cada punto costó al menos una corrida fallida.

## Lo que hay que saber de la app para automatizarla

- **El servidor al que habla el AMI no sale solo del `.env`.** En el login, el campo «Código
  Identificación Empresa» busca una fila de `company_endpoints` y guarda su `api` en
  `CapacitorStorage.API_URL`. Ese código **no es el NIT**: en local, `123456789-2` apunta a
  `localhost:8085`. Si un navegador ya tenía guardado el de desa o QA, importa de allá y la lista sale
  vacía sin ningún error.
- **El conductor de las programaciones de prueba es el usuario de pruebas del AIO**, no el del AMI:
  los flujos de Green toman `credentialsFor("aio")`.
- **En un perfil de navegador nuevo, el login puede dejar al usuario sin menús**
  (`authUserMenus` vacío) y la importación de Green no muestra «Prestación de Servicio» ni
  «Inspecciones», aunque `menus/v0/mobile/{user}/{company}` sí devuelve los menús. Cambiar de empresa
  desde la barra superior tampoco lo arregló. El flujo `respel/service-provision/capture-sequence.mjs`
  acepta `--puerto` para conectarse a un navegador con una sesión que ya funcione. Pasó el
  2026-11-05; la causa no se encontró.
- **La importación tiene copias ocultas de la pantalla** (las páginas anteriores de Ionic siguen en el
  DOM). Un `element.click()` sobre el primer «Prestación de Servicio» que aparece cae en una copia
  invisible y no importa nada: hay que hacer clic de ratón real sobre el elemento visible.
- **El AMI solo descarga las programaciones aprobadas de hoy** (en la hora de la empresa), con su
  inspección aprobada. Datos de prueba de otro día no aparecen.

## Capturas desde un celular real (adb + CDP)

Lo que solo existe en nativo —permisos, ubicación apagada, notificaciones— se captura del celular
conectado: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` y CDP sobre el webview.
Lo aprendido en el 11687 (2026-11-26):

- **`Page.captureScreenshot` se cuelga con la pantalla apagada o bloqueada.** Despertar con
  `input keyevent KEYCODE_WAKEUP` y deslizar para desbloquear; `adb screencap` sirve para ver los
  diálogos del sistema, que el webview no ve.
- **Ubicación apagada**: `cmd location set-location-enabled false|true`.
- **Permiso en «preguntar»**: `pm revoke` (cierra la app). Tras dos negativas Android marca
  `USER_FIXED`, que `pm grant` no borra: se limpia concediéndolo desde Ajustes > Permisos.
- **Capacitor recuerda la negativa aparte**, en `shared_prefs/PluginPermStates.xml`, y sigue
  respondiendo `denied`. Con la APK de depuración se borra con `run-as <paquete> rm …` y la app detenida.
- **El nombre de la compilación sale en pantalla** (`AMI-LOCAL`): se reemplaza en el DOM antes de
  capturar, porque en producción dice AMI.
- **Cerrar sesión con `router.push('/logout')` deja montadas las páginas anteriores** y sus alertas se
  ven encima del ingreso. El menú real usa `href="/logout"`, que recarga: recargar antes de capturar.
