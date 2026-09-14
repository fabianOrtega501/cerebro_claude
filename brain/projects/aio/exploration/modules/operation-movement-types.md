# Operaciones → Maestros → Tipos de Movimiento

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

- Ruta app (URL): /operations/operations-movement-types | Backend module: Operation | Estado: `importado, sin verificar`| Actualizado: 2026-08-12

## Permisos
| Subject (ruta) | Abilities | Dónde se exige (router front / middleware backend) |
|---|---|---|
| `/operations/operations-movement-types` | `read` | Front: `definePage.meta` en `src/pages/operations/operations-movement-types/index.vue` (`action: 'read'`) y `subject` del tab. Back: `permission:/operations/operations-movement-types,READ` en `get-all`, `show`, `custom-get-all`, `export-data` (rutas de `movement_types.php` y `movement_types_details.php`) |
| `/operations/operations-movement-types` | `create` | Back: `...,CREATE` en `store` y `duplicate` (tanto padre como detalle). Front: `$can('create', subject)` en botones Standard |
| `/operations/operations-movement-types` | `update` | Back: `...,UPDATE` en `update`. Front: `$can('update', subject)` |
| `/operations/operations-movement-types` | `delete` | Back: `...,DELETE` en `delete`. Front: `$can('delete', subject)` |

Notas técnicas:
- Las rutas del recurso Detalle (`operations-movement-types-details/*`) reutilizan el **mismo** subject de permiso del padre (`permission:/operations/operations-movement-types,...`); no hay permiso propio.
- `get-select-data` (padre y detalle) y `get-all-by-service` **no** llevan middleware de permiso (solo auth `sanctum`).

## Rutas / Endpoints
| Método | Endpoint | Controlador@método | Acción de UI que lo dispara | Auth/permiso |
|---|---|---|---|---|
| GET | `operations-movement-types/v0/custom-get-all?current_page=N` | `CustomMovementTypesController@customGetAll` | Listado/paginación de la tabla principal (filtra por `company_id`) | READ |
| GET | `operations-movement-types/v0/get-all` | `MovementTypesController@index` | (genérico, no usado por el service TS) | READ |
| POST | `operations-movement-types/v0/store` | `MovementTypesController@store` | Guardar paso 1 del wizard (crear) | CREATE |
| GET | `operations-movement-types/v0/show/{id}` | `MovementTypesController@show` | Abrir wizard en modo ver/editar | READ |
| PUT | `operations-movement-types/v0/update/{id}` | `MovementTypesController@update` | Guardar paso 1 en modo update | UPDATE |
| DELETE | `operations-movement-types/v0/delete/{id}` | `MovementTypesController@destroy` | Icono eliminar (confirmación) | DELETE |
| POST | `operations-movement-types/v0/duplicate/{id}` | `MovementTypesController@duplicate` | Sin trigger en UI (no consumido por el service TS) | CREATE |
| POST | `operations-movement-types/v0/export-data` | `MovementTypesController@exportData` | Botón Exportar (encola job vía `CustomNotificationService`) | READ |
| GET | `operations-movement-types/v0/get-select-data` | `MovementTypesController@getSelect` | (select del padre; el combo de la vista usa `ServiceService`, no este) | solo auth |
| GET | `operations-movement-types-details/v0/get-all?current_page=N` | `MovementTypesDetailsController@index` | Tabla de detalles (paso 2), filtra por `movement_type_id` | READ |
| POST | `operations-movement-types-details/v0/store` | `MovementTypesDetailsController@store` | Agregar detalle (paso 2) | CREATE |
| GET | `operations-movement-types-details/v0/show/{id}` | `MovementTypesDetailsController@show` | Ver/editar detalle | READ |
| PUT | `operations-movement-types-details/v0/update/{id}` | `MovementTypesDetailsController@update` | Guardar detalle en update | UPDATE |
| DELETE | `operations-movement-types-details/v0/delete/{id}` | `MovementTypesDetailsController@destroy` | Eliminar detalle | DELETE |
| POST | `operations-movement-types-details/v0/duplicate/{id}` | `MovementTypesDetailsController@duplicate` | Sin trigger en UI | CREATE |
| POST | `operations-movement-types-details/v0/export-data` | `MovementTypesDetailsController@exportData` | (expuesto; método `export` existe en el service TS) | READ |
| GET | `operations-movement-types-details/v0/get-select-data` | `MovementTypesDetailsController@getSelect` | select de detalles | solo auth |
| GET | `operations-movement-types-details/v0/get-all-by-service` | `CustomMovementTypesDetailsController@getAllByService` | `getAllByService` del service TS (detalles activos por servicio/compañía) | solo auth |

