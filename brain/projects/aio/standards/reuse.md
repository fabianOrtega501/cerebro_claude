# AIO — inventario de lo reutilizable

Qué pieza ya resuelve cada necesidad común en `aio-backend` y `aio-app`, y qué no se hace en estos
repos. Se lee **antes de armar el plan**: el plan dice qué se reutiliza de aquí y qué se escribe
nuevo. Las rutas son relativas a cada repo; Doctor avisa si una deja de existir.

Fuentes: el `CLAUDE.md` de cada repo, sus memorias de estándar (`buscar-antes-de-crear`,
`validaciones-con-el-estandar`, `estandar-intacto`, `cada-consulta-en-su-entidad`,
`fecha-de-la-empresa`, `solo-lo-pedido`) y lo aprendido en los tickets. Cuando
`review-overengineering` encuentre un `reusar` que no esté aquí, se agrega.

## No se hace

- **Backend**
  - Modificar el `<Entidad>Service`, su interfaz o el `<Entidad>Controller` del estándar: la lógica va en `Custom*`, en `applyFilters()` o en una Action.
  - Consultar el modelo de otra entidad desde el servicio propio: se pide a su `Custom<Entidad>Service` y a su endpoint.
  - `Rule::exists` o validaciones armadas a mano: llaves con `mergeRules` + `ForeignKeyExists`, tipos con las propiedades de `CommonFormRequest`.
  - `now()` o la hora del servidor para una fecha de negocio: sale de `CustomCompanyService`.
  - Validaciones, protecciones, cachés o métodos que no pidió la HU ni el usuario: se proponen, no se agregan.
  - `env()` fuera de `config/`, `public $queue` en un Job, colas escritas a mano, `SoftDeletes`, queries en el controlador, listados sin `company_id`, PHPDoc encima de un método con `@OA`, comentarios sueltos dentro del código.
  - Correr `pint` (el formato lo pone el editor) o `php artisan` desde el host: siempre con Sail.
- **Frontend**
  - Llamar a la API desde un componente: siempre una clase de `src/services/` con `$api`.
  - `VTextField` / `VTextarea` directos en formularios: `AppTextField` / `AppTextarea` con la etiqueta arriba, `persistent-placeholder` y placeholder `` `${$t('enter')} ${etiqueta}` ``.
  - Una clave i18n nueva cuando ya existe una equivalente; las nuevas, al final de `es.json` y `en.json`.
  - Tablas, diálogos o botones hechos desde cero cuando hay uno en `src/components/Standard/` o `src/components/dialogs/`.
  - `defineModel` (Vue 3.3 sin la opción activada en Vite): `modelValue` + `update:modelValue`.
  - `useApi`, imports de `@db/` o `@api-utils/`, `console.log`, y `pnpm lint` (reformatea todo el repo).

## Backend (`aio-backend`)

### CRUD, listados y filtros
- CRUD, select del front, duplicar y exportar sin escribir nada: `BaseService` (`app/Services/Common/Base/BaseService.php`) y `BaseRepository` (`app/Repositories/Eloquent/Common/Base/BaseRepository.php`).
- Filtro de un listado: `applyFilters()` del repositorio. Un array da `whereIn`, `'null'` / `'not_null'` dan `whereNull` / `whereNotNull`, los `*_id` van por igualdad y el texto por `LIKE`; `per_page=all`, `get_columns` e `include_ids` ya existen.
- Escritura en varias tablas: `BaseService::executeInTransaction(callable)`.
- Entidad sin `company_id` que filtra por empresa a través de una relación: trait `app/Traits/Modules/Maintenance/FiltersByCompanyRelation.php`.
- Búsqueda de texto sin tildes ni mayúsculas, por palabras: trait `app/Traits/Functions/NormalizesTextSearch.php`.
- Duplicar numerando el código: `DuplicatorByCode::duplicate` (`app/Services/Common/Base/DuplicatorByCode.php`).

### Validación
- Base de todo Form Request: `app/Http/Requests/Common/CommonFormRequest.php`. Propiedades `$requiredString`, `$nullableString`, `$requiredDate`, `$requiredBool`, `$requiredNumeric`, `$nullableArray`…; métodos `validateString(max, 'nullable')`, `validateNumeric`, `mergeRules`, `validateFile`, `requiredAlphaNumericCode`. Los comodines (`'*.staffs.*.observation'`) funcionan con estas mismas reglas.
- Llave foránea: `ForeignKeyExists` (`app/Rules/Common/ForeignKeyExists.php`); si además debe estar activa, `ActiveForeignKeyExists` (`app/Rules/Common/ActiveForeignKeyExists.php`).
- Unicidad, opcionalmente por empresa e ignorando el propio id: `ColumnValueExists`, `ColumnValueExistsWithId` y, compuesta, `ColumnValueUniqueByColumns` (`app/Rules/Common/`).
- Token cifrado de un portal público: `ValidEncryptedIdRule` (`app/Http/Rules/Common/ValidEncryptedIdRule.php`) y `QrIdCodec` (`app/Helpers/QrIdCodec.php`).

