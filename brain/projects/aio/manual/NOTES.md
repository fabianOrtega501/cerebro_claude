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

## Módulos con flujo ya escrito

| Módulo | Script | Vistas |
| --- | --- | --- |
| AVL | `modules/avl/capture.mjs` | `gps-history` (Histórico GPS), `vehicle-tracking` (Seguimiento Vehicular) |
| AVL | `modules/avl/capture-map-tools.mjs` | `map-tools-gps-history`, `map-tools-vehicle-tracking` (controles flotantes, medición, coordenadas y pantalla completa; no necesita datos de negocio) |
| Operaciones > Despachos | `modules/operations/dispatches/capture-movements.mjs` | `dispatch-movements` (gestión del despacho, pestaña Desplazamientos: `Despachos.md`) |
| Operaciones > Rutas | `modules/operations/routes/capture-geometry.mjs` | `route-geometry` (consulta geográfica: `rutas.md` y `routesGeometries.md`) |
| Operaciones > Rutas | `modules/operations/routes/capture-read-only.mjs` | `route-read-only` (wizard en modo consulta: `rutas.md`) |
| Móvil > Censo | `modules/mobile/visits/capture.mjs` | `census` (tabla de visitas y pestaña Información Visitas: `Censo.md`) |
| Público > Portal Ciudadano | `modules/public/citizen-portal/capture.mjs` | `citizen-portal` (la página del QR y su menú de accesibilidad: `ConsultaElementosPublico.md`). Sin login y sin backend |
| Público > Portal Ciudadano | `modules/public/citizen-portal/capture-recycling.mjs` | `citizen-portal-recycling` (mapa de puntos de acopio: `ReciclajeVoluminosos.md`). Sin login, pero **sí** necesita el backend y datos publicados |

Para el wizard de la ruta hay que pasar `--ruta` con una que tenga registros en sus pestañas: en
los datos de prueba, `MAR-01` (Ruta #2) tiene personal, peajes y puntos de control, y ninguna ruta
tiene suministros.