## Controladores
| Clase (archivo) | Métodos relevantes | Qué orquesta técnicamente |
|---|---|---|
| `MovementTypesController` (`app/Http/Controllers/Modules/Operation/MovementTypes/MovementTypesController.php`) | `index`, `store`, `show`, `update`, `destroy`, `duplicate`, `exportData`, `getSelect` | Extiende `BaseController`; envuelve cada acción en `executeWithHandling` + `ApiResponse`. Inyecta `IMovementTypesService` y `CustomNotificationService`. `store/update` validan con `StoreMovementTypesRequest`; `exportData` con `ExportDataRequest` y delega el encolado a `customNotificationService->generateExportNotificaction($request, $service)` |
| `CustomMovementTypesController` (misma carpeta) | `customGetAll` | Inyecta `IMovementTypesService` + `CustomMovementTypesService`; delega el listado paginado con filtro por compañía a `CustomMovementTypesService@customGetAll` |
| `MovementTypesDetailsController` (`.../MovementTypesDetails/MovementTypesDetailsController.php`) | `index`, `store`, `show`, `update`, `destroy`, `duplicate`, `exportData`, `getSelect` | Análogo al padre con `IMovementTypesDetailsService`; `store/update` validan con `StoreMovementTypesDetailsRequest` |
| `CustomMovementTypesDetailsController` (misma carpeta) | `getAllByService` | Delega a `CustomMovementTypesDetailsService@getAllByService($request->all())` |

## Servicios
| Clase (archivo) | Métodos | Responsabilidad técnica |
|---|---|---|
| `MovementTypesService` (`app/Services/Modules/Operation/MovementTypes/MovementTypesService.php`) | hereda de `BaseService` (`listAll`, `create`, `find`, `update`, `delete`, `duplicate`, `getSelectModel`) | Implementa `IMovementTypesService`; sin lógica propia, todo vía `IMovementTypesRepository` (Eloquent) |
| `CustomMovementTypesService` (misma carpeta) | `customGetAll(Request, $filters=[], $with=[])` | Construye la query Eloquent: decodifica `filter` JSON, aplica `applyFilters()`, filtra por compañía con `whereHas('companies', company_id)`, resuelve `per_page` (`'all'` → `count()`, default 10), `orderBy('id', order_by='desc')`, paginación con `current_page` |
| `MovementTypesDetailsService` (`.../MovementTypesDetails/MovementTypesDetailsService.php`) | hereda de `BaseService` | Implementa `IMovementTypesDetailsService`; CRUD genérico vía repositorio |
| `CustomMovementTypesDetailsService` (misma carpeta) | `getAllByService(array $data): Collection` | Query lean: `select('id','name')` sobre `MovementTypesDetails`, `whereHas('movementTypes', active + company_id + operation.movement_types.service_id)` y `active=true`, `orderBy('id','desc')` |
| `CustomNotificationService` (Settings/Notification) | `generateExportNotificaction($request, $service)` | Encola el job de exportación y devuelve la notificación con id de proceso (usado por `exportData` de ambos controladores) |

## Query builders / Requests / Rules
| Artefacto | Archivo | Qué construye/valida |
|---|---|---|
| `StoreMovementTypesRequest` | `app/Http/Requests/Modules/Operation/MovementTypes/StoreMovementTypesRequest.php` | Reglas (store y update comparten FormRequest): `company_id` requiredNumeric; `service_id` `required|numeric` + `UniqueMovementTypeByServiceRule`; `name` requiredString; `is_default` requiredBool; `active` requiredBool. Extiende `CommonFormRequest` |
| `StoreMovementTypesDetailsRequest` | `.../MovementTypesDetails/StoreMovementTypesDetailsRequest.php` | `movement_type_id` requiredNumeric; `name` requiredString; `order` requiredNumeric; `collects_weight`, `unloads_weight`, `reports_operation_times`, `operation_start_time`, `operation_end_time`, `active`, `is_default` todos requiredBool |
| `UniqueMovementTypeByServiceRule` | `app/Http/Rules/Modules/Operation/MovementType/UniqueMovementTypeByServiceRule.php` | ValidationRule: existe `MovementTypes` con mismo `company_id` (de `request->company_id`) + `service_id` (valor), excluyendo `id` de `request->id` en update. Mensaje: "Ya existe un tipo de movimiento para el servicio seleccionado." |
| `ExportDataRequest` | `app/Http/Requests/Modules/Standard/ExportDataRequest.php` | Valida `filetype`/`filename` para `export-data` |
| `customGetAll` (query builder inline) | `CustomMovementTypesService` | Ver Servicios: filtro por compañía vía `whereHas('companies')`, paginación |
| `getAllByService` (query builder inline) | `CustomMovementTypesDetailsService` | Ver Servicios |

