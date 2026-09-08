# Status — notas del flujo de manual

Lo que hay que saber de esta app antes de correr un flujo. Cada linea aqui es una corrida
fallida que ya no hace falta repetir.

## Configuracion

| Variable | Donde | Para que |
|---|---|---|
| `STATUS_MANUAL_WEB` | `env` de `~/.claude/settings.json` | Ruta al repo `manua-web`. Va en el cerebro, no en el repo de trabajo: ahi las rutas absolutas no tienen nada que hacer |
| `STATUS_TEST_EMAIL` / `STATUS_TEST_PASSWORD` | `~/.claude/secrets.env` | Usuario de pruebas |

La app se sirve desde el contenedor `status` en `http://localhost:8086` (`APP_PORT` del `.env`).
**No usar el puerto 3000 de BrowserSync**: es otro origen y las peticiones con `Authorization`
disparan preflight, que no admite las redirecciones 301 que devuelve Apache.

## El login tiene dos pasos y un captcha

1. Correo, contrasena y **captcha de cinco digitos** dibujado en un canvas.
2. El **mismo formulario** muestra entonces el selector de empresa y el boton *Ingresar*. Sin
   empresa el backend no emite el menu y toda ruta interna rebota.

Tres trampas, todas pagadas:

- **El codigo del captcha no se lee de la imagen**: esta en `generatedCaptcha` del componente,
  accesible por `document.querySelector('.captcha-container').__vue__`.
- **El primer boton dentro de `.captcha-container` es el de refrescar** (`sync`). Pulsarlo
  regenera el captcha y deja invalido el que se acaba de escribir. Hay que ir por texto.
- **`focus()` no abre los `v-select`**: en headless la ventana no tiene foco del sistema y el
  evento no se emite. Hay que lanzar `dispatchEvent(new Event('focus'))` a mano. Vale para
  cualquier vue-select de la app, no solo el del login.

Tras entrar, el usuario de pruebas puede caer en `/pages/ResetPassword` si tiene la contrasena
marcada para renovar; la sesion sirve igual y se puede navegar a cualquier ruta.

## Datos

La empresa con informacion real en el ambiente local es **SER AMBIENTAL SAS ESP.** (id 1): es la
unica con registros de variables tecnicas y con FT34. Con cualquier otra, las pantallas salen
vacias y la captura no sirve.

`mt_aplicabilidades` decide que formularios ve cada empresa; si una empresa no tiene filas ahi,
su selector de formularios sale vacio aunque el usuario sea superusuario.

## Estructura del manual

- Documentos: `<STATUS_MANUAL_WEB>/docs/Status/<Modulo>/.../*.md`, con frontmatter `id`, `title`,
  `sidebar_label`.
- Imagenes: `<STATUS_MANUAL_WEB>/website/static/img/...`, referenciadas como `/Manual/img/...`.
- **El manual no usa admoniciones de Docusaurus** (`:::note`). Las unicas que hay estan en
  `docs/doc1.md`, que es el ejemplo que trae la plantilla. Para una advertencia, parrafo con
  **negrita** al inicio.
- Varios documentos estan escritos sin tildes. Es un defecto heredado: lo nuevo se escribe bien.

## Modulos con flujo escrito

| Modulo | Que captura |
|---|---|
| `certificacion-variables` | Formulario *Registrar Variables SD* y tabla de informacion de rellenos sanitarios |
