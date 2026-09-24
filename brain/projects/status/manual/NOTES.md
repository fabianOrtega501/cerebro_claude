# Status — notas del flujo de manual

Lo que hay que saber de esta app antes de correr un flujo. Cada linea aqui es una corrida
fallida que ya no hace falta repetir.

## Configuracion

| Variable | Donde | Para que |
|---|---|---|
| `STATUS_MANUAL_WEB` | `env` de `~/.claude/settings.json` | Ruta al repo `manua-web`. Va en el cerebro, no en el repo de trabajo: ahi las rutas absolutas no tienen nada que hacer |
| `STATUS_TEST_EMAIL` / `STATUS_TEST_PASSWORD` | `~/.claude/secrets.env` | Usuario de pruebas |
| `STATUS_DB_CONTAINER` | `env` de `~/.claude/settings.json` | Contenedor de Postgres (`postgres_postgis_17`). Sin el, `lib/seed.mjs` falla con `No such container: undefined` |

## Cual de las dos aplicaciones se captura

**Conviven dos Status y no son la misma aplicacion.** El ticket 7433 separo el backend y el
frontend del monolito, asi que hoy hay:

| | Donde | Que es |
|---|---|---|
| **Monolito** | `http://localhost:8086`, contenedor `status` | La version anterior, la que esta en produccion hoy |
| **Separado** | `http://localhost:8081` (front) + `http://localhost:8087` (API) | Lo que dejo el 7433 |

**El flujo apunta al separado**, que es lo que se va a desplegar. Capturar contra el 8086
documenta la version vieja: se distingue a simple vista porque el captcha del monolito no tiene
tarjeta ni boton de escuchar el codigo.

Lo que el usuario final percibe distinto entre los dos: el captcha rediseñado, el boton de tema
claro/oscuro en la barra superior, y que con la clave vencida ya **no** se puede entrar.

**No usar el puerto 3000 de BrowserSync** del monolito: es otro origen y las peticiones con
`Authorization` disparan preflight, que no admite las redirecciones 301 que devuelve Apache.

## El login tiene dos pasos y un captcha

1. Correo, contrasena y **captcha de cinco digitos** dibujado en un canvas.
2. El **mismo formulario** muestra entonces el selector de empresa y el boton *Ingresar*. Sin
   empresa el backend no emite el menu y toda ruta interna rebota.

Tres trampas, todas pagadas:

- **El codigo del captcha no se lee de la imagen**: esta en `generatedCaptcha` del componente,
  accesible por `document.querySelector('.captcha').__vue__`. **La clase cambio** de
  `.captcha-container` a `.captcha` con el rediseño del 7433.
- **Los dos botones del bloque no tienen texto**: uno regenera el codigo y el otro lo lee en voz
  alta. Pulsar el de regenerar invalida el captcha que se acaba de escribir. Hay que ir por
  texto al boton de *Iniciar*, nunca por posicion.
- **El boton de voz no siempre existe.** El componente lo oculta si el navegador no publica
  voces, que es lo normal en headless. No dar por hecho que hay dos botones.
- **`focus()` no abre los `v-select`**: en headless la ventana no tiene foco del sistema y el
  evento no se emite. Hay que lanzar `dispatchEvent(new Event('focus'))` a mano. Vale para
  cualquier vue-select de la app, no solo el del login.

> **La clave vencida ahora bloquea de verdad.** Antes, si el usuario de pruebas tenia la
> contrasena marcada para renovar, caia en `/pages/ResetPassword` pero la sesion servia igual y
> se podia navegar a cualquier ruta. Desde el 7433 **no**: el login emite un token acotado a la
> habilidad `clave:renovar` y un middleware rechaza todo lo demas con 403, asi que el flujo se
> queda encerrado en esa pantalla y las capturas salen todas iguales.
>
> Se comprueba mirando `fecharenovacion` del usuario de pruebas: si esta en el pasado, hay que
> ponerla adelante **antes** de capturar y devolverla despues.
>
> ```bash
> cd /datos/proyectos/status-full/status-api
> ./vendor/bin/sail artisan tinker --execute="DB::table('usuarios')->where('id',100)->update(['fecharenovacion'=>'2027-12-31']);"
> ```

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
| `gestion-tramites` | Listado, ventana de creacion, captura del formulario, formatos afectados, edicion y seguimiento |

## Antes de capturar

- **Las dos piezas tienen que estar arriba**: la API (`./vendor/bin/sail up -d` en `status-api`,
  responde en el 8087) y el front en el 8081. La API tarda unos segundos en quedar lista.
- **El front hay que recompilarlo si hay cambios sin desplegar**, y **el build exige Node 14**
  porque `node-sass 4` no compila con versiones nuevas:

  ```bash
  cd /datos/proyectos/status-full/status-frontend
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 14
  npm run build
  ```

  Con el Node del sistema falla con *"Node Sass does not yet support your current environment"*.
  El build completo tarda cerca de 40 minutos: conviene lanzarlo en segundo plano.
- **Las capturas del manual son en tema claro.** La aplicacion ahora recuerda el tema en
  `localStorage` bajo la clave `temaStatus`, asi que una corrida anterior que lo dejo en oscuro
  se lo pasa a la siguiente. Forzarlo antes de capturar:
  `localStorage.setItem('temaStatus', 'light')`.

## Trampas de los popups

- **Se cierran de adentro hacia afuera.** El popup hijo (el de capturar un formulario) queda por
  encima del padre; si se deja abierto, tapa todo lo que se capture despues y la captura sale con
  las dos ventanas superpuestas.
- **El alto de la ventana decide si el modal cabe.** Con 950 px de alto, el modal de creacion se
  corta y el boton *Guardar* queda fuera. Con 1200 entra completo.
- **La clase del popup de variables SD cambio** de `popup-variables-sd` a `modal-variables-sd` en
  el ticket 10919. El flujo de `certificacion-variables` quedo apuntando a la vieja y se corrigio
  el 2026-09-23.
