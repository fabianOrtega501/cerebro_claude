# AIO web — perfil del manual

Todo lo que la skill transversal `update-manual` necesita saber **de este proyecto**. El
procedimiento general no esta aqui: esta en `~/.claude/skills/update-manual/SKILL.md`.

Este archivo es conocimiento ganado a base de corridas fallidas. Cada punto de "Lo que hay que
saber de la app" costo al menos una. **Al descubrir uno nuevo, agregalo aqui**, no en el
procedimiento transversal: no le sirve a Epsilon ni a Status.

## Configuracion

Las rutas y puertos salen del bloque `env` de `.claude/settings.local.json` de `aio-app`. Las
**credenciales no**: viven en `~/.claude/secrets.env`, fuera de todo repo.

| Variable | Donde | Para que |
| --- | --- | --- |
| `AIO_MANUAL_WEB` | `settings.local.json` | Ruta al repo `manua-web` |
| `AIO_WEB_URL` | `settings.local.json` | Dev server de `aio-app` (por defecto `http://localhost:5173`) |
| `AIO_API_URL` | `settings.local.json` | Backend local (por defecto `http://localhost:8085/api`) |
| `CHROME_PATH` | `settings.local.json` | Solo si Chrome no esta en una ruta estandar |
| `AIO_TEST_EMAIL` / `AIO_TEST_PASSWORD` | `~/.claude/secrets.env` | Usuario de pruebas del backend local |

## Verificar que hay datos antes de capturar

Una corrida toma de 2 a 4 minutos; este chequeo toma segundos.

```bash
cd ~/.claude/brain/projects/aio/manual
node lib/api.mjs get "users/v0/select-user-company/1"     # empresas disponibles
node lib/api.mjs token                                     # si algun flujo lo necesita
node lib/api.mjs count "operation-routes/v0/get-all" "dispatches/v0/get-all"
```

**Agrupa siempre las consultas en una invocacion.** El login del backend esta limitado a **5 por
minuto** por email+IP; una llamada por endpoint agota el cupo y devuelve 429.

**Si el conteo da 0, no captures ese modulo.** Documentar una pantalla vacia es peor que no
documentarla: dile al usuario que el ambiente local no tiene datos de ese modulo y ofrecele
documentar otra cosa. (Paso con Puntos de Interes: 0 categorias y 0 items en local.)

## Dev server

```bash
pnpm dev
```

Tarda ~25 s. **Que responda no basta si acaba de arrancar.** La primera vez que se visita una
vista, Vite optimiza las dependencias que arrastra y **recarga la pagina** (`optimized
dependencies changed. reloading` en su log). La app vuelve al splash y la espera del selector se
agota. No es un fallo del flujo: se vuelve a correr y con la cache caliente pasa. Si una corrida
falla con el splash en `_fallo.png`, mirar primero el log del dev server.

**Dos dev servers del mismo repo se pisan la caché.** Si hay un segundo `vite` (por ejemplo, uno
en el 5174 que el usuario levantó para probar), comparten `node_modules/.vite`. Cuando el nuevo
vuelve a optimizar las dependencias, el viejo sigue sirviéndolas con los hashes anteriores y la app
**queda en blanco, sin excepciones en consola**: el flujo falla con `Timeout esperando
input[type="email"]`. Revisar con `ss -ltnp | grep 517` y pasar `--base` con el puerto que sí
carga. No matar ninguno de los dos sin preguntar: los dos son del usuario. Pasó el 2026-10-02.

**Un `timeout` de shell que corta el flujo deja el navegador vivo en el 9222**, porque mata a Node
antes del `finally`. La corrida siguiente se conecta a él. Correr `close-orphans.mjs` después de
cada corte, aunque el script diga que no hay huérfanos al arrancar.

Tambien hace falta el **backend local arriba** (el de `aio-backend`, con Sail), salvo en las
vistas publicas que no consultan nada.

## Estructura del manual

- Documentos: `<AIO_MANUAL_WEB>/docs/AIO/<Modulo>/.../*.md` (frontmatter con `id`, `title`,
  `sidebar_label`).
- Imágenes: `<AIO_MANUAL_WEB>/website/static/img/aio/...`
- En los `.md` las imágenes se referencian como `/Manual/img/aio/...`, sin `website/static`.
- Las capturas del AIO web son **tema claro** y de **ventana completa**. El viewport estándar es
  **1486x795** (`VIEWPORT` en `lib/session.mjs` de esta carpeta), que es el de las capturas ya publicadas:
  mantenerlo para que el manual se vea uniforme.
- Cada vista tiene su documento y su carpeta de imágenes. En AVL, por ejemplo, `HistoricoGps/` y
  `SeguimientoVehicular/` documentan la misma funcionalidad de capas por separado, con estilos de
  redacción distintos (el de Histórico usa emojis en los títulos, el de Seguimiento no).
  **Respetar el estilo de cada archivo** en vez de unificarlos.

### Ortografía: siempre correcta, aunque el archivo no lo esté

Varios documentos del manual están escritos **sin tildes** (`informacion`, `geometria`,
`unicamente`). Es un defecto heredado, **no un estilo que haya que imitar**.