## Modelos / Tablas / Migraciones
| Modelo | Tabla | Relaciones | Índices/particiones/defaults técnicos |
|---|---|---|---|
| `MovementTypes` (`app/Models/Modules/Operation/MovementTypes/MovementTypes.php`) | `operation.movement_types` | `companies` belongsTo Company; `services` belongsTo Service (`service_id`); `user` belongsTo User (`created_by`); `updater` belongsTo User (`updated_by`) | Fillable: `company_id, service_id, name, is_default, created_by, updated_by, active`. `$hidden=[user,updater]`. `$appends=[creator_name, service_name, updater_name]` (accessors) |
| `MovementTypesDetails` (`.../MovementTypesDetails/MovementTypesDetails.php`) | `operation.movement_types_details` | `movementTypes` belongsTo MovementTypes (`movement_type_id`); `user` belongsTo User (`created_by`) | Fillable incluye las 5 banderas + `order`, `active`, `is_default`. `$appends=[creator_name]` |

Migraciones:
- `2025_05_29_201619_create_movement_types_table.php`: crea `operation.movement_types`. FKs `company_id`→`companies`, `service_id`→`public.services`; `name` string(150); `is_default` boolean **default `true`**; auditoría + timestamps vía trait `AddsAuditActiveAndTimestamps` (añade `created_by`/`updated_by`/`active` + `timestamps`).
- `2025_05_29_201920_create_movement_types_details_table.php`: crea `operation.movement_types_details`. FK `movement_type_id`→`operation.movement_types` con **`onDelete('cascade')`**; `name` string(150); `order` integer; `collects_weight`, `unloads_weight`, `reports_operation_times`, `operation_start_time`, `operation_end_time` boolean **default `false`**; auditoría + timestamps. (`down()` referencia `movement_types_details` sin schema — inconsistente, no bloqueante.)
- `2026_07_24_191326_add_is_default_to_movement_types_details_table.php`: agrega `is_default` boolean **default `false`** a `operation.movement_types_details`.
- Otras migraciones homónimas (`2024_09_23...`, `2025_08_08...`, `create_submovement_types...`) pertenecen a los módulos Tires/Maintenance, no a este.

## Frontend (técnico)
| Vista (.vue) | Servicio TS | Composables/stores | Notas técnicas |
|---|---|---|---|
| `src/pages/operations/operations-movement-types/index.vue` | — | `definePage` | Cascarón: `subject`/`action: 'read'`; monta un único tab con `MovementTypes.vue` vía `<Tabs>` |
| `src/views/pages/operations/movement-types/MovementTypes.vue` | `MovementTypesService`, `ServiceService` | `useI18n`, `getValidationRule` (transformRulesForms), model `MovementTypesModel.json`; sin Pinia | Host de la tabla (`Standard/Table/DataTable`) y del wizard (`DialogComponent`). Headers desde el JSON. Combo de servicio se llena con `ServiceService.getSelectItem()` |
| `.../wizards/MovementTypesWizard.vue` | (usa los services del padre) | `computed`, `ref` | Wizard de 2 pasos: paso 1 tipo de movimiento, paso 2 detalles |
| `.../forms/MovementTypesForm.vue` | — | `defineEmits`, `VSkeletonLoader` | Formulario paso 1 |
| `.../forms/MovementTypesDetailsTable.vue` | `MovementTypesDetailsService` | `VDataTable` (labs), model `MovementTypesDetailsModel.json` | Tabla de detalles (paso 2); bloquea agregar si no hay `movementTypesId` |
| `.../forms/MovementTypesDetailsForm.vue` | — | `VSkeletonLoader` | Formulario de detalle (paso 2) |
| `.../components/MovementsTypesComponent.vue` | — | — | Componente auxiliar de la vista |

Servicios TS:
- `MovementTypesService.ts` (`src/services/operations/movement-types/`): `getAll` (inyecta `company_id` de `dataCurrentUserCompany`), `store` (inyecta `company_id`), `show`, `update`, `delete`, `export`, `getSelectItem`.
- `MovementTypesDetailsService.ts` (`src/services/operations/movement-types-details/`): CRUD + `export` + `getSelectItem` + `getAllByService` (inyecta `company_id`).

## Bloqueos (solo bugs que impidieron continuar; vacío si no hubo)
Ninguno.

## Comparación con el manual (log del paso de manual; no es lógica de negocio)
- **Manual encontrado**: Sí.
  URL: `https://services.datint.co/Manual/docs/AIO/Operaciones/tiposDesplazamiento/tiposDesplazamiento`
  (fuente en repo `manua-web`: `docs/AIO/Operaciones/tiposDesplazamiento/tiposDesplazamiento.md`,
  id docusaurus `tiposDesplazamiento`, título de página **"Tipos de Desplazamiento"**).
  Nota: existen otras 3 páginas con nombre similar en el manual que **no** son este módulo (son de
  otros módulos distintos, verificadas y descartadas):
  `AIO/Mantenimiento/MovementTypes.md` (módulo Mantenimiento, campos Nombre/Transferida/Suma/Consumo
  — inventario de llantas) y `AIO/Llantas/Maestros/TiposMovimientos/{TiposMovimientos,
  TiposSubmovimientos}.md` (módulo Llantas, campos Nombre/Descripción/Tipo). Ninguna de las tres
  aplica a Operaciones → Maestros → Tipos de Movimiento.

