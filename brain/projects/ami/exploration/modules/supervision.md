# AMI (móvil) → Supervisión

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

- Ruta app (AMI): `/supervision/*` | Backend module: `Operation` (schema `operation`) + `Settings`
  (`operational_centers`, `shifts`) + módulo `Supervision` propio (`services`, `tipes_vehicles`,
  `download_locations`, `landfill_weight_controls`) | Estado: `importado, sin verificar`| Actualizado: 2026-09-03

Repo AMI: `app-movil/src/views/pages/modules/supervision/` (+ `inspection-closures/`). Backend:
`aio-backend` (`app/Http/Controllers/Modules/Operation/**`, `routes/api/v0/Modules/Operation/**`,
`routes/api/v0/Modules/Settings/operational_centers.php`). Login/company: $AIO_COMPANY_NAME (company_id 9),
validado en vivo contra `localhost:8085`/`localhost:8100`.

Offline-first: 5 sub-flujos comparten el mismo patrón AMI **importar → inspeccionar (SQLite local) →
enviar**. El header de cada inspección se guarda en la tabla local `supervisory_inspections`
(1 por visita/ruta/elemento/ubicación), con hijos `operation_process_inspections` (1 por tipo de
inspección aplicado) → `operation_inspection_results` (respuesta por pregunta) y
`operation_supervisory_attachments` (evidencias). Al enviar, el back crea `operation.supervisory_inspections`
+ `operation.process_inspections` + `operation.inspection_results` + `operation.inspections_attachments`
en una sola transacción por registro.

## Permisos (AMI no usa CASL)
Sin subject/ability; el acceso es por **menú local** (`authUser.menus[].url`, igual que otros módulos
AMI). Fuente única en `src/composables/Modules/supervision/useProcessFunction.ts`
(`SUPERVISION_PROCESS_MENUS`): mapea cada sub-flujo a un `menuUrl`, y `getAvailableProcesses(authUser)`
filtra qué tarjetas de Importar/Enviar (y por extensión, qué entradas de menú) ve el usuario.

| Proceso (`SupervisionProcessKey`) | Menú AMI | Sub-flujo |
|---|---|---|
| `scales` | `/supervision/bascula` | Control de Peso / Báscula |
| `dispatchs` | `/supervision/dispatchs` | Despachos |
| `land` | `/supervision/land` | Terreno |
| `locations` | `/supervision/locations` | Ubicaciones |
| `items` | `/supervision/items` | Elementos |

Backend: los endpoints CRUD estándar de `supervisory-inspections`/`inspection-closures`/
`landfill-weight-controls` usan `permission:/operations/inspections,<accion>` /
`permission:/operations/inspection-closures,<accion>` / `permission:/operations/landfill-weight-controls,<accion>`
respectivamente (mismo patrón que AIO web). Los endpoints **`store-mobile-data`** (los que usa AMI para
enviar) **no llevan middleware `permission:`**, solo `auth:sanctum` global — igual que en VehicleControl.
`operational-centers/v0/get-with-user` tampoco lleva middleware de permiso.

## Rutas de la app (AMI, `src/router/index.ts`)
Todas con `meta: { requireAuth: true }`, sin permiso CASL. Cada `Page.vue` es un wizard interno
(`currentSection` con `v-if`, NO sub-rutas de vue-router) — solo `/supervision/bascula` tiene dos rutas
reales (listado y formulario "Nuevo").

| Ruta | Componente | Rol |
|---|---|---|
| `/supervision/import-data` | `ImportData.vue` | Importar maestros de los 5 sub-flujos |
| `/supervision/send-data` | `SendData.vue` | Enviar pendientes (3 colas: control de peso, inspecciones, cierres de ruta) |
| `/supervision/bascula` | `Bascula/ScalesPage.vue` | Listado + edición in-place de controles de peso importados |
| `/supervision/bascula/form` | `Bascula/SupervisionPage.vue` | Alta MANUAL de un control de peso (sin API, 100% local) |
| `/supervision/dispatchs` | `dispatchs/DispatchPage.vue` | Wizard 5 pasos: `ServiceRoutes → SelectVehicle → InformationNews → InspectionComponent → EvidencesDispatch` |
| `/supervision/land` | `land/LandPage.vue` | Wizard 5 pasos: `LandServiceRoutes → LandSelectVehicle → LandInformation → LandInspectionComponent → LandEvidences` |
| `/supervision/locations` | `locations/LocationPage.vue` | Wizard 3 pasos: `LocationInformation → LocationInspectionComponent → LocationEvidences` |
| `/supervision/items` | `items/ItemPage.vue` | Wizard 4 pasos: `SelectItem → ItemObservation → InspectionItemComponent → ItemEvidences` |