Todo texto nuevo se escribe con ortografía correcta: tildes, `ñ`, signos de apertura (`¿` `¡`).
"Respetar el estilo del archivo" aplica al tono, a los títulos y al uso de emojis — **nunca a la
ortografía**.

Si el documento que estás tocando tiene el defecto, corrige lo que escribes y **ofrécele al
usuario normalizar el resto del archivo**; no lo hagas por tu cuenta, porque ensucia el diff del
cambio que sí te pidieron.

## Lo que hay que saber de la app para automatizarla

Cada uno de estos puntos costó una corrida fallida:

- **Las vistas públicas no pasan por el login.** Las rutas con `meta.public` (el QR de aseo
  urbano, los certificados, el registro de asistencia) montan con `layout: 'blank'` y sin sesión:
  para esas está `openPublicPage`, no `openSession`. Ni captcha, ni empresa, ni módulo, y si la
  vista no consulta el backend tampoco hace falta tenerlo arriba.
- **Los endpoints públicos están limitados a 60 peticiones por minuto y por IP** (`RateLimiter`
  del backend, no del login). Una corrida del mapa de puntos de acopio hace tres cargas de página,
  y cada una encadena varias consultas: si además hay pestañas abiertas contra el mismo backend, la
  corrida se cruza con un 429 y la vista sale **vacía**, sin error visible. Si un mapa aparece sin
  puntos, comprobar el límite con un `curl` antes de tocar el flujo.
- **El menú de accesibilidad ya no es del portal: vive en `src/components/accessibility/`** y sus
  clases son `a11y-widget__*` (antes `cp-a11y__*`), con los atributos del `<html>` como
  `data-a11y-*` (antes `data-cp-*`). Sus ids llevan un prefijo **único por instancia**, así que a
  los interruptores hay que llegar por el final del atributo:
  `.a11y-widget__option[aria-describedby$="hint-highContrast"]`.
- **El dev server monta el panel de Vue DevTools encima de la app**, centrado abajo, y sale en
  todas las capturas: hay imágenes ya publicadas con esa pastilla. Peor aún, tapa lo que quede en
  esa zona —se comió el texto del `VSnackbar` de la vista pública—. `openSession` y
  `openPublicPage` ya lo ocultan por CSS (`HIDE_DEVTOOLS`); en producción no existe, así que
  ocultarlo no falsea la captura.
- **En headless la geolocalización está denegada de fábrica.** Las vistas que la usan tienen dos
  caminos distintos —el mapa de puntos de acopio se encuadra en la empresa o en el ciudadano, y las
  tarjetas muestran o no la distancia—, así que sin `setGeolocation` solo se puede documentar la
  mitad. Hay que llamarlo **antes** de navegar, y recargar si la vista ya estaba montada.
- **Hay vistas que no caben en los 795 px del manual.** El mapa de puntos de acopio mide el 60% del
  alto de la ventana y debajo lleva su lista: capturar con el viewport estándar corta la pantalla
  por la mitad. Se sube el alto (1486x1200) y se deja el **ancho** de siempre, que es lo que hace
  que las imágenes se sigan viendo parejas.
- **Al cerrar un `VDialog`, Vuetify devuelve el foco al botón que lo abrió**, que queda con su
  anillo de foco puesto. Es correcto para el teclado, pero en la captura se lee como si el botón
  estuviera activado: un `document.activeElement?.blur()` después de cerrar lo deja limpio.
- **El canvas del captcha cambio de clase con el rediseno del ticket 10898**: ahora es
  `captcha__canvas` y antes `captcha-canvas`. `CAPTCHA_HOOK` acepta las dos, porque las ramas sin
  ese ticket mezclado siguen con la vieja. Si algun dia se retira la antigua, ese hook es el unico
  sitio a tocar; si se olvida, **el login automatizado deja de funcionar en todos los modulos**,
  con un timeout que parece de red.
- **El captcha se rompió dos veces por el mismo rediseño, y en dos sitios distintos.** No basta
  con que `CAPTCHA_HOOK` acepte las dos clases del canvas: `openSession` **decide si hay captcha**
  con su propio selector, y **escribe el código** en otro. Los tres tienen que aceptar las dos
  variantes. Quedó así tras el ticket 9357, con las clases nuevas primero:

  | Qué | Nuevo (rediseño) | Anterior |
  | --- | --- | --- |
  | Canvas (hook y detección) | `.captcha__canvas` | `.captcha-canvas` |
  | Campo donde se escribe | `.captcha__field input` | `.captcha-input-col input` |

  El síntoma cuando falla es engañoso: el login llega hasta el final y la pantalla dice **"Este
  campo es requerido"** bajo la verificación. No es que el código se leyera mal — es que nunca se
  escribió, porque la detección dio `false` y el bloque entero se saltó.
- **`openPublicPage` acepta `captchaHook: true`.** Hay vistas publicas con captcha —el registro de
  asistencia a capacitaciones— y ahi `readCaptcha` no funcionaba: el hook solo lo inyectaba
  `openSession`. Se inyecta antes de navegar; despues no engancha.
