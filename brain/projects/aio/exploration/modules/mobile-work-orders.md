# Móvil → Operaciones → Órdenes de Trabajo

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

Estado: **explorado (validación dirigida — AddressInput reemplaza Ubicación/PointGPSDialog, wizard Ver,
flujo de estados, Finalizar/Anular, orden de campos)** — actualizado: 2026-08-26.

## Actualización 2026-08-26 — `AddressInput` reemplaza el campo "Ubicación" (cierra el ciclo de vida del campo dirección)
Nueva validación EN VIVO de un cambio posterior a las 3 pasadas de 2026-08-25 (rama `feature/sergio-10691`,
sin commitear al momento de validar). **El campo "Ubicación" (mapa `PointGPSDialog`) fue ELIMINADO** de
`WorkOrderAddForm.vue` — confirmado por lectura de código (ya no hay import de `PointGPSDialog` ni
`openLocationMap`/`updateDataModalPointGps`) y por UI (el modal "Agregar Orden de Trabajo" solo muestra 8
campos, sin Ubicación al final). En su lugar, el campo **Dirección ahora usa el componente estándar
`AddressInput`** (`src/components/Standard/AddressInput/AddressInput.vue`, el mismo ya documentado en
`mobile-operaciones-prestacion-servicio.md` para el botón "Programar"):
- `<AddressInput id="address" v-model="workOrder.address" :action="action" label="" ... />` — reemplaza el
  `AppTextField` simple que existía antes de la validación de coordenadas.
- Abre un sub-diálogo anidado (dentro del mismo `DialogComponent`) con 6 campos: Vía (`AppAutocomplete`,
  catálogo `parameters.type_via`), Numero Vía, Eje (E/N/O/S), Segunda vía, Numero Predio, Información
  Adicional. Si Vía = "Otra" (`OTR`), colapsa a solo Vía + Información Adicional.
- `applyAddress()` concatena las partes en un string único: `"{tipoVía} {numVía} {eje} # {segundaVía} -
  {predio} {infoAdicional}"` (confirmado en vivo: seleccionar "Calle"+10+E+20+30+texto produjo
  `"CL 10 E # 20 - 30 PRUEBA-EXPLORACION-..."`) y lo asigna a `workOrder.address` (mismo campo `varchar(255)`
  de siempre, sin cambio de esquema backend).
- **Orden de campos confirmado sin cambios** respecto a la 2ª pasada del 25/08: Fecha Programada/Municipio,
  Responsable/Dirección, Barrio/PQR/Tipo de Servicio, Detalle — **ya sin el campo Ubicación al final**
  (el `VCol` de Ubicación + su `v-show="action !== 'store'"` fueron removidos del template).
- **Confirmado por 3 vías** que el hallazgo de coordenadas del 25/08 no aplica más de la misma forma:
  el `POST mobile-work-orders/v0/store` real capturado en esta sesión **no lleva `latitude`/`longitude`**
  en el body (la responsabilidad de esas 2 columnas vuelve a no estar cubierta desde el encabezado de
  AIO web; las coordenadas de la orden en sí — no las "_service" de ejecución — quedan sin capturar desde
  este formulario tras el rediseño). Esto es un hallazgo de código, no se investigó si es intencional
  (fuera de alcance técnico).
