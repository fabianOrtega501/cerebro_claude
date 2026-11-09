# SGH — inventario de lo reutilizable

Qué pieza ya resuelve cada necesidad común en `sgh` (monolito Laravel 5.2.45 / PHP 7.1, vistas Blade con
jQuery y DataTables, PostgreSQL), y qué no se hace. Se lee **antes de armar el plan**. Las rutas son
relativas al repo; Doctor avisa si una deja de existir. El repo convive con dos generaciones: el
**estándar legado** (`ModelWithSoftDeletes` + `Controller` base, columnas `PREFIJO_COLUMNA`) y el **estándar
nuevo por módulo** (servicio + contrato + `QueryBuilder`, tablas con columnas en minúscula), cuyo único
ejemplo completo es Vacunas. Lo nuevo sigue el de Vacunas; lo legado solo se mantiene.

Fuentes: `README.md` (vacío), `docs/modules/GestionHumana/Vacunas/README.md`, `docs/modules/GestionHumana/Tickets/README.md`,
`composer.json`, el código de `app/`, `resources/views/widgets/`, `database/` y `tests/`. El repo no trae `CLAUDE.md` ni `.claude/`.

## No se hace

- Comentarios sueltos dentro del código (manda la regla del cerebro). El repo está lleno de ellos y de bloques comentados; no se imita.
- PHP 7.1 y Laravel 5.2.45 (`composer.json`): sin `??=`, funciones flecha (`fn`), propiedades tipadas, `?->`, `match` ni `enum`. `Collection::first` recibe `($callback, $default)`, no hay `firstWhere` (llega en 5.3). Las rutas se registran con `Route::` clásico, sin `Route::resource(...)->only()` ni API Resources.
- Extender el controlador legado para módulos nuevos (`getRequest()` convierte todo a mayúsculas y vacíos a `null`, `storeModel` y `destroyModel` usan `->send()` y `flash_alert`): un módulo nuevo va por servicio, como Vacunas.
- Lógica de negocio o consultas en el controlador de un módulo nuevo: el controlador llama a `IXxxService` inyectado por constructor. Un binding nuevo se registra en `app/Providers/ServiceBindingServiceProvider.php`, no en `AppServiceProvider`.
- Servicios nuevos que no extiendan `BaseService` e implementen su contrato, salvo los de reportes, que son clases sueltas que devuelven el query (`app/Services/Modules/Reportes/`).
- Registrar rutas de un módulo nuevo en `app/Http/routes.php`: va un archivo por módulo bajo `app/Http/Routes/Modules/`, que `RouteServiceProvider` carga solo.
- Un módulo nuevo sin permisos `<modulo>-index|create|edit|delete`: cada ruta lleva `->middleware('permission:...')` y el menú se siembra aparte.
- `Validator` de campo suelto en el controlador de un módulo nuevo: va en una clase `StoreXxxRequest` con `rules()` y `messages()` (ojo: no extienden `FormRequest`).
- Borrar registros del módulo nuevo: se anulan con `estado` (`ACTIVA = 1`, `ANULADA = 2`), no con `delete()` ni `SoftDeletes`.
- Insertar en migraciones o seeders con lógica no idempotente: todo seeder que corre desde una migración se puede ejecutar varias veces sin duplicar.
- Agregar un seeder nuevo a `DatabaseSeeder` si ya se ejecuta desde una migración (los de Vacunas solo se llaman desde `database/migrations`). `database/` está en el `classmap` de `composer.json`: un seeder nuevo exige `composer dump-autoload` en el despliegue.
- Ejecutar `migrate`, `db:seed` o `artisan` en el host; probar contra la base compartida con escrituras.
- Textos de interfaz y mensajes de validación en inglés: todo va en español (con tildes) y los archivos van guardados en UTF-8.
- Nombres de tablas del módulo nuevo en mayúsculas con prefijo de columna (`CARG_ID`): el esquema nuevo usa `sgh.NOMBRE_TABLA` con columnas en minúscula (`id`, `creado_por`, `fecha_creacion`, `estado`).
- Imitar `app/Http/Controllers/GestionHumana/ActualizarControllerxx.php` y `app/Http/Controllers/Reportes/RptXxxxxxController.php`: archivos huérfanos.
- Referencias a tickets, Mantis, GLPI o HU en código o docs; credenciales o rutas absolutas en archivos versionados.