### Respuestas, errores y controlador
- Toda acción de controlador: `executeWithHandling` de `app/Http/Controllers/Common/Base/BaseController.php`; respuesta con `ApiResponse::success/warning/error` (`app/Http/Responses/ApiResponse.php`).
- Rechazo de negocio con detalle por campo: `CustomException(['Campo' => ['mensaje']])` (422 warning); con un solo mensaje: `ValidationException` (`app/Exceptions/Common/`).
- Registrar un error dentro de un Job o servicio: `ErrorLoggingService::logError` (`app/Services/Common/Base/ErrorLoggingService.php`).

### Empresa, fechas, usuario y parámetros
- Fecha y hora actual de la empresa: `CustomCompanyService::getActuallyDateByCountryCompany($companyId)`; de UTC a la hora de la empresa: `formatDateByCountryCompany`; al revés, para guardar: `toUtcFromCountryCompany` (`app/Services/Modules/Settings/Company/CustomCompanyService.php`).
- Publicar las fechas de un modelo en la hora de su empresa: trait `app/Traits/Functions/FormatDateByCompany.php`. Lo que compare instantes se lee con `getRawOriginal`.
- Encabezado oficial (código, versión, fechas) de un PDF por empresa: trait `app/Traits/Functions/FormatHeader.php`.
- Colaborador del usuario en sesión: `Auth::user()?->staff?->id` (relación `User::staff()`, por documento). No hace falta `User::find(Auth::id())`.
- Parámetro por empresa: `CustomParameterService::getParameterByCompany($companyId, $key)` (`app/Services/Modules/Settings/Parameter/CustomParameterService.php`).
- Comprobar un permiso por código: `PermissionCheckerService::userHasPermission` (`app/Services/Common/Auth/PermissionCheckerService.php`).

### Exportaciones, PDF, archivos y notificaciones
- Exportación asíncrona estándar con notificación: `CustomNotificationService::generateExportNotificaction` (`app/Services/Modules/Settings/Notification/CustomNotificationService.php`); síncrona: `DataExporter::export` (`app/Services/Common/Base/DataExporter.php`).
- PDF desde una vista Blade: `TcpdfGenerator::RenderViewToPdfBytes` (`app/Services/Common/Base/TcpdfGenerator.php`); reporte o dashboard con visibilidad por cargo: `ReportBaseService` (`app/Services/Common/Base/ReportBaseService.php`).
- Marca de agua en una imagen base64: `ImageWatermarkService` (`app/Services/Common/Base/ImageWatermarkService.php`); código de barras o QR: `BarcodeService` (`app/Services/Common/Base/BarcodeService.php`).
- Dirección a partir de latitud y longitud: `OsmService::getAddress` (`app/Services/Modules/Osm/OsmService.php`); punto PostGIS: trait `app/Traits/Functions/GpsPoint.php`; formatear un punto o geometría para el front: `GpsPointFormatService` (`app/Services/Modules/Standard/GpsPointFormatService.php`).
- Enlace absoluto al front: `FrontendUrl::to` (`app/Helpers/FrontendUrl.php`).
- Correo con adjunto: `MailService::sendEmailAttachment` (`app/Services/Modules/Settings/Mail/MailService.php`); logo de la empresa para un correo: `EmailLogoResolver` (`app/Services/Common/Base/EmailLogoResolver.php`).
- Nombre de una cola: `QueueNames` (`app/Enums/QueueNames.php`); acción de permiso: `Permissions` (`app/Enums/Settings/Permissions.php`); ruta sin auditoría: `ExcludedRoutes` (`app/Enums/Settings/ExcludedRoutes.php`).
- Columnas de auditoría o código y nombre en una migración: traits de `app/Traits/Migrations/` (`AddsAuditActiveAndTimestamps`, `AddsCodeAndName`…).

## Frontend (`aio-app`)