`inspection-closures/InspectionClosureForm.vue` no tiene ruta propia: se abre como **modal** desde
`land/LandServiceRoutes.vue` (botón "Cerrar" sobre cada ruta) y también desde `dispatchs/ServiceRoutes.vue`
(mismo store local `inspection_closures`, mismo `IInspectionClosure`).

## Ticket 10777 — filtro `user_id` en Centro Operativo (Terreno/Despacho)
`land/LandServiceRoutes.vue` y `dispatchs/ServiceRoutes.vue` son los **ÚNICOS DOS** puntos que llaman
`OperationalCenterService.getAll` (local, `src/services/app/modules/settings/operational-centers/
OperationalCenterService.ts`) para poblar el selector "Centro Operativo":
`operationalCenterService.getAll({ user_id: authUser.value.id, company_id: companyId.value })`. Antes
solo filtraba por `company_id`. (`vehicleControl/ImportVehicleControlData.vue` y `.../ItemsForm.vue`
también importan `OperationalCenterService` pero solo usan `.delete()`/`.getInsert()`, no `.getAll()` con
ese filtro.)

`OperationalCenterService.getAll` (local) es un `SELECT * FROM operational_centers` + `getFiltersToQuery`
→ genera `WHERE user_id = ? AND company_id = ?` (igualdad estricta, sin `OR user_id IS NULL`).

La importación (`ImportData.vue::importOperationalCenters`) trae el maestro con
`OperationalCenterApi.getAllWithUserAuthenticated({ user_id, company_id })` → backend
`GET operational-centers/v0/get-with-user` → `CustomOperationalCenterController@getOCWithUser` →
`CustomOperationalCenterService::getOCWithUser` (`app/Services/Modules/Settings/OperationalCenter/
CustomOperationalCenterService.php:159`): `OperationalCenter` + `LEFT JOIN user_operational_centers uoc
ON uoc.operational_center_id = oc.id AND uoc.user_id = :userId`, con `WHERE oc.company_id = :companyId`
(el `user_id` solo condiciona el JOIN, **no** filtra filas) — **trae TODOS los centros de la empresa**,
con `user_id` = el del supervisor si está asignado o `NULL` si no. `storeMultiFromApi` guarda esa columna
`user_id` tal cual en la tabla local `operational_centers`.

**Validado en vivo (2026-09-03, company_id=$AIO_COMPANY_ID, user_id=1 $AIO_TEST_EMAIL):** la importación trajo 45
centros operativos, **los 45 con `user_id = NULL`** en SQLite local (confirmado por consulta directa a la
BD local vía `browser_evaluate`; en Postgres, `public.user_operational_centers` tiene 165 filas para
otros usuarios pero 0 para `user_id=1`). Al entrar a Terreno o Despachos, el filtro local `WHERE user_id =
1 AND company_id=$AIO_COMPANY_ID` no matchea ninguna fila `user_id NULL` → **el select "Centro Operativo" queda
vacío** y el sub-flujo no se puede continuar con un usuario sin asignación explícita en
`user_operational_centers`. Ver "Bloqueos".