## Controladores y CRUD

- CRUD legado de un catálogo (index / create / store / edit / update / destroy con papelera): extender `Controller` (`app/Http/Controllers/Controller.php`) con `$route` y `$class`; el constructor ya registra los permisos `<clase>-index|create|edit|delete` por nombre del modelo. Modelo de referencia: `app/Http/Controllers/CnfgContratos/CargoController.php`.
- Guardar, actualizar y borrar en el CRUD legado: `storeModel`, `updateModel`, `destroyModel`, `destroyModelAjax`, `forceDelete`, `restore`, `emptyTrash` (`app/Http/Controllers/Controller.php`); gancho antes de guardar: `beforeSave`; antes de borrar: `preDestroy`; relaciones muchos a muchos: `storeRelations`.
- Botones de fila en un listado: `buttonShow`, `buttonEdit`, `buttonDelete`, `buttonRestore` (`app/Http/Controllers/Controller.php`).
- Traducir una excepción a mensaje para el usuario: `capturaExcepcion` (`app/Http/Controllers/Controller.php`).
- Regla de negocio que falla y debe llegar como mensaje: `throw new AlertaException($mensaje)` (`app/Exceptions/AlertaException.php`) y el controlador la atrapa con `flash_alert($e->getMessage(), 'danger')` o `response()->json(['mensaje' => ...], 422)`.
- Controlador de módulo nuevo (servicio inyectado, `AlertaException`, redirección al empleado): `app/Http/Controllers/GestionHumana/Vacunas/VacunaController.php`.
- Registrar las rutas de un CRUD legado: `route_resource($name, $controller, $route, ['datatable' => true, 'trash' => true, 'deleteMult' => true, 'show' => true])` (`app/Http/Helpers/helpers.php`); aplica solo a `app/Http/routes.php`.
- Rutas de un módulo nuevo: archivo propio con prefijo, `namespace`, middleware `auth` y `permission:` por ruta, `where` numérico en los ids (`app/Http/Routes/Modules/GestionHumana/vacunas.php`); la carga automática está en `app/Providers/RouteServiceProvider.php`.
- Select2 remoto genérico sobre cualquier modelo (`?model=&column=&q=`): `Controller::ajax` (`app/Http/Controllers/Controller.php`); select2 con paginación propia (`{results:[{id,text}], pagination:{more}}`): `buscarEmpleados` en `app/Http/Controllers/GestionHumana/Vacunas/VacunaController.php`.
- Parámetros generales editables (`PARAMETROSGENERALES`): `getGlobalParameter($descripcion, $default)` y `getGlobalParameterToArrayCombine($parametro, $default)` (`app/Http/Helpers/helpers.php`); administración: `app/Http/Controllers/App/ParametroGeneralController.php`.

## Validación

- Reglas de un modelo legado: método estático `rules($id = 0)` en el modelo, que `Controller::validateRules` ejecuta; `unique` que ignora el registro actual: `static::unique($id, 'COLUMNA')`; unicidad compuesta: `static::uniqueWith($id, [...])` (`app/Traits/ModelRulesTrait.php`, paquete `felixkiss/uniquewith-validator`).
- Reglas de un módulo nuevo: clase `StoreXxxRequest` con `rules()`, `messages()`, `validador(array)` (para JSON, responde 422) y `validate($request)` (para formularios, redirige con errores). Referencia: `app/Http/Requests/Modules/GestionHumana/Vacunas/StoreVacunaRequest.php`.
- Fecha que no puede ser futura: `date|before:tomorrow` (`app/Http/Requests/Modules/GestionHumana/Vacunas/StoreVacunaRequest.php`).
- Archivos adjuntos: `file|mimes:jpeg,jpg,pdf,png|max:100000` (`app/Http/Requests/Modules/GestionHumana/NovedadesLaborales/StoreNovedadesLaboralesRequest.php`).
- Reglas personalizadas ya registradas (`overlapping`, `greater_than_field`, `salario`, `eps`, `arl`, `ccf`, `afp`, `afc`, `cargo`, `tiposalario`, `tipoempleador`, `empleadorclase`, `grupoturno`, `negocioempleador`, `equipocelular`, `validar_tarjeta`, `validar_licencia`): `Validator::extend` en `app/Providers/AppServiceProvider.php`.
- Mensajes de error del validador como arreglo plano: `formatValidationErrors` (`app/Http/Controllers/Controller.php`).

