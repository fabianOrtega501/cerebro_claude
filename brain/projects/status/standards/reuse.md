# Status — inventario de lo reutilizable

Qué pieza ya resuelve cada necesidad común en `status-api` (Laravel 13 / PHP 8.4) y en
`status-frontend` (Vue 2.7 con Vuesax), y qué no se hace. Se lee **antes de armar el plan**. Las
rutas son relativas al repo que nombra cada sección. Doctor avisa si una ruta deja de existir.

El monolito `status` ya no se desarrolla (desde el 2026-11-25): no se toma como referencia de
código nuevo.

Fuentes: el `CLAUDE.md` de cada repo, `status-api/docs/`, las memorias de los proyectos en el
cerebro y las secciones de `~/.claude/CLAUDE.md` que tocan Status.

## No se hace

- **Comentarios sueltos dentro del código.** Manda la regla del cerebro (decisión de Fabian del
  2026-10-07); `code-standards-guard` los niega.
- **status-frontend**
  - Lógica de negocio o llamadas HTTP en el store; buscar vue-i18n, vue-acl, mixins o carpetas `utils/`, `http/`, `acl/`.
  - Prefijo `fn_`, `::v-deep` / `>>>`, `console.log`, `var`; siempre `===`.
  - Comparar el IMEC con `> 0`: es `>= 0`.
  - Leer dos veces el cuerpo de un servicio (`data.data`): los servicios ya devuelven `respuesta.data`.
  - Copiar de AIO la URL `/storage` fuera de Sanctum, la URL horneada en el bundle, el `split('/api')`, el AES con la llave en el bundle o el 400 en vez de 403.
- **status-api**
  - `SoftDeletes`: el borrado lógico es la columna `estado`. API Resources, policies o Gates de negocio.
  - `migrate --pretend` (ejecuta de verdad), Artisan o Composer en el host.
  - Responder con `response()->json()`, `establecerArregloRetorno` o un arreglo crudo: siempre `ApiResponse`. Un error nunca con HTTP 200.
  - `Request` genérico: un Form Request por método. El controlador no consulta la base.
  - Mensajes repetidos como literales: van como constante de clase.
  - Un nivel `Sipa/Aprovechamiento`, rutas en `api.php`, un archivo de rutas sin `auth:sanctum`, la clave `providers` en `config/app.php`.
  - Editar `storage/api-docs/api-docs.json` a mano, PHPDoc en un método que atiende una ruta, prosa dentro del `@OA` o anotaciones `@OA` compartidas. El controlador tocado se documenta en el mismo cambio.
  - Agregar algo a `database/seeds` (congelada), que una migración de datos dependa de un seeder, `migrate` o `db:seed` contra una base compartida, cruzar la base de trabajo con `status_testing`.
  - `first()` en pruebas sin `orderBy`; inventar el payload de una prueba: se copia del front.
  - Confiar en `sanitizeQuery`; tocar por tocar el SQL crudo del gestor transaccional; reemplazos masivos sin revisar sitio por sitio.
  - Borrar `SinUso/` sin confirmación; asumir que una ruta existente funciona.
  - La regla `boolean` con FormData: las reglas salen de la tabla, no del controlador viejo.
  - Mencionar AIO u otros proyectos en un commit.
- **Los dos**: referencias a tickets, Mantis, GLPI o HU en código o docs; credenciales o rutas absolutas en archivos versionados; probar con escrituras.

## Backend (status-api)

### Respuestas, errores y controladores
- Respuesta JSON estándar `{status, message, data, meta}`: `ApiResponse` (`app/Http/Responses/ApiResponse.php`).
- Traducir una excepción o un código de Postgres y registrarla: `Controller::verificarExcepciones()` (`app/Http/Controllers/Controller.php`).
- Excepción de negocio: `CustomException` (`app/Exceptions/CustomException.php`); ejemplo de subclase en status-api: `app/Exceptions/Status/GestorTransaccional/CargueDeArchivoException.php`.
- Registrar un error en base y log: `ErrorService::logError()` (`app/Services/Common/Base/ErrorService.php`) o el trait `ManejoErrores::capturarError()` (`app/Traits/Common/ManejoErrores.php`).
- Controlador de referencia que se imita: `app/Http/Controllers/Status/GestionTramites/FormularioTramite/FormulariosTramitesController.php`.

### Validación
- Base de los Form Requests: `CommonFormRequest` (`app/Http/Requests/Common/CommonFormRequest.php`), con `mergeRules`, `validateString`, `validarDecimal`, `validarArchivo`. Ojo: su `failedValidation` responde HTTP 200 con `{code: 500}`; en lo nuevo se sobrescribe con `ApiResponse::warning()`.
- Llave foránea en un esquema: `ForeignKeyExists` (`app/Rules/Common/ForeignKeyExists.php`).
- Nombre de tabla que llega del cliente (solo status-api): `TablaDeTransaccion`, `TablaBloqueable`, `NombreDeArchivoDeCargue` (`app/Rules/`).