## Servicios locales (SQLite, `BaseService`/clase propia) — tabla que tocan
| Servicio (archivo) | Tabla local | Notas técnicas |
|---|---|---|
| `OperationalCenterService` (`settings/operational-centers/`) | `operational_centers` | `getAll(filters)` genérico vía `getFiltersToQuery`; `storeMultiFromApi` guarda `user_id` de la asignación (o `null`) |
| `OperationalCenterServiceService` (`settings/operational-center-services/`) | `operational_center_services` | `getServicesByOperationalCenter(id)` — join a `services` local para el selector "Servicio" dependiente del Centro Operativo |
| `ShiftService` (`settings/shifts/`) | `shifts` | `getAll/find/deleteByFilters`, `storeMultiFromApi` |
| `ServicesService` (`supervision/`) | `services` | Catálogo de servicios de Supervisión (PK lógica `service_id`, no el `id` autoincremental) |
| `TipesVehiclesService` (`supervision/`) | `tipes_vehicles` | Catálogo tipos de vehículo de Supervisión (independiente del catálogo `type_vehicles` de Settings) |
| `DownloadLocationsService` (`supervision/`) | `download_locations` | `getByCompany`, usado por Ubicaciones y Báscula |
| `LandfillWeightControlsService` (`supervision/`) | `landfill_weight_controls` | CRUD local completo (`store/update/delete/getByCompany/getToSend` con joins a `services`/`tipes_vehicles`/`download_locations` para mostrar nombres); `closed=1` marca "listo para enviar" |
| `RouteService` (`operations/routes/`) | `routes` | `getAll/getTotal` paginado con filtro `pending`, `closure_date_number_different`; `setPendingRoute` (usado al eliminar en cascada una inspección de Terreno) |
| `ItemService` / `ItemTypeService` (`operations/items*`) | `items`, `item_types` | Compartidos con el módulo Elementos (ver `operaciones-maestros-elementos.md`); `inspection_pending` marca si un elemento ya fue supervisado |
| `InspectionService` (`operations/inspections/`) | `operation_inspections` | Catálogo de tipos de inspección importado (4 familias: `is_dispatch`, `is_dispatch+is_router`, `unloading_place`, `item_type_id NOT NULL`); `storeOnCascadeMulti` inserta también `operation_inspection_details` |
| `InspectionDetailService` (`operations/inspection-details/`) | `operation_inspection_details` | Preguntas/detalle del catálogo (con sus posibles respuestas embebidas al importar) |
| `SupervisoryInspectionService` (`operations/supervisory-inspections/`) | `supervisory_inspections` | **Header** de cada inspección de campo; `store` inserta con `user_id, company_id, service_id, route_id, item_id, download_location_id, vehicle_id, departure_date, mileage, identification, name, news, observations, latitude, longitude, execution_date, is_rescheduled`; `getAllOnCascade`/`deleteOnCascade` orquestan `process_inspections`+`attachments`+`routeService.setPendingRoute`+`itemService.update(inspection_pending)` |
| `ProcessInspectionService` (`operations/process-inspections/`) | `operation_process_inspections` | 1 fila por tipo de inspección aplicado a un `supervisory_inspection_id` |
| `InspectionResultService` (`operations/inspection-results/`) | `operation_inspection_results` | 1 fila por pregunta respondida (`inspection_detail_id`, `response_id`, `notes`) |
| `InspectionAttachmentService` (`operations/inspections-attachments/`) | `operation_supervisory_attachments` | Evidencias (fotos/firma) en base64, asociadas a `supervisory_inspection_id` |
| `InspectionClosureService` (`operations/inspection-closures/`) | `inspection_closures` | Cierre de ruta (solo Terreno/Despacho); `getAllOnCascade` arma `attachments` desde `InspectionClosureAttachmentService` |
| `InspectionClosureAttachmentService` (`operations/inspection-closure-attachments/`) | (tabla de adjuntos de cierre, patrón `BaseService`) | Evidencias del cierre de ruta |

## Servicios API (`BaseApi`, importar/enviar) — endpoint que consumen
Confirmados por código **y** por `browser_network_requests` en vivo (Importar Todo, company $AIO_COMPANY_ID):

