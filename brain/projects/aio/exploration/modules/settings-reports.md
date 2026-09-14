# Settings → Maestros → Reportes

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

- Ruta app (URL): `/settings/reports` (+ `/reports/generate` para la generación de usuario final, y la
  pestaña `reportsRoles` embebida en `/settings/users`)  | Backend module: `Settings`  | Estado: `importado, sin verificar`  | Actualizado: 2026-09-11

## Permisos
| Subject (ruta) | Abilities (create/read/update/delete/…) | Dónde se exige (router front / middleware backend) |
|---|---|---|
| `/settings/reports` | read (listar), create (botón Agregar), update (Editar/Ver-Editar filtros y campos hijos), delete (Eliminar) | Front: `definePage` en `src/pages/settings/reports/index.vue`; `$can('create'\|'update'\|'delete', props.subject)` en `ReportButtonsTable.vue`, `ReportsTable.vue`, `FieldsReportForm.vue`, `FiltersReportForm.vue`. Backend: middleware `permission:/settings/reports,{READ|CREATE|UPDATE|DELETE}` SOLO en `routes/api/v0/Modules/Settings/reports.php` y `report_filters.php` (ver nota de rutas más abajo — `report_fields`, `report_access_roles` y `report_templates` no llevan ese middleware). |
| `/settings/reports-roles` | read/update/delete (asignación reporte↔rol) | Front: pestaña `reportsRoles` en `src/pages/settings/users/index.vue` (filtra la pestaña por `$can`) y `$can('update'\|'delete', props.subject)` en `DataTableRolReport.vue`. Backend: rutas `report_access_roles.php` **sin** middleware de permiso explícito (solo protegidas por el guard global de autenticación). |
| `/reports/generate` | read | Front: `definePage` en `src/pages/reports/generate/index.vue`. Backend: endpoints `get-reports-by-user-role`, `get-filters-report`, `get-data-filter-select`, `process-reports` sin middleware de permiso explícito (dependen de que el usuario ya tenga rol con reportes asignados vía `report_access_roles`). |

No se detectaron banderas de acción de "otra ruta" reutilizadas (patrón `$can('read', '/otra-ruta')`) en este módulo.