### Datos, parámetros y usuario
- CRUD y listado paginado con filtros (`filtros`, `ordenar_por`, `por_pagina`, `pagina_actual`): `BaseService` (`app/Services/Common/Base/BaseService.php`), que se apoya en `GetColumnTableName` (`app/Console/Utils/GetColumnTableName.php`).
- Parámetros de negocio de `public.parametros`: trait `ConsultaParametros` (`app/Traits/Status/ConsultaParametros.php`).
- Periodos y tasas: trait `UsarFuncion` (`app/Traits/Common/UsarFuncion.php`).
- Empresas del usuario (status-api): `DashboardService::obtenerEmpresasDelUsuario()` (`app/Services/Status/Dashboard/General/DashboardService.php`).
- Usuario autenticado: `Auth::id()`; no hay helper propio. "¿Es superusuario?" está repetido en tres servicios privados: si hace falta en un cuarto, se propone extraerlo.
- Auditoría en migraciones: traits de `app/Traits/Migrations/` (`AddAudit`, `AddAuditAndActive`, `AddAuditActiveAndTimestamps`).
- Filtro de transacciones bloqueadas (status-api): macro `WhereTransaccionBloqueadasMacro` (`app/Macros/Builder/WhereTransaccionBloqueadasMacro.php`).

### Exportaciones, documentos, archivos y correo
- Excel: `CustomExport` y `EstilosExcel` (`app/Exports/Utilities/`); formatos numéricos en status-api: `app/Const/NumberFormat.php`.
- PDF con dompdf: patrón `Pdf::loadView` de `app/Services/Sipa/Acta/ActaService.php` (status-api).
- Word: `app/Services/Status/GestorTransaccional/Reversion/DocumentosDeReversionService.php` (status-api).
- Archivos a binario o base64: `FileBinaryService` (`app/Services/Common/Base/FileBinaryService.php`) y `DocumentosService` (`app/Services/Common/Base/DocumentosService.php`).
- Correo: `CorreoService::enviarCorreo()` (`app/Services/Common/Base/CorreoService.php`).

### Seeders, objetos SQL y pruebas
- Menú y permisos: `database/seeders/MenusSeeder.php` y `ModulosSeeder.php`, que leen un JSON por módulo en `database/initialData/menus/` (por ejemplo `aprovechamiento.json`) y `modulos.json` (una pantalla nueva es una entrada en el JSON de su módulo).
- Objetos SQL: `DbObjectsSeeder`.
- Pruebas de status-api: `usuarioActivo()` y `superUsuario()` (`tests/TestCase.php`), datos de trámite (`tests/Support/GestionTramites/CreaTramitesDePrueba.php`).

## Front (status-frontend, `src/`)
- Cliente HTTP con el interceptor de 401: `apiClient`, importado de `@/axios` (`src/axios.js`).
- Capa de servicios, que espeja `app/Services` del back y devuelve `respuesta.data`: como `src/services/Status/GestorMaestros/MtListaMaestro/MtListaMaestrosService.js`.
- Avisar el error de una pantalla: `avisarErrorDeLaPantalla` (`src/composables/useFunction.js`).
- Sesión, empresas y permisos IMEC: `DatosSesion.vue` (`src/views/GestorInformacion/Estandar/DatosSesion.vue`); botonera estándar: `Botones.vue` (`src/views/GestorInformacion/Estandar/Botones.vue`).
- Selector de empresa: `Empresas.vue` y sus variantes (`src/views/GestorInformacion/Estandar/Empresas.vue`); de periodo, que emite `AAAAMMDD` en todas las frecuencias: `Frecuencia.vue` (`src/views/GestorInformacion/Estandar/Frecuencia.vue`).
- Moneda: `InputMoneda.vue` (`src/views/GestorInformacion/Estandar/InputMoneda.vue`); exportar: `ExportarArchivo.vue` (`src/views/GestorInformacion/Estandar/ExportarArchivo.vue`); importar Excel: `src/components/excel/ImportExcel.vue`.
- Tablas dinámicas: `src/views/GestorInformacion/Estandar/tablaDinamica.vue`.
- Notificaciones, confirmación y espera: `$vs.notify`, `$vs.dialog`, `$vs.loading` de Vuesax; tablas `vs-table`, popups `vs-popup`.
- Formulario con el estándar `campo` / `campo__label` / `campo__error`: referencia en `src/views/GestorInformacion/Transacciones/GestionTramites/EditorTramite.vue`.