| Clase (archivo) | Método | Endpoint backend | Controlador (backend) |
|---|---|---|---|
| `OperationalCenterApi` (`settings/operational-centers/`) | `getAllWithUserAuthenticated` | `GET operational-centers/v0/get-with-user?filter={active,company_id,user_id}` | `CustomOperationalCenterController@getOCWithUser` |
| `OperationalCenterApi` | `getServicesByCenters`→`getAllCenterServices` | `GET operational-center-services/v0/get-all?filter={active,operational_center_id:[...]}&per_page=all` | `OperationalCenterServiceController@index` |
| `ServicesApi` (`supervision/`) | `getAll` | `GET services/v0/get-all?filter={active}&per_page=all` | módulo Supervision `ServicesController` |
| `TipesVehiclesApi` (`supervision/`) | `getAllTipesVehicles` | `GET type-vehicles/v0/select-type-vehicles` | módulo Settings `TypeVehicleController` (select) |
| `ShiftApi` (`settings/shifts/`) | `getAll` | `GET shifts/v0/get-all?filter={active,company_id}&per_page=all` | `ShiftController@index` |
| `RouteApi` (`operations/routes/`) | `getAll` | `GET operation-routes/v0/mobile/get-all?filters={active,company_id}&per_page=500` (paginado) | `RouteController` (endpoint mobile dedicado) |
| `VehicleApi` (`settings/vehicles/`) | `customGetAll` | `GET vehicles/v0/custom-get-all?filters={active,user_id,validateUserBusinessUnits,vehicle_states:[1,5],company_id}&per_page=500|all` | `CustomVehicleController@getAllVehicles`-equivalente |
| `ItemTypeApi` (`operations/item-types/`) | `getAll` | `GET item-types/v0/get-all?filters={active}&per_page=all` | módulo Operation `ItemTypeController` |
| `ItemApi` (`operations/items/`) | `getAll` | `GET items/v0/mobile/get-all?filters={company_id,active,last_imported_date}&per_page=500` (paginado, incremental por `last_imported_date`) | `ItemController` (endpoint mobile dedicado) |
| `InspectionApi` (`operations/inspections/`) | `getAll` | `GET inspection-operations/v0/get-all-complete?filters={...}&per_page=all` (4 llamadas: dispatch / terreno / locations / items, un filtro distinto cada vez) | `InspectionsController@getAllComplete`-equivalente |
| `DownloadLocationsApi` (`supervision/`) | `getAllDownloadLocations` | `GET download-locations/v0/get-all?filter={active,company_id}&per_page=all` | módulo Operation `DownloadLocationController` |
| `LandfillWeightControlsApi` (`supervision/`) | `getAllControls` | `GET landfill-weight-controls/v0/get-all?filter={created_at:date}&per_page=all` | `LandfillWeightControlsController@index` |
| `LandfillWeightControlsApi` | `storeMobileData` (envío) | `POST landfill-weight-controls/v0/store-mobile-data` | **NO EXISTE en el backend** — ver "Bloqueos" |
| `SupervisoryInspectionApi` (`operations/supervisory-inspections/`) | `storeMobileData` (envío) | `POST supervisory-inspections/v0/store-mobile-data` | `CustomSupervisoryInspectionController@storeMobileData` |
| `InspectionClosureApi` (`operations/inspection-closures/`) | `storeMobileData` (envío) | `POST inspection-closures/v0/store-mobile-data` | `CustomInspectionClosureController@storeMobileData` |

Endpoints validados en vivo con `filter/filters` reales: `operational-centers/v0/get-with-user`
devolvió `company_id=$AIO_COMPANY_ID&user_id=1`; `vehicles/v0/custom-get-all` con `vehicle_states:[1,5]`;
`inspection-operations/v0/get-all-complete` se llamó 4 veces con `is_dispatch`, `is_dispatch=false&is_router=true`,
`unloading_place`, `is_item_type` respectivamente (mapea 1:1 a Despachos/Terreno/Ubicaciones/Elementos).

## Controladores (backend)
| Clase (archivo) | Métodos relevantes | Qué orquesta técnicamente |
|---|---|---|
| `CustomOperationalCenterController` (`Settings/OperationalCenter/`) | `getOCWithUser` | Lee `filter` (JSON), delega a `customOperationalCenterService->getOCWithUser($filters)` |
| `CustomSupervisoryInspectionController` (`Operation/SupervisoryInspection/`) | `storeMobileData`, `customGetAll`, `approve`, `getPdf` | `storeMobileData`: recorre el array recibido y llama a `processSupervisoryInspectionData` por cada uno, devuelve los ids procesados |
| `CustomInspectionClosureController` (`Operation/InspectionClosure/`) | `storeMobileData` | Igual patrón, para cierres de ruta |
| `LandfillWeightControlsController` / `CustomLandfillWeightControlsController` (`Operation/LandfillWeightControls/`) | `index/store/show/update/destroy/duplicate/exportData/getSelect/getPdf` | **Sin `storeMobileData`** (confirmado: no existe el método en ninguna de las 2 clases ni la ruta en `landfill_weight_controls.php`) |

## Servicios (backend)
| Clase (archivo) | Métodos | Responsabilidad técnica |
|---|---|---|
| `CustomOperationalCenterService` (`Services/Modules/Settings/OperationalCenter/`) | `getOCWithUser` | `OperationalCenter::query()->from('operational_centers as oc')->leftJoin('user_operational_centers as uoc', 'uoc.operational_center_id'='oc.id' AND (si hay userId) 'uoc.user_id'=userId)`, `where('oc.company_id', companyId)` si viene — el `user_id` es condición del JOIN, no filtro de filas |
| `CustomSupervisoryInspectionService` (`Services/Modules/Operation/SupervisoryInspection/`) | `storeMobileData`, `processSupervisoryInspectionData`, `customGetAll` | `processSupervisoryInspectionData` (`DB::transaction`): `isDuplicatedSupervisoryInspection` → `storeSupervisoryData` → si `news=true` crea `process_inspections`+`inspection_results` por cada item del array `inspections[]`; si no, `storeProcessInspectionDefault`; auto-aprueba si no hay respuestas relevantes (`approveSupervisoryIfNoRelevant`); crea `attachments` y dispara `ProcessInspectionAttachmentJob` (marca de agua async, igual patrón que VehicleControl); condicionalmente crea un `landfill_weight_control` (`isRequiredSaveLandfillWeightControls`) |
| `CustomInspectionClosureController`/Service equivalente | `storeMobileData` | Mismo patrón transaccional para el cierre de ruta y sus adjuntos |

