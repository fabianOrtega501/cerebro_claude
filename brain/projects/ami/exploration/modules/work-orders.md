# AMI (móvil) → Operaciones → Órdenes de Trabajo (ejecución de campo)

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

- App: `app-movil` (Ionic/Capacitor), rama `feature/sergio-10691`. Backend: `aio-backend` (mismo del
  módulo AIO web). Ruta app: `/operations/import-data` (Importar Datos), `/operations/work-orders`
  (consulta + wizard de ejecución), `/operations/send-data` (Enviar Datos). Estado: **explorado
  (validación E2E en vivo del flujo revivido + validación visual del wizard rediseñado de 6 pasos +
  validación de textos i18n exactos, validador de materiales, chips de estado en tema claro/oscuro
  aproximado, y marca de agua confirmada visualmente en la evidencia sincronizada)**.
  Actualizado: 2026-08-26.

## Actualización 2026-08-26 — validación puntual de textos exactos, validador de materiales, chips de estado (claro/oscuro) y marca de agua
Sesión de seguimiento (misma rama `feature/sergio-10691`, sin commitear), enfocada en confirmar EXACTO lo
pedido por la tarea (no una reexploración completa). Sembrado por UI real desde AIO web (`AddressInput`,
ver `modules/mobile-operaciones-ordenes-de-trabajo.md`): 3 órdenes `mobile.work_orders` (ids 1015/1016/1017,
company $AIO_COMPANY_ID, `user_operator_id` reasignado a `1` — admin — vía `UPDATE` reversible porque el buscador de
Responsable en AIO web resolvió por defecto a otro usuario, "JOHN FREDY MARULANDA"). Materiales/
work_tools de prueba: `mobile.materials.id=16`, `mobile.work_tools.id=16`.

**Todo lo pedido por la tarea PASA, confirmado por código + captura en vivo**:
- **Consulta (`WorkOrder.vue`)**: chip de estado con punto de color + texto en color sobre fondo tenue
  (`status-pending` naranja/`--ion-color-warning-shade`, `status-inprogress` azul/`--ion-color-primary`,
  `status-executed` verde/`--ion-color-success`, todas con `rgba(...)` de fondo al 16-18% opacidad) y chip
  de tipo delineado (`.type-chip`, `border: 1px solid var(--ion-color-medium)`, fondo transparente) —
  **las 3 tarjetas PENDIENTE/EN PROCESO/EJECUTADA capturadas simultáneamente en la misma lista** (se
  provocó cada estado real: 1015 sin tocar = PENDIENTE; 1016 con solo materiales agregados localmente =
  EN PROCESO vía `WorkOrderService.getInProgressOrderIds()`; 1017 finalizado por wizard completo =
  EJECUTADA vía `completed=1` local). **Tema oscuro**: no existe toggle in-app (Ionic usa
  `@media (prefers-color-scheme: dark)` puro en `src/theme/variables.css`, sin clase manual) — se simuló
  inyectando un `<style>` con los mismos valores hexadecimales del bloque `@media` real de Ionic
  (`--ion-color-success:#2fdf75`, `--ion-color-warning-shade:#e0bb2e`, `--ion-color-primary:#2359c5`,
  fondo `#121212`/tarjetas `#1e1e1e`) sobre la página ya renderizada; los 3 chips siguieron perfectamente
  legibles con buen contraste. Es una aproximación por CSS, no un verdadero cambio de
  `prefers-color-scheme` a nivel de motor (el MCP no expone `emulateMedia`), pero usa los valores reales
  del propio archivo de tema, no inventados — evidencia suficiente de que el diseño no depende de hacks
  visibles solo en claro.