- **La accion de escuchar el codigo no se ve en los navegadores snap.** Brave y Firefox de snap no
  alcanzan el `speech-dispatcher` del sistema, asi que `speechSynthesis.getVoices()` devuelve 0 y
  el componente esconde el boton (es su comportamiento correcto). Las capturas del bloque de
  verificacion **hay que tomarlas con el Chrome `.deb`** (`/usr/bin/google-chrome`), que si trae
  voces; con Brave sale una sola accion y el manual quedaria documentando de menos.
- **El boton flotante de accesibilidad del portal ciudadano tapa el contenido de detras.** Queda
  fijo sobre el borde derecho y se come el campo que tenga debajo. En las capturas del bloque de
  verificacion se oculta por CSS (`.a11y-widget__fab`), que es lo que hace la vista `citizen-portal-verification`;
  el manual ya lo documenta aparte con `boton-accesibilidad.png`.
- **Dibujar en el `SignaturePad` tiene dos trampas.** La primera: los `mouseMoved` necesitan
  `buttons: 1`, porque sin el mapa de botones pulsados signature_pad los toma por un
  desplazamiento sin trazo y el lienzo queda vacio. La segunda: el lienzo del registro de
  asistencia queda al borde inferior de la ventana, asi que **hay que desplazarlo antes de medirlo**
  o los puntos del trazo caen fuera del viewport y los eventos no llegan a ninguna parte. Conviene
  comprobar el resultado leyendo el canal alfa del canvas en vez de suponer que se dibujo.
- **El login tiene captcha, y no se puede saltar por entorno.** El bypass del formulario exige
  `VITE_APP_ENV === 'QA'` y el `.env` local trae `LOCAL`. El captcha son 5 dígitos que
  `Captcha.vue` dibuja en un `<canvas>`, así que no se leen del DOM: se enganchan envolviendo
  `CanvasRenderingContext2D.prototype.fillText` con `Page.addScriptToEvaluateOnNewDocument`
  antes de que cargue la app (`CAPTCHA_HOOK` en `lib/session.mjs`). No hace falta tocar el `.env`
  de nadie.
- **`AppSelect` y `AppAutocomplete` reescriben el `id`.** El `id="companies"` de la vista termina
  en el DOM como `app-select-companies-<aleatorio>`, con sufijo distinto en cada render. Hay que
  buscar por prefijo: usar el helper `appField('companies')`. Los `VBtn` sí conservan su id
  (`#buscar-rutas` funciona).
- **Los selects de Vuetify no se abren con `element.click()`.** El menú se activa desde los
  eventos de ratón del `.v-field`; hay que despachar `Input.dispatchMouseEvent` sobre el campo
  (`openSelect` lo hace).
- **Las opciones de los selects llegan por API.** Si el menú se abre antes de la respuesta,
  Vuetify pinta "No data available" y ahí se queda. `openSelect` reintenta cerrando con Escape.
- **Sin empresa seleccionada no hay módulos.** `modulos.vue` pide las aplicaciones cuando cambia
  la empresa, así que el orden es: empresa → tarjeta del módulo → vista.
- **Las rutas del AVL se dibujan en canvas, no en SVG.** Los mapas se crean con
  `preferCanvas: true`, así que no hay `<path>` que consultar ni sobre el que hacer click. Se
  localizan leyendo los píxeles del canvas (`pointsOnCanvasStroke`) y se hace click con el ratón
  real: el renderer de canvas de Leaflet hace su propio hit-testing con las coordenadas.
- **Un solo punto del trazo no basta.** Las rutas son mallas de calles y el hit-test falla en
  muchos píxeles pintados. Hay que probar varios tramos separados entre sí; en la corrida de
  referencia el popup abrió al **tercer** intento de 12.
- **El mapa se inicializa antes de que el viewport definitivo esté aplicado.** Queda con tamaño
  mínimo: solo carga un parche de tiles en la esquina y el canvas de geometrías queda en 0x0.
  Se arregla disparando un `resize` de ventana (`refreshMap`), que es lo que Leaflet escucha.
- **La tabla de rutas tiene una fila incluso vacía**: la de "No data available". Esperar
  `tbody tr` se cumple de inmediato y todo lo que sigue corre en falso. Hay que esperar
  `tbody tr input[type=checkbox]`, que solo existe con datos reales.
- **Los modales abren vacíos y después pintan skeletons.** Esperar "sin skeletons" apenas abre la
  modal se cumple con la modal en blanco. Primero hay que esperar a que monte el contenido (por
  ejemplo `.v-dialog .stepper-icon-step`) y **después** a que no queden `.v-skeleton-loader`.
  Para tablas dentro de un diálogo ni siquiera eso alcanza: la tabla se monta, pide los datos y
  **luego** pinta los skeletons, así que `waitForNoSkeletons` pasa en el hueco previo. Usar
  `waitForTableSettled`, que exige filas + sin skeletons + sin overlay de carga, sostenido.