## Query builders / Requests / Rules (backend)
| Artefacto | Archivo | Qué construye |
|---|---|---|
| `CustomSupervisoryInspectionService::customGetAll` | mismo archivo | Query builder inline sobre `operation.supervisory_inspections as si` con `LEFT JOIN operation.process_inspections as pi` + `LEFT JOIN operation.inspections as ip`, `selectRaw` con `CASE` para derivar `inspection_type` (`location/dispatch/terrain/element`) desde flags de `inspections`; join opcional a `operation.routes` si el filtro trae `operational_center_id`/`service_id`/`route_id` |
| (sin FormRequest dedicado) `storeMobileData` (supervisory-inspections / inspection-closures) | recibe `$request->all()` crudo (array de registros) — la validación de duplicados la hace el propio servicio (`isDuplicatedSupervisoryInspection`), no un Request | — |

## Modelos / Tablas / Migraciones (backend, Postgres)
| Modelo | Tabla | Notas técnicas |
|---|---|---|
| `OperationalCenter` | `public.operational_centers` | Sin schema propio (vive en `public`, no en `settings`) |
| `UserOperationalCenter` | `public.user_operational_centers` | Tabla de asignación supervisor↔centro; FK `user_id`, `operational_center_id`; en el ambiente de prueba, 165 filas para company $AIO_COMPANY_ID pero **0 para el usuario admin usado en la exploración** |
| `SupervisoryInspection` | `operation.supervisory_inspections` | Header; columnas igual a la interfaz local (`user_id, company_id, service_id, route_id, item_id, download_location_id, vehicle_id, departure_date, mileage, identification, name, news, observations, latitude, longitude, execution_date, is_rescheduled, status, approved_user, observations_approved_user`) |
| `ProcessInspection` (namespace Operation) | `operation.process_inspections` | FK `supervisory_inspection_id`, `inspection_id` |
| `InspectionResult` | `operation.inspection_results` | FK `process_inspection_id`, `inspection_detail_id`, `response_id` |
| `InspectionsAttachment`/`SupervisoryAttachment` | `operation.inspections_attachments` | FK `supervisory_inspection_id`; procesada async por `ProcessInspectionAttachmentJob` (marca de agua) |
| `Inspection` (namespace Operation) | `operation.inspections` | Catálogo; flags `is_dispatch`, `is_router`, `unloading_place`, `item_type_id` clasifican el tipo de inspección |
| `LandfillWeightControls` | `operation.landfill_weight_controls` | CRUD estándar completo; sin ruta/mobile de envío en lote (ver Bloqueos) |
| `InspectionClosure` | `operation.inspection_closures` (o equivalente) | Cierre de ruta con adjuntos |

## Frontend (AMI, técnico)

### Importar (`ImportData.vue`)
7 tarjetas agrupadas por proceso vía `groupCardsByProcess`/`filterCardsByProcess`
(`useProcessFunction.ts`), cada una con su `function(index)`:
- **`operational_centers_combo`** (procesos `scales,dispatchs,land`): `importOperationalCentersCombo` →
  `importOperationalCenters` (limpia y repuebla `operational_centers`+`operational_center_services`) →
  `integrateServices` (repuebla `services`).
- **`vehicles_combo`** (`scales,land`): `importVehiclesCombo` → `importVehicles` (paginado 500, borra por
  `company_id` antes) → `integrateTipesVehicles` (repuebla `tipes_vehicles`).
- **`items_combo`** (`items`): `importItemsCombo` → `importItems` (paginado 500, incremental por
  `last_imported_date` guardado en tabla `parameters`) → `importItemTypes`.
- **`shifts_combo`** (`dispatchs,land`): `importShiftsCombo` → `importShifts` → `integrateRoutes`
  (paginado 500).
- **`download_locations`** (`scales,locations`): `integrateDownloadLocations` (borra por `company_id`).
- **`operation_inspections`** (`dispatchs,land,locations,items`): `importInspections` — 4 llamadas
  secuenciales a `importTypeInspection` con un filtro cada una (`is_dispatch`/`is_router`/
  `unloading_place`/`is_item_type`), cada una hace `deleteCascadeByFilters` + `storeOnCascadeMulti`
  (inserta también `operation_inspection_details`).
