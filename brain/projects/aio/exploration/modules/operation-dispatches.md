# Operaciones → Operaciones → Despachos

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

- Ruta app (URL): /operations/dispatches | Backend module: Operation | Estado: `importado, sin verificar`| Actualizado: 2026-08-12

## Permisos
| Subject (ruta) | Abilities | Dónde se exige (router front / middleware backend) |
|---|---|---|
| `/operations/dispatches` | `read` | Front: `definePage({ subject:'/operations/dispatches', action:'read' })` en `src/pages/operations/dispatches/index.vue`. Back: middleware `permission:/operations/dispatches,READ` en rutas `get-all`, `show`, `custom-get-all`, `export-data`, `get-dispatches-by-vehicle`, `get-select-for-weights` |
| `/operations/dispatches` | `create` | Front: `v-if="$can('create', props.subject)"` en botón "Agregar" (`DispatchButtonsTable.vue:270`). Back: middleware `...,CREATE` en `store`, `custom-store`, `custom-store-all`, `duplicate` |
| `/operations/dispatches` | `update` | Front: prop `:has-permission="$can('update', props.subject)"` a `DailyCaptureForm`. Back: middleware `...,UPDATE` en `update/{id}`, `close/{id}` |
| `/operations/dispatches` | `delete` | Front: icono anular con `v-if="$can('delete', props.subject) && item.dispatch_status === 0"` (`DispatchTable.vue:282`). Back: middleware `...,DELETE` en `delete/{id}`, `cancel/{id}` |
| `/operations/issues` | `read` | Front: `v-if="$can('read', '/operations/issues')"` en icono "Novedades" por fila (abre `Issues.vue`) |
| (ninguno) | — | `get-select-data` (`GET /v0/get-select-data`) no lleva middleware de permiso en `dispatches.php` |

## Rutas / Endpoints
Archivo: `aio-backend/routes/api/v0/Modules/Operation/dispatches.php` (prefijo `/dispatches`).

| Método | Endpoint | Controlador@método | Acción de UI que lo dispara | Auth/permiso |
|---|---|---|---|---|
| GET | `/dispatches/v0/custom-get-all` | `CustomDispatchController@index` | Listado/paginación de la tabla (`DispatchService.getAll`) | sanctum + READ |
| POST | `/dispatches/v0/custom-store` | `CustomDispatchController@store` | Guardar despacho individual (`DispatchService.store`) | sanctum + CREATE |
| POST | `/dispatches/v0/custom-store-all` | `CustomDispatchController@storeAll` | Guardar despacho masivo (`DispatchService.storeCustomAll`) | sanctum + CREATE |
| PUT | `/dispatches/v0/close/{id}` | `CustomDispatchController@closeDispatch` | Cerrar despacho (`DispatchService.closeDispatch`, `CloseDispatchForm`) | sanctum + UPDATE |
| PUT | `/dispatches/v0/cancel/{id}` | `CustomDispatchController@cancelDispatch` | Anular despacho (`DispatchService.annul`, `AnnulDispatchForm`) | sanctum + DELETE |
| GET | `/dispatches/v0/get-dispatches-by-vehicle` | `CustomDispatchController@getByVehicle` | Buscador interno de Gestión Diaria (`DispatchService.getByVehicle`) | sanctum + READ |
| GET | `/dispatches/v0/get-select-for-weights` | `CustomDispatchController@getSelectForWeights` | Select de despachos para distribución de pesos (`DispatchService.getSelectForWeights`) | sanctum + READ |
| GET | `/dispatches/v0/get-all` | `DispatchController@index` | (genérico, no usado por la vista principal) | sanctum + READ |
| POST | `/dispatches/v0/store` | `DispatchController@store` | (genérico `StoreDispatchRequest`; no usado por la UI actual) | sanctum + CREATE |
| GET | `/dispatches/v0/show/{id}` | `DispatchController@show` | `DispatchService.show` | sanctum + READ |
| PUT | `/dispatches/v0/update/{id}` | `DispatchController@update` | `DispatchService.update` | sanctum + UPDATE |
| DELETE | `/dispatches/v0/delete/{id}` | `DispatchController@destroy` | `DispatchService.delete` | sanctum + DELETE |
| POST | `/dispatches/v0/duplicate/{id}` | `DispatchController@duplicate` | Sin botón en UI | sanctum + CREATE |
| POST | `/dispatches/v0/export-data` | `DispatchController@exportData` | Exportar (`ExportItem` → `DispatchService.export`, encola job vía `CustomNotificationService`) | sanctum + READ |
| GET | `/dispatches/v0/get-select-data` | `DispatchController@getSelect` | — | sanctum (sin middleware de permiso) |