## Rutas / Endpoints
| Método | Endpoint | Controlador@método | Acción de UI que lo dispara | Auth/permiso |
|---|---|---|---|---|
| GET | `reports/v0/get-all` | `ReportController@index` | (no usado por el front actual; el listado usa `get-all-custom`) | `permission:/settings/reports,READ` |
| POST | `reports/v0/store` | `ReportController@store` | (ruta CRUD estándar, no usada por el front — el front usa `store-custom`) | `permission:/settings/reports,CREATE` |
| GET | `reports/v0/show/{id}` | `ReportController@show` | — | sin middleware |
| PUT | `reports/v0/update/{id}` | `ReportController@update` | — | `permission:/settings/reports,UPDATE` |
| DELETE | `reports/v0/delete/{id}` | `ReportController@destroy` | Botón Eliminar (`DeleteItem` en `ReportsTable.vue`, vía `ReportService.delete`) | `permission:/settings/reports,DELETE` |
| POST | `reports/v0/duplicate/{id}` | `ReportController@duplicate` | (sin uso visible en el front) | `permission:/settings/reports,CREATE` |
| POST | `reports/v0/export-data` | `ReportController@exportData` | Botón "Exportar" (`ExportItem` en `ReportButtonsTable.vue`) | `permission:/settings/reports,READ` |
| GET | `reports/v0/select-reports` | `ReportController@getSelectReports` | `ReportService.getSelectItem` (select genérico de reportes) | sin middleware |
| POST | `reports/v0/store-custom` | `CustomReportController@store` | Botón "Agregar" del maestro (`ReportForm` action `store`, multipart con plantilla base64) | `permission:/settings/reports,CREATE` |
| POST | `reports/v0/update-custom/{id}` | `CustomReportController@update` | Botón "Editar" del maestro | `permission:/settings/reports,UPDATE` |
| GET | `reports/v0/get-all-reports-roles` | `CustomReportController@index` | Tabla `reportsRoles` en `/settings/users` (`ReportRolService.getAll`) | `permission:/settings/reports,READ` |
| GET | `reports/v0/show-custom/{id}` | `CustomReportController@show` | Botón "Ver" del maestro (incluye datos de plantilla) | sin middleware |
| GET | `reports/v0/get-all-custom` | `CustomReportController@getAllReports` | Listado principal de `ReportsTable.vue` (`ReportService.getAll`) | `permission:/settings/reports,READ` |
| GET | `reports/v0/get-reports-by-user-role` | `CustomReportController@getReportsByRoleUserSelect` | Select de reporte en `/reports/generate` (`CustomReportService.getReportsGenerate`) | sin middleware |
| POST | `reports/v0/process-reports` | `CustomReportController@processReports` | Botón "Generar" en `/reports/generate` (`CustomReportService.processReports`) | sin middleware |
| GET | `reports/v0/database-engines` | `CustomReportController@getDatabaseEngines` | Select "Motor de base de datos" en `ReportForm.vue` (`ReportService.getDatabaseEngines`) | `permission:/settings/reports,READ` |
| GET | `report-fields/v0/get-all` | `ReportFieldController@index` | Tabla de campos (paso "Campos" del wizard, `FieldsReportForm.vue`) | sin middleware |
| POST | `report-fields/v0/store` | `ReportFieldController@store` | Agregar campo | sin middleware |
| GET | `report-fields/v0/show/{id}` | `ReportFieldController@show` | Ver campo | sin middleware |
| PUT | `report-fields/v0/update/{id}` | `ReportFieldController@update` | Editar campo | sin middleware |
| DELETE | `report-fields/v0/delete/{id}` | `ReportFieldController@destroy` | Eliminar campo | sin middleware |
| POST | `report-fields/v0/duplicate/{id}` | `ReportFieldController@duplicate` | (sin uso visible en el front) | sin middleware |
| POST | `report-fields/v0/export-data` | `ReportFieldController@exportData` | (botón export deshabilitado en este sub-form, `buttonDisabled: ['export','search']`) | sin middleware |
| GET | `report-filters/v0/get-all` | `ReportFilterController@index` | Tabla de filtros (paso "Filtros" del wizard, `FiltersReportForm.vue`) | `permission:/settings/reports,READ` |
| POST | `report-filters/v0/store` | `ReportFilterController@store` | Agregar filtro | `permission:/settings/reports,CREATE` |
| GET | `report-filters/v0/show/{id}` | `ReportFilterController@show` | Ver filtro | `permission:/settings/reports,READ` |
| PUT | `report-filters/v0/update/{id}` | `ReportFilterController@update` | Editar filtro | `permission:/settings/reports,UPDATE` |
| DELETE | `report-filters/v0/delete/{id}` | `ReportFilterController@destroy` | Eliminar filtro | `permission:/settings/reports,DELETE` |
| POST | `report-filters/v0/duplicate/{id}` | `ReportFilterController@duplicate` | (sin uso visible en el front) | `permission:/settings/reports,CREATE` |
| POST | `report-filters/v0/export-data` | `ReportFilterController@exportData` | (botón export deshabilitado en este sub-form) | `permission:/settings/reports,READ` |
| GET | `report-filters/v0/get-filters-report` | `CustomReportFilterController@index` | `/reports/generate`: al elegir reporte, lista sus filtros (`ReportFilterService.getFiltersReport`) | sin middleware |
| GET | `report-filters/v0/get-data-filter-select` | `CustomReportFilterController@getDataFilterSelect` | `/reports/generate`: llena el select de un filtro `filter_type=select` ejecutando su `query` (`ReportFilterService.getDataFilterSelect`) | sin middleware (valida `id`/`company_id` con `SearchReportFilterRequest`) |
| GET | `report-access-roles/v0/get-all` | `ReportAccessRoleController@index` | Tabla `reportsRoles` (CRUD estándar) | sin middleware |
| POST | `report-access-roles/v0/store` | `ReportAccessRoleController@store` | Asignar reporte a rol | sin middleware |
| GET | `report-access-roles/v0/show/{id}` | `ReportAccessRoleController@show` | — | sin middleware |
| PUT | `report-access-roles/v0/update/{id}` | `ReportAccessRoleController@update` | Editar asignación | sin middleware |
| DELETE | `report-access-roles/v0/delete/{id}` | `ReportAccessRoleController@destroy` | Eliminar asignación (`DeleteItem` en `DataTableRolReport.vue`) | sin middleware |
| POST | `report-access-roles/v0/duplicate/{id}` | `ReportAccessRoleController@duplicate` | (sin uso visible) | sin middleware |
| POST | `report-access-roles/v0/export-data` | `ReportAccessRoleController@exportData` | (sin uso visible en `ReportRol.vue`) | sin middleware |
| GET | `report-access-roles/v0/show-custom/{id}` | `CustomReportAccessRoleController@show` | Botón "Ver"/"Editar" en `DataTableRolReport.vue` (`ReportRolService.show`, agrega `application_id` derivado) | sin middleware |
| GET/POST/PUT/DELETE | `report-templates/v0/*` | `ReportTemplateController` (CRUD estándar) | **Sin consumo desde el frontend**: la plantilla se gestiona embebida dentro de `reports/v0/store-custom` y `update-custom` (campo `file` en `ReportForm.vue`), no por estos endpoints directos | sin middleware |