- **`landfill_weight_controls`** (`scales`): `importLandfillControls` — reimporta en cascada
  servicios/tipos de vehículo/ubicaciones/vehículos, luego trae SOLO los controles del día
  (`getAllControls(today)`) que NO tengan `entry_weight`/`exit_weight`/`latitude`/`length` (evita pisar
  edición local en curso); si hay registros locales sin cerrar, pide confirmación (se pierden).
- Botón "Importar Todo" (`.sync-button`, ícono archive) ejecuta `integrateTable` en cascada para todas
  las tarjetas visibles (`integrateAll`); **validado en vivo**: las 6 tarjetas con datos hoy quedaron en
  100% (`operational_centers`=45, `services`=22, `vehicles`, `tipes_vehicles`, `download_locations`=2,
  `operation_inspections`=33, `shifts`=7, `routes`=821, `item_types`=23, `items`=11674); "Controles de
  Peso" mostró el aviso `No hay controles de peso para importar del día actual` (esperado, sin data hoy).

### Enviar (`SendData.vue`)
3 colas independientes, cada una filtrada por proceso (`getAvailableProcesses`):
- **Control de peso** (`scales`): `getData()` = `landfillWeightControlsService.getToSend(companyId)`
  (solo `closed=1`). `sendSupervision` trocea en lotes (`chunkBySize`, tope 50 registros / 5MB) y llama
  `landfillWeightControlsApi.storeMobileData(batch)`; borra localmente por `id` los que el backend
  confirme. **Este endpoint no existe en el backend** (ver Bloqueos) → cualquier envío de esta cola
  falla.
- **Inspecciones** (`dispatchs,land,locations,items`): `supervisoryInspectionService.getAllOnCascade({user_id,
  company_id})` arma el árbol completo (header+process_inspections+resultados+attachments) y lo envía
  ENTERO en un solo `POST` (`storeMobileData`); borra en cascada localmente los ids que el backend
  confirme (`response.data` = array de ids).
- **Cierres de ruta** (`land`): mismo patrón con `inspectionClosureService.getAllOnCascade`.
- `sendAll()` recorre las 3 tarjetas visibles en orden; `route.query.send=1` (usado por
  `ImportData.vue` cuando detecta pendientes) dispara `sendAll()` automáticamente al entrar.

### Terreno / Despachos (`land/*`, `dispatchs/*`) — mismo patrón, wizard 5 pasos
1. `LandServiceRoutes`/`ServiceRoutes`: selects "Centro Operativo" (local `operational_centers`, filtro
   `user_id`+`company_id` — ver 10777) → "Servicio" (`operationalCenterServiceService.
   getServicesByOperationalCenter`) → "Turno" (`shiftService.getAll`) → busca rutas
   (`routeService.getAll/getTotal` con `operational_center_id, service_id, shift_id, pending:false`, y en
   Terreno además `closure_date_number_different`). Botón "Cerrar" por ruta abre el modal
   `InspectionClosureForm` (guarda en `inspection_closures` local). Despachos además tiene un FAB
   "+" que abre `SearchRouteForm` para agregar una ruta no listada (`onNewRoute` → valida
   `existingRoute?.pending`, inserta con `routeService.storeFromApi` si no existe localmente).
2. `LandSelectVehicle`/`SelectVehicle`: confirma/edita el vehículo de la ruta (Despacho pide además
   `mileage`, kilometraje).
3. `LandInformation`/`InformationNews`: datos de novedad (identificación/nombre funcionario,
   observaciones).
4. `LandInspectionComponent`/`InspectionComponent`: renderiza un `*InspectionSection` por cada
   `operation_inspections` que matchee `company_id`+`is_dispatch`/`is_router` (según el tipo), guiado por
   `currentInspectionSection` (mismo patrón que Elementos/Ubicaciones).
5. `LandEvidences`/`EvidencesDispatch`: fotos (`MultiEvidencesComponent`) + firma; al enviar arma
   `supervisory_inspections` (con `route_id, vehicle_id, mileage, service_id, shift` implícito vía
   `route`) + `process_inspections`/`inspection_results` por cada detalle respondido + `attachments`.

### Ubicaciones (`locations/*`) — wizard 3 pasos
`LocationInformation` (select "Ubicación de Descarga" local `download_locations` + identificación/nombre/
observaciones) → `LocationInspectionComponent` (inspecciones filtradas por `unloading_place:true`) →
`LocationEvidences` (envío). Header `supervisory_inspections` con `download_location_id` poblado,
`service_id/route_id/vehicle_id` en `null`.