## Servicios

- Base de un servicio de módulo: `BaseService` con `getAll`, `getById`, `store`, `update`, `destroy`, `paginar($query, $porPaginaDefecto)` (lee `per_page`, acepta 10/25/50/100) y `aplicarBusqueda($query, $columnas)` (lee `buscar`, `ILIKE` sobre `CAST(... AS TEXT)`) (`app/Services/BaseService.php`).
- Auditoría de creación y modificación (`creado_por`, `fecha_creacion`, `modificado_por`, `fecha_modificacion`, `estado`): `auditoriaCreacion` y `auditoriaModificacion` en `app/Services/BaseService.php`; las usa `store` y `update` por herencia.
- Contrato del servicio: `IBaseService` (`app/Contracts/Services/IBaseService.php`) y una interfaz por módulo que lo extiende (`app/Contracts/Services/Modules/GestionHumana/Vacunas/IVacunaService.php`).
- Módulo completo de referencia: `app/Services/Modules/GestionHumana/Vacunas/VacunaService.php` (reglas de negocio, validaciones, anulación, exportación), `app/Services/Modules/GestionHumana/Vacunas/VacunaCargueService.php` (cargue fila por fila) y `app/Queries/Modules/Vacunas/VacunaQueryBuilder.php` (todo el SQL del módulo, separado del servicio).
- Enlazar interfaz con implementación: `$this->app->bind(...)` en `app/Providers/ServiceBindingServiceProvider.php`.
- Modelo del módulo nuevo (tabla `sgh.XXX`, `CREATED_AT` y `UPDATED_AT` propios, relaciones a `Prospecto`, `DetalleMaestros`, `User`): `app/Models/Modules/GestionHumana/Vacunas/Vacuna.php`, bajo `app/Models/Modules/`.
- Visibilidad por empresa, temporal, gerencia y cargo del usuario según su rol: `get_permisosgenerales($query)` (`app/Http/Helpers/helperModels.php`); el query debe tener unidos `EMPLEADORES`, `TEMPORALES`, `GERENCIAS` y `CARGOS`. Auxiliares: `get_permisosempresas_user`, `get_permisostemporales_user`, `get_permisosgerencias_user`, `get_permisoscargos_user`.
- Último contrato de un empleado: `VacunaQueryBuilder::SUB_ULTIMOS_CONTRATOS` (`app/Queries/Modules/Vacunas/VacunaQueryBuilder.php`); nombre completo: `VacunaQueryBuilder::NOMBRE_COMPLETO`; comparar texto sin tildes: `textoComparable` / `LETRAS_CON_TILDE` y `LETRAS_SIN_TILDE` (misma clase).
- Maestros y detalles (catálogos tipo `TIPO DE VACUNA`): `DetalleMaestros` con `whereHas('maestro', ...)` (`app/Models/DetalleMaestros.php`, `app/Models/Maestros.php`), como en `VacunaService::obtenerTiposVacuna`.
- Correo de una persona encargada por cédula o por prospecto: `CorreoEncargadoService::porCedula` y `porProspecto` (`app/Services/Modules/GestionHumana/Tickets/CorreoEncargadoService.php`).
- Consultas reutilizables del legado (por modelo): `repositorio('Ausentismo')`, `repositorio('Diagnostico')`, etc. (helper en `app/Http/Helpers/helperModels.php`; clases en `app/Repositories/`).
- Auditoría de cambios del modelo legado: `OwenIt\Auditing` ya viene en `ModelWithSoftDeletes` (`app/Models/ModelWithSoftDeletes.php`); campos `*_CREADOPOR`, `*_MODIFICADOPOR`, `*_ELIMINADOPOR` los llena `SoftDeletesTrait` (`app/Traits/SoftDeletesTrait.php`).
- Relaciones de un modelo con su conteo (para impedir borrar con hijos): `RelationshipsTrait::relationships('HasMany')` (`app/Traits/RelationshipsTrait.php`).