- **Textos i18n exactos confirmados en vivo (no solo por código)**:
  - Paso Detalle: caption bajo el textarea = **"Descripción de lo Solicitado"** (clave
    `requestedDescriptionHelper` en `es.json`/`en.json`, línea 323) — coincide exactamente con lo pedido
    (ya no es "Describe lo solicitado" como se había visto en una pasada anterior; el texto fue corregido).
  - Paso Materiales: al exceder la cantidad gastada (probado 10 solicitada / 20 gastada), aparece
    **exactamente** `"* La cantidad gastada no puede ser mayor a la solicitada."` (clave
    `usedExceedsRequested`) bajo el campo Gastada — validador `usedNotGreaterThanRequested()` en
    `WorkOrderDetailsData.vue:142-149`, se dispara al intentar avanzar (`handleNext`/`validateInputs`),
    no al perder foco.
  - Paso Finalizar: **Kilometraje** (`NumberInputComponent`, opcional, `max-length=9`) y **Observaciones**
    con contador visible **"0 / 1500"** en vivo, subiendo en tiempo real al escribir (confirmado
    "67 / 1500" y "82 / 1500" tras escribir observaciones de prueba) — `TextareaComponent :max-length="1500"`
    en `EndWorkOrder.vue:50` (antes era 250 en una exploración previa; el límite fue ampliado a 1500).
  - Caption del stepper en cada paso: **"Paso N de 6 · {etiqueta}"** confirmado literal en los 6 pasos
    (ej. "Paso 1 de 6 · Detalle de la solicitud", "Paso 2 de 6 · Materiales", ... "Paso 6 de 6 · Finalizar
    orden") — `StepProgress.vue`, ya documentado en la pasada anterior, reconfirmado aquí.
- **Marca de agua**: ver detalle técnico completo (backend) en
  `modules/mobile-operaciones-ordenes-de-trabajo.md` → sección "Actualización 2026-08-26 — swiper... y
  marca de agua". Resumen desde el lado AMI: el `latitude_service`/`longitude_service` que el backend
  necesita para estampar viene de `EvidenceData.vue::getGeolocation()` (llamada antes de la cámara, no
  disponible en navegador headless — `CapacitorException: Not implemented on web`), guardado en
  `localStorage` (`current-work-order-data`) y finalmente persistido en la fila LOCAL de `work_orders`
  recién en `EndWorkOrder.vue::onSubmitForm → workOrderService.closeWorkOrder(...)`. **Gotcha nuevo**: si
  se reinyectan coordenadas manualmente solo en el `localStorage` de `currentWorkOrderData` (sin tocar la
  fila SQLite `work_orders`), se pierden en cuanto se vuelve a la lista y se reselecciona la orden
  (`WorkOrder.vue::onSelectWorkOrder → saveInLocal()` sobreescribe `currentWorkOrderData.workOrder`
  completo con la fila de SQLite, que no las tiene) — hubo que hacer `UPDATE work_orders SET
  latitude_service=?, longitude_service=? WHERE id=?` directo sobre la fila SQLite local (vía el mismo
  truco de `import('/src/services/app/DatabaseService.ts')`) para que sobrevivieran hasta el `Finalizar` +
  sync. Primera pasada sin este fix (orden 1017) sincronizó con coordenadas vacías y, correctamente, el
  backend NO estampó nada (comportamiento defensivo esperado); segunda pasada con el fix (orden 1016,
  coordenadas reales de Bogotá) sí estampó — imagen verificada visualmente con las 4 líneas
  (📌 dirección real resuelta por OSM, 🕒 fecha, 🌐 lat/lng, 🏢 razón social).

**Limpieza completa confirmada** (BD backend + BD local AMI + filesystem virtual):
- Backend: `DELETE` de `work_order_details`/`staff_work_orders`/`work_order_tools`/`work_order_attachments`
  para los 3 `work_order_id` (1015/1016/1017) + los propios `work_orders` + `materials.id=16` +
  `work_tools.id=16`. Verificado: `mobile.work_orders` de company $AIO_COMPANY_ID en **0 filas**; 0 huérfanos en las 4
  tablas hijas (`LEFT JOIN` contra `work_orders` sin coincidencia = 0 filas en las 4).
- Local AMI: la orden 1016 (sincronizada con éxito) quedó en 0 filas sola vía `deleteSent()`. La orden
  1015 (nunca ejecutada, sin datos hijos) se borró manualmente (`DELETE FROM work_orders WHERE id=1015`,
  sin filas hijas que limpiar). Confirmado `SELECT id FROM work_orders` → `[]`.
- Filesystem virtual de Capacitor: los 2 archivos de evidencia inyectados
  (`evidencia_inicial_prueba_1016.jpg`, `evidencia_inicial_prueba_1017.jpg`) borrados con
  `Filesystem.deleteFile`.
- UI de "Órdenes de Trabajo" (AMI) y de AIO web confirman ambas listas vacías tras la limpieza.

**Bloqueos**: ninguno bloqueante. Reafirma el aprendizaje ya documentado (inyección directa vía
`window.Capacitor.Plugins.<Plugin>` / `import('/src/services/app/DatabaseService.ts')` para bypassear
GPS/cámara no disponibles en Chrome headless) y agrega el gotcha nuevo de `localStorage` vs SQLite arriba.

Complementa (no duplica) a `modules/mobile-operaciones-ordenes-de-trabajo.md`, que documenta el lado
AIO web (creación/gestión de la OT por el despachador). Este archivo documenta el lado **AMI**: el
líder de cuadrilla importa la OT ya creada en AIO, la ejecuta en campo (Personal/Materiales/
Herramientas/Evidencias/Finalizar) y la sincroniza de vuelta.

## Resumen de la validación en vivo
Preparación: seed determinista en BD (`mobile.work_orders` id=7, `company_id=$AIO_COMPANY_ID` $AIO_COMPANY_NAME,
`user_operator_id=1` $AIO_TEST_EMAIL, `status='Solicitada'`, `scheduled_date=hoy`; más 1
`mobile.materials` y 1 `mobile.work_tools` de la empresa, y 1 `public.staff` ya existente
`company_staff`-vinculado a la empresa). **Migración pendiente aplicada**: la columna `mobile
.work_orders.km` (feature `feature/sergio-10691`, migración
`database/migrations/2026_08_25_130000_add_km_to_work_orders_table.php`) no estaba corrida en la BD
local; se ejecutó `php artisan migrate --path=...` dentro del contenedor `aio-backend-laravel.test-1`
(reversible con `down()` del propio archivo, no se tocó código).

Flujo ejercitado end-to-end: **Importar Datos** (4 tarjetas, incl. las 2 nuevas) → **Órdenes de
Trabajo** (consulta, wizard completo Detalle→Materiales→Personal→Herramientas→Evidencias→Finalizar)
→ **Enviar Datos** → verificación en BD backend → **limpieza completa** (BD backend + BD local AMI +
filesystem local).

**Workaround de evidencia** (cámara/GPS no disponibles en Chrome headless vía Playwright MCP): el flujo
real de "Evidencia Inicial" primero pide geolocalización (`GeolocationService.getCurrentPosition` →
Capacitor `Geolocation.requestPermissions` → `CapacitorException: Not implemented on web`), lo que
dispara la alerta *"No es posible continuar con el proceso porque la ubicación del dispositivo se
encuentra desactivada"* y bloquea `getPhoto1()` antes de invocar la cámara. Esto es una limitación del
entorno (no hay GPS/cámara real en el navegador headless), no un bug de la app. Se inyectó una
evidencia mínima **directamente en el storage local del propio AMI** (no en la UI):
1. `window.Capacitor.Plugins.CapacitorSQLite` → `INSERT INTO work_order_attachments (work_order_id,
   photo_number, file_name, type, file) VALUES (7,1,'evidencia_inicial_prueba','jpg','data:image/
   jpeg;base64,...')` (mismo esquema que usa `WorkOrderService.storeAttachment`).
2. **Además** fue necesario escribir el archivo real en el Filesystem virtual de Capacitor
   (`window.Capacitor.Plugins.Filesystem.writeFile({path:'evidencia_inicial_prueba.jpg',
   directory:'DATA', data: <base64 sin prefijo>})`), porque `EvidenceData.vue → getPhotosDB() →
   loadPhoto()` (composable compartido `usePhotoService` en `src/composables/usePhotoGallery.ts:394-419`)
   **no lee la columna `file` de la fila de la BD para pintar la miniatura** — solo la usa como
   bandera de existencia; la miniatura real la relee siempre vía `Filesystem.readFile({path, directory:
   Directory.Data})` a partir de `file_name`+`.`+`type`. Con solo el INSERT en SQLite, `Filesystem
   .readFile` lanzaba `Error: File does not exist.` y la tarjeta seguía mostrando el ícono de cámara
   (foto no "cargada" pese a existir la fila). Con el archivo también escrito, `getPhotosDB()` renderizó
   la miniatura correctamente y `validateData()` dejó de bloquear "Debe tomar la evidencia inicial."
   Limpieza: se borró la fila de `work_order_attachments` (vía el propio flujo de `deleteSent()` al
   sincronizar, ver abajo) y el archivo inyectado (`Filesystem.deleteFile`).

**Registro de prueba y limpieza confirmada**:
- Sembrado: `mobile.work_orders.id=7`, `mobile.materials.id=1`, `mobile.work_tools.id=1` (staff
  reutilizado, ya existente: `public.staff.id=5263`, sin insertar).
- Ejercitado como líder de cuadrilla real (UI): import (Personal/Materiales/Herramientas/Órdenes de
  Trabajo), selección de la orden, Materiales (+1, cantidad solicitada 10 / gastada 8), Personal (+1),
  Herramientas (+1), Evidencias (evidencia inicial inyectada por el workaround), Finalizar (Fecha
  Inicio `2026-08-25 12:00`, Fecha Fin `2026-08-25 12:13`, Kilometraje `12345`, Observaciones), Enviar
  Datos (sync real contra backend).
- **Verificado en backend tras el sync**: `mobile.work_orders.id=7` con `status='Ejecutada'`,
  `km=12345.00`, `observations`, `start_date`/`end_date` pobladas; 1 fila en `work_order_details`
  (`used_quantity=8`, `requested_quantity=10`), 1 en `staff_work_orders` (`staff_id=5263`), 1 en
  `work_order_tools`, 1 en `work_order_attachments` (`file_name='evidencia_inicial_prueba'`, `type=
  'jpg'`, `287` bytes).
- **Limpieza**: `DELETE` manual de las 4 tablas hijas + `work_orders.id=7` + `materials.id=1` +
  `work_tools.id=1` en la BD backend (verificado en `0` filas por cada `SELECT COUNT`). La BD local de
  AMI (SQLite vía `CapacitorSQLite`) **ya había quedado vacía sola**: tras un sync exitoso,
  `WorkOrderService.deleteSent(id)` (`src/services/app/modules/operations/work-order/
  WorkOrderService.ts:246-252`) borra en cascada `work_order_details`/`staff_work_orders`/
  `work_order_tools`/`work_order_attachments`/`work_orders` del id sincronizado — confirmado por
  `SELECT` vacío en las 5 tablas locales tras el envío. El archivo de evidencia inyectado se borró con
  `Filesystem.deleteFile`. UI de "Órdenes de Trabajo" (consulta) confirma lista vacía tras la limpieza.

## Permisos
AMI **no usa CASL por ruta** como AIO web: las rutas del router (`src/router/index.ts:187-213`) solo
llevan `meta: { requireAuth: true }` (sesión válida), sin `subject`/`action` por pantalla. El control de
acceso real ocurre en el **backend** al llamar cada endpoint:
- `GET /mobile-work-orders/v0/mobile/get-all/{companyId}/{userId}`: sí lleva
  `middleware('permission:/mobile/work-orders,READ')` (mismo subject `/mobile/work-orders` que usa el
  módulo AIO web).
- `POST /mobile-work-orders/v0/mobile/store-data`: **sin middleware de permiso** (solo exige sesión
  Sanctum vía el resto del stack de la app) — asimetría respecto al `get-all`, confirmada leyendo
  `routes/api/v0/Modules/Mobile/work_orders.php:29-34`.
- `GET /staff/v0/mobile/get-all/{companyId}`, `GET /materials/v0/mobile/get-all/{companyId}`, `GET
  /work-tools/v0/mobile/get-all/{companyId}`: usados por la tarjeta "Datos Generales" (no auditados sus
  middlewares en esta sesión, ya existían antes del feature).

## Rutas / Endpoints (los nuevos de `feature/sergio-10691`)
| Método | Endpoint | Controlador@método → Servicio@método | Dispara desde AMI |
|---|---|---|---|
| GET | `/mobile-work-orders/v0/mobile/get-all/{companyId}/{userId}` | `CustomMobileWorkOrderController@getAll` → `CustomMobileWorkOrderService::getAll` | Tarjeta "Órdenes de Trabajo" en Importar Datos (`importWorkOrders()`, `ImportData.vue:375-388`) |
| POST | `/mobile-work-orders/v0/mobile/store-data` | `CustomMobileWorkOrderController@storeData` → `CustomMobileWorkOrderService::processData`/`storeData` | Tarjeta "Ordenes de Trabajo" en Enviar Datos (`sendWorkOrders()`, `SendData.vue:339-381`) |

Endpoints preexistentes reutilizados por "Datos Generales" (`importGeneralData()`,
`ImportData.vue:355-368`, título de la tarjeta cicla Personal→Materiales→Herramientas→"Datos
Generales"): `GET /staff/v0/mobile/get-all/{company}`, `GET /materials/v0/mobile/get-all/{company}`,
`GET /work-tools/v0/mobile/get-all/{company}`.

## Servicios backend
- `App\Services\Modules\Mobile\WorkOrder\CustomMobileWorkOrderService` (`app/Services/Modules/Mobile/
  WorkOrder/CustomMobileWorkOrderService.php`):
  - `getAll(companyId, userId)`: `Auth::id() ?? $userId` como operador real (no confía en el userId de
    la URL); filtra `WorkOrder::where('company_id',...)->where('user_operator_id', $operatorId)
    ->where('status','Solicitada')->where('scheduled_date','<=',today())->where('active', true)`, con
    eager-load `workOrderDetails.material`, `staffWorkOrders.staff`, `workOrderTools.workTool`.
  - `processData(array $data)`: itera `data_get($data,'data',[])` (payload = `IWorkOrderToSend[]`) y
    llama `storeData` por cada orden; devuelve el array de ids procesados (usado por el front para
    reconciliar qué sincronizar/borrar local).
  - `storeData(array $dataCollected)`: envuelto en `DB::transaction`; desestructura
    `workOrder/workOrderDetails/staffWorkOrder/workOrderTools/attachments`; si algo lanza, hace
    `Log::error` y devuelve `0` (ese id NO se marca como procesado → sync parcial).
  - `updateWorkOrder(array $workOrderData)`: **solo** actualiza campos de ejecución (`status`,
    `start_date`, `end_date`, `observations`, `km`, `latitude_service`, `longitude_service`,
    `updated_by`) — no permite mass-assignment de `company_id`/`user_operator_id`/etc. Busca por `id`
    Y `user_operator_id = Auth::id()`; si no existe, lanza `RuntimeException` (esa orden no se marca
    como procesada, resto del batch continúa).
  - `storeWorkOrderDetails/storeWorkOrderStaff/storeWorkOrderTool`: `updateOrCreate` con clave
    compuesta que incluye `created_by`/`updated_by` (no solo `work_order_id`+FK hijo).
  - `storeWorkOrderAttachment`: decodifica el base64 (recorta el prefijo `data:...;base64,` con
    `substr`/`strpos`), lo pasa por `pg_escape_bytea` para la columna `bytea` de Postgres.

## Modelos / Tablas
- `mobile.work_orders`: columna nueva `km numeric(10,2) nullable` (migración `2026_08_25_130000_add_
  km_to_work_orders_table.php`, comentario en columna). `$fillable` del modelo
  (`App\Models\Modules\Mobile\WorkOrder\WorkOrder`) incluye `km`.
- Tablas hijas sin cambios de esquema: `mobile.work_order_details` (`used_quantity`,
  `requested_quantity`), `mobile.staff_work_orders`, `mobile.work_order_tools`,
  `mobile.work_order_attachments` (`file bytea`).
- FK relevante para el seed: `mobile.work_orders.company_id → companies.id`,
  `mobile.materials.company_id`/`mobile.work_tools.company_id → companies.id`,
  `mobile.staff_work_orders.staff_id → public.staff.id` (vía `company_staff` para saber qué staff
  pertenece a qué empresa, no hay FK directa staff↔company).

## Frontend AMI (técnico)
- **Importar Datos** — `src/views/pages/modules/operations/ImportData.vue`:
  - `setTablesImportData()` arma 4 tarjetas (`ITableImport[]`): Elementos, Despachos, **Datos
    Generales** (nueva, `function: importGeneralData`), **Órdenes de Trabajo** (nueva, `function:
    importWorkOrders`).
  - `importGeneralData(index)`: loop `[{name:'Personal',fn:importStaff},{name:'Materiales',
    fn:importMaterials},{name:'Herramientas',fn:importWorkTools}]`, reasigna
    `tablesImport.value[index].label` en cada paso y lo vuelve a `"Datos Generales"` al terminar —
    mismo patrón que el combo de Prestación de Servicio (CPS), reutilizado.
  - `importWorkOrders()`: `workOrderService.deleteAllByUserCompany(userId, companyId)` (limpia local
    antes de traer) → `workOrderApi.getAll(companyId, userId)` → `workOrderService.storeOrUpdate` por
    cada registro.
  - `hasPendingDataToSend()` guard en `onIonViewWillEnter`: si hay OT completadas o Elementos
    pendientes de enviar, redirige a `/operations/send-data` con warning (no deja importar encima de
    datos sin sincronizar).
- **Wizard de ejecución** — `src/views/pages/modules/operations/work_order/WorkOrderPage.vue`
  (orquestador de 7 `currentSection`, todas montadas condicionalmente con `v-if`, se remonta cada vez
  que se activa): 1=`WorkOrder.vue` (listar/buscar/seleccionar), 2=`DetailRequest.vue` (detalle,
  solo lectura), 3=`WorkOrderDetailsData.vue` (Materiales), 4=`StaffData.vue` (Personal),
  5=`EquipmentsData.vue` (Herramientas), 6=`EvidenceData.vue` (Evidencias), 7=`EndWorkOrder.vue`
  (Finalizar). `submitForm()` exige al menos 1 registro en `staff_work_orders`, 1 en
  `work_order_details` y 1 en `work_order_attachments` (via `getAllAttachments()` sin filtrar por
  `work_order_id`, cuidado si hay más de 1 orden local con adjuntos) antes de permitir cerrar; llama
  `workOrderService.closeWorkOrder({...workOrder, status:'Ejecutada', completed:1})`.
  - `WorkOrderDetailsData.vue`/`StaffData.vue`/`EquipmentsData.vue`: patrón idéntico —
    `SelectDataFetcher` (autocomplete remoto sobre servicio local ya importado) + botón `addCircle` que
    hace `INSERT` inmediato en SQLite local (no espera al "Siguiente"); persiste aunque se navegue away
    y vuelva.
  - `EndWorkOrder.vue` (Finalizar): **nuevo campo "Kilometraje"** (`NumberInputComponent`, `max-length
    9`, opcional — no lleva `requiredValidator`) entre Fecha Fin y Observaciones. `saveInLocal()`
    guarda `{observations, start_date, end_date, km}` en `currentWorkOrderData` (composable
    `getCurrentWorkOrderData`/`setCurrentWorkOrderData`, persistido en `localStorage`).
    `onSubmitForm()` llama `workOrderService.closeWorkOrder(...)` (UPDATE local, sin cambiar `status`
    todavía — eso lo hace `WorkOrderPage.submitForm()` en el padre) y muestra confirm `alertController`
    antes de cerrar.
  - `EvidenceData.vue`: 2 tarjetas fijas — título exacto **"Evidencia Inicial (Obligatoria)"** (photo1,
    slot `getPhoto1()`) y **"Evidencia Adicional (Opcional)"** (photo2, `getPhoto2()`). Solo `photo1`
    es obligatoria (`validateData()`). `getPhoto1()` llama primero `getGeolocation()`
    (`GeolocationService.getCurrentPosition()`) — si falla, dispara `locationAlert()` y NO llega a
    invocar la cámara (`capturePhoto`); ese es el punto exacto del bloqueo en navegador headless.
- **Enviar Datos** — `src/views/pages/modules/operations/SendData.vue`:
  - `sendWorkOrders()`: `pendingWorkOrders` viene de `workOrderService.getByUserCompanyToSend(user,
    company)` (solo `completed=1`); trocea con `chunkBySize(..., WORK_ORDER_BATCH_MAX_COUNT=5,
    WORK_ORDER_BATCH_MAX_BYTES=5MB)` (las evidencias van en base64, de ahí el tope de peso) → por cada
    lote `workOrderApi.storeData(batch)` → `response.data` = array de ids procesados por el backend →
    por cada id: `workOrderService.deleteSent(id)` (borra local en cascada) y se filtra de
    `pendingWorkOrders`. Si un error de red trae `"unauthenticated"` en el mensaje, se re-lanza (expulsa
    a login); cualquier otro error de un lote individual solo se loggea (`logErrorService.storeError`)
    y el resto del batch continúa (sync parcial).
  - `showSyncResult(total, synced, "Ordenes de Trabajo")` (`useSyncResultMessage`,
    `src/composables/standard/useSyncResultMessage.ts`): si `synced === total` → `successToast(t(
    'syncDataSuccess', {module}))`; si `0 < synced < total` → `warningToast(t('syncDataPartial', {...}))`;
    si `synced === 0` → `warningToast(t('syncDataFailed', {...}))`. En esta validación fue el caso
    "éxito total" (`1/1`); no se vio el toast en captura (se disipa rápido), pero el código y la
    respuesta del backend (`data:[7]`, `status:'success'`) confirman la rama de éxito.
- **Servicio local** `src/services/app/modules/operations/work-order/WorkOrderService.ts`: capa sobre
  SQLite (`@capacitor-community/sqlite`, backend web = sql-wasm). `storeOrUpdate` hace `INSERT OR
  REPLACE` posicional (22 columnas, orden fijo — cualquier cambio de columnas en `CreateWorkOrderTables`
  obliga a mantener el orden en este INSERT). `closeWorkOrder` es un `UPDATE` parcial (no toca
  `company_id`/`municipality_id`/etc.). `deleteSent(id)` es el único punto que borra en cascada las 4
  tablas hijas + la orden.
- **Migración local** `src/database/migrations/AddKmToWorkOrdersTable.ts` (`ALTER TABLE work_orders ADD
  COLUMN km REAL;`), registrada en `src/database/NewMigrations.ts`.

## Gotcha de entorno (Playwright MCP + Capacitor en navegador)
- `Geolocation` y `Camera` de Capacitor lanzan `Not implemented on web` / piden permisos reales del
  navegador que Playwright headless no puede conceder de forma fiable para este flujo con GPS
  obligatorio antes de la cámara.
- Acceso directo a los plugins de Capacitor desde la consola del navegador: `window.Capacitor.Plugins
  .<PluginName>` (ej. `CapacitorSQLite`, `Filesystem`) — permite `open/query/run/close` SQL crudo y
  `writeFile/readFile/deleteFile` sobre el filesystem virtual, útil para inspeccionar/seed/limpiar el
  estado local de AMI sin pasar por la UI cuando un paso de hardware bloquea.
- `browser_click`/`browser_type` con `ref` de `browser_snapshot` fallan sistemáticamente en esta sesión
  (`"X" does not match any elements` o error de parseo de selector) — mitigado usando siempre
  selectores CSS/Playwright-locator explícitos como `target` (`ion-button:has-text(...)`,
  `text=...`, `elemento >> nth=-1`) en vez de los `ref`.
- Selects nativos de Ionic (`ion-select`) sí abren con `.click()` sintético, pero elegir la opción
  requiere clic real (Playwright) sobre el `ion-radio`/`ion-item` del popover — un `.click()` sintético
  vía `evaluate` sobre el `ion-item` no lo selecciona (se cierra el popover sin cambiar el valor).
- El diálogo pre-login "Código Identificación Empresa" (2 campos separados por "-") no es el NIT de la
  empresa de negocio: corresponde a `identification_code` de `company_endpoints` (entorno local:
  `"1-1"` → apunta a `http://localhost:8085/api`), una tabla de selección de backend/API, no de
  compañía.

## Validación visual del wizard rediseñado de 6 pasos (2026-08-25, segunda pasada)
Segunda validación en vivo, enfocada en el **rediseño visual** del wizard (`StepProgress.vue`, nuevo
componente untracked en `feature/sergio-10691`) y la tarjeta de consulta rediseñada de `WorkOrder.vue`
(Id=1, `mobile.materials.id=3`, `mobile.work_tools.id=3`, staff reutilizado `id=5263`; ids distintos a
la validación anterior porque quedaron libres tras la limpieza previa).

- **Consulta (`WorkOrder.vue`)**: confirmado 1:1 con el diseño esperado — tarjeta con label "ORDEN DE
  TRABAJO" + número grande, chip de estado (`status-pending`/`status-inprogress`/`status-executed`,
  clases CSS en `WorkOrder.vue:316-337`) y chip de tipo de servicio a la derecha, sección "UBICACIÓN"
  con Dirección/Barrio/Municipio, subtítulo `"{n} orden(es)"`. El chip de estado cambia dinámicamente
  sin recarga de datos: `PENDIENTE` → `EN PROCESO` (al reingresar tras guardar datos parciales, vía
  `inProgressIds` = `workOrderService.getInProgressOrderIds()`) → `EJECUTADA` (tras finalizar).
- **`StepProgress.vue`** (`src/views/pages/modules/operations/work_order/StepProgress.vue`, nuevo):
  6 segmentos (`v-for="n in total"`), clase `segment-done` (verde, `--ion-color-success`),
  `segment-current` (azul, `--ion-color-primary`) o `segment-pending`
  (`rgba(255,255,255,0.12)`) + caption `"Paso {current} de {total} · {label}"`. Verificado con
  `getComputedStyle` en los 6 pasos: 1 segmento current + N done + resto pending, avanzando
  correctamente en cada paso (incluida step 6 "Finalizar orden" con los 5 anteriores en done).
  **Hallazgo NO bloqueante**: el color `pending` (`rgba(255,255,255,0.12)`) es prácticamente invisible
  sobre el fondo blanco de la `ion-card` en este build (tema claro) — el segmento pendiente casi no se
  distingue visualmente del fondo de la tarjeta, aunque el DOM/CSS es correcto. Reportar si el diseño
  buscaba contraste también en tema claro.
- **Paso 1 Detalle (`DetailRequest.vue`)**: subtítulo `"Orden de trabajo {id} · {type_service}"`,
  helper-text "Describe lo solicitado" bajo el textarea de descripción (readonly). Confirmado.
- **Paso 2 Materiales (`WorkOrderDetailsData.vue`)**: empty state exacto ("Aún no hay materiales
  asignados" / "Selecciona arriba y agrégalos con el +"); tras agregar, "MATERIALES AGREGADOS · {n}" +
  tarjeta por material con nombre + ícono `trashOutline` + campos "SOLICITADA"/"GASTADA"
  (`NumberInputComponent`, digitables, confirmado tecleando 10/8 y viendo el valor persistir).
- **Paso 3 Personal (`StaffData.vue`, no listado en el diff pero mismo patrón)**: empty state "Aún no
  hay personal asignado" / "Selecciona arriba y agrégalo con el +"; tras agregar, "PERSONAL ASIGNADO ·
  {n}" + tarjeta con avatar circular de iniciales (ej. "LA"), nombre, "C.C. {identification_number}" +
  ícono de eliminar.
- **Paso 4 Herramientas (`EquipmentsData.vue`)**: **asimetría de diseño confirmada por código** — solo
  recibió `StepProgress` + el empty state nuevo ("Aún no hay herramientas asignadas" / "Selecciona
  arriba y agrégalas con el +"); la lista de herramientas agregadas **sigue con el diseño viejo**
  (tabla `ion-grid` con columnas Id/Nombre + ícono `removeCircle` rojo), no la tarjeta con
  `trashOutline` que sí recibieron Materiales y Personal. No es un bug — coincide con lo que pide la
  tarea (solo empty state) — pero es una inconsistencia visual real dentro del propio wizard rediseñado.
- **Paso 5 Evidencias (`EvidenceData.vue`)**: 2 tarjetas fijas "Evidencia Inicial (Obligatoria)" /
  "Evidencia Adicional (Opcional)" con ícono de cámara. Confirmado el mismo bloqueo de entorno ya
  documentado (geolocalización obligatoria antes de la cámara, `CapacitorException: Not implemented on
  web`) y aplicado el mismo workaround (insert directo en SQLite local `work_order_attachments` +
  `Filesystem.writeFile`), con un matiz nuevo: **el insert debe hacerse en el MISMO ciclo de vida SPA
  que el remount del paso** (no sobrevive a un `browser_navigate` de página completa) — un primer intento
  insertando y luego haciendo un `browser_navigate` completo perdió la fila (la escritura cruda vía
  `CapacitorSQLite.run()` a nivel de plugin, sin pasar por el objeto de conexión de la app, no persiste
  al store IndexedDB de `jeep-sqlite` entre reloads). Solución: insertar, y forzar el remount del
  componente navegando **dentro de la SPA** (ir a otra ruta del menú y volver a "Órdenes de Trabajo"),
  no con recarga completa del navegador. Tras esto, la miniatura cargó correctamente y
  `validateData()` dejó de bloquear.
- **Paso 6 Finalizar (`EndWorkOrder.vue`)**: confirmados Fecha Inicio, Fecha Fin (con validador
  "La fecha fin no puede ser inferior a la fecha inicio" — visto en vivo al dejar ambas en 12:00 exacto),
  Kilometraje (opcional) y Observaciones (0/250). Botón final cambia de flecha azul a check verde
  (`nextRequired=false` en `FormCard`) y pide confirmación `"¿Esta seguro que desea finalizar la orden de
  trabajo?"` antes de guardar.

**Registro de prueba (segunda pasada) y limpieza confirmada**:
- Sembrado: `mobile.work_orders.id=9` (address `"Calle 10 # 20-30 PRUEBA-EXPLORACION"`,
  `request_description` con prefijo `PRUEBA-EXPLORACION-WIZARD`), `mobile.materials.id=3`,
  `mobile.work_tools.id=3` (staff reutilizado `id=5263`).
- Flujo completo: Importar Datos (Datos Generales + Órdenes de Trabajo) → consulta → wizard 6 pasos
  (Materiales 10/8, Personal LUIS ALBERTO CRUZ TRUJILLO, Herramienta PRUEBA-EXPLORACION, evidencia
  inyectada, Finalizar con km=12345, observaciones `PRUEBA-EXPLORACION-WIZARD Validacion en vivo del
  wizard rediseñado`) → Enviar Datos (sync real, `Datos por enviar: 1 → 0`).
- **Verificado en backend tras el sync**: `mobile.work_orders.id=9` `status='Ejecutada'`, `km=12345.00`,
  `start_date`/`end_date`/`observations` correctos; 1 fila en cada tabla hija
  (`work_order_details` used=8/requested=10, `staff_work_orders` staff_id=5263, `work_order_tools`,
  `work_order_attachments` 160 bytes).
- **Limpieza**: `DELETE` manual de las 4 tablas hijas + `work_orders.id=9` + `materials.id=3` +
  `work_tools.id=3` en la BD backend (verificado `0` filas cada tabla). BD local AMI verificada vacía
  en las 5 tablas (`deleteSent()` cascada tras el sync, sin intervención manual). Archivo de evidencia
  inyectado borrado con `Filesystem.deleteFile`. UI de consulta confirma "0 órdenes / No hay órdenes de
  trabajo."

## Bloqueos
Ninguno bloqueante para el objetivo de la tarea. La única pared real (geolocalización/cámara no
disponibles en Chrome headless) fue superada con el workaround de inyección directa documentado arriba,
y quedó explícitamente señalada como limitación de entorno, no bug de la app.

## Comparación con el manual (2026-08-25)
Manual de usuario: `manua-web/docs/AMI/Operaciones/WorkOrder.md`.
- **Importar**: el manual dice "Se importará Personal, Materiales, Herramientas y Órdenes de Trabajo"
  (conceptualmente correcto) pero **no refleja la estructura de 2 tarjetas** que introdujo
  `feature/sergio-10691`: "Datos Generales" (combo Personal+Materiales+Herramientas con título cíclico) +
  "Órdenes de Trabajo". → **parcialmente desactualizado**.
- **Finalizar**: el manual **ya menciona el kilometraje del vehículo** → coincide con el nuevo campo `km`.
- **Evidencias**: el manual dice "requerida la primera foto, la segunda opcional" → coincide con
  "Evidencia Inicial (Obligatoria)" / "Evidencia Adicional (Opcional)".
- **Enviar Datos**: tarjeta "Órdenes de Trabajo" + Enviar Todo coinciden; el manual no describe los
  mensajes de sincronización (total/parcial/ninguna) que ahora usa el envío. → matiz nuevo.
- **Compuerta**: brecha menor (estructura de import de 2 tarjetas) → actualización de manual opcional vía
  `update-web-manual`, gated por el usuario.