## Controladores
| Clase (archivo) | Métodos relevantes | Qué orquesta técnicamente |
|---|---|---|
| `ReportController` (`app/Http/Controllers/Modules/Settings/Report/ReportController.php`) | `index, store, show, update, destroy, duplicate, exportData, getSelectReports` | CRUD estándar del maestro (delegando en `IReportService`/`ReportService`); no es el que usa el front (usa `CustomReportController`) salvo `select-reports` |
| `CustomReportController` (`.../Report/CustomReportController.php`) | `index, getAllReports, store, show, update, getReportsByRoleUserSelect, processReports, getDatabaseEngines` | Listado paginado con plantilla, alta/edición con `file` (base64) vía `CustomReportService`, disparo de generación (`ProccessReportsService`) y motores multibase |
| `ReportFilterController` (`.../ReportFilter/ReportFilterController.php`) | CRUD estándar | Filtros del reporte (hijo) |
| `CustomReportFilterController` (`.../ReportFilter/CustomReportFilterController.php`) | `index (get-filters-report), getDataFilterSelect` | Filtros de un reporte específico y resolución de datos para filtro `select` (ejecuta el `query` del filtro contra el motor del reporte) |
| `ReportFieldController` (`.../ReportField/ReportFieldController.php`) | CRUD estándar | Campos/columnas del reporte (hijo) |
| `ReportAccessRoleController` (`.../ReportAccessRole/ReportAccessRoleController.php`) | CRUD estándar | Asignación reporte↔rol |
| `CustomReportAccessRoleController` (`.../ReportAccessRole/CustomReportAccessRoleController.php`) | `show` | Muestra una asignación con `application_id` derivado (`hasOneThrough`) |
| `ReportTemplateController` (`.../ReportTemplate/ReportTemplateController.php`) | CRUD estándar | Plantilla de Excel del reporte (tabla hija); no consumido directo por el front |