## Vistas y widgets Blade

- Layout de pantalla con menú: `@extends('layouts.menu')` con secciones `title`, `page_heading` y `section`; pilas `head`, `scripts` y `modals` (`resources/views/layouts/menu.blade.php`, `resources/views/layouts/plane.blade.php`).
- Incluir una vista hermana sin repetir la ruta: `@rinclude('form-inputs')` (directiva en `app/Providers/AppServiceProvider.php`); formulario crear y editar compartiendo `form-inputs` (`resources/views/cnfg-contratos/cargos/create.blade.php`).
- Campo de formulario: `@include('widgets.forms.input', ['type'=>'text|select|number|date|textarea|checkbox|email|file|password|time|color|icon|select-search', 'name'=>..., 'label'=>..., 'data'=>..., 'options'=>[...], 'column'=>n])` (`resources/views/widgets/forms/input.blade.php` y `input-<tipo>.blade.php`); botones de guardar y cancelar: `widgets.forms.buttons`; error de campo: `widgets.forms.alerta`.
- Select con búsqueda remota (select2 ajax): `type => 'select-search'` con `url` (`resources/views/widgets/forms/input-select-search.blade.php`); uso real en `resources/views/gestion-humana/vacunas/create.blade.php`.
- Select hijo que se llena según el padre: `@include('widgets.select-dependiente', ['selectPadre'=>..., 'selectHijo'=>..., 'url'=>..., 'nombreBusqueda'=>...])` (`resources/views/widgets/select-dependiente.blade.php`, script `public/assets/scripts/select2/select2-dependiente.js`).
- Alertas: `flash_alert($msg, 'success|info|warning|danger')` y `flash_modal` (`app/Http/Helpers/helpers.php`), que pintan `resources/views/widgets/flash-alert.blade.php` y `resources/views/widgets/alert.blade.php`.
- Modal de confirmación de borrar, restaurar o anular: `@include('widgets.modals.modal-withaction')` más el botón de `buttonDelete` / `buttonRestore`; variantes: `modal-delete`, `modal-actualizar`, `modal-loading` (`resources/views/widgets/modals/`).
- Otros: `widgets.panel`, `widgets.popup`, `widgets.tooltip`, `widgets.progress`, `widgets.collapse`, `widgets.labels`, `widgets.btnlink`, `widgets.button`, `widgets.buttongroup`, `widgets.validaFecha`, `widgets.lib.datetimepicker`, `widgets.charts.panelchart` (`resources/views/widgets/`).
- Directiva para fechas Carbon: `@datetime($fecha)` (`app/Providers/AppServiceProvider.php`); permisos en vista: `@permission('<modulo>-<accion>')` de Entrust.
- Formulario con campos y botones de referencia del módulo nuevo: `resources/views/gestion-humana/vacunas/form-inputs.blade.php`.

## Datatables y listados