## Controladores
| Clase (archivo) | Métodos relevantes | Qué orquesta técnicamente |
|---|---|---|
| `CustomDispatchController` (`app/Http/Controllers/Modules/Operation/Dispatch/CustomDispatchController.php`) | `index`, `store`, `storeAll`, `closeDispatch`, `cancelDispatch`, `getByVehicle`, `getSelectForWeights` | Todos vía `BaseController::executeWithHandling` + `ApiResponse`. Inyecta `IDispatchService`, `CustomNotificationService`, `CustomDispatchService`. `closeDispatch`/`cancelDispatch` hacen `find($id)` (404 si no existe) y delegan a `CustomDispatchService` |
| `DispatchController` (`.../Dispatch/DispatchController.php`) | `index`, `store`, `show`, `update`, `destroy`, `duplicate`, `exportData`, `getSelect` | CRUD genérico sobre `IDispatchService` (BaseService). `exportData` usa `ExportDataRequest` + `CustomNotificationService::generateExportNotificaction` |

## Servicios
| Clase (archivo) | Métodos | Responsabilidad técnica |
|---|---|---|
| `CustomDispatchService` (`app/Services/Modules/Operation/Dispatch/CustomDispatchService.php`) | `getAllDispatches`, `create`, `storeAll`, `saveCrewDispatch` (priv), `saveSuppliesByStaff`, `assignRouteTolls` (priv), `storeAttendances`, `getMovementConfigurationOrFail` (priv), `getMovementType` (priv), `getDefaultMovementTypeDetails` (priv), `saveDefaultMovements` (priv), `closeDispatch`, `cancelDispatch`, `getByVehicle`, `getSelectForWeights`, `getParameterOrderDispatch`, `listAllExportData` | `create`/`storeAll` en `DB::transaction`: crean `Dispatch`, tripulación (`DispatchCrew`), suministros (`DispatchSupply`), asistencias (`Attendances`/`AbsenceRecords`), peajes (`DispatchToll`) y desplazamientos por defecto (`DispatchMovement`); cada mutación registra log vía `CustomDispatchAuditLogService`. `getAllDispatches` pagina con `DispatchQueryBuilder` (`orderBy id desc`, `per_page`/`current_page`). `getMovementConfigurationOrFail` lanza `CustomException` si no hay `MovementTypes` activo o sin `MovementTypesDetails` con `active=true AND is_default=true`. `closeDispatch` invoca `CloseDispatchAction` |
| `DispatchValidatorService` (`.../Dispatch/DispatchValidatorService.php`) | `getVehicleConflict`, `getStaffConflict`, `serviceRequiredVehicle` | Consultas de conflicto por `shift_id`+fecha(`start_datetime`)+`dispatch_status IN (0,1)`+`active`. `serviceRequiredVehicle`: `exists` sobre `service_type_vehicles` para el `service_id` |
| `DispatchService` (`.../Dispatch/DispatchService.php`) | (hereda de `BaseService`) | CRUD genérico Eloquent sobre el repositorio `IDispatchRepository`; sin lógica propia |
| `CustomDispatchAuditLogService` (`.../DispatchAuditLog/CustomDispatchAuditLogService.php`) | `createDispatchLog` | Inserta filas en `operation.dispatch_audit_logs` (table_name, record_id, old/new_data, action, description) |
| `CloseDispatchAction` (`app/Actions/Modules/Operation/Dispatch/CloseDispatchAction.php`) | `execute`, `validateMovements`, `validateTolls`, `validateDownloads`, `validateSupports`, `validateNoRegressionInMetrics`, `validateVehicleBaseline` | Valida precondiciones de cierre; lanza `CustomException` por área (Desplazamientos/Peajes/Descargues/Apoyos/Kilometraje/Horómetro) |

