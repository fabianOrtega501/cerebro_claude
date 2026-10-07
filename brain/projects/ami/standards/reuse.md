# AMI (app-movil) — inventario de lo reutilizable

Qué pieza ya resuelve cada necesidad común en `app-movil` (Ionic + Vue 3, captura sin conexión con
SQLite local y sincronización contra `aio-backend`), y qué no se hace. Se lee **antes de armar el
plan**. Las rutas son relativas al repo; Doctor avisa si una deja de existir.

Fuentes: el `CLAUDE.md` del repo, su `.claude/memory/` y el README.

## No se hace

- Comentarios sueltos dentro del código (manda la regla del cerebro).
- `fetch` suelto en un componente: va en una clase de `src/services/api/` que extienda `BaseApi`. SQL suelto en un componente: va en un servicio de `src/services/app/` que extienda `BaseService`.
- Escribir directo contra la API desde el flujo de captura: primero se guarda en local con su bandera de sincronización. No asumir que hay red.
- Asumir que la API es la del `.env`: se usa `getApiUrl()`.
- Agregar algo a `Migrations.ts` (sistema antiguo), editar una migración ya publicada, correr el `runSeeders()` antiguo con la app montada.
- Consultas concurrentes sobre `DatabaseService`: para concurrencia está `LocalDatabaseService`.
- Guardar `SCHEMA_STAMP` en `localStorage`: va en `Preferences`.
- Dejar sin limpiar la clave de un borrador, al guardar o al salir sin guardar.
- Que un lote fallido aborte todo el envío o se reporte como éxito total: se mantienen los tres desenlaces (total, parcial, fallido).
- Seleccionar elementos por índice global (`querySelectorAll('ion-item')[0]`).
- Scripts de automatización o capturas en el repo fuera de su skill; nada de eso en `src/` ni en `package.json`.
- Textos de interfaz fuera de i18n; tipar todo como `any` en código nuevo; agregar axios u ofetch.
- Rutas absolutas o credenciales en lo que se commitea.
- Editar a mano `android/variables.gradle`, `android/gradle/wrapper/gradle-wrapper.properties`, `android/app/capacitor.build.gradle` o `android/local.properties`.
- Diagnosticar un Code:0001 al ingresar como un problema de red: falta la versión en `mobile.app_versions` y hay que correr `AppVersionSeeder` en el backend.

## API y sesión
- Petición con token, timeout y URL por empresa: `$api.fetchApi` (`src/utils/api.ts`); base de las clases de API: `BaseApi` (`src/services/api/BaseApi.ts`), que lanza `"unauthenticated"` ante un 401.
- URL del backend por empresa: `getApiUrl` / `setApiUrl` (`src/composables/useApiUrlFunction.ts`).
- Usuario actual con `company_id`, `token` y `menus`: `getUserAth` / `setUserAth` (`src/composables/useFunction.ts`); en los envíos, `BaseSendData.userId` y `companyId`.
- Permiso (el usuario tiene un menú con esa URL): `hasPermission(url)` (`src/composables/baseUseFunction.ts`).
- Cambiar de empresa y reconstruir menús: `switchActiveCompany` (`src/composables/useCompanySwitch.ts`).

## Base local
- Conexión persistente para código nuevo: `LocalDatabaseService` (`src/services/app/LocalDatabaseService.ts`); la heredada, que abre y cierra en cada consulta: `DatabaseService` (`src/services/app/DatabaseService.ts`).
- CRUD genérico de una tabla: `BaseService<TEntity>` (`src/services/app/BaseService.ts`).
- Migración nueva: `BaseMigration` (`src/database/migrations/BaseMigration.ts`) registrada en `NewMigrations` (`src/database/NewMigrations.ts`); seeders nuevos en `src/database/NewSeeders.ts`; arranque del esquema: `SchemaService` (`src/services/app/SchemaService.ts`).
- Parámetros guardados en local: `ParameterService` (`src/services/app/ParameterService.ts`); borradores: `DraftService` (`src/services/app/DraftService.ts`); firmas: `SignatureService` (`src/services/app/SignatureService.ts`).
- SQL con paginación, orden y búsqueda: `applyPaginate`, `applyOrderBy`, `buildSearchClause` (`src/composables/useFunction.ts`).

## Sincronización
- Orquestar el envío de todos los módulos: `SendDataService` (`src/services/app/modules/common/send-data/SendDataService.ts`); base del envío de un módulo: `BaseSendData` (`src/services/app/modules/common/send-data/BaseSendData.ts`).
- Mostrar el resultado del envío: `useSyncResultMessage().showSyncResult` (`src/composables/standard/useSyncResultMessage.ts`).
- Lotes por cantidad y peso: `chunkBySize` (`src/composables/useFunction.ts`); solo por cantidad: `chunkArray` (`src/composables/standard/helpers.ts`).
- Importación paginada con progreso: `useImportPaginated` (`src/composables/standard/useImportPaginated.ts`); pantalla genérica: `src/components/ImportDataComponent/`.
- Aviso de actualización: `useAppUpdate` (`src/composables/useAppUpdate.ts`).

## Componentes
- Formulario que valida a sus hijos: `FormComponent` (`src/components/standard/form/FormComponent.vue`); paso de formulario: `FormCard` (`src/components/FormCard.vue`).
- Campos: `src/components/standard/inputs/`, `TextareaComponent` (`src/components/standard/textarea/TextareaComponent.vue`), selects en `src/components/standard/selects/`, fecha y hora: `DateTimeComponent` (`src/components/standard/date/DateTimeComponent.vue`).
- Firma: `SignaturePadComponent` (`src/components/standard/signature/SignaturePadComponent.vue`); una foto o adjunto: `SingleAttachmentComponent` (`src/components/standard/single-attachment/SingleAttachmentComponent.vue`); varias evidencias: `MultiEvidencesComponent` (`src/components/MultiEvidencesComponent/MultiEvidencesComponent.vue`); video: `VideoCaptureComponent` (`src/components/VideoCaptureComponent/VideoCaptureComponent.vue`).
- Mapa: `MapComponent` (`src/components/MapComponent/MapComponent.vue`); modal: `ModalComponent` (`src/components/standard/modal/ModalComponent.vue`); cliente: `ClientSelectorModal` (`src/components/standard/ClientSelector/ClientSelectorModal.vue`); dirección DANE: `src/components/DaneAddressComponent/`.
- Scroll infinito: `InfiniteScrollComponent` (`src/components/standard/infinite-scroll/InfiniteScrollComponent.vue`); carga: `AppLoading` (`src/components/AppLoading/AppLoading.vue`).

## Utilidades
- Alertas y toasts: `useAlert` (`src/composables/useAlert.ts`); toast según la respuesta del backend: `notify` (`src/utils/notify.ts`).
- Validaciones: `src/composables/standard/validators.ts`; vacíos y agrupación: `src/composables/standard/helpers.ts`.
- Fechas: `dayjs` con UTC (`src/utils/dayjs.ts`) y `getCurrentCountryDate` (`src/composables/useFunction.ts`).
- Fotos: `usePhotoService(storageKey)` (`src/composables/usePhotoGallery.ts`); borrador de un formulario: `createLocalStorageEntity` (`src/composables/baseUseFunction.ts`).
- Odómetro u horómetro en cero: `useZeroMeterControl` (`src/composables/standard/useZeroMeterControl.ts`).
- Traducir fuera de componentes: `t()` (`src/utils/translate.ts`); textos en `src/plugins/i18n/locales/es.json` y `en.json`.