- Listado legado con filtro por columna en el servidor (Yajra, `getData` por POST): ruta con `'datatable' => true`; controlador con `Datatables::eloquent($query)->addColumn('action', ...)->filterColumn(...)->make(true)`; vista con `@include('widgets.datatable.datatable-ajax', ['action'=>'POST', 'urlAjax'=>route($route.'.getData', compact('trash')), 'columns'=>[...]])` (`app/Http/Controllers/CnfgContratos/CargoController.php`, `resources/views/cnfg-contratos/cargos/index.blade.php`).
- Listado pequeño que carga todo en cliente, con exportación: `widgets.datatable.datatable-export` (`resources/views/cnfg-organizacionales/grupos/index.blade.php`); sin paginador propio: `widgets.datatable.datatable-sin-paginador`; base y utilidades: `datatable`, `datatable-footer`, `datatable-filters`, `datatable-filters-alert` (`resources/views/widgets/datatable/`).
- Listado nuevo paginado y con búsqueda en el servidor: el servicio llama `aplicarBusqueda` y `paginar` de `BaseService`; la vista usa `widgets.filtro-busqueda`, `widgets.paginador` (`['paginator' => $paginador]`) y `datatable-sin-paginador`. Referencia: `resources/views/gestion-humana/vacunas/index.blade.php`.
- Exportar el listado completo con los filtros activos: `exportar` del controlador que arma el archivo desde el servicio (`app/Http/Controllers/GestionHumana/Vacunas/VacunaController.php`, `exportarListado` en `VacunaService`).
- Concatenar nombres para una columna: `expression_concat([...], 'ALIAS', 'TABLA')` (`app/Http/Helpers/helpers.php`); arreglo para un select desde un modelo: `model_to_array(Modelo::class, 'COLUMNA', $pk, $whereArr)` (misma fuente).

## Cargue masivo Excel

- Cargue legado (la hoja se procesa en el navegador y se envía una fila por petición a `createFromAjax`): `@include('widgets.modals.modal-import', ['model'=>'Modelo'])` más `public/assets/scripts/importModelFromExcel.js` y `ModelController::createFromAjax` (`resources/views/widgets/modals/modal-import.blade.php`, `app/Http/Controllers/App/ModelController.php`); ruta propia con el parámetro `ruta`.
- Cargue de un módulo nuevo: modal propio con la plantilla, `importModelFromExcel.js` y un endpoint `cargue-fila` que responde `{status: OK|ERR, msg, csrfToken}`; controlador y servicio de referencia: `app/Http/Controllers/GestionHumana/Vacunas/VacunaCargueController.php`, `app/Services/Modules/GestionHumana/Vacunas/VacunaCargueService.php`; vista: `resources/views/gestion-humana/vacunas/modal-cargue.blade.php`; resumen en pantalla: `public/assets/scripts/vacunas/cargue-log.js`.
- Tres desenlaces por fila (cargada, ya registrada, rechazada) para que re-subir el archivo no duplique: constantes `CARGADA`, `YA_REGISTRADA`, `RECHAZADA` de `VacunaCargueService`.
- Plantilla descargable con lista desplegable y hoja oculta de catálogos: `plantilla` en `app/Http/Controllers/GestionHumana/Vacunas/VacunaCargueController.php` (Maatwebsite Excel 2 / PHPExcel).
- Lectura del `.xlsx` en el navegador: `public/assets/scripts/js-xlsx/xlsx.core.min.js` y `shim.min.js`.
- Cargue de imágenes: `public/assets/scripts/importModelImages.js`; cargue de contratos, novedades y prospectos: `widgets.modals.modal-importcontratos`, `modal-importnovedad`, `modal-importprospect` (`resources/views/widgets/modals/`).

## Reportes

- Registrar un reporte: entrada `['id'=>..., 'title'=>..., 'filterRequired'=>true]` en el arreglo del rol que corresponda (`$reportesgh`, `$reportescompartidos`, `$reportessst`, ...) de `app/Http/Controllers/Reportes/ReporteController.php`; ruta `Route::post('<Id>', 'Rpt<Tema>Controller@metodo')` en el grupo `reportes` de `app/Http/routes.php`; formulario de filtros `formRep<Id>.blade.php` en `resources/views/reportes/`, con `formRepBotones`.
- Controlador de reportes: extender `ReporteController`, armar un query con joins, aplicar `get_permisosgenerales($query)`, filtrar con `$this->data` y devolver `$this->buildJson($query, $columnaGrafico, $columnasExcluidas)` (`app/Http/Controllers/Reportes/RptTicketsController.php` como modelo corto).
- Respuesta del reporte: `buildJson` devuelve el JSON y, si pasa de 2000 filas, escribe un CSV en la carpeta del usuario dentro de la carpeta pública de almacenamiento (`app/Http/Controllers/Reportes/ReporteController.php`); generador de CSV desde un arreglo: `app/Http/Controllers/Exports/ReportesEstandarController.php`.
- Reporte con lógica extensa: servicio suelto que arma y devuelve el query (`execute(array $data)`), no hereda de `BaseService` (`app/Services/Modules/Reportes/ContratosCompensacion/ContratosCompensacionService.php`, usado en `RptContratosController::repContratosCompensacion`).
- PDF: `Barryvdh\DomPDF` (`app/Http/Controllers/GestionHumana/CertificadoContratoController.php`, `CarneController.php`; `buildPdf` en `app/Services/Modules/GestionHumana/NovedadesLaborales/NovedadesLaboralesService.php`).