## Servicios
| Clase (archivo) | Métodos | Responsabilidad técnica (qué hace, no el porqué de negocio) |
|---|---|---|
| `ReportService` (`app/Services/Modules/Settings/Report/ReportService.php`) | hereda de `BaseService` | CRUD genérico (paginación/filtros estándar) sobre `IReportRepository` |
| `CustomReportService extends ReportService` (`.../Report/CustomReportService.php`) | `create, update, getReport, listAllReports, getReportsRoles, getReportsByRoleUserSelect, getDatabaseEngines` | Alta/edición del reporte + su `ReportTemplate` (crea/actualiza/borra la plantilla según `template`/`file`); listado con `QuerysFilters` sobre `reports`; árbol rol→reportes (`Role::with('roleReports')`); reportes visibles para el rol activo del usuario en la empresa; lectura y filtrado del parámetro `report_database_engines` contra `config('database.connections')` |
| `ReportFilterService` (`.../ReportFilter/ReportFilterService.php`) | hereda de `BaseService` | CRUD genérico de filtros |
| `CustomReportFilterService extends ReportFilterService` (`.../ReportFilter/CustomReportFilterService.php`) | `listFiltersByReport, getDataFilterSelect` | Filtros de un `report_id` con `QuerysFilters`; ejecuta el `query` de un filtro `select` (sustituyendo `@company_id`/`@user_id`) contra la conexión (`db_connection`) del reporte padre, con fallback a la conexión por defecto si no es válida |
| `ReportFieldService` (`.../ReportField/ReportFieldService.php`) | hereda de `BaseService` | CRUD genérico de campos |
| `ReportAccessRoleService` (`.../ReportAccessRole/ReportAccessRoleService.php`) | hereda de `BaseService` | CRUD genérico de asignaciones reporte↔rol |
| `CustomReportAccessRoleService extends Controller` (`.../ReportAccessRole/CustomReportAccessRoleService.php`) | `getReportRol` | Trae una asignación con `report.application` cargado y `application_id` calculado |
| `ProccessReportsService` (`app/Services/Common/Base/ProccessReportsService.php`) | `processReports, getReport, getReportFields, getExcelColumnLetter, createNotification, resolveReportEngine (private), fallbackToCsvIfExceedsExcelLimit (private), markNotificationError` | Orquesta la generación: sustituye `@filtro`/`@user_id` en el `query`, valida `ORDER BY` (además de la validación en el request, aquí es defensiva por si el query cambió), resuelve motor/conexión y plantilla de paginación desde el parámetro `report_database_engines`, castea a CSV si el conteo probado excede `EXCEL_MAX_DATA_ROWS` (1.048.575), crea la `Notification` y despacha `ProcessReportsJob` a la cola `QueueNames::REPORTS_GENERATOR` |
| `ProcessReportsJob` (`app/Jobs/Standard/ProcessReportsJob.php`) | `handle, saveLog, updateNotification, updateNotificationError, deleteFile` (protegidos) | Job en cola: pagina la consulta con la plantilla de paginación del motor resuelto (`DB::connection($connection)->select(...)` en bloques de `sizeChunk=10000`), exporta con `DataExporter`/`FileWriterFactory` (csv/txt/xlsx, con o sin plantilla vía `SpreadsheetDiskCache`), guarda el archivo en `storage/app/public/exports`, actualiza la `Notification` (éxito/error) y loguea con `fun_log_error` (procedimiento SQL) — todo esto (notificación, log) corre siempre en la conexión por defecto (pgsql), solo la consulta de datos usa la conexión del motor |