- **Hay dos indicadores de carga distintos.** Los formularios usan `VSkeletonLoader`; las tablas
  usan además `Standard/Loader/Loading.vue`, que es `vue-loading-overlay` (`.vl-parent` /
  `.vl-overlay`) y no tiene nada que ver con los skeletons. Esperar solo uno deja pasar el otro.
- **El nombre en el código no es el nombre en pantalla.** La pestaña `movements` del despacho se
  llama **Desplazamientos** en la interfaz, y el diálogo para crear uno se titula "Agregar
  Movimiento". Antes de redactar, leer el texto real de la pantalla capturada; y antes de
  afirmar una regla de negocio (qué filas se pueden editar, por ejemplo), confirmarla en el
  código: en esa tabla depende de `is_editable`, no de la posición de la fila.
- **En Despachos hay dos botones con la clase `v-log` en cada fila**: el del historial y el de
  Novedades. Se distinguen por el ícono — `tabler-file-description` es el del log. Tomar "el
  primero `.v-log`" abre la pantalla equivocada.
- **El Histórico GPS monta la vista dos veces.** `gpsHistory.vue` renderiza `GpsHistoryView` en
  la página y otra vez dentro del diálogo de pantalla completa. Hay dos mapas en el DOM: los
  selectores globales pueden agarrar el que está oculto.
- **Los controles de capas dependen de permisos.** El control de rutas solo existe si el usuario
  tiene lectura sobre `/operations/operation-routes`; los de puntos de interés y elementos, sobre
  `/avl/interest-points` y `/operations/item`. Como cuáles se pintan cambia con el usuario, no se
  identifican por su posición en la pila sino por la clase de su ícono
  (`custom-icon-control`, `custom-icon-points-of-interest`, `custom-icon-points-of-element`,
  `custom-icon-routes`), que es la que les pone `changeIcon`.
- **Solo el primer control de capas despliega un panel.** A los otros tres `addActionEvent` les
  quita la expansión para que abran un diálogo. Y el que sí se despliega lo hace con el
  `mouseenter` **real** del ratón: hay que mover el cursor encima (`moveMouseTo`), no sirve un
  `click()` sintético. El recuadro de `highlight` no lo cierra, porque se dibuja sin eventos de
  ratón; pero cualquier movimiento posterior sí.
- **De la pantalla completa del AVL se sale con una X, no con un ícono de minimizar.** El ícono
  `tabler-minimize` está en la tarjeta de la vista, que sigue en el DOM detrás del diálogo: el
  botón del diálogo es `tabler-x`. Y hay otra X dentro del mismo diálogo, la que limpia la
  medición, así que el selector tiene que acotarse a la barra (`.v-dialog .v-toolbar`).
- **Sin marcadores no hay clústeres.** El botón de agrupar cambia de ícono igual, pero el efecto
  que documenta el manual —los círculos con el conteo— necesita vehículos en el mapa.
- **`waitForSelector` no sirve para `.v-dialog`.** Comprueba `offsetParent !== null` y el diálogo
  es `position: fixed`, así que su `offsetParent` siempre es `null`: la espera se agota aunque el
  modal esté abierto. Hay que esperar algo de adentro, como `.v-dialog .v-card`.
- **Y tampoco sirve para lo que tenga `display: contents`.** Ese valor no genera caja, así que su
  `offsetParent` también es `null` — el elemento existe, `querySelectorAll` lo encuentra, y la
  espera se agota igual. Le pasa a **`.v-timeline-item`**, que Vuetify declara así
  (`VTimeline.sass`), y es lo que usa el Log de Despacho. Para esos casos hay que esperar
  **contando** los elementos con `evaluate`, no con `waitForSelector` (`waitForCount` en
  `modules/operations/dispatches/capture-log.mjs`).
- **No todos los mapas son de canvas.** El de la consulta geográfica de la ruta se crea sin
  `preferCanvas`, así que las geometrías sí son `<path>` y sirve `pointOnPath`. Aun así el click
  tiene que ser del ratón real, porque Leaflet ubica el popup con el `clientX/clientY`.
- **Los marcadores tapan el trazo.** El punto medio de la línea suele caer bajo un marcador de
  punto de control, que está en un panel superior y se lleva el click: hay que probar varias
  fracciones del trazo y confirmar que el popup abierto es el de la capa buscada.
- **Los pasos del wizard viven en un `VSlideGroup`.** Los últimos (Geometrías, Suministros) quedan
  fuera de la vista y su click no hace nada; primero hay que correrlos con `.v-slide-group__next`.
- **Con dos diálogos abiertos hay varios botones de cerrar.** El del diálogo de arriba es el
  **último** del DOM, no el primero.
- **Un formulario largo no cabe en el diálogo.** El `.v-card` se limita al alto de la ventana y
  el resto queda en un scroll interno, así que el recorte por selector sale cortado a la mitad
  aunque `captureBeyondViewport` esté activo. Hay que agrandar la ventana con `setViewport`
  **después** de abrir el modal y antes de capturar (`modules/mobile/visits/capture.mjs` usa
  1486x1500 para el asistente del censo).