## Query builders / Requests / Rules
| Artefacto | Archivo | Qué construye/valida |
|---|---|---|
| `DispatchQueryBuilder` | `app/Queries/Modules/Operations/Dispatch/DispatchQueryBuilder.php` | `getAllDispatches`: `Dispatch::select(...)` + `QuerysFilters::applyFilters`; si `filter.staff_id` → join a `dispatch_crews`+`distinct`; siempre `whereHas('operationalCenters.userOperationalCenters', user_id=filter.user_id)` (limita al centro operativo del usuario) |
| `StoreDispatchRequest` | `app/Http/Requests/Modules/Operation/Dispatch/StoreDispatchRequest.php` | Base: `company_id`, `service_id`, `shift_id`, `operational_center_id`, `route_id` (todos `ForeignKeyExists`); `vehicle_id` `nullable|numeric`+FK; `order` `nullable|string|max:30`; `start_datetime` requerido date; `end_datetime` `nullable|date|after_or_equal:start_datetime`; `final_km`/`hour_meter` `between:0,9999999999.99`; `dispatch_status` `in:0,1,2,3`; `cancellation_reason` `max:255` |
| `CustomStoreDispatchRequest` | `.../CustomStoreDispatchRequest.php` (extiende StoreDispatchRequest) | Añade `start_time` `required|date_format:H:i`; `vehicle_id` con `UniqueVehicleByShiftRule`; `staff_data` `required|array`+`UniqueStaffByShiftRule`; `staff_data.*.id` FK a `staff`; `staff_data.*.supplies` `nullable|array`; `staff_data.*.is_support` bool |
| `CustomStoreDispatchAllRequest` | `.../CustomStoreDispatchAllRequest.php` (extiende StoreDispatchRequest) | Reescribe `rules`: `company_id`/`service_id`/`shift_id`/`operational_center_id` con FK; `routes_data` `required|array`+`UniqueStaffByShiftAllRule`+`UniqueVehicleByShiftAllRule` |
| `CloseDispatchRequest` | `.../CloseDispatchRequest.php` | `start_datetime` req date; `end_datetime` req date `after_or_equal:start_datetime`; `final_km`/`hour_meter` req numeric `between:0,9999999999.99` |
| `CancelDispatchRequest` | `.../CancelDispatchRequest.php` | `prepareForValidation` inyecta `id` de la ruta; `id` FK a `operation.dispatches`; `cancellation_reason` `required|string|max:255` |
| `UniqueVehicleByShiftRule` | `app/Http/Rules/Modules/Operation/Dispatches/UniqueVehicleByShiftRule.php` | Si hay `vehicle_id`, usa `DispatchValidatorService::getVehicleConflict`; falla con mensaje que incluye despacho y ruta en conflicto |
| `UniqueStaffByShiftRule` | `.../Dispatches/UniqueStaffByShiftRule.php` | Recorre `staff_data`, acumula conflictos vía `getStaffConflict`; falla listando persona/despacho/ruta |
| `UniqueVehicleByShiftAllRule` / `UniqueStaffByShiftAllRule` | `.../Dispatches/UniqueVehicleByShiftAllRule.php`, `UniqueStaffByShiftAllRule.php` | Variantes para el flujo masivo (validan sobre `routes_data`) |

## Modelos / Tablas / Migraciones
| Modelo | Tabla | Relaciones | Índices/particiones/defaults técnicos |
|---|---|---|---|
| `Dispatch` (`app/Models/Modules/Operation/Dispatch/Dispatch.php`) | `operation.dispatches` | `belongsTo`: companies, services, shifts, operationalCenters, routes, vehicles, user(created_by), userClose(closed_by_user_id). `appends`: creator_name, closed_by_user_name, company_name, vehicle_data, vehicle_code, operational_center_name, service_name, shift_name, route_data | Migración `2025_10_29_175843`: FKs a companies/services/shifts/operational_centers/routes; `vehicle_id`,`closed_by_user_id` nullable; `dispatch_status` int `default(0)` (0 Programado,1 En operación,2 Cerrado,3 Anulado); `final_km`/`hour_meter` double(10,2). Alter `2026_05_21` añade `execution_start_date`; `2026_07_08_120000` añade `cancellation_reason`. Sin `onDelete` cascade |
| `DispatchCrew` | `operation.dispatch_crews` | `dispatch_id`→dispatches, `staff_id`→public.staff | `is_support` bool default false; `start_time` datetime, `end_time` nullable; `notes` nullable |
| `DispatchSupply` | `operation.dispatch_supplies` | dispatch_id, supply_id→maintenance.supplies, staff_id→public.staff, measurement_system_id→public.measurement_systems | `quantity` double(10,2) |
| `DispatchMovement` | `operation.dispatch_movements` | dispatch_id, movement_type_detail_id→operation.movement_types_details | `trip_number` int, `movement_date` date, `start_date`/`end_date` nullable, `order` nullable, `final_kilometers`/`final_hour_meter` double(10,2) nullable; columna `geom geometry(POINT,4326)` NULL |
| `DispatchToll` | `operation.dispatch_tolls` | dispatch_id, toll_id→public.tolls | `ticket_number` nullable, `toll_date` nullable, `cost` double(10,2) default 0 |
| `DispatchAuditLog` | `operation.dispatch_audit_logs` | dispatch_id→dispatches | `table_name`, `record_id`, `operation_type`, `description`, `old_data`/`new_data` jsonb, `ip_address` |
| (relacionadas, mismo patrón) | `dispatch_downloads`, `dispatch_fuels`, `dispatch_route_supports` | dispatch_id→dispatches | migraciones `2025_10_29_*`; usadas por las pestañas de Gestión Diaria |