## Query builders / Requests / Rules
| Artefacto | Archivo | Qué construye/valida (columnas, joins, filtros, reglas) |
|---|---|---|
| `QuerysFilters` (uso genérico) | `app/Console/Utils/QuerysFilters.php` | Aplica filtros dinámicos (`applyFilters`) sobre `reports`/`report_filters` desde el JSON `filter` de la query string |
| `StoreReportRequest` | `app/Http/Requests/Modules/Settings/Report/StoreReportRequest.php` | Reglas del CRUD estándar (`ReportController`): `application_id`, `name` (max 50), `query` (+`ValidQueryRule`), `type_report` (max 4), `template`/`active` bool |
| `CustomStoreReportRequest` | `.../Report/CustomStoreReportRequest.php` | Reglas del alta/edición real usada por el front: agrega `type_report in:csv,txt,xlsx`, `db_connection` (+`ValidReportEngine`), `query` (+`ValidQueryRule`+`HasOrderByRule`), `template`/`active` como `in:true,false` (llegan como string por `FormData`), `file`/`file_name`/`extension_file` (`xlsx`/`xlsm`) requeridos condicionalmente (`withValidator`→`sometimes` si `template===true`) |
| `ValidReportEngine` | `app/Http/Rules/Modules/Settings/Report/ValidReportEngine.php` | Que el `db_connection` esté en el parámetro `report_database_engines` (activo) **y** exista como conexión real en `config('database.connections')`; si no, falla |
| `HasOrderByRule` | `app/Http/Rules/Modules/Settings/Report/HasOrderByRule.php` | Que el `query` contenga `ORDER BY` (regex `/\border\s+by\b/i`), requisito para poder paginar por bloques en la generación |
| `ValidQueryRule` | `app/Http/Rules/Modules/Standard/ValidQueryRule.php` | Que el `query` no contenga palabras reservadas de escritura/DDL (`INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, GRANT, REVOKE, ...`) — solo bloquea palabras sueltas, no un parser real |
| `StoreReportFilterRequest` | `.../ReportFilter/StoreReportFilterRequest.php` | `report_id`, `label_name`/`filter_name` (max 50), `filter_type` (max 30), `query` (+`ValidQueryRule`, `required_if:filter_type,select`) |
| `SearchReportFilterRequest` | `.../ReportFilter/SearchReportFilterRequest.php` | `id`/`company_id` requeridos enteros, para `get-data-filter-select` |
| `StoreReportFieldRequest` | `.../ReportField/StoreReportFieldRequest.php` | `report_id`, `order` (0-9999 + `UniqueOrderFieldByReportRule`), `field_name` (max 30), `display_name` (max 60), `format` (max 60) |
| `UniqueOrderFieldByReportRule` | `app/Http/Rules/Modules/Settings/ReportFields/UniqueOrderFieldByReportRule.php` | Que no exista otro `report_field` con el mismo `order` para el mismo `report_id` (excluyendo el propio `id` en edición) |
| `StoreReportAccessRoleRequest` | `.../ReportAccessRole/StoreReportAccessRoleRequest.php` | `report_id`, `rol_id` (+`UniqueReportByRoleRule`), `active` bool |
| `UniqueReportByRoleRule` | `app/Http/Rules/Modules/Settings/ReportAccessRole/UniqueReportByRoleRule.php` | Que el par `(report_id, rol_id)` no esté ya asignado (excluyendo el propio `id`) |
| `ReportRepository` | `app/Repositories/Eloquent/Modules/Settings/Report/ReportRepository.php` | Extiende `BaseRepository` sin filtros propios (`$allowedFilters = []`); el filtrado real de `get-all-custom` lo hace `QuerysFilters` en el servicio, no el repositorio |

## Modelos / Tablas / Migraciones
| Modelo | Tabla | Relaciones | Índices / particiones / defaults técnicos |
|---|---|---|---|
| `Report` (`app/Models/Modules/Settings/Report/Report.php`) | `reports` | `belongsTo Application`, `belongsTo User` (`created_by`), `hasMany ReportAccessRole`, `hasMany ReportTemplate` | PK `id`; FK `application_id→applications`; `db_connection varchar(50) default 'pgsql'` (migración `2026_09_10_000001_add_db_connection_to_reports_table`); `$appends=[application_name, created_by_name]`; `$hidden=[reportTemplates, application, user]` |
| `ReportFilter` (`.../ReportFilter/ReportFilter.php`) | `report_filters` | `belongsTo Report`, `belongsTo User` | FK `report_id→reports` **ON DELETE CASCADE**; `$appends=[report_name, created_by_name]` |
| `ReportField` (`.../ReportField/ReportField.php`) | `report_fields` | `belongsTo Report`, `belongsTo User` | FK `report_id→reports` **ON DELETE CASCADE**; `format varchar(60)` (ampliado por migración `2024_08_09_130615_alter_format_in_report_fields_table`); `$appends=[report_name, created_by_name]` |
| `ReportAccessRole` (`.../ReportAccessRole/ReportAccessRole.php`) | `report_access_roles` | `belongsTo Report`, `belongsTo Role` (`rol_id`), `belongsTo User`, `hasOneThrough Application` (vía `Report`) | FK `report_id→reports`, `rol_id→roles` (sin cascada); `$appends=[application_name, application_id, report_name, role_name, created_by_name]` |
| `ReportTemplate` (`.../ReportTemplate/ReportTemplate.php`) | `report_templates` | `belongsTo Report`, `belongsTo User` | FK `report_id→reports` **ON DELETE CASCADE**; guarda `file` (texto/base64), `name`, `type` |
| Parámetro `report_database_engines` | tabla `parameters` (`key='report_database_engines'`) | — | Semilla por migración `2026_09_10_000002_seed_report_database_engines_parameter`; JSON `[{name, connection, pagination}]`; hoy trae `pgsql` (PostgreSQL AIO) y `sqlsrv` (SQL Server SIESA ENTERPRISE); `config/database.php` define las conexiones reales `pgsql`/`sqlsrv` que deben coincidir por `connection` |