- **Coincide con la exploración**: parcial.
  - Botones de cabecera (Agregar naranja, Buscar, Exportar) y su ubicación — coincide.
  - Wizard de 2 pestañas: paso 1 Tipo de Movimiento, paso 2 Detalles — coincide.
  - Campos del Detalle (paso 2): Nombre, Orden, Peso recolectado (`collects_weight`), Peso
    descargado (`unloads_weight`), Registro de tiempos (`reports_operation_times`), Hora inicio de
    operación (`operation_start_time`), Hora fin de operación (`operation_end_time`) — coincide con
    los nombres de campo reales (5 switches + Nombre + Orden).
  - Acciones por fila (Ver/Editar/Eliminar) y diálogo de confirmación al eliminar — coincide.
  - Comportamiento del botón "Ver" en el detalle (solo visualización si el padre se abrió en modo
    ver) — coincide con el flujo real (modo `view` deshabilita todo en ambos pasos).
  - Exportar: manual dice que se puede exportar en CSV/TXT/XLSX — **no verificado** en la
    exploración (no se abrió el combo de formatos para no disparar el job), así que no se puede
    confirmar ni contradecir ese dato puntual.

- **Discrepancias (app vs manual)**:
  1. **Nombre del módulo inconsistente**: el título/id de la página del manual es "Tipos de
     Desplazamiento", pero el propio texto de la página y la UI real usan "Tipos de Movimiento"
     (ruta real `/operations/operations-movement-types`, menú "Tipos de Movimiento"). Un usuario que
     busque "Tipos de Movimiento" en el buscador del manual puede no encontrar esta página por
     título/slug.
  2. **Campo "Por defecto" mal ubicado**: el manual lo lista como campo del **formulario del padre**
     (paso 1: Nombre, Nombre Servicio, Por defecto). La exploración de código+UI encontró que
     `is_default` en el padre es un valor automático **sin control visible** en el formulario de
     creación (se envía tal cual en la copia local, no hay switch en pantalla). En cambio, la
     exploración sí registró un switch "Por defecto" en el **formulario de Detalle** (paso 2, junto
     a los 5 switches), que el manual no incluye en su lista de campos del Detalle. Es decir, el
     manual parece haber puesto el campo en el paso equivocado.
  3. **Descripción incorrecta del comportamiento al crear detalles sin guardar el padre**: el manual
     afirma "los detalles quedarán asociados al tipo de movimiento directamente anterior" si no se
     guarda el padre antes de crear detalles. La exploración de código (`MovementTypesDetailsTable.vue`
     y el servicio) muestra que el sistema **bloquea** la acción y devuelve un warning ("Es necesario
     guardar previamente el tipo de movimiento para poder agregar el detalle correspondiente"), sin
     crear ni asociar nada a otro registro.
  4. **Columnas de la tabla desactualizadas**: el manual documenta columnas "Nombre, Código,
     Descripción, Registró, Fecha de registro, Estado". La tabla real tiene "Acciones, Id, Nombre,
     **Servicio**, Registró, Fecha Registro, **Actualizado por**, **Fecha Actualización**, Estado" —
     no existe columna "Código" ni "Descripción"; el nombre correcto es "Servicio", y faltan en el
     manual "Id", "Actualizado por" y "Fecha Actualización".

- **Documentación faltante en el manual** (priorizada por impacto para el usuario final):
  1. Propósito de negocio del módulo (qué es un Tipo de Movimiento y sus Detalles/Submovimientos).
  2. Regla de unicidad Servicio↔Tipo de Movimiento y su mensaje de error.
  3. Campo "Activo" del padre visible solo en edición/vista (no en creación).
  4. Naturaleza asíncrona de Exportar (encola proceso con id).
  5. Significado del campo "Orden" del Detalle.
  6. Permisos: visibilidad de botones y que los Detalles no tienen permiso independiente.
  7. Endpoint `duplicate/{id}` sin botón en UI — correcto que el manual no lo mencione.

## Estado / próximos pasos
Documentación técnica completa vía lectura de código (front + back). Verificado contra rutas,
controladores, servicios, requests, rule, modelos y migraciones reales. La lógica de negocio se
documenta aparte en `aio-backend/docs/modules/operation/movement-types/README.md`.
Pendiente (si se autoriza): ejercitar flujos de escritura reales en entorno no productivo y
confirmar en vivo el endpoint `duplicate` (sin trigger de UI) y los formatos de exportación.