Todas las tablas usan el trait `AddsAuditActiveAndTimestamps` (created_by/updated_by/active/timestamps).

## Frontend (técnico)
| Vista (.vue) | Servicio TS | Composables/stores | Notas técnicas |
|---|---|---|---|
| `src/pages/operations/dispatches/index.vue` | — | — | Cascarón: `definePage` + monta `DispatchTable` con `subject="/operations/dispatches"` |
| `src/views/pages/operations/dispatches/DispatchTable.vue` | `DispatchService`, `CustomUserService` | auto-imports (`dataCurrentUser`, `notify`, i18n) | Tabla `VDataTable` (labs); acciones por fila: Procesar (`.v-process` → `DailyCaptureForm`), Bitácora (`dispatchLog` → `LogDispatchInfo`), Anular (`.v-annul`, solo `dispatch_status===0`+`delete`), Novedades (`Issues.vue`). Filtro vía `getAll(current_page, filter)` |
| `.../buttons/DispatchButtonsTable.vue` | `DispatchService`, `CustomUserService` | `dataCurrentUser`, `dataCurrentUserCompany` | Cabecera: Gestión Diaria (global), Exportar (`ExportItem`), Buscar, Agregar. `store`/`storeCustomAll` según flujo. `filtersExport` usa `company_ids` (multi-empresa) o `company_id` |
| `.../forms/DispatchForm.vue` (+ `DispatchMasiveForm.vue`) | `DispatchService`, `RouteService` | — | Wizard fullscreen `store`/`search`; switch `mass_dispatch` decide individual (`custom-store`) vs masivo (`custom-store-all`) |
| `.../forms/DailyCaptureForm.vue` | varios servicios de submódulos | — | Hub "Gestión Diaria" con pestañas (Desplazamientos/Tripulación/Descargues/Peajes/Combustible/Apoyos); contiene `CloseDispatchForm` |
| `.../forms/CloseDispatchForm.vue` | `DispatchService.closeDispatch` | — | `PUT close/{id}` |
| `.../forms/AnnulDispatchForm.vue` | `DispatchService.annul` | — | `PUT cancel/{id}`, campo `cancellation_reason` requerido |
| `.../forms/LogDispatchInfo.vue` | `DispatchAuditLogService` | — | Timeline de auditoría (solo lectura) |
| `src/services/operations/dispatches/DispatchService.ts` | — | — | `getAll/store/show/update/delete/export/storeCustomAll/getByVehicle/getSelectForWeights/closeDispatch/annul`; inyecta `user_id`/`company_id`(o `company_ids`) en `filter` |
| `src/interfaces/operations/dispatches/IDispatch.ts` | — | — | Tipos `IDispatch`/`IDispatchResponse` |
| `src/pinia/operations/dispatches/Dispatch.ts` | — | store `useMassiveDispatchStore` | Estado `{ vehicles, staff }` + `setVehicles` para el flujo masivo |

## Bloqueos (solo bugs que impidieron continuar; vacío si no hubo)
_(ninguno)_

## Comparación con el manual (log del paso de manual; no es lógica de negocio)