## Frontend (técnico)
| Vista (.vue) | Servicio TS | Composables / stores | Notas técnicas (mapa de campos, llamadas) |
|---|---|---|---|
| `src/pages/settings/reports/index.vue` | — | `Tabs` (una sola pestaña `reports`) | `definePage({ subject:'/settings/reports', action:'read' })`; monta `ReportsTable.vue` |
| `src/views/pages/settings/reports/ReportsTable.vue` | `ReportService` | — | Listado paginado (`get-all-custom`); acciones Ver/Editar/Eliminar abren `ReportDialog` con `ReportFormWizard` en modo `read`/`update`; `DeleteItem` estándar llama `ReportService.delete` |
| `src/views/pages/settings/reports/buttons/ReportButtonsTable.vue` | `ReportService` | — | Botones Exportar (`ExportItem`), Buscar (`ReportDialog action=search` → `ReportForm` sin llamar API, solo arma `dataFilterReport` y emite `handleReportFilter`), Agregar (`ReportDialog action=store` → `ReportService.store`), limpiar filtros |
| `src/views/pages/settings/reports/ReportFormWizard.vue` | — | `AppStepper` (3 pasos: Reporte/Filtros/Campos) | Orquesta `ReportForm` + `FiltersReportForm` + `FieldsReportForm` dentro de un `VWindow`; el paso "Reporte" es el único que puede crear/editar el registro padre (`data-edit-report`→`ReportsTable.editDataReport`→`ReportService.update`); los pasos "Filtros"/"Campos" solo aparecen útiles cuando `report.id` ya existe (edición) |
| `src/views/pages/settings/reports/forms/ReportForm.vue` | `ReportService` (solo para `getDatabaseEngines`), `ApplicationService` | — | Campos: `application_id` (autocomplete), `name`, `type_report` (csv/txt/xlsx fijos en el propio componente), `db_connection` (autocomplete poblado por `getDatabaseEngines`), `template` (switch) + `file` (`VFileInput` .xlsx/.xlsm en base64), `query` (textarea), `active`; deshabilita todo si `action==='read'` |
| `src/views/pages/settings/reports/forms/FiltersReportForm.vue` | `ReportFilterService` | `ButtonsTable`/`DinamicFormAction`/`DeleteItem` (componentes Standard) | CRUD de `report_filters` acotado a `report_id` fijo (prop `report.id`); `formFields` define `filter_type` como select fijo (`select/text/number/date/datetime`) y `query` (textarea, solo aplica si `filter_type==='select'`) |
| `src/views/pages/settings/reports/forms/FieldsReportForm.vue` | `ReportFieldService` | ídem | CRUD de `report_fields` acotado a `report_id`; `formFields`: `order` (number), `field_name`, `display_name`, `format`, `active` |
| `src/views/pages/settings/reports/dialog/ReportDialog.vue` | — | — | Diálogo genérico del módulo; `serviceAction` (`read/update/store/search`) controla título y si el footer (`ButtonsAction`) se muestra (solo en `currentStep===0`, es decir, en el paso "Reporte" del wizard) |
| `src/views/pages/settings/report-rols/ReportRol.vue` | `ReportRolService`, `ApplicationService`, `ReportService`, `RoleService` | `ReportRolModel.json` (headers/formFields genéricos) | Vive embebido como pestaña `reportsRoles` de `/settings/users`; usa el patrón data-driven `*Model.json` + `ButtonsTable`/`DataTableRolReport` en vez de un wizard propio |
| `src/views/pages/settings/report-rols/DataTableRolReport.vue` | (recibe el `service` por prop) | — | Aplana `role.role_reports[]` a filas `{report_id, rol_id, ...}` agrupadas por `rol_id` (`group-by`); Ver usa `show-custom` (trae `application_id` derivado) |
| `src/services/settings/reports/ReportService.ts` | — | — | `getAll→get-all-custom`, `store/update→*-custom` (FormData multipart con `file` en base64 + `file_name`/`extension_file`), `show→show-custom/{id}`, `delete→delete/{id}`, `getSelectItem→select-reports`, `getDatabaseEngines→database-engines`, `export→export-data` |
| `src/services/settings/reports/CustomReportService.ts` | — | — | `getReportsGenerate→get-reports-by-user-role` (filtra por `application_id`+`company_id` de sesión), `processReports→process-reports` |
| `src/services/settings/report-filters/ReportFilterService.ts` | — | — | CRUD estándar + `getFiltersReport→get-filters-report`, `getDataFilterSelect→get-data-filter-select` (agrega `company_id` de sesión) |
| `src/services/settings/report-fields/ReportFieldService.ts` | — | — | CRUD estándar sobre `report-fields/v0/*` |
| `src/services/settings/report-rols/ReportRolService.ts` | — | — | `getAll→get-all-reports-roles`; `store/update/delete/export→report-access-roles/v0/*`; `show→show-custom/{id}` |
| `src/pages/reports/generate/index.vue` | `CustomReportService`, `ReportFilterService` | `useBroadcastChannel('notification-channel')` | Pantalla de usuario final (`definePage subject:'/reports/generate'`): selecciona reporte (solo los del rol activo) → carga sus filtros (`getFiltersReport`) → si un filtro es `select` resuelve sus opciones (`getDataFilterSelect`) → arma inputs dinámicos por `filter_type` (text/number/date-datetime/select) → botón "Generar" llama `processReports(reportSelected, {value: dataItem})` y notifica; NO navega a un archivo, la notificación (WS) trae el link cuando el Job termina |
| `src/interfaces/settings/reports/IReport.ts` | — | — | Campos clave: `application_id, name, query, type_report, db_connection, template, file, template_name, template_type, active, role_reports[]` |