## Migraciones y seeders

- Tabla nueva del esquema nuevo: `Schema::create('sgh.NOMBRE', ...)` con `id`, `fecha_creacion`, `creado_por`, `modificado_por`, `fecha_modificacion`, `estado` (`database/migrations/2026_07_25_000001_create_vacunas_table.php`).
- Seeder que corre desde una migración: la migración llama `Artisan::call('db:seed', ['--class' => 'XxxSeeder', '--force' => true])` y el seeder es idempotente (consulta antes de insertar) (`database/migrations/2026_07_25_000003_seed_catalogo_vacunas.php`, `database/seeds/CatalogoVacunasSeeder.php`).
- Permisos `<modulo>-index|create|edit|delete` y su asignación a roles `admin` y `gesthum` (`gesthum` sin delete): `database/seeds/VacunasModuloSeeder.php`; opción de menú bajo "Gestión Humana": `database/seeds/MenuVacunasSeeder.php` y su migración `database/migrations/2026_07_24_000001_insert_menu_vacunas.php`.
- Catálogo nuevo como maestro y detalles (`sgh.MAESTROS`, `sgh.DETALLE_MAESTROS`): `database/seeds/CatalogoVacunasSeeder.php`.
- Seeders de arranque de instalación (no de despliegue): `database/seeds/DatabaseSeeder.php`.

## Correos y tareas programadas

- Correo del ciclo de vida: evento + listener + job `SendEmail*` en cola (`app/Events/EventNewTicket.php`, `app/Listeners/CreateTicketListener.php`, `app/Jobs/SendEmailNewTicket.php`); reglas de destinatarios: `docs/modules/GestionHumana/Tickets/README.md`.
- Recordatorios periódicos: comando en `app/Console/Commands/` (`TicketsFinalizar`, `TicketsTemporal`, `ProximosFinalizar`) programado en `app/Console/Kernel.php`; `SghQueue.xml` es la tarea de Windows que lanza los jobs de Laravel.

## Helpers

- Cargados por `composer.json` (`files`): `app/Http/Helpers/helpers.php` y `app/Http/Helpers/helperModels.php`; antes de escribir uno nuevo se busca aquí.
- Texto: `str_upperspace` (nombre de clase a palabras), `number_to_letter`, `number_to_ordinal`.
- Fechas: `datetime`, `convert_to_date`, `validaFecha`, `getFechaHabilAdicionada` (suma días hábiles sin festivos).
- Modelos por nombre: `modelo($nombre)`, `get_model($nombre)` (resuelve `\SGH\Models\...`), `findId`, `findAll`, `findBy`.
- Ruta actual: `current_route_action`; logo: `get_logo`.
- Dominio de empleados: `get_permisosgenerales` y derivados (ver Servicios).

## Pruebas

- Prueba de servicio contra la base con transacción por prueba y usuario admin: extender `VacunasTestCase` (`tests/gestion-humana/vacunas/VacunasTestCase.php`, usa `DatabaseTransactions` y `markTestSkipped` si no hay admin); ejemplos: `tests/gestion-humana/vacunas/VacunaServiceTest.php`, `tests/gestion-humana/vacunas/VacunaCargueServiceTest.php`, `tests/gestion-humana/tickets/CorreosTicketsTest.php`.
- Fila de cargue como la envía el front: helper de `tests/gestion-humana/vacunas/VacunaCargueServiceTest.php`.