**Manual localizado: SÍ.**
URL pública verificada por navegador: `https://services.datint.co/Manual/docs/AIO/Operaciones/Operaciones/Despachos/Despachos/`
Fuente local (Docusaurus): `manua-web/docs/AIO/Operaciones/Operaciones/Despachos/Despachos.md`.

**Nota metodológica**: el `.md` local está desactualizado respecto al sitio publicado. El `.md` local solo tiene: Agregar (individual/masivo), Buscar, Exportar, una nota de "Ejecución/Validaciones" de una línea, y Novedades. El sitio en vivo tiene además: sección Gestión Diaria completa, sección Anular Despacho completa (dos ubicaciones + nota de irreversibilidad) y sección Peajes extensa. La comparación se basó en el contenido del sitio publicado.

### Coincide con la exploración: PARCIAL
Coincidencias confirmadas: botones de cabecera (Gestión Diaria, Agregar, Buscar, Exportar); switch masivo/individual y campos del despacho individual; despacho masivo (tabla de rutas con checkboxes, vehículo/tripulación por fila → `custom-store-all`); tripulación obligatoria mínimo 1 con suministros por persona; asistencia automática (`storeAttendances`); Exportar en formatos CSV/TXT/XLSX; Anular solo si "Programado" con confirmación (icono `v-annul` + `cancel/{id}`); Novedades (`Issues.vue`); pestaña Peajes de Gestión Diaria (columnas Nombre/Número Tiquete/Fecha/Costo).

### Discrepancias (manual vs. funcionamiento real)
1. Campo Vehículo: el manual dice visible "si la ruta tiene tipos de vehículos" y lo marca Opcional; el código lo condiciona a si el Servicio requiere vehículo (`serviceRequiredVehicle` → `service_type_vehicles`) y, cuando es visible, es obligatorio (`requiredValidator` + `UniqueVehicleByShiftRule`).
2. Anular: el manual dice solo "confirmación"; el formulario real exige `cancellation_reason` obligatorio (máx 255).
3. "Últimos 10 despachos": el manual lo describe como limitación; el listado es paginado (`custom-get-all?current_page=N`, `per_page` default 10) sin tope fijo.

### Documentación faltante (priorizada)
1. [ALTO] Regla de Tipo de Movimiento sin Detalle `is_default=true` bloquea la creación (`getMovementConfigurationOrFail` lanza `CustomException`) — no documentada.
2. [ALTO] "Cerrar Despacho" sin sección en el manual.
3. [ALTO] Pestañas de Gestión Diaria (Desplazamientos, Tripulación, Descargues, Combustible) sin documentar; solo Peajes tiene sección.
4. [MEDIO] Pestaña "Apoyos" (`dispatch_route_supports`) sin mención.
5. [MEDIO] Bitácora / Log de auditoría (`LogDispatchInfo`) sin mención.
6. [MEDIO] Estados del despacho no enumerados explícitamente.
7. [MEDIO] Validaciones `UniqueVehicleByShiftRule`/`UniqueStaffByShiftRule` no explicadas.
8. [BAJO] Validación de inspección vehicular antes de iniciar desplazamiento: solo una frase suelta.
9. [BAJO] Endpoint `duplicate/{id}`: sin botón en UI ni mención (consistente).

## Estado / próximos pasos
- Código frontend + backend documentado técnicamente (endpoints, controladores, servicios, requests/rules, query builder, modelos/migraciones).
- El listado principal filtra siempre por el/los centro(s) operativo(s) del usuario (`DispatchQueryBuilder` → `whereHas operationalCenters.userOperationalCenters user_id`).
- `DispatchController@destroy`/`duplicate` usan el genérico `IDispatchService` (BaseService); `duplicate/{id}` no tiene botón en UI y su implementación de clonado no fue verificada (nota previa: `BaseService::duplicate` posiblemente vacío/sin clonar). Pendiente confirmar.
- Sin `onDelete` cascade en las FKs de las tablas hijas; el cierre limpia/cierra desplazamientos vía `CustomDispatchService::closeDispatchMovements`.
- Pendiente opcional: ejercitar por UI (en un despacho descartable) cierre, anulación y "Agregar" en cada pestaña de Gestión Diaria; confirmar exportación real (encola job asíncrono).
- La lógica de negocio (reglas, porqués, cascada de creación paso a paso) vive en `aio-backend/docs/modules/operation/dispatches/README.md`.