## Bloqueos (solo bugs que impidieron continuar; dejar vacío si no hubo)
- **Resuelto durante la sesión**: el *port-forwarding* host↔contenedor de Docker (8085 y 5433) estuvo caído/muy degradado una parte de la sesión (TCP conectaba pero no llegaba respuesta). Se verificó BD por `docker exec` mientras tanto; al recuperarse la red se completó el ciclo CRUD real por API (ver "Acciones ejercitadas"). No quedó ningún bloqueo pendiente del módulo.

## Comparación con el manual (log del paso de manual; no es lógica de negocio)
- **Manual encontrado: sí.** Manual de usuario (`manua-web`): `docs/AIO/Maestros/Reportes/Reportes.md` (parametrización: Agregar/Ver/Editar, Filtros, Campos), `docs/AIO/Maestros/Reportes/RolesReportes.md` (reportes-roles) y `docs/AIO/Reportes/Generar` (generación por el usuario final). Sitio en vivo: `https://services.datint.co/Manual/`.
- **Coincidencias / brecha cubierta:** el manual documenta parametrización, roles y generación. En **esta sesión** ya se actualizó `Reportes.md` para el **campo nuevo "Motor de base de datos"**: se agregó a la lista de campos obligatorios, se añadió la nota (dialecto del motor + ORDER BY obligatorio para todo reporte + PostgreSQL por defecto) y se **regeneraron las capturas 2/3/6.png** (Agregar/Ver/Editar) mostrando el campo. También en el manual técnico (`manual-tecnico`) se agregó la fila del parámetro `report_database_engines` en `docs/Aio/api/parameters/table.md`.
- **Sin brecha pendiente de usuario** para el campo multibase. Detalles internos (fallback silencioso a CSV por límite de Excel, sustitución de placeholders, separación de conexiones) son técnicos/de negocio y viven en esta memoria y en `aio-backend/docs/modules/settings/reports/README.md`, no en el manual de usuario.