### Recursos y tablas
- Recurso nuevo: `*Model.json` en `src/models/` y `pnpm CreateResourceFlow`, que genera interface, service y vista. Un ajuste sobre un recurso existente no pasa por el generador.
- Tabla CRUD completa: `DataTable` (`src/components/Standard/Table/DataTable.vue`), con acciones propias por `rowActions(item)` (`src/interfaces/standard/IRowAction.ts`) o los slots `customAction` / `customActionEnd`.
- Formulario dinámico desde `formFields`: `Forms` (`src/components/Standard/Forms/Forms.vue`); modal con ese formulario: `DinamicFormAction` (`src/components/Standard/Action/DinamicFormAction.vue`).
- Pestañas por permiso: `Tabs` (`src/components/Standard/Tabs/Tabs.vue`); asistente por pasos: `Wizard` (`src/components/Standard/Wizard/Wizard.vue`).

### Diálogos y botones
- Diálogo de formulario: `DialogComponent` (`src/components/dialogs/DialogComponent.vue`); confirmación sí / no: `ConfirmDialog` (`src/components/dialogs/ConfirmDialog.vue`); botón X: `DialogCloseBtn`.
- Botón de pie de diálogo con color e ícono según la acción: `ButtonsAction` (`src/components/Standard/Buttons/ButtonsAction.vue`).
- Acción de fila con ícono y tooltip: `IconBtn` dentro de `VTooltip`, como en `src/components/Standard/Table/Buttons/RowActionButton.vue`.
- Carga: `Loading` (`src/components/Standard/Loader/Loading.vue`).

### Campos
- Texto, texto largo, select y autocompletado: `AppTextField`, `AppTextarea`, `AppSelect`, `AppAutocomplete` (`src/@core/components/app-form-elements/`), con la etiqueta arriba.
- Select paginado contra un service: `AioDataFetcherSelect` (`src/@core/components/app-form-elements/AioDataFetcherSelect.vue`); número o moneda: `AppNumberField`; fecha: `AppDateTimePicker`.
- Dirección estructurada: `AddressInput` (`src/components/Standard/AddressInput/AddressInput.vue`); cliente: `ClientSelectorDialog` (`src/components/Standard/ClientSelector/ClientSelectorDialog.vue`); periodo año-mes: `PeriodSelector` (`src/components/Standard/Forms/PeriodSelector.vue`).
- Validadores: `src/@core/utils/validators.ts` (`requiredValidator`, `maxLengthValidator`, `betweenValidator`, `doubleValidator`, `notFutureDate`…); desde el `Model.json`, `src/utils/transformRulesForms.ts`; rango de fechas: `useValidation()` (`src/composables/useValidation.ts`).

### Utilidades
- Mostrar la respuesta de un service: `notify(response)` (`src/utils/notify.ts`); en el `catch` del service: `handleResponseErrors` (`src/utils/handleResponseErrors.ts`).
- Usuario y empresa actuales (no reactivos): `dataCurrentUser`, `dataCurrentUserCompany` (`src/utils/UserDataUtils .ts`, con espacio en el nombre).
- Permiso en el script: `const { can } = useAbility()` (`src/plugins/casl/composables/useAbility.ts`); en la plantilla, `$can(action, subject)`.
- Fecha actual de la empresa: `CustomCompanyService.getActuallyDateByCompany` (`src/services/settings/companies/CustomCompanyService.ts`); formatos de fecha y número: `src/composables/useFunction.ts`.
- Chip de estado: `StatusChip` (`src/components/Standard/chips.vue/StatusChip.vue`); color de estado de una actividad: `src/utils/activityStatusUtils.ts`; estados de una OT: `useWorkOrderStatuses()` (`src/composables/useWorkOrderStatuses.ts`).
- Constantes de negocio del front (estados de vehículo, despacho…): `src/utils/constants.ts`.

### Claves i18n que ya existen
`add` Agregar · `edit` Editar · `view` Ver · `store` Guardar · `close` Cerrar · `cancel` Cancelar · `confirm` Confirmar · `enter` Ingrese · `select` Seleccione · `search` Buscar · `clearFilters` Limpiar filtros · `noInformation` No existe información · `status` Estado · `active` Activo · `observation` Observación · `observations` Observaciones · `description` Descripción · `executedTime` Tiempo Ejecutado · `noObservation` Sin observación · `observationsOf` Observaciones de {name}.

No existen `save`, `clear`, `noData`, `details`, `error`, `refresh`, `reset`, `selectAll` ni `requiredField`. Ojo: `required` es "Solicitado", no "obligatorio".