- **Al entrar a una vista del AVL salen toasts** ("Vehículos obtenidos exitosamente", "Usuarios
  obtenidos con éxito") en la esquina inferior derecha, justo encima del rótulo de coordenadas.
  Hay que esperar a que se vayan (`.Toastify__toast` en cero) antes de capturar esa zona.
- **Sin vehículos en pantalla el mapa arranca en vista continental.** No hay `fitBounds` que lo
  acerque, así que las capturas salen con medio continente y una medición de cientos de
  kilómetros. Hay que acercar con `.leaflet-control-zoom-in` antes de capturar.
- **`captureBeyondViewport` dispara eventos de ratón en la página.** Obliga a Chrome a rehacer
  el layout, y ese reflow manda un `mouseout`: lo que dependa de la posición del cursor se
  limpia justo antes de capturar (el rótulo de coordenadas quedaba en `Lat: --  Lng: --`).
  `screenshot` ya solo activa esa opción cuando el recorte se sale de la pantalla, así que **no
  hay que compensarlo con esperas**: un recorte que cabe en el viewport sale con lo que se ve.
  Si aun así capturas algo que sigue al cursor, repón la posición con `moveMouseTo` antes.
- **Un recorte anclado a un elemento pequeño se sale de su contenedor.** El rótulo de
  coordenadas está pegado al borde del mapa: con margen se agarra el fondo blanco de la página.
  Para esos casos, pasarle a `screenshot` un `clip` calculado sobre el contenedor.

- **Los pasos de un `AppStepper` no siempre son clicables.** Si la vista le pasa
  `is-active-step-valid`, el componente entra en modo validación y anula el `@click` de cada
  paso: el único camino es el par de botones Anterior / Siguiente del formulario. Y la clase
  `.stepper-icon-step` **solo existe cuando el paso trae `icon`**; sin ícono el componente cae
  en su rama numerada y hay que buscar por `.step-title`.
- **Cada fila de `DataTable` trae sus acciones por duplicado**: la tabla de escritorio y la
  variante de tarjetas para móvil, con las mismas clases y una de las dos oculta. Un
  `row.querySelector('.v-show')` devuelve la primera, que puede ser la invisible: su rectángulo
  es 0×0 y el click cae sobre el velo del diálogo sin que pase nada. Hay que recorrer todas y
  quedarse con la que tenga tamaño.
- **Los `id` de `AppTextField` y `AppAutocomplete` cambian en cada render.** Se calculan como
  `app-<tipo>-<etiqueta>-<aleatorio>` dentro de un `computed`, así que un id leído antes de
  tocar un select ya no existe después. Hay que resolver el campo por su etiqueta en el momento
  de usarlo.
- **La etiqueta no siempre está dentro del componente.** Varias vistas ponen el rótulo como un
  `<label class="v-label">` **hermano**, justo antes del campo (Nombre y Descripción del paso
  Planes). Y Vuetify añade su propia etiqueta flotante, vacía: hay que quedarse con la primera
  que tenga texto y, si no hay ninguna, con el `placeholder`.
- **No todo campo es un `App*`.** `Tipo Vehículo` del paso Planes es un `VAutocomplete` pelado;
  si el barrido solo busca los envoltorios del proyecto, ese campo se queda sin llenar y el
  formulario no valida. Ojo al deducir el tipo: un `VAutocomplete` **también** lleva la clase
  `v-text-field`, así que hay que decidir por `.v-select` / `.v-autocomplete`.
- **Los tooltips de las celdas son `.v-overlay--active`.** Si el "diálogo más alto" se busca por
  esa clase, un tooltip que quedó abierto se lleva el papel y a partir de ahí no se encuentra
  ningún botón. Acotar a los overlays que contengan un `.v-card`.
- **Un select múltiple deja su menú abierto tras elegir**, y ese `.v-list` tapa los botones del
  diálogo. Se cierra con la tecla real (`pressEscape`), no con un `KeyboardEvent` sintético
  sobre `document`; los diálogos son `persistent`, así que el Escape no se lleva la modal.
- **Elegir un valor en un select puede devolver el formulario a esqueletos** mientras recarga
  los campos que dependen de él (Actividad depende de Sistema). Una relectura inmediata cae en
  ese hueco y no ve ningún campo: hay que volver a esperar a que el formulario monte, y esperar
  también a los campos que están **deshabilitados** mientras cargan.
- **El boton de guardar del formulario estandar cambia de texto segun la accion**: `Guardar` al
  crear y **`Editar`** al editar. Buscar "Guardar" en la edicion no encuentra nada y el flujo sigue
  como si hubiera guardado.
- **El buscador de Clientes abre en skeletons**, a diferencia del de la tabla estandar: esperar el
  dialogo no basta, hay que esperar el campo `[id^="app-text-field-name-"]`.
- **El `.footer-dialog` de `DialogComponent` es `position: fixed` a lo ancho de la ventana**,
  con `z-index: 999`: se lleva el click de cualquier botón que caiga en esa franja, y el
  síntoma es que no pasa nada. Bajar el scroll del diálogo sube los botones por encima.

### La tabla estandar: sus campos de filtro y su desborde horizontal

Tres cosas que cuestan una corrida cada una si no se saben:

- **El buscador de una tabla estandar es un dialogo aparte**, que se abre con el boton `Buscar`.
  Hace falta cuando el registro no cae en la primera pagina: el listado de clientes tiene 126.
- **Sus campos no tienen `label` con texto ni `placeholder`**, asi que no se pueden localizar por
  su rotulo. Lo que si traen es un `id` con el patron **`app-text-field-<campo>-<hash>`**, de modo
  que el selector estable es `[id^="app-text-field-name-"]`. Para los selectores y autocompletados
  el prefijo es `app-select-` y `app-autocomplete-`, que es lo que ya resuelve el helper
  `appField()`.
- **Las tablas anchas desbordan y su columna de acciones queda fuera de vista.** Capturar con
  `{ selector: "table" }` produce una imagen con el encabezado y sin los botones. Hay que empujar
  `.v-table__wrapper` con `scrollLeft = scrollWidth` antes de la captura, y fotografiar la vista
  completa en vez del elemento.

### Autorizacion de fidelizacion: dos condiciones para que exista el boton

El candado solo se pinta si `is_active && isCommercialDirector && allows_authorization`. Es decir:

- El usuario de pruebas (`AIO_TEST_EMAIL`) **tiene que ser Director Comercial**. Hoy lo es: su
  cargo trae `is_commercial_director` en verdadero, comprobable con
  `getClassificationsByUserId()`. Si alguien cambia esa clasificacion, el flujo deja de encontrar
  el boton y lo dice con un mensaje propio en vez de morir en un timeout.
- Tiene que haber un acuerdo en **"Pendiente de Autorización"**. Los del cliente `Prueba Catastro`
  (id 1076155) estan en la empresa **Empresa Demo**, no en PROMOCALI.

El flujo **no confirma la decision**: abre la ventana y la fotografia en sus dos estados. Guardar
cambiaria el estado del acuerdo y la siguiente corrida ya no encontraria nada pendiente.

Desde el 2026-09-30 un acuerdo **sin elementos pactados no ofrece decidir**: la ventana oculta los
radios, las notas y Guardar, y deja solo Cerrar. Tres consecuencias para el flujo:

- **`aprobar` y `rechazar` necesitan un acuerdo pendiente con elementos.** Los pendientes de
  `Prueba Catastro` hoy no los tienen, asi que esas dos capturas no se pueden regenerar con el
  escenario actual hasta agregarle elementos a uno.
- **La vista `sin-elementos`** (`--solo sin-elementos --acuerdo 5`) abre el acuerdo por su id, no el
  primer candado, y falla si la ventana ofrece radios. `seed.sql` deja sus totales en nulo.
- **El candado ya no lleva `title`**: se busca por `aria-label="Autorización de fidelización"`, y la
  fila se busca dentro de `.v-dialog tbody tr`, porque la primera tabla del DOM es la de clientes.

### Gestion Diaria de despachos: el orden de turno y fecha

Dos trampas del buscador de la Gestion Diaria, documentadas por el equipo en su copia de la skill
y absorbidas con el flujo:

- **El turno se elige antes que la fecha.** Elegir el turno repinta el campo de fecha y lo
  devuelve a hoy, asi que hacerlo al reves deja la busqueda vacia sin avisar.
- **La fecha se fija en el modelo del formulario, no tecleandola.** flatpickr revierte el valor
  escrito al salir del campo.

Los tres flujos absorbidos el 2026-09-15 (`dispatch-daily-filters`, `dispatch-daily-card`,
`logbook-search`) **no se han corrido desde el cerebro**: se comprobo que resuelven sus imports
contra los helpers del perfil, nada mas. La primera corrida puede necesitar ajustes de datos
(`--turno`, `--fecha`, `--vehiculo`).

## Al terminar, en este repo

**Levantar el dev server reescribe `components.d.ts`**, que regenera `unplugin-vue-components` al
escanear la app. Antes de tocarlo, mirar **que** cambio:

```bash
git diff --numstat components.d.ts
```

- **Sin numeros** (solo el aviso de fin de linea): el contenido es identico, se restaura sin
  perder nada con `git checkout -- components.d.ts`.
- **Con numeros**: hay un cambio de contenido real, y es una desincronizacion preexistente entre
  el archivo commiteado y lo que produce el generador (por ejemplo la linea de `VueApexCharts`,
  que aparece al visitar vistas con graficas). **No lo descartes en silencio:** diselo al usuario
  y deja que decida si lo commitea aparte. Es regenerable pero no es tuyo y no deberia colarse en
  el MR de la documentacion.

### El destino de un mapeo tiene que ser un nombre que el documento ya use

`copy-to-manual.mjs` copia a donde diga el `mappings.mjs`, sin comprobar que alguien muestre esa
imagen. Un destino inventado deja el archivo huérfano en el manual **y la página sigue enseñando
la imagen vieja**, sin que nada falle. Le pasó a `dispatch-movements`, que apuntaba a
`desplazamientos-tabla.png` cuando `Desplazamientos.md` referencia `desplazamientos_01.png`.

Antes de escribir un mapeo, mirar qué nombre usa el `.md`:

```bash
grep -o "[a-z0-9_-]*\.png" docs/AIO/<ruta>/<Documento>.md | sort -u
```

## Módulos con flujo ya escrito

| Módulo | Script | Vistas |
| --- | --- | --- |
| AVL | `modules/avl/capture.mjs` | `gps-history` (Histórico GPS), `vehicle-tracking` (Seguimiento Vehicular) |
| AVL | `modules/avl/capture-map-tools.mjs` | `map-tools-gps-history`, `map-tools-vehicle-tracking` (controles flotantes, medición, coordenadas y pantalla completa; no necesita datos de negocio) |
| Operaciones > Despachos | `modules/operations/dispatches/capture-movements.mjs` | `dispatch-movements` (gestión del despacho, pestaña Desplazamientos: `Despachos.md`) |
| Operaciones > Despachos | `modules/operations/dispatches/capture-log.mjs` | `dispatch-log` (Log de Despacho, el historial de cambios: `Despachos.md`). Imprime al final los campos que salieron sin traducir, así que sirve de comprobación del i18n. El despacho se pasa con `--despacho` y **tiene que estar en la primera página** de la tabla: el flujo no pagina. En Empresa Demo sirven el 34 y el 42, que mezclan altas y modificaciones |
| Operaciones > Despachos | `modules/operations/dispatches/capture-change-vehicle.mjs` | `dispatch-change-vehicle` (cambio de vehiculo del despacho, la accion con permiso propio). Absorbido del `.claude/` del repo |
| Respel > Clientes | `modules/respel/clients/capture.mjs` | `clients-map` (mapa geografico de clientes). Absorbido del repo; trae su `seed.sql` |
| Respel > Clientes | `modules/respel/client-loyalties/capture.mjs` | `client-loyalties-authorization` (ventana de Autorización de fidelización, dentro del asistente de Gestiones: `clients.md`). Trae su `seed.sql`. Hay que pasarle `--empresa "Empresa Demo"` |
| Respel > Comercial | `modules/respel/client-operation-costs/capture.mjs` | `client-operation-costs` (maestro Costos de Operación: `client-operation-costs.md`, y su opción en la ficha del cliente: `clients.md`). Trae su `seed.sql` con cuatro vigencias de COSMITET LTDA en PROMOCALI, una por estado; ese cliente tiene prestaciones ejecutadas en 2026, que es lo que hace salir el aviso de rentabilidad. No guarda nada: cierra cada formulario con Cerrar |
| Operaciones > Despachos | `modules/operations/dispatches/capture-daily-filters.mjs` | `dispatch-daily-filters` (criterios de la Gestión Diaria: `Despachos.md`). Con `--turno`, que debe tener rutas cuya frecuencia cubra hoy, y `--vehiculo` / `--otro-vehiculo`. Es sobre todo prueba de la cascada de limpieza. **La cascada del campo vaciado está en `qa` pero no en `prod`**: sobre una rama de `prod` esa comprobación falla y no es un fallo del flujo. Absorbido del repo |
| Operaciones > Despachos | `modules/operations/dispatches/capture-daily-card.mjs` | `dispatch-daily-card` (la tarjeta del despacho encontrado, con **Servicio** y **Vehículo**: `Despachos.md`). Con `--fecha`, `--turno` y `--vehiculo`, que tienen que apuntar a un día con despachos. Absorbido del repo |
| Mantenimiento > Bitácora | `modules/maintenance/logbook/capture-search.mjs` | `logbook-search` (formulario de búsqueda, ya sin el campo **Tipo de Equipo**: `BitacoraDeMantenimiento.md`). Con `--vehiculo`, la etiqueta del desplegable (código/placa), que debe apuntar a un vehículo **con** bitácoras. Absorbido del repo |
| Mantenimiento > Órdenes de trabajo | `modules/maintenance/work-orders/capture-search.mjs` | `work-order-search` (formulario de búsqueda con el criterio **Estado**: `WorkOrder.md`). Con `--estado`, que debe existir en los datos y no estar en todas las órdenes: el flujo comprueba que el filtro acote el listado. Absorbido del repo |
| Operaciones > Despachos | `modules/operations/dispatches/capture-massive-closure.mjs` | `massive-closure` (cierre masivo: botón, panel de candidatos, tripulación y modal de fecha: `Despachos.md`). Solo entran despachos sin vehículo y en operación, así que la empresa tiene que tener alguno. Absorbido del repo |
| AVL | `modules/avl/capture-route-search.mjs` | `route-search` (buscador de rutas). Absorbido del repo; trae su `seed-route-search.sql` |
| Operaciones > Rutas | `modules/operations/routes/capture-geometry.mjs` | `route-geometry` (consulta geográfica: `rutas.md` y `routesGeometries.md`) |
| Operaciones > Rutas | `modules/operations/routes/capture-read-only.mjs` | `route-read-only` (wizard en modo consulta: `rutas.md`) |
| Móvil > Censo | `modules/mobile/visits/capture.mjs` | `census` (tabla de visitas y pestaña Información Visitas: `Censo.md`) |
| Público > Portal Ciudadano | `modules/public/citizen-portal/capture.mjs` | `citizen-portal` (la página del QR y su menú de accesibilidad: `ConsultaElementosPublico.md`). Sin login y sin backend |
| Público > Portal Ciudadano | `modules/public/citizen-portal/capture-recycling.mjs` | `citizen-portal-recycling` (mapa de puntos de acopio: `ReciclajeVoluminosos.md`). Sin login, pero **sí** necesita el backend y datos publicados |
| Mantenimiento > Planes | `modules/maintenance/plans/capture.mjs` | Los cuatro pasos de líneas del wizard (Actividades, Puestos de Trabajo, Herramientas, Suministros) |
| Mantenimiento > Planes | `modules/maintenance/plans/capture-crud.mjs` | Una captura por operación del CRUD, en los tres modos del wizard (`--modo edicion\|creacion\|consulta`). Sirve además como prueba: imprime al final la lista de hallazgos, y una corrida limpia termina en `hallazgos (0)` |
| Operaciones > Novedades | `modules/operations/issues/capture.mjs` | `issues` (formulario de Agregar sin la Salida No Conforme, la ventana **Cerrar novedades** con el interruptor y el concepto ya elegido, el detalle de una novedad cerrada con ella y el cierre de Mantenimiento solo con **Solución**: `Operaciones/Novedades/Novedades.md` y `Mantenimiento/Novedades.md`). Trae su `seed.sql`, que hay que aplicar antes: textos presentables y una novedad cerrada con Salida No Conforme en Empresa Demo. El listado **no muestra la descripción**, así que el flujo resuelve el id de cada novedad en la base y busca la fila por la celda del ID. Nunca guarda ni confirma; sirve de prueba con `hallazgos (0)` |
| Operaciones > Despachos | `modules/operations/dispatches/capture-reopen.mjs` | `dispatch-reopen` (acción **Reabrir Despacho** en la fila de la tabla y en la tarjeta de la Gestión Diaria, con su modal del motivo: `Despachos.md`). Con `--despacho`, que tiene que estar **Cerrado**, y `--abierto`, uno Programado o En Operación. El usuario de pruebas necesita el permiso `/operations/reopen-dispatch` en la empresa. **Nunca confirma** la reapertura. Sirve de prueba: una corrida limpia termina en `hallazgos (0)`. Absorbido del repo |
| Mantenimiento > Bitácora | `modules/maintenance/logbook/capture-tracking.mjs` | `logbook-tracking` (seguimientos con **área responsable**, fechas y tiempo transcurrido, su formulario y el detalle: `BitacoraDeMantenimiento.md`). Necesita una bitácora **En proceso** con al menos un seguimiento. Absorbido del repo |
| Mantenimiento > Órdenes de trabajo | `modules/maintenance/work-orders/capture-supplies.mjs` | `work-order-supplies` (buscador de suministros con el menú desplegado: `WorkOrder.md`). Regenera `OT_26.png` con `--sobrescribir`. Absorbido del repo |
| Respel > Operaciones > Prestación de Servicios | `modules/respel/service-provisions/capture.mjs` | `service-provisions-edit` (diálogo **Editar Prestación de Servicios** con una cantidad recibida decimal digitada: `Respel/Operaciones/service-provision.md`, regenera `pr_1.png` con `--sobrescribir`). Con `--prestacion`, que tiene que estar en la primera página y mostrar el lápiz; en PROMOCALI local sirve la 121354. **Nunca guarda**: digita y cierra |
| Respel > Fidelización | `modules/respel/client-loyalties/capture-signature-audit.mjs` | `signature-audit` (acción de auditoría en el listado de acuerdos y la pantalla del quórum con la tabla de firmantes: `Comercial/Fidelizacion/auditoria-firmas.md`). Con `--cliente`, `--acuerdo` y `--solo acciones\|auditoria\|todo`. Saca la auditoría normal y **expandida**, y falla si abre a pantalla completa o sin el botón Ampliar. Espera las 102 de 120 firmas del acuerdo #5 de la base local, que se cargaron con un `seed.sql` que **nunca se commiteó**: sin él la barra sale casi vacía. Absorbido del repo, con `runSql` asíncrono |

La navegación del wizard —abrir la pestaña Planes, abrir el wizard de una fila, saltar entre
pasos— vive en `modules/maintenance/plans/wizard.mjs`, compartida por los dos flujos. Ninguno de
los dos tiene todavía `mappings.mjs`, así que `copy-to-manual.mjs` no los cubre: las capturas
salen a la carpeta que se le pase y se copian a mano si hacen falta en el manual.

Para el CRUD hay que apuntar a un plan **sin líneas** (en los datos de prueba, `PRUEBA CRUD
Wizard`): con un plan grande la fila recién creada cae en la última página y la comprobación da
negativo. Para el modo consulta conviene lo contrario, un plan con datos (`DEMO Plan`).

Para el wizard de la ruta hay que pasar `--ruta` con una que tenga registros en sus pestañas: en
los datos de prueba, `MAR-01` (Ruta #2) tiene personal, peajes y puntos de control, y ninguna ruta
tiene suministros.
