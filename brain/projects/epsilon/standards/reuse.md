# Epsilon — inventario de lo reutilizable

Qué pieza ya resuelve cada necesidad común en `epsilon` (front Vue 3 con Options API y PrimeVue) y
en `epsilon-backend` (Express + Sequelize, capa nueva en `src/App` + `src/routes`), y qué no se
hace. Se lee **antes de armar el plan**. Las rutas son relativas a cada repo. Doctor avisa si una
deja de existir.

Fuentes: el `CLAUDE.md` de cada repo, `docs/contrato-backend.md` (idéntico en los dos) y
`epsilon-backend/docs/README.md`.

## No se hace

- **Los dos**: comentarios sueltos dentro del código (manda la regla del cerebro); `Authorization: Bearer` (el token es `x-access-token`); credenciales o rutas absolutas en lo versionado.
- **Frontend**
  - Llamar a la API desde un componente: siempre una clase de `src/services/` con `$api`.
  - Nada nuevo en `src/service/` (singular), `src/components/Utilidades/` ni páginas con la lógica dentro.
  - Migrar el legado o unificar estilo de paso; arreglar deuda conocida al paso de otro cambio.
  - Tablas nuevas desde cero: se reutiliza `src/components/standard/`.
  - `<script setup>`, composables, Pinia o i18n sin acordarlo; `this.` dentro del template.
  - Usar directo `BorrarItem`, `ContainerInputComponent`, `LoaderComponent` o `GenericSkeletonComponent`.
  - `catch { console.log }` o `console.error` como manejo de errores: `handleResponseErrors` + `notify`; para avisos nuevos, `notify()`, no `fnNotificar` ni `ToastService`.
  - Confiar en el código HTTP: se mira `response.status`. Replicar en los servicios el manejo de 401/403.
  - `require.context` en algo nuevo; corregir las erratas propagadas (`jwtOken`, `validatorCapcha`, `ConfimacionDialogo.vue`, `FacturaServie`, `TrnaService.js`).
  - Tomar como referencia la plantilla Sakai, el README, el código muerto o las ramas `meta.is_admin` / `meta.guest` / `localStorage.user`.
  - Usar `vuelidate@0.7`, `xlsx`, `volar-service-vetur`, `nodemon` o `dotenv`.
  - Construir permisos sobre `roles` esperando que el front los aplique.
  - Cambiar a `false` el fail-closed del bloqueo de tarifas ni "arreglar" `sui.vue:21`.
- **Backend**
  - Hacer crecer `src/modules`: lo nuevo va en `src/App` + `src/routes`.
  - Lógica de negocio en el controlador; `throw new Error` suelto para un error de usuario (va `BusinessError` con `statusCode`).
  - Lógica de cálculo en JS: va en `DBobjects/*.sql`. Funciones PL/pgSQL dentro de una migración. Editar una migración desplegada.
  - `db.open()` en código nuevo; interpolar parámetros en `Sequelize.literal()`.
  - Listados sin validar la relación usuario ↔ APS; un `WHERE` sin `verid`; asumir que `estado` / `activo` es booleano o que `1` es activo.
  - Una pantalla sin su seeder de menú; omitir `ApiResponse` o devolver un objeto donde se espera un array.
  - Reformatear archivos completos, imponer una nomenclatura nueva, reordenar los pasos de integración.
  - Confiar en el controlador que aparece en el log de errores; guiarse por `.gitignore` para saber qué existe.
  - Documentación fuera del MR que cambia la regla, o con emojis.