### Elementos (`items/*`) — wizard 4 pasos
`SelectItem` (select "Categoría de Elementos" local `item_types` → busca `items` paginado con
`item_type_id, company_id, inspection_pending:true`, filtro texto por `code`) → `ItemObservation` →
`InspectionItemComponent` (inspecciones filtradas por `is_item_type`, i.e. `item_type_id IS NOT NULL`) →
`ItemEvidences` (envío; además marca `itemService.update(item.id, {inspection_pending:false})`). Header
`supervisory_inspections` con `item_id` poblado.

### Control de Peso / Báscula (`Bascula/*`) — sin wizard, todo local
`ScalesPage.vue` (`/supervision/bascula`): lista los `landfill_weight_controls` NO cerrados de la
empresa; cada card permite **Ingreso** (modal: ubicación de descarga + peso entrada + descripción),
**Salida** (modal: peso salida + descripción, valida `exit ≤ entry`), **Anular** (modal: descripción
obligatoria, marca `active:false, closed:true`) y **Cerrar** (habilitado solo si `entry_weight` y
`exit_weight` > 0; marca `closed:true`). **Todas estas acciones son 100% locales**
(`landfillWeightControlsService.update`, sin llamada API) — el registro queda `closed:true` y pasa a la
cola de "Enviar Datos". `SupervisionPage.vue` (`/supervision/bascula/form`, botón "Nuevo"): alta MANUAL
de un control (sin `landfill_id` de origen servidor) con selects Ubicación/Servicio/Tipo Vehículo +
campos Ruta/Código/Placa/Peso Entrada/Externo/Descripción; también 100% local
(`landfillWeightControlsService.store`), geolocalización best-effort vía `navigator.geolocation` (web) o
`GeolocationService` (nativo).

## Acciones ejercitadas (validación en vivo, 2026-09-03)
- Login por UI (correo+contraseña+selección de empresa $AIO_COMPANY_NAME) — confirmado `POST /api/login`,
  `GET /api/app-versions/v0/get-all`, `POST /api/device-app-versions/v0/store` contra `localhost:8085`.
- **Importar Todo** en `/supervision/import-data`: 12+ endpoints distintos confirmados por
  `browser_network_requests` (tabla de arriba), datos verificados directamente en SQLite local vía
  `browser_evaluate` (conteos arriba).
- Apertura de las 7 vistas de sub-flujo (`land`, `dispatchs`, `locations`, `items`, `bascula`,
  `bascula/form`) confirmando que cargan sus selects/datos locales o, en su defecto, el bloqueo
  documentado abajo.
- **No se completó** un ciclo crear→enviar→verificar-BD→eliminar de una inspección de supervisión: Terreno
  y Despachos quedaron bloqueados por el selector vacío de Centro Operativo (10777, ver Bloqueos); el
  formulario manual de Báscula (`/supervision/bascula/form`) quedó cargando indefinidamente a la espera
  de geolocalización (sin permiso en el navegador headless) y Elementos/Ubicaciones requieren evidencia
  fotográfica/firma que este entorno tampoco puede simular de forma fiable sin tiempo adicional. **BD
  local y remota quedaron sin registros de prueba** (no se llegó a crear ninguno).