- **Registro de prueba**: `mobile.work_orders.id=1014` (company $AIO_COMPANY_ID), creado 100% por UI real (Municipio
  "BOGOTA", Responsable "JOHN FREDY MARULANDA", Dirección vía `AddressInput` con Vía=Calle,
  Numero=10, Eje=E, Segunda vía=20, Predio=30, Info adicional=`PRUEBA-EXPLORACION-20260826`). Ejercitado:
  Crear (`POST store` confirmado), Ver (modal simple sin stepper, `Solicitada`), Editar (modal simple,
  campo Barrio editado a `...+"-EDITADO"`, `PUT update/1014` confirmado con toast "Datos de orden de
  trabajo editados con éxito."). **Limpieza**: `DELETE mobile-work-orders/v0/delete/1014` vía `curl` con
  token de sesión (`POST /api/login`, token en `data.user.token`). BD verificada en 0 filas para
  `address ILIKE '%PRUEBA-EXPLORACION-20260826%'`.
- **Bloqueo/gotcha de entorno reafirmado**: el primer intento de abrir el diálogo "Agregar" con
  `browser_click` seguido de `browser_take_screenshot` mostró el diálogo cerrado (no se abrió o se cerró
  solo); consolidar apertura+llenado en un único `browser_evaluate` con sleeps funcionó de forma
  consistente. Los `VAutocomplete` de `AioDataFetcherSelect`/`AddressInput` **sí responden a eventos
  `input` sintéticos** (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` +
  `dispatchEvent(new InputEvent('input', {inputType:'insertText'}))`) siempre que se despache **carácter
  por carácter** con pausas de ~15-60ms (escribir el string completo de una vez no dispara el debounce
  `@update:search` de forma confiable). Un residuo de diálogos apilados (Ver/Editar quedaron abiertos sin
  cerrar de una iteración previa) causó que `document.querySelector('.v-dialog .v-card')` devolviera el
  diálogo equivocado (el primero, no el "Agregar" recién abierto) — mitigado cerrando todos los diálogos
  abiertos en bucle (`while` + click en "Cerrar"/"Cancelar") antes de reintentar, y usando siempre
  `dialogs[dialogs.length - 1]` (el más reciente) en vez de `querySelector` simple cuando puede haber
  más de un `VDialog` apilado.

## Actualización 2026-08-26 — swiper de evidencias (`WorkOrderAttachments.vue`) y marca de agua (backend)
Validación EN VIVO complementaria (ciclo completo AIO web → AMI → backend, ver detalle de ejecución en
`modules/ami-operaciones-ordenes-de-trabajo.md`), enfocada en 2 puntos técnicos del lado de visualización:

**1. Wizard de evidencias (`WorkOrderAttachments.vue`, paso 5 del wizard `Ejecutada`/`Finalizada`)**: usa
`swiper/element/bundle` (`register()` en `onMounted`) con `<swiper-container loop centered-slides
navigation>` — reemplaza un carrusel previo roto. Cada `swiper-slide` envuelve un `VImg` que abre un
`VDialog` con la imagen a tamaño completo al hacer click. Las imágenes vienen de `GET
mobile-work-orders/v0/get-attachment/{id}` (`CustomWorkOrderController::getAttachment`, sin middleware de
permiso) y se arman como `data:image/${type};base64,${file}`. No se pudo re-verificar visualmente el
swiper en esta sesión porque el ciclo de prueba fue vía inyección directa en AMI + sync (no se volvió a
abrir el wizard de "Ver" en AIO web sobre la orden ejecutada antes de limpiar los datos) — **queda
pendiente de una futura pasada** si se necesita capturar el swiper con evidencia real en pantalla; el
componente en sí se leyó completo por código y no tiene señales de estar roto (import correcto, `register()`
llamado, estructura de slides válida).

**2. Marca de agua en evidencias — CONFIRMADA visualmente, aplicada de forma síncrona (no job en cola)**.
Cadena completa verificada por código + en vivo:
- `App\Services\Modules\Mobile\WorkOrder\CustomMobileWorkOrderService::storeData()` (dentro de la misma
  `DB::transaction` del `POST mobile-work-orders/v0/mobile/store-data`) llama `updateWorkOrder()` **antes**
  de `storeWorkOrderAttachment()` por cada adjunto — importante: el orden garantiza que `latitude_service`/
  `longitude_service`/`end_date` ya estén escritos en el `WorkOrder` en memoria cuando se estampa la
  evidencia.
- `storeWorkOrderAttachment(WorkOrder $workOrder, array $data)` → `applyEvidenceWatermark()` (privado): si
  `latitude_service`/`longitude_service` están vacíos, **devuelve la imagen sin marcar** (defensivo, no
  aborta la transacción) — **confirmado en vivo**: una evidencia inyectada sin coordenadas (orden 1017,
  primera pasada) se guardó en BD sin marca (2373 bytes decodificados, idénticos a la imagen original salvo
  el paso por PHP, visualmente sin overlay).
- Con coordenadas presentes (orden 1016, segunda pasada, `latitude_service=4.710989`,
  `longitude_service=-74.072092`, Bogotá): `OsmService::getAddress()` resuelve la dirección real
  ("Avenida Calle 127 - Transversal 60"), y `ImageWatermarkService::applyWatermarkToBase64Image()`
  (`app/Services/Common/Base/ImageWatermarkService.php`) estampa 4 líneas con emoji+sombra
  (📌 dirección, 🕒 fecha de ejecución `end_date`, 🌐 `Lat:.., Lng:..`, 🏢 razón social de la empresa) en la
  esquina inferior izquierda, y re-codifica a JPEG calidad 90 — **confirmado visualmente descargando el
  bytea de `mobile.work_order_attachments` y decodificándolo**: la imagen de prueba (fondo azul liso,
  2529 bytes originales) llegó a BD con **12060 bytes** y las 4 líneas de texto blanco con sombra negra
  perfectamente legibles, exactamente el patrón esperado por la tarea. El tamaño casi 5× mayor por sí solo
  ya es indicio fuerte de que el estampado ocurrió (texto sobre imagen plana añade mucha entropía a un JPEG).
- **Patrón reusado de otro módulo** (Prestación de Servicio Respel, según el comentario del propio código):
  "patrón síncrono, como Prestación de Servicio de Respel" — el watermark se aplica en el mismo request de
  sincronización, no hay `Job`/cola involucrada para Órdenes de Trabajo (a diferencia de otros adjuntos del
  sistema que sí usan `ProcessXAttachmentJob` en `app/Jobs/Modules/...`, ver `QueueNames.php`).
- **Workaround usado para poder probar el watermark sin GPS/cámara real** (documentado en detalle en
  `modules/ami-operaciones-ordenes-de-trabajo.md`): tras inyectar la evidencia directo en SQLite local de
  AMI, hubo que **además** escribir `latitude_service`/`longitude_service` directamente en la fila local de
  `work_orders` (no solo en el `localStorage` de `currentWorkOrderData`, que se pierde al re-seleccionar la
  orden desde la lista — `WorkOrder.vue::onSelectWorkOrder` sobreescribe `currentWorkOrderData.workOrder`
  completo con la fila de SQLite). Sin ese paso, el primer intento (orden 1017) sincronizó con coordenadas
  vacías y el backend, correctamente, no estampó nada — confirma que el comportamiento defensivo del
  backend funciona como está documentado en su propio código.

## Actualización 2026-08-25 (2ª pasada, mismo día) — validación del ORDEN de campos tras ajuste de layout
Se re-validó EN VIVO `WorkOrderAddForm.vue` (rama `feature/sergio-10691`, sin commitear) tras un ajuste
de layout posterior a la validación de coordenadas de más abajo. **Orden confirmado por código
(`VCol md=6/4/12` en secuencia) Y por UI (placeholders leídos del DOM + captura visual)**:
1. Fecha Programada (md=6) / Municipio (md=6)
2. Responsable (md=6) / Dirección (md=6)
3. Barrio (md=4) / Numero de PQR (md=4) / Tipo de Servicio (md=4)
4. Detalle de la solicitud (md=12, ancho completo)
5. **Ubicación (md=6) — ÚLTIMO campo de datos**, antes del switch `active` (oculto en `store`) y el
   botón flotante "Editar". Ya **no** aparece entre Dirección y Barrio (posición histórica documentada
   más abajo en el hallazgo original ya estaba corregida desde la 1ª pasada; esta 2ª pasada confirma
   que el layout en filas de 2/3/1 columnas tampoco rompió el orden).
- **Registro de prueba de esta 2ª pasada**: `mobile.work_orders.id=10`, company_id=$AIO_COMPANY_ID, creado 100% por
  UI real (incl. Municipio "BOGOTA", Responsable "JOHN FREDY MARULANDA" vía buscadores remotos, y
  selección de coordenadas por clic en el mapa Leaflet). Confirmado en 3 vías: (a) UI — el modal
  "Agregar Orden de Trabajo" muestra los 9 campos en el orden exacto de arriba; (b) red — `POST
  mobile-work-orders/v0/store` con body `"latitude":"5.239606","longitude":"-73.410644"` (no nulos);
  (c) BD — `mobile.work_orders.id=10` con esas coordenadas pobladas.
- **Ver** (estado `Solicitada`): modal simple "Leer Orden de Trabajo" **sin stepper** (`.stepper-icon-step`
  ausente del DOM) — confirmado.
- **Editar** (estado `Solicitada`): modal simple editable (`input[name=address].readOnly === false`).
  Se editó `neighbordhood` → `PRUEBA-EXPLORACION-20260825-EDITADO` y se guardó con el botón flotante
  "Editar"; `PUT mobile-work-orders/v0/update/10` (200) y BD reflejan el cambio.
- Estado forzado a `Ejecutada` (`UPDATE` directo y reversible sobre el registro propio, mismo patrón ya
  usado en la 1ª pasada). **Editar** en `Ejecutada`: abre el **wizard de 5 pasos**
  (`.stepper-icon-step` presente) con encabezado de solo lectura (`input[name=address].readOnly ===
  true`) — confirmado.
- **Finalizar** (botón `tabler-circle-check` de la fila, con diálogo de confirmación "Confirmar"): `PUT
  update/10` → `status='Finalizada'` (confirmado en BD). Tras Finalizar, la fila queda con **solo el
  botón Ver** (Editar/Anular/Finalizar desaparecen) — confirmado.
- **Anular**: se revirtió el estado a `Ejecutada` (BD, reversible, registro propio) para poder ejercitar
  el botón Anular (`tabler-trash`) por UI real. Confirmado: `status='Anulada', active=false` en BD; la
  fila vuelve a quedar con **solo Ver**.
- **Limpieza**: `DELETE mobile-work-orders/v0/delete/10` vía `curl` con token obtenido por `POST
  /api/login` (con `device_name` requerido — el token está en `data.user.token` en esta versión del
  backend, no en `data.token`). Verificado por SQL: `mobile.work_orders` y `staff_work_orders` de
  company_id=$AIO_COMPANY_ID en **0 filas**; UI confirma "No data available".
- **Bloqueo/inestabilidad de entorno (no bug de la app)**: los `.v-dialog` de este módulo se **cierran
  solos entre llamadas de herramienta MCP** incluso cuando la única acción intermedia es un
  `browser_take_screenshot` o un `browser_snapshot` (no solo `browser_click`/`ref`, como decía la nota
  previa). Mitigación que funcionó: consolidar cada flujo completo (abrir diálogo → llenar N campos →
  abrir sub-diálogo del mapa → click en Leaflet → Aceptar → Guardar) en **un único
  `browser_evaluate` async con `await sleep(...)` entre pasos**, sin ninguna llamada de herramienta
  intercalada; solo se tomó `browser_screenshot`/`browser_network_requests` **después** de que el flujo
  ya había terminado (guardado o cerrado).

## Actualización 2026-08-25 (1ª pasada, rama `feature/sergio-10691`) — cierra el "Hallazgo crítico" de abajo
Se validó EN VIVO un cambio (sin commitear al momento de la validación) que **cierra el gap de
coordenadas** documentado más abajo y **cambia el comportamiento Ver/Editar** según el estado de la
orden. Archivos tocados (`git diff` contra `desa`, ambos sin commit):
- `src/views/pages/mobile/work-orders/forms/WorkOrderAddForm.vue`
- `src/views/pages/mobile/work-orders/WorkOrderWizard.vue`

**1. Campo "Ubicación" en el formulario de encabezado** (`WorkOrderAddForm.vue`):
- Nuevo `VTextField` readonly (`class="location-field"`, icono `tabler-map-2`) que al hacer click
  (`openLocationMap()`) abre `PointGPSDialog` (mismo componente reutilizable ya documentado abajo).
  Precarga el punto si `latitude`/`longitude` ya existen (`POINT(${longitude} ${latitude})`).
- Al aceptar (`updateDataModalPointGps()`), parsea el WKT `POINT(lng lat)` devuelto con
  `match(/-?\d+\.\d+/g)` y asigna `workOrder.value.longitude = coords[0]`,
  `workOrder.value.latitude = coords[1]` (2 columnas separadas, no WKT único — como ya advertía la
  nota de implementación de abajo). El campo muestra `"${latitude}, ${longitude}"` (`locationDisplay`
  computed).
- **Confirmado en vivo por 3 vías**: (a) UI — clic en el campo abre el mapa Leaflet, clic en un punto
  coloca marcador, "Aceptar" cierra el mapa y el campo pasa a mostrar `"5.261495, -74.289550"`; (b)
  red — el `POST mobile-work-orders/v0/store` real capturado ahora **sí** incluye
  `"latitude":"5.261495","longitude":"-74.289550"` en el body (antes iban ausentes); (c) BD — el
  registro creado (`mobile.work_orders.id=5`, company_id=$AIO_COMPANY_ID) quedó con `latitude=5.261495`,
  `longitude=-74.289550` pobladas (`latitude_service`/`longitude_service` siguen NULL, no forman
  parte de este cambio).
- El resto de campos obligatorios (Fecha Programada, Municipio "BOGOTA", Responsable "JOHN FREDY
  MARULANDA", Dirección, Tipo de Servicio "Alcantarillado", Detalle) se llenaron y guardaron sin
  problema — el `StoreWorkOrderRequest` ya aceptaba `latitude`/`longitude` desde antes (`nullable|
  string|max:255`), así que no hizo falta tocar el backend.

**2. `WorkOrderWizard.vue` — modal simple vs wizard de 5 pasos, según `workOrderData.status`**:
- Nuevo computed `isExecuted = ['Ejecutada', 'Finalizada'].includes(status)`. Si es `false`
  (`Solicitada`/`Anulada`), el template renderiza **solo** `WorkOrderAddForm` dentro de un `VForm`
  (sin `AppStepper` ni las `VWindowItem` de Personal/Materiales/Herramientas/Evidencia). Si es `true`,
  se mantiene el wizard completo de 5 pasos (comportamiento previo, documentado abajo).
- **Confirmado en vivo**: con la orden en `Solicitada`, tanto **Ver** como **Editar** abren un modal
  simple (`hasStepper: false` verificado en DOM — sin `.stepper-icon-step-bg`/`.header-wizzard`); con
  la orden en `Ejecutada` (forzada por `UPDATE` directo y reversible sobre el registro propio),
  **Editar** vuelve a abrir el wizard de 5 pasos (`hasStepper: true`).
- Nuevo computed `headerAction = props.action === 'update' && status === 'Ejecutada' ? 'read' :
  props.action`, pasado como `:action` al `WorkOrderAddForm` del paso 1 **solo dentro de la rama del
  wizard** (en la rama de modal simple se sigue usando `props.action` tal cual, así que
  Solicitada+Editar sigue editable). Efecto: en el wizard (Ejecutada/Finalizada), el encabezado
  siempre es de solo lectura aunque la acción global sea `update` — confirmado en vivo:
  `input#address` (o el que corresponda) queda `readOnly=true` y el botón flotante "Editar"
  (`.fixed-button-container`, que en el formulario solo se muestra si `action==='update'`) queda con
  `offsetParent=null`/rect en cero (oculto por el propio `v-show` del formulario, ya no por CSS
  externo). Personal/Materiales siguen editables en `Ejecutada` (confirmado: paso "Personal" muestra
  botón "Agregar" real) — ese comportamiento no cambió, ya estaba documentado abajo y no fue tocado
  por este diff (`StaffWorkOrder.vue`/`WorkOrderDetail.vue` no aparecen en el `git diff`).
- **Nota de estado no cubierta por la tarea**: con `Solicitada`/`Anulada` renderizando el modal
  simple, ya no hay forma en el frontend web de ver/editar Personal/Materiales/Herramientas/Evidencia
  de una orden `Anulada` con datos previos, porque el wizard completo solo se monta si
  `Ejecutada`/`Finalizada`. No se investigó si eso es intencional (regla de negocio, fuera de alcance
  técnico de esta validación).

**Registro de prueba de esta validación**: `mobile.work_orders.id=5`, company_id=$AIO_COMPANY_ID, creado 100% por
UI real incl. selección de coordenadas por mapa. Ejercitado: Crear (con Ubicación), Ver (modal
simple, Solicitada), Editar (modal simple editable, Solicitada), `UPDATE` directo a `Ejecutada`
(reversible, registro propio), Editar (wizard, encabezado solo lectura, paso Personal con "Agregar"
disponible). **Limpieza**: `DELETE mobile-work-orders/v0/delete/5` vía `curl` con token de sesión real
(el intento inicial vía `fetch()` desde la consola del navegador fue bloqueado por CORS al pedir
`credentials:'include'` contra un backend con `Access-Control-Allow-Origin: *` — no es un bug de la
app, es una limitante de hacer la llamada cross-origin manual desde la consola en vez de por `$api`;
sin efecto porque `curl` sí completó el borrado). Verificado por SQL:
`mobile.work_orders`/`staff_work_orders` de company_id=$AIO_COMPANY_ID en **0 filas**; UI muestra "No data
available".

**Bloqueos de esta validación**: ninguno bloqueante. Inestabilidad ya conocida (ver "Bloqueos" al
final): los `.v-dialog` de este módulo se siguieron cerrando solos entre llamadas de herramienta que
usan el snapshot de accesibilidad (`browser_snapshot`/`browser_click` con `ref`); mitigado consolidando
cada paso del formulario en un único `browser_evaluate` con eventos sintéticos
(`pointerdown→mousedown→pointerup→mouseup→click`) y sin intercalar `browser_snapshot`. Un HMR fallido
transitorio (`500` al recargar `WorkOrderWizard.vue`, con el consiguiente
`Failed to fetch dynamically imported module`) apareció una vez al inicio de la sesión, antes de
empezar a interactuar; se resolvió solo con una navegación completa (`browser_navigate`) — no volvió a
ocurrir y no está relacionado con el código de los 2 archivos tocados.

Ruta front: `http://localhost:5173/mobile/work-orders` (subject `/mobile/work-orders`,
`action: 'read'` — `src/pages/mobile/work-orders/index.vue`). Módulo de creación/gestión de Órdenes
de Trabajo desde AIO web; la **ejecución real** (agregar Personal/Materiales/Herramientas/Evidencias
con datos reales de campo) ocurre desde **AMI** vía
`POST mobile-work-orders/v0/mobile/store-data` (`CustomMobileWorkOrderController::storeData` →
`CustomMobileWorkOrderService::processData`) — no explorado en esta sesión (fuera de alcance, la
tarea pidió solo el módulo web).

## Permisos
- Subject `/mobile/work-orders` (CRUD estándar: create/read/update/delete). Verificado con el
  usuario de prueba (rol Administrador): todas las acciones visibles.
- Backend: `routes/api/v0/Modules/Mobile/work_orders.php` — cada ruta CRUD lleva
  `permission:/mobile/work-orders,<accion>` (READ/CREATE/UPDATE/DELETE). `get-select-data` y
  `get-attachment/{id}` **sin** middleware de permiso.
- **Patrón "bandera"**: el botón **Finalizar** se autoriza con `$can('read', '/mobile/work-orders-approve')`
  (subject distinto, no CRUD propio de esta tabla) —
  `src/views/pages/mobile/work-orders/WorkOrderTable.vue:329`.
- Los submódulos embebidos (Personal, Materiales, Herramientas) reciben `subject="/mobile/work-orders"`
  explícito (mismo permiso, no tienen subject propio) — `WorkOrderWizard.vue`.

## Rutas / endpoints (`work_orders.php`, prefix `/mobile-work-orders`)
| Método | Endpoint | Controlador@método | Dispara desde UI |
|---|---|---|---|
| GET | `/v0/get-all` | `WorkOrderController@index` → `IWorkOrderService::listAll` | Tabla (listar/paginar/filtrar) |
| POST | `/v0/store` | `WorkOrderController@store` (`StoreWorkOrderRequest`) | Botón **Agregar** |
| GET | `/v0/show/{id}` | `WorkOrderController@show` | **Ver**, **Editar** (mount de `WorkOrderWizard`), Finalizar/Anular (releen antes de actualizar) |
| PUT | `/v0/update/{id}` | `WorkOrderController@update` (`StoreWorkOrderRequest`) | **Editar** (guardar encabezado), **Finalizar**, **Anular** (los 3 reusan el mismo PUT, solo cambia el payload `status`/`active`) |
| DELETE | `/v0/delete/{id}` | `WorkOrderController@destroy` | **NINGUNA acción de UI la usa** — el frontend nunca llama a `delete()` (existe en `WorkOrderService.ts` pero ningún componente lo invoca); el "eliminar" de la tabla es en realidad el botón **Anular** (soft-delete vía `update` con `status='Anulada', active=false`) |
| POST | `/v0/duplicate/{id}` | `WorkOrderController@duplicate` | Sin botón en UI (código muerto de frontend; existe endpoint) |
| POST | `/v0/export-data` | `WorkOrderController@exportData` | Botón **Exportar** (encola notificación de export, patrón estándar `CustomNotificationService`) |
| GET | `/v0/get-select-data` | `WorkOrderController@getSelect` | No usado por este módulo (helper genérico) |
| GET | `/v0/get-attachment/{id}` | `CustomWorkOrderController@getAttachment` | Tab Evidencia (`WorkOrderAttachments.vue`, no ejercitado a fondo) |

Submódulos hijos (mismo patrón `DataTable.vue` genérico, filtrado por `work_order_id`):
- `staff-work-orders` (Personal) → rutas en `staff_work_orders.php`, mismo permiso `/mobile/work-orders`.
- `work-order-details` (Materiales) → `work_order_details.php`.
- `work-order-tools` (Herramientas) → `work_order_tools.php`.
(No se leyó el detalle interno de estos 3 controladores en esta sesión — su comportamiento de
habilitado/deshabilitado se validó desde el frontend, ver "Flujo de estados" abajo.)

## Modelo / tabla
`App\Models\Modules\Mobile\WorkOrder\WorkOrder` → tabla `mobile.work_orders`.
- `$fillable`: incluye `latitude`, `longitude`, `latitude_service`, `longitude_service`, `km`
  (columnas **existen y son escribibles**, pero **ningún componente de frontend las puebla nunca** —
  confirmado por grep en `src/views/pages/mobile/work-orders/**` y por el payload real del `POST
  store` capturado en vivo, ver "Hallazgo crítico" abajo).
- `$appends`: `company_name`, `creator_name`, `municipality_name`, `user_operator_name`,
  `municipality_data` (`{id,name}`), `user_operator_data` (`{id,name}`).
- Relaciones: `companies` (belongsTo Company), `municipality` (belongsTo Municipality), `user`
  (belongsTo User vía `created_by`), `userOperator` (belongsTo User vía `user_operator_id`),
  `workOrderDetails`/`staffWorkOrders`/`workOrderTools`/`workOrderAttachments` (hasMany).
- Sin `onDelete cascade` observado en las FK hijas (no verificado a fondo — el `DELETE` real de
  backend no se usa desde el front, y en esta sesión se usó vía API solo para limpieza final).

## Request / validación backend
`StoreWorkOrderRequest` (usado por `store` Y `update`):
- `company_id`/`municipality_id`/`user_operator_id`: `ForeignKeyExists`.
- `address`: required|string|max:255. `request_description`: required|string|max:1500.
- `status`: nullable|string|`in:Solicitada,Ejecutada,Finalizada,Anulada`.
- **`latitude`/`longitude`/`latitude_service`/`longitude_service`: `nullable|string|max:255`** — el
  backend SÍ acepta coordenadas (como texto libre, sin validar formato numérico/WKT), pero nada en
  el frontend las envía nunca.
- `scheduled_date`: required|date + regla custom `ValidateScheduledDateRule`
  (`app/Http/Rules/Modules/Mobile/WorkOrders/ValidateScheduledDateRule.php`, no auditada en detalle
  esta sesión).
- `type_service`: required|string|`in:Acueducto,Alcantarillado` (aunque el frontend puebla las
  opciones dinámicamente desde `parameters` con `key=service_type_work_orders` — si ese parámetro
  llegara a tener un valor fuera de esas 2 opciones, el backend lo rechazaría).

## Frontend — artefactos técnicos
- **Página**: `src/pages/mobile/work-orders/index.vue` — 1 sola tab ("workOrders") vía componente
  genérico `Tabs`.
- **Tabla**: `src/views/pages/mobile/work-orders/WorkOrderTable.vue` — `VDataTable` manual (no usa el
  `DataTable.vue` estándar), estado `dataWorkOrders`/`itemsMeta` propios, `updateDataTable()` llama
  `WorkOrderService.getAll(current_page, filters)`. Columna `status` con `StatusChip` (4 estados con
  color). Botones de fila con `v-if` por estado (ver tabla de abajo).
- **Botones superiores**: `src/views/pages/mobile/work-orders/buttons/WorkOrderButtonsTable.vue`
  (Exportar/Buscar/Agregar, patrón `ExportItem` + 2× `DialogComponent`).
- **Form de creación/edición/búsqueda (ÚNICO, reusado por las 3 acciones vía prop `action`)**:
  `src/views/pages/mobile/work-orders/forms/WorkOrderAddForm.vue`. Campos → payload:
  - `scheduled_date` (`AppDateTimePicker`/flatpickr, `minDate` = ayer) → `scheduled_date`.
  - `municipality_data` (`AioDataFetcherSelect` sobre `MunicipalityService.getAllSearchable`,
    filtro `{active:true, country_id: dataCurrentUserCompany.country_id}`) → resuelto a
    `municipality_id` en `handlerData()`.
  - `user_operator_data` (`AioDataFetcherSelect` sobre `UserService.customGetAll`, filtro
    `{active:true}`, busca por `name` — **NO por email**, confirmado en vivo: buscar "admin" da 0
    resultados aunque ese sea el email de login; hay que buscar por nombre/apellido real) →
    `user_operator_id`.
  - `address` (`AppTextField`, required+maxLength) → `address`.
  - `neighbordhood` (`AppTextField`, opcional) → `neighbordhood`.
  - `pqr_number` (`AppTextField`, opcional, max 30) → `pqr_number`.
  - `type_service` (`AppAutocomplete`, items desde `ParametersService.getAll(1,{key:'service_type_work_orders',active:true})`,
    valor `;`-separado) → `type_service`.
  - `request_description` (`AppTextarea`, required, max 1500) → `request_description`.
  - `active` (`VSwitch`, oculto en `action==='store'` con `v-show`) → `active`.
  - **NO existe ningún campo de latitud/longitud, ni botón que abra un mapa** (`PointGPSDialog` o
    similar) en este formulario. Confirmado por lectura de código Y por el payload real capturado en
    la petición `POST store` (ver Hallazgo crítico).
  - En creación, `status` se fija a `'Solicitada'` siempre (`handlerData()`:
    `if (workOrder.value.status === undefined) statusWorkOrder = 'Solicitada'`).
- **Wizard de Ver/Editar**: `src/views/pages/mobile/work-orders/WorkOrderWizard.vue` — **(histórico,
  ver "Actualización 2026-08-25" arriba para el comportamiento vigente)**. Hasta el
  `feature/sergio-10691`, era `AppStepper` horizontal de **5 pasos SIEMPRE** (Orden de Trabajo,
  Personal, Materiales, Herramientas de Trabajo, Evidencia), montado igual para `action='read'` y
  `action='update'` sin condicional que lo redujera a modal simple. **Desde 2026-08-25**: modal
  simple (solo `WorkOrderAddForm`) si `status` es `Solicitada`/`Anulada`; wizard de 5 pasos con
  encabezado de solo lectura si `status` es `Ejecutada`/`Finalizada`. Cada paso es un componente hijo
  que recibe
  `:action`, `:work-order-id`, `:status-work-order` (excepto Evidencias, que no recibe
  `status-work-order`):
  - Paso 1: `WorkOrderAddForm` (mismo componente de creación, con los datos ya cargados).
  - Paso 2: `StaffWorkOrder.vue` → `DataTable.vue` genérico + `StaffWorkOrderModel.json`, filtro
    `{work_order_id}`.
  - Paso 3: `WorkOrderDetail.vue` (Materiales) → ídem con `WorkOrderDetailModel.json`.
  - Paso 4: `WorkOrderTool.vue` (Herramientas) → mismo patrón (no inspeccionado línea a línea, mismo
    esqueleto que Personal/Materiales).
  - Paso 5: `WorkOrderAttachments.vue` (Evidencias) — no ejercitado en vivo (subir archivo real
    fuera de alcance de esta sesión).

## Flujo de estados (validado en vivo)
| Estado | Encabezado (paso 1) editable | Personal/Materiales/Herramientas | Botones de fila visibles |
|---|---|---|---|
| **Solicitada** | Sí (`action='update'`) | Bloqueado: sin botón "Agregar", tabla sin columna Acciones — `getButtonDisabled()` en `StaffWorkOrder.vue`/`WorkOrderDetail.vue` devuelve la lista completa deshabilitada cuando `statusWorkOrder === 'Solicitada'` | Ver, Editar, Anular |
| **Ejecutada** | Sí (confirmado: `input[name=address]` con `readOnly=false`) | **Desbloqueado**: aparece botón "Agregar" (confirmado en vivo, capturas) | Ver, Editar, Anular, **Finalizar** (requiere permiso `/mobile/work-orders-approve`) |
| **Finalizada** | — (fila sin Editar/Anular/Finalizar) | — | Solo Ver |
| **Anulada** | — | — | Solo Ver |

- **No existe ninguna acción en el frontend web que mueva `Solicitada → Ejecutada`.** Ese estado
  solo se alcanza desde AMI (`storeData`/`processData`, fuera de alcance). Para validar el
  comportamiento de UI en `Ejecutada` se hizo un `UPDATE` directo y reversible sobre el registro de
  prueba propio (autorizado por las reglas del módulo — verificación en BD local).
- **Finalizar** y **Anular** son ambos, técnicamente, el MISMO `PUT update/{id}`: releen el registro
  con `show()`, cambian `status` (y `active=false` solo en Anular) y reenvían el objeto completo.
  No hay endpoint dedicado `finish`/`annul` en el backend — toda la lógica de transición vive en el
  frontend (`WorkOrderTable.vue: updateFinishWorkOrder`/`updateAnuledWorkOrder`).
- Confirmado en vivo: tras **Finalizar**, la fila pierde Editar/Anular/Finalizar (solo Ver). Tras
  revertir a `Solicitada` (BD, registro propio) y usar **Anular**, la fila también pierde todas las
  acciones salvo Ver, y el registro queda `active=false`.

## Hallazgo crítico — captura de coordenadas (histórico, corregido el 2026-08-25)
**Este gap fue cerrado** por el cambio de `feature/sergio-10691` documentado en "Actualización
2026-08-25" arriba (campo "Ubicación" + `PointGPSDialog` en `WorkOrderAddForm.vue`). Se deja el
hallazgo original como referencia histórica de por qué faltaba y cómo se diagnosticó:

**Confirmado por 3 vías independientes que NO existe forma de capturar Latitud/Longitud al crear ni
editar una Orden de Trabajo desde AIO web:**
1. **Código**: `WorkOrderAddForm.vue` no importa `PointGPSDialog` ni ningún componente de mapa; no
   hay `v-model` para `latitude`/`longitude`/`latitude_service`/`longitude_service` en ningún lugar
   del árbol de componentes del módulo.
2. **UI en vivo**: el modal "Agregar Orden de Trabajo" muestra exactamente 8 campos (Fecha
   Programada, Municipio, Responsable, Dirección, Barrio, Numero de PQR, Tipo de Servicio, Detalle
   de la solicitud) — ninguno de coordenadas, ningún botón de mapa.
3. **Red + BD**: el `POST mobile-work-orders/v0/store` real (capturado con
   `browser_network_request`) NO incluye ninguna de las 4 claves de coordenadas en el body; el
   registro creado (`id=4`) quedó con `latitude`/`longitude`/`latitude_service`/`longitude_service`
   en `NULL` en `mobile.work_orders` (verificado por SQL).

El **backend sí soporta** las 4 columnas (`nullable|string|max:255` en `StoreWorkOrderRequest`,
`$fillable` en el modelo) — el gap es puramente de frontend (formulario incompleto respecto a lo que
el backend ya acepta).

### Componente reutilizable recomendado para cerrar el gap
`src/components/dialogs/PointGPSDialog.vue` — mapa Leaflet en un `VDialog`, click para colocar/quitar
un único marcador. **Contrato**: `v-model:dataModalPointGps` = objeto `{isDialogVisible: Ref<boolean>,
pointGps: Ref<string|null>, action: Ref<string>, nameInput: Ref<string>}`; al aceptar, emite
`update:dataModalPointGps` con `pointGps` en formato **WKT `POINT(lng lat)` (un solo string, NO
lat/lng separados)** — construido en `acceptData()`:
`` `POINT(${lng.toString().slice(0,10)} ${lat.toString().slice(0,8)})` ``. Reusado hoy en 8+ formularios
(ej. `ProvisionServiceScheduleForm.vue`: botón abre el diálogo, el padre asigna
`schedule.value.scheduled_location = dataModal.pointGps` a una única columna WKT).
**Importante para quien implemente la HU**: `WorkOrder` NO tiene una columna WKT única — tiene 4
columnas de texto separadas (`latitude`, `longitude`, `latitude_service`, `longitude_service`). Para
reusar `PointGPSDialog` tal cual habría que **parsear** el `POINT(lng lat)` devuelto y separarlo en
2 campos numéricos antes de asignarlo (patrón distinto al resto de módulos que usan una columna WKT
directa) — no es una integración de 1 línea.

## Registro de prueba y limpieza
- Creado por UI real (todos los campos, incl. Municipio "BOGOTA" y Responsable "JOHN FREDY
  MARULANDA" vía los buscadores remotos reales): `mobile.work_orders.id=4`, company_id=$AIO_COMPANY_ID,
  `pqr_number`/`address`/`neighbordhood`/`request_description` con prefijo
  `PRUEBA-EXPLORACION-20260825`.
- Ejercitado: Ver (wizard 5 pasos, solo lectura), Editar (guardado real vía `PUT update/4`),
  Finalizar (vía `UPDATE` directo a `Ejecutada` + botón real "Finalizar" → `status='Finalizada'`),
  reversión a `Solicitada` (BD, registro propio) para poder ejercitar **Anular** por UI real
  (`status='Anulada', active=false`, confirmado en BD).
- **Limpieza final**: dado que el módulo no tiene un "Eliminar" real en la UI (solo Anular =
  soft-delete), se purgó el registro con el endpoint `DELETE mobile-work-orders/v0/delete/4` del
  propio backend del módulo (vía `curl` con token de sesión real, mismo endpoint que
  `WorkOrderService.ts::delete()` expone pero que ningún componente invoca). Verificado por SQL:
  `mobile.work_orders` de company_id=$AIO_COMPANY_ID y sus 4 tablas hijas (`staff_work_orders`,
  `work_order_details`, `work_order_tools`, `work_order_attachments`) en **0 filas** — mismo estado
  que al inicio. UI confirma "No data available".

## Bloqueos
Ninguno bloqueante. Notas de entorno (no bugs de la app):
- **`ERR_INSUFFICIENT_RESOURCES`** al primer intento de abrir el diálogo "Agregar" (Vite dev server
  sirviendo ~9000 módulos sin bundlear satura conexiones concurrentes del navegador) — se resolvió
  recargando la página; no volvió a ocurrir.
- **Inestabilidad ya documentada en `learnings.md`**: los `VDialog persistent` de este módulo se
  cerraron solos varias veces entre llamadas de herramienta (sin relación con el código del módulo);
  mitigado consolidando cada flujo en un único `browser_evaluate` idempotente.
- Warning de consola menor (no bloqueante): falta la clave i18n `'Solicitada'` en `es`/`en`
  (`[intlify] Not found 'Solicitada' key`) — aparece al montar el wizard; no rompe funcionalidad,
  candidato a limpieza de i18n (no se investigó dónde se usa `$t('Solicitada')`).

## Comparación con el manual (2026-08-25)
Manual de usuario: `manua-web/docs/AIO/Mobile/Maestros/Operaciones/OrdenesTrabajo.md` (sitio:
`/Manual/docs/AIO/Mobile/Maestros/Operaciones/OrdenesTrabajo`).
- **Crear**: el manual lista Fecha Programada, Municipio, Responsable, Dirección, Barrio, N° PQR, Tipo de
  Servicio, Detalle — **NO menciona la captura de Ubicación (Latitud/Longitud)** que agregó
  `feature/sergio-10691` (campo "Ubicación" con modal-mapa `PointGPSDialog`). → **Manual desactualizado**.
- **Ver**: el manual muestra siempre las secciones Personal/Materiales/Herramientas/Evidencia; **no
  refleja** el nuevo modal-simple (Solicitada/Anulada) vs wizard de 5 pasos (Ejecutada/Finalizada). →
  **desactualizado**.
- **Editar**: el manual dice editable en Solicitada/Ejecutada; **no menciona** que en Ejecutada el
  encabezado queda solo-lectura (solo personal/materiales/herramientas). → matiz nuevo no documentado.
- **Finalizar / Anular**: coinciden con el manual.
- **Compuerta**: hay brechas → el manual requiere actualización (lat/long + modal-simple/wizard) vía skill
  `update-web-manual` (pendiente, gated por el usuario).