## Backend (`epsilon-backend`)
- Controlador base, con `try/catch`, log en base y `BusinessError` a 4xx: `BaseController` (`executeWithHandling`, `apiResponseSuccess`, `apiResponseWarning`) — `src/App/Controllers/Common/Base/BaseController.js`.
- Filtros JSON a un `where` de Sequelize (los textos con `iLike`): `BaseService` (`getSequelizeFilters`, `columnExists`) — `src/App/Services/Common/Base/BaseService.js`. No hay repositorio base.
- Respuesta estándar: `ApiResponse` (`success`, `warning`, `error`) — `src/App/Responses/ApiResponse.js`.
- Cierre de la validación (400 con `{field, message}`): `validateRequest` — `src/App/Requests/Common/Base/BaseRequest.js`.
- Valor único y llave foránea: `columnValueExists` (`src/App/Rules/Common/ColumnValueExists.js`) y `foreignKeyExists` (`src/App/Rules/Common/ForeignKeyExists.js`).
- Error de negocio: `err.name = 'BusinessError'` con `err.statusCode`; ejemplo en `src/App/Services/Modules/Suministros/Pgirs/ServicioPgirs.js`.
- Log de errores en base: `InsertLogError.insertLogError` — `src/Utilidades/insertLog.js`.
- Usuario autenticado: `req.SISID`, que deja `authJwt.verificarToken` — `src/middlewares/authJwt.js`.
- Permiso de descarga: `ValidacionPermisosService.validarPermisoDescarga` — `src/Utilidades/validacionPermisos.js`.
- APS del usuario: `ApsService.getLegacyByUser(userId)` — `src/App/Services/Modules/Settings/Aps/ApsService.js`; empresas por APS: `CompanyService` — `src/App/Services/Modules/Settings/Company/CompanyService.js`.
- Excel y Word desde plantilla: `ExportsService.fnExportFilesService` y `fnExportFilesServiceWord` — `src/services/exportService/exportService.js`. No hay generador de PDF.
- Funciones PL/pgSQL: seeder `src/database/seeders/20240722150147-update-database-functions.js`.
- Módulo de referencia completo: TipoProductividad — `src/routes/api/Modules/Suministros/tipos-productividad/v0.js` y sus carpetas en `src/App/`.

## Frontend (`epsilon`)
- Cliente HTTP (`x-access-token`, 401/403 a logout): `$api` — `src/utils/api.js`; errores: `handleResponseErrors` — `src/utils/handleResponseError.js`; avisos: `notify` — `src/utils/notify.js`.
- Validadores (`requiredValidator`, `maxLengthValidator`, `dateAfterField`…): `src/utils/validadores.js`.
- Fechas, empresa y texto: `dateFormatted`, `empresaAps`, `capitalizeText` — `src/utils/commonFunctions.js` (ojo: `dateFormatted` calcula el semestre distinto que `store.js`). Vacíos: `src/utils/helpers/helpers.js`.
- Contexto compartido (APS, fecha, semestre, usuario): store Vuex — `src/store.js`.
- Bloqueo de tarifa: `BloqueoTarifasService` — `src/service/procesos/bloqueoTarifas/BloqueoTarifasService.js` (legado, pero es la consulta central).
- Selector de APS y período: `src/components/Selector.vue`.
- CRUD declarativo: `TablaDataDinamicaComponente` — `src/components/standard/datatable/TablaDataDinamicaComponente.vue`, con sus modelos en `src/models/`; tabla simple con CSV: `src/components/standard/datatable/DataTableComponent.vue`; formulario por modelo: `src/components/standard/Formularios/FormularioDinamicoAccion.vue`.
- Modal: `src/components/standard/dialog/DialogComponent.vue`; confirmación: `src/components/standard/confirmacion/ConfimacionDialogo.vue`; carga: `src/components/standard/loader/ProgressBarComponent.vue`.
- Campos: `src/components/standard/dropdown/DropdownComponent.vue`, `src/components/standard/dropdown/SearchDropdownComponent.vue`, `src/components/standard/inputs/text-input/TextInputComponent.vue`, `src/components/standard/inputs/number/NumberInputComponent.vue`, `src/components/standard/calendar/CalendarComponent.vue`, `src/components/standard/switch/SwitchComponent.vue`, `src/components/standard/textarea/TextareaComponent.vue`.
- Botones: `src/components/standard/buttons/ButtonsAction.vue` y `src/components/standard/buttons/BotonesCargueInformacion.vue`.
- Módulo de referencia: tipos-productividad — `src/pages/suministros/tipos-productividad/index.vue` y `src/services/suministros/tipos-productividad/ServicioTipoProductividad.js`.