## Bloqueos
| # | Pantalla | Pasos repro | Qué quedó bloqueado | Evidencia |
|---|---|---|---|---|
| 1 | `/supervision/land`, `/supervision/dispatchs` (paso 1, selector "Centro Operativo") | Importar datos con un usuario SIN filas en `user_operational_centers` (ej. `$AIO_TEST_EMAIL`, id=1) → entrar a Terreno o Despachos | El select "Centro Operativo" queda vacío: `OperationalCenterService.getAll` local filtra `WHERE user_id = ? AND company_id = ?` (igualdad estricta) sobre una tabla donde TODO centro no asignado quedó con `user_id NULL` (el backend `get-with-user` sí trae todos los centros de la empresa vía LEFT JOIN, sin filtrar). Ningún usuario sin asignación explícita puede avanzar en Terreno/Despachos, aunque haya centros "no asignados" (`user_id NULL`) disponibles para la empresa. Bloqueó completar el ciclo crear→enviar→eliminar de esos dos sub-flujos. | Confirmado en vivo: `operational-centers/v0/get-with-user?filter={...,"user_id":1}` devolvió 45 filas, las 45 con `user_id:null` en SQLite local (`SELECT COUNT(*) FROM operational_centers`=45, sample con `user_id:null`); Postgres `public.user_operational_centers` tiene 165 filas totales, 0 para `user_id=1`. Código: `app-movil/src/services/app/modules/settings/operational-centers/OperationalCenterService.ts:19-23` + `land/LandServiceRoutes.vue:382`, `dispatchs/ServiceRoutes.vue:382` |
| 2 | `/supervision/send-data`, tarjeta "Control de peso de rellenos sanitarios" | Cerrar (`closed:true`) cualquier control de peso local y presionar "Enviar" | `LandfillWeightControlsApi.storeMobileData` hace `POST /landfill-weight-controls/v0/store-mobile-data`, pero esa ruta **no existe** en `aio-backend` (no está en `routes/api/v0/Modules/Operation/landfill_weight_controls.php`, y ni `LandfillWeightControlsController` ni `CustomLandfillWeightControlsController` tienen método `storeMobileData`). Cualquier intento de enviar esta cola fallará con 404/405 en runtime. | Código: `app-movil/src/services/api/modules/supervision/LandfillWeightControlsApi.ts:83-103` (llama al endpoint) vs `aio-backend/routes/api/v0/Modules/Operation/landfill_weight_controls.php` (rutas completas, sin `store-mobile-data`) y ambos controladores (`grep function` sin `storeMobileData`). No se llegó a intentar el envío real por falta de datos cerrados de prueba (bloqueo #1 impidió generar una inspección; el control de peso manual quedó bloqueado por geolocalización, bloqueo #3) |
| 3 | `/supervision/bascula/form` (alta manual) | Abrir "Nuevo" sin permiso de geolocalización concedido en el navegador | El formulario queda con todos los campos `disabled` y una `progressbar` indefinida (esperando `navigator.geolocation`/`GeolocationService`), sin timeout visible en la UI en el tiempo evaluado. No es bug de la app (limitación del entorno headless sin GPS), pero impidió usar esta vía alterna para crear un registro de prueba sin depender de Centro Operativo | Observado en vivo; código: `Bascula/SupervisionPage.vue` (validación de ubicación antes de habilitar el form) |

## Comparación con el manual (paso de manual — orquestador, 2026-09-03)
- **Manual**: `manua-web` → `docs/AMI/Supervision/` con un doc por sub-flujo: `Terreno.md`, `Despachos.md`, `Elementos.md`, `ControlDePeso.md`, `Ubicaciones.md` (+ imágenes en `website/static/img/AppMovil/Supervision/`).
- **Coincide**: los 5 sub-flujos están documentados a nivel de USO, con el ciclo importar → inspeccionar → enviar que confirmó la exploración; las capturas muestran las pantallas reales (p. ej. `Terreno/routes.png` con Centro Operativo → Servicio → Turno → Ruta).
- **Discrepancias / faltantes (anotadas, NO corregidas — no las requiere esta exploración ni el ticket 10777):**
  - `Terreno.md` describe la vista "Ruta" solo como "filtrar por **servicio** y **turno**"; **omite** mencionar el paso de seleccionar el **Centro Operativo** (y que ahora muestra solo los asignados al supervisor, 10777). Omisión preexistente; mejora opcional del manual.
  - Los dos **bugs** hallados (endpoint `landfill-weight-controls/v0/store-mobile-data` inexistente → Control de Peso no envía; selector de Centro Operativo vacío para supervisores sin asignación) **NO van al manual** (son defectos para el usuario final, no documentación de uso). Se reportan aparte.
- **Compuerta**: el manual cubre el módulo a nivel de uso y **no requiere cambios** por esta exploración ni por 10777 (el selector de Centro Operativo no está documentado en su contenido, así que el filtro no invalida ningún texto/imagen). No se tocó el manual.

## Estado / próximos pasos
- Documentación técnica completa por código para los 5 sub-flujos + Importar/Enviar + cierre de rutas,
  confirmada contra red real para Importar y para el punto de 10777.
- Pendiente (si se retoma): completar un ciclo crear→enviar→verificar-BD→eliminar real para al menos un
  sub-flujo, lo cual requiere (a) un usuario de prueba con al menos un `user_operational_centers` asignado
  (o corregir/entender si el filtro `user_id` estricto es el comportamiento esperado del ticket 10777), y
  (b) resolver el permiso de geolocalización en el navegador de pruebas (o sembrar `latitude/longitude`
  vía `localStorage`/servicio TS como en otros módulos AMI, ver `ami-operaciones-ordenes-de-trabajo.md`).
- El bloqueo #2 (ruta backend faltante) es independiente del anterior y bloquea a CUALQUIER usuario que
  tenga controles de peso pendientes de enviar.