## Acciones ejercitadas por API (ciclo completo, tras recuperarse la red)
Login `POST /api/login` (con `device_name`, requerido por `LoginRequest` aunque no esté en el request de referencia del skill) → token real. Con empresa/rol del usuario de pruebas (`application_id=1` "settings"):

| Paso | Endpoint | Payload relevante | HTTP | Resultado |
|---|---|---|---|---|
| Crear reporte `PRUEBA-EXPLORACION-20260911152821` | `POST reports/v0/store-custom` (multipart) | `application_id=1, name, query="SELECT id, name FROM reports ORDER BY id ASC", type_report=csv, db_connection=pgsql, template=false, active=true` | 200 | `id=57` creado (`CustomReportController@store`→`CustomReportService::create`) |
| Ver | `GET reports/v0/show-custom/57` | — | 200 | Trae el registro + `name_template/type_template=null` (sin plantilla) |
| Editar | `POST reports/v0/update-custom/57` (multipart) | `name` con sufijo `-EDITADO`, `query` cambiado a `WHERE active = true ORDER BY id DESC` | 200 | Actualizado correctamente (`updated_at` cambia) |
| Crear filtro hijo | `POST report-filters/v0/store` | `report_id=57, label_name="Estado", filter_name="active", filter_type="select", query="SELECT true as id, 'Activo' as name"` | 200 | `id=147` creado |
| Ver filtro | `GET report-filters/v0/show/147` | — | 200 | OK |
| Resolver select del filtro | `GET report-filters/v0/get-data-filter-select?id=147&company_id=$AIO_COMPANY_ID` | — | 200 | `data:[{"id":true,"name":"Activo"}]` — confirma que ejecuta el `query` del filtro contra la conexión del reporte padre (`CustomReportFilterService::getDataFilterSelect`) |
| Editar filtro | `PUT report-filters/v0/update/147` | `label_name="Estado Activo"` | 200 | OK |
| Eliminar filtro | `DELETE report-filters/v0/delete/147` | — | 200 | OK |
| Eliminar reporte | `DELETE reports/v0/delete/57` | — | 200 | OK (`ReportController@destroy`) |

**Verificación en BD** (`docker exec postgres_postgis_17 psql -U postgres -d aio`): `reports id=57` → 0 filas; `report_filters id=147/report_id=57` → 0 filas; `report_fields/report_templates/report_access_roles report_id=57` → 0 filas; `count(*) from reports` volvió a **52** (igual que antes de la prueba). **BD limpia, sin residuos.**

## Estado / próximos pasos
- **Documentación de código: completa** (permisos, rutas/controladores/servicios, requests/rules, modelos/migraciones y frontend técnico mapeados en ambos repos, incluido el motor multibase `db_connection`/`report_database_engines`/`ValidReportEngine`/`HasOrderByRule` y el flujo `ProccessReportsService`→`ProcessReportsJob`).
- **Ciclo CRUD ejercitado por API real** (crear→ver→editar→eliminar, padre + un hijo `report_filters`), confirmado contra el código y con BD verificada limpia (ver tabla arriba).
- **No ejercitado deliberadamente**: la generación real (`process-reports`/`ProcessReportsJob`) para no encolar un job masivo, tal como pedía el alcance; el flujo queda documentado solo por código. Tampoco se probó `report_fields` (hijo análogo a `report_filters`, mismo patrón CRUD, ya cubierto por código) ni `report_access_roles`/plantilla (`file`) por API, por no ser necesarios para confirmar el mapeo técnico ya verificado con `report_filters`.
