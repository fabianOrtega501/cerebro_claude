# Presupuesto -> Plantas de presupuesto

- Ruta (URL): `/cnfg-presupuesto/plantaspresupuestos`  |  Modulo del backend: CnfgPresupuesto (monolito, Blade + jQuery)  |  Estado: `parcial`  |  Actualizado: 2026-11-09

Mapa sacado solo del codigo (sin base ni API: no hay contenedor local y la unica credencial es de produccion). Lineas aproximadas.

## Permisos
| Subject | Abilities | Donde se exige |
|---|---|---|
| `plantapresupuesto` (= `strtolower` de la clase del modelo, `$nameClass` en `Controller::__construct`) | `-index` (index, getData), `-create` (create, store), `-edit` (edit, update), `-delete` (destroy) | `app/Http/Controllers/Controller.php:24-47`, middleware `permission:` con `only`. El constructor de `PlantaPresupuestoController` (l.30) solo llama `parent::__construct()` |
| `app-trash` | trash, restore, forceDelete | Grupo de middleware dentro de `route_resource` con `trash=>true` (`app/Http/Helpers/helpers.php:28-52`). La vista tambien lo usa con `@permission('app-trash')` para el boton de papelera |
| `app-model` | boton de importar Excel | Solo en la vista: `@permission('app-model')` en `widgets/modals/modal-import.blade.php`. El `ModelController` lo exige en su constructor (`app/Http/Controllers/App/ModelController.php:~35`) pero la ruta de cargue masivo de planta NO pasa por el (ver Hallazgos) |
| Menu | `plantapresupuesto-index` | `database/seeds/MenuTableSeeder.php:~484-489` (y otra entrada en l.~893-898), URL `cnfg-presupuesto/plantaspresupuestos`. Permisos creados en `database/seeds/PermissionsTableSeeder.php:54` (`createPermissions(PlantaPresupuesto::class, 'niveles de cargos', ...)`, display name copiado de otro modulo) |

## Rutas / Endpoints
Grupo `prefix cnfg-presupuesto`, `namespace CnfgPresupuesto` en `app/Http/routes.php:226-249`. Linea 232: `route_resource('plantaspresupuestos', 'PlantaPresupuestoController', 'cnfg-presupuesto.plantaspresupuestos', ['datatable'=>true,'trash'=>true])`.

`route_resource` genera: `Route::resource` sin `show` (index, create, store, edit, update, destroy; nombres `cnfg-presupuesto.plantaspresupuestos.*`), mas `POST .../getData` (datatable) y, con permiso `app-trash`, `GET .../trash` (index con `trash=true`), `PUT .../restore/{id}`, `DELETE .../forceDelete/{id}`.

| Metodo | Endpoint | Controlador@metodo | Accion de la interfaz | Permiso |
|---|---|---|---|---|
| GET | /cnfg-presupuesto/plantaspresupuestos | PlantaPresupuestoController@index (l.40) | Listado | plantapresupuesto-index |
| POST | .../plantaspresupuestos/getData | @getData (l.50) | Datatable server-side | plantapresupuesto-index |
| GET | .../create | @create (l.134) | Formulario nuevo | plantapresupuesto-create |
| POST | .../plantaspresupuestos | @store (l.145) -> `parent::storeModel()` | Guardar nuevo | plantapresupuesto-create |
| GET | .../{id}/edit | @edit (l.157) | Formulario editar | plantapresupuesto-edit |
| PUT | .../{id} | @update (l.171) | Guardar edicion | plantapresupuesto-edit |
| DELETE | .../{id} | @destroy (l.225) -> `destroyModel` (soft delete) | Eliminar | plantapresupuesto-delete |
| GET | .../trash | @index con trash=true | Papelera | app-trash |
| PUT/DELETE | .../restore/{id}, .../forceDelete/{id} | Controller base `restore` / `forceDelete` | Restaurar / borrar definitivo | app-trash |
| GET | /cnfg-presupuesto/cargarExcelPlantaPresupuesto/{model} (nombre `cargarExcelPlantaPresupuesto`, routes.php:247) | @cargaMasivaExcel (l.1980) | Cargue masivo Excel (una fila por llamada) | Ninguno de permiso, solo `auth` (ver Hallazgos) |
| GET | /cnfg-presupuesto/liquidarPresupuestoFromAjax/{model} | @liquidarPresupuestoFromAjax (l.235, ~1700 lineas) | Boton Excel verde en `create`: liquida presupuesto | Ninguno de permiso por ruta |
| GET | /gestion-humana/buscaGerencia, buscaGrupo, buscaTurno, buscaCentroCosto, buscaCentroOperacion | `GestionHumana\ContratoController@busca*` (routes.php:386-392) | Selects dependientes del formulario | Sin middleware propio visible en la ruta |

`PlantaPresupuestoController` NO define metodos `busca*`: los selects dependientes usan los del `ContratoController` (ejemplo: `buscaCentroOperacion`, l.1029: `modelo('CentroOperacion')->where('EMPL_ID', findId('Empleador', request('id'))->EMPL_ID)`, devuelve JSON `[{CEOP_DESCRIPCION, CEOP_ID}]`).

## Servicios y consultas
No hay capa de servicios: toda la logica esta en controlador y clase base.

| Clase (archivo) | Metodos | Que resuelve |
|---|---|---|
| `app/Http/Controllers/CnfgPresupuesto/PlantaPresupuestoController.php` | `$route='cnfg-presupuesto.plantaspresupuestos'`, `$class=PlantaPresupuesto::class` (l.26-28) | Define subject de permiso y ruta base |
| idem | `getData` (l.50-108) | `PlantaPresupuesto::join PRESUPUESTOS` + leftJoin EMPLEADORES, GERENCIAS, GRUPOS, TURNOS, CARGOS. Select: `PLPR_ID, PRES_NOMBRE, EMPL_NOMBRECOMERCIAL, GERE_DESCRIPCION, GRUP_DESCRIPCION, TURN_DESCRIPCION, CARG_DESCRIPCION, PLPR_ENERO..PLPR_DICIEMBRE, PLPR_OBSERVACIONES, PLPR_CREADOPOR, PLPR_MODIFICADOPOR, PLPR_ELIMINADOPOR, PLPR_NUEVA (CASE 1->'Si', 2->'No'), PLPR_FECHA_AUTORIZACION`. `Datatables::eloquent`, `onlyTrashed()` si `trash`. Columna `action` con botones. Un `filterColumn('CAGE_DESCRIPCION')` huerfano (columna que no existe en el select) |
| idem | `getArrays` (l.111-127) | Arrays de selects: `arrPresupuestos, arrEmpleadores (Auth::user()->empleadores), arrGerencias, arrCentrosCostos, arrTiposcontrato, arrGrupos, arrTurnos, arrCargos, arrCentrosOperaciones, arrTiposSalarios` (parametro global `TIPOS_SALARIOS`, `NORMAL,INTEGRAL`). Usado por `create` y `edit` |
| idem | `update` (l.171-222) | Firma `update($id, $relations=[], $redirectindex=true, $data=[])`: con `$data` lleno es cargue masivo, si no `getRequest()`. Fuerza `PLPR_FECHA_AUTORIZACION=null` si no viene. `validateRules`, `fill`, `beforeSave`, `save`. Si no es redirect, lanza `AlertaException` con errores JSON |
| idem | `validarReglasNegocio` (l.1943, static) | Solo logica de `PLPR_NUEVA` (SI->1 exige fecha, NO->2 exige fecha vacia, otro valor alerta). Devuelve `['alertas','reglas','datos']`; `reglas` solo se llena (`PlantaPresupuesto::rules($id)`) si NUEVA es SI/NO valido |
| idem | `cargaMasivaExcel` (l.1980-2073) | Ver Cargue masivo |
| idem | `preparaDatos` (l.2076-2127) | Copia de la logica de `createFromAjax` para el camino ACTUALIZAR: antepone prefijo, resuelve BelongsTo |
| idem | `obtenerValorhora` (l.2131) | Privado, lee parametro `PPTO_HORA_LABORAL` (`ParametroGeneralController`) |
| `app/Http/Controllers/Controller.php` | `validateRules` (l.81): `Validator::make($data, call_user_func($this->class.'::rules', $id))`; `storeModel` (l.92): `getRequest` -> `validateRules` -> `fill` -> `beforeSave` -> `save` -> `storeRelations`, flash y redirect a `$route.index`; `getRequest` (l.200): vacios a `null` y todo a MAYUSCULAS salvo `getNoUppercase()` del modelo | PLPR no define `$noUppercase` |
| `app/Http/Controllers/App/ModelController.php` | `createFromAjax` (l.45-150), `ejecutarReglasNegocio`, `validator` (l.942), `$reglasNegocio` (l.27-31, incluye `PlantaPresupuesto`) | Ver Cargue masivo |

### Cargue masivo por Excel
- Front: `widgets.modals.modal-import` con `['model'=>'PlantaPresupuesto','ruta'=>'cargarExcelPlantaPresupuesto']` (index.blade.php:11) -> `public/assets/scripts/importModelFromExcel.js`. Lee la primera hoja con `XLSX.utils.sheet_to_json` y manda **una fila por llamada GET** (`data = fila + row`). Los encabezados del Excel son las claves; las celdas vacias no llegan. Cada respuesta `{status:'OK'|'ERR', msg}` se pinta como `Fila N: msg` (verde/rojo). Plantilla: `public/templates/TemplateImportPlantaPresupuesto.xlsx` (existe; el modal arma `templates/TemplateImport{model}.xlsx`, contenido de la plantilla no inspeccionado).
- `cargaMasivaExcel`: `getRequest()` (mayusculas); `NOVEDAD` -> `ACTUALIZAR=1, ELIMINAR=2, CREAR=3, vacio=3`; otro valor -> `ERR "La novedad ingresada no es una accion valida"`.
  - ACTUALIZAR: exige `CODIGO_PLANTA` (= `PLPR_ID`); `preparaDatos` -> `validarReglasNegocio('', '', datos, [], '', 0)` -> `update($CODIGO_PLANTA, [], false, $datos)`.
  - ELIMINAR: `destroyModelAjax($CODIGO_PLANTA, true)` (soft delete); `status==='danger'` -> `ERR`.
  - CREAR: `(new ModelController)->createFromAjax($modelClass, $request)`.
  - Excepciones: `capturaExcepcion($e, ' la planta de personal ')` (Controller.php:515) -> `ERR`.
- Mapeo de columnas (`createFromAjax` y `preparaDatos`): prefijo = `strtoupper(substr(Modelo::CREATED_AT,0,5))` = `PLPR_`. Cada encabezado del Excel que no sea relacion queda como `PLPR_<ENCABEZADO>` (ej. `SALARIOBASE` -> `PLPR_SALARIOBASE`, `NUEVA` -> `PLPR_NUEVA`, `FECHA_AUTORIZACION` -> `PLPR_FECHA_AUTORIZACION`). Se agrega `CREADOPOR` = usuario autenticado (-> `PLPR_CREADOPOR`). Cualquier encabezado extra (`NOVEDAD`, `CODIGO_PLANTA`, `row`) queda como `PLPR_*` pero se ignora al no estar en `$fillable`.
- Relaciones BelongsTo: se detectan por reflexion (`RelationshipsTrait::getRelationships`) y el encabezado debe llamarse **como el metodo de la relacion**: `presupuesto, empleador, gerencia, centrocosto, grupo, turno, cargo, centrooperacion, tipocontrato`. Su valor se busca por la `$filterKey` del modelo relacionado (en mayusculas): Presupuesto `PRES_NOMBRE`, Empleador `EMPL_NOMBRECOMERCIAL`, Gerencia `GERE_DESCRIPCION`, CentroCosto `CECO_CODIGO`, Grupo `GRUP_DESCRIPCION`, Turno `TURN_DESCRIPCION`, Cargo `CARG_DESCRIPCION`, CentroOperacion `CEOP_DESCRIPCION`, TipoContrato `TICO_DESCRIPCION`. Si no existe: alerta `No existe "x" en <Modelo>` por `*_ID`, y `AlertaException` con JSON.
- Crear: `PlantaPresupuesto::$filterKey = 'PLPR_ID'` = clave primaria, asi que `createFromAjax` no busca existentes (siempre crea). Luego `ejecutarReglasNegocio` llama `PlantaPresupuestoController::validarReglasNegocio` (por `$reglasNegocio`), asigna `$this->alerts`, y `validator($datos,$reglas,$prefix)` lanza `Exception` con JSON de errores (prefijo `PLPR_` removido del texto). `NUEVA` del Excel se espera como `SI`/`NO` y se convierte a 1/2.
- Una columna nueva en el Excel funciona sola si es `<ENCABEZADO>` = nombre de columna sin `PLPR_` y esta en `$fillable`; si es FK nueva hay que agregar la relacion BelongsTo con el nombre del encabezado y su `filterKey`.

## Modelos / Tablas
| Modelo | Tabla | Relaciones | Indices o defaults que importan |
|---|---|---|---|
| `app/Models/PlantaPresupuesto.php` (extiende `ModelWithSoftDeletes`) | `PLANTASPRESUPUESTOS`, PK `PLPR_ID`, `filterKey=PLPR_ID`, traza `PLPR_FECHACREADO/MODIFICADO/ELIMINADO` (+ `*POR`) | belongsTo: presupuesto (PRES_ID), empleador (EMPL_ID), gerencia (GERE_ID), centrocosto (CECO_ID), grupo (GRUP_ID), turno (TURN_ID), cargo (CARG_ID), centrooperacion (CEOP_ID), tipocontrato (TICO_ID). hasMany: liquidacionespresupuestos (PLPR_ID), plantasdominicales (PLPR_ID). Scope `plantas()` hace join de empleadores, gerencias, cargos, grupos, turnos, centrosoperaciones, centroscostos, tiposcontratos | FKs con `onDelete/onUpdate cascade` sobre las 9 tablas relacionadas |

- `$fillable` (l.18-52): `PRES_ID, EMPL_ID, GERE_ID, CECO_ID, CARG_ID, GRUP_ID, TURN_ID, CEOP_ID, TICO_ID, PLPR_TIPOSALARIO, PLPR_FACTORARL, PLPR_SALARIOBASE, PLPR_BONIFICACION, PLPR_COMISION, PLPR_RODAJE, PLPR_INDEMNIZACION, PLPR_OTRO, PLPR_INCREMENTO, PLPR_ENERO..PLPR_DICIEMBRE, PLPR_NUEVA, PLPR_FECHA_AUTORIZACION, PLPR_OBSERVACIONES`. Un campo nuevo debe agregarse aqui o `fill()` lo ignora en silencio.
- `rules($id)` (l.54-90): todos `required` (+ `numeric` en ids y valores) salvo `PLPR_OBSERVACIONES` (`max:300`) y `PLPR_FECHA_AUTORIZACION` (`date`, no required). `PLPR_FACTORARL` `in:0.00522,0.01444,0.02436,0.04350,0.06960`; `PLPR_TIPOSALARIO` `max:30`; `PLPR_NUEVA` `required`. Una columna nueva `required` aqui tambien fallara en el cargue masivo y en el update.
- Migraciones: `database/migrations/2019_02_04_000039_create_plantas_presupuestos_table.php` (crea la tabla; todos los valores `unsignedInteger` NOT NULL salvo `PLPR_FACTORARL`/`PLPR_INCREMENTO` `double(4,4)`; `PLPR_OBSERVACIONES` string 300 nullable; comentario de tabla segun `DB_CONNECTION` pgsql/mysql) y `2022_06_06_150516_columns_nueva_fecha_autorzacion_to_plantaspresupuestos.php` (agrega `PLPR_NUEVA` unsignedInteger nullable y `PLPR_FECHA_AUTORIZACION` date nullable; es el patron mas cercano a "agregar columna"). Convencion: `Schema::table`, `echo '- Creando campo en ...'`, `->comment(...)`, `down()` con `dropColumn`.
- Otras tablas que leen PLANTASPRESUPUESTOS (impacto al agregar columna): `LIQUIDACIONESPRESUPUESTOS` y `PLANTASDOMINICALES` (FK `PLPR_ID`), `ItemLiquidacionController` (l.98-128, 380-384), `Reportes/RptPresupuestosController` (l.155+), `PlantaDominicalController` y `resources/views/cnfg-presupuesto/plantasdominicales/*`, `resources/views/widgets/modals/form-inputs.blade.php`. Seeder `database/seeds/PresupuestosTableSeeder.php:73` crea plantas con `PlantaPresupuesto::create`.

## Front
Carpeta `resources/views/cnfg-presupuesto/plantaspresupuestos/`.

| Vista | Servicio | Estado compartido | Notas |
|---|---|---|---|
| `index.blade.php` (104 l.) | `POST route('...getData')` por `widgets.datatable.datatable-ajax` | Ninguno | `<thead>` con 24 `<th>` + vacio de accion y arreglo `columns` en orden: `PLPR_ID, PRESUPUESTOS.PRES_NOMBRE, EMPLEADORES.EMPL_NOMBRECOMERCIAL, GERENCIAS.GERE_DESCRIPCION, GRUPOS.GRUP_DESCRIPCION, TURNOS.TURN_DESCRIPCION, CARGOS.CARG_DESCRIPCION, ENERO..DICIEMBRE, PLPR_OBSERVACIONES, PLPR_CREADOPOR, PLPR_NUEVA, PLPR_FECHA_AUTORIZACION` + (`PLPR_ELIMINADOPOR` si trash, si no `PLPR_MODIFICADOPOR`). Orden y cantidad de `<th>` deben coincidir con `columns` y con el select de `getData`. Boton importar Excel (l.11), papelera, crear |
| `create.blade.php` (17 l.) | `store` | - | Incluye `from-input-script`, `liquidacion-import` (`model=LiquidarPresupuesto`, boton Excel verde a `liquidarPresupuestoFromAjax`) y `form-inputs` |
| `edit.blade.php` (11 l.) | `update` (PUT) | - | `Form::model($plantapresupuesto)`; incluye `from-input-script` y `form-inputs` |
| `form-inputs.blade.php` (114 l.) | - | - | Filas de `widgets.forms.input` (selects con `data=>$arr...`, numeros con `options=>['required']`, `PLPR_NUEVA` select 1=Si/2=No, `PLPR_FECHA_AUTORIZACION` tipo date con `dependiente`). Cada select padre-hijo va seguido de `widgets.select-dependiente`. Termina con `widgets.forms.buttons` |
| `from-input-script.blade.php` (25 l.) | - | - | JS: habilita/obliga `PLPR_FECHA_AUTORIZACION` segun `PLPR_NUEVA` (1 habilita y requiere; 2 limpia y deshabilita) |
| `duplicatecreate.blade.php`, `liquidacion-import.blade.php` | - | - | La primera no tiene ruta que la use (funcionalidad comentada en index); la segunda es el modal de liquidar |

Dependencias en el formulario (selectPadre -> selectHijo, URL): EMPL_ID -> GERE_ID (`gestion-humana/buscaGerencia`), EMPL_ID -> GRUP_ID (`buscaGrupo`), EMPL_ID -> TURN_ID (`buscaTurno`), GERE_ID -> CECO_ID (`buscaCentroCosto`), EMPL_ID -> CEOP_ID (`buscaCentroOperacion`). Cargo y Tipo de contrato no son dependientes.

### Widget `widgets.select-dependiente`
`resources/views/widgets/select-dependiente.blade.php` (empuja a `scripts`) + `public/assets/scripts/select2/select2-dependiente.js` (`fillDropDownAjax`).
- Parametros: `url` (obligatorio, pasa por `URL::to`), `selectPadre` (id del select padre), `selectHijo` (id del select hijo), `nombreBusqueda` (campo del JSON que se muestra como texto), `placeholder` (se recibe pero el widget no lo usa), opcionales `idBusqueda` (campo del JSON usado como value; por defecto = `selectHijo`) y `msgModel` (texto del aviso; por defecto `'datos'`).
- Al cargar la pagina deshabilita el hijo si su valor esta vacio o null. Al `change` del padre: vacia y deshabilita el hijo, hace GET a `url` con `?id=<valor del padre>`, llena `<option value=item[idBusqueda]>item[nombreBusqueda]</option>`, rehabilita y limpia la seleccion. Si el JSON viene vacio muestra toastr de advertencia `No se encontraron <msgModel> para la opcion seleccionada.` y deja el hijo deshabilitado; en error muestra toastr de error segun `Unauthorized` / `Forbidden` / otro.
- Contrato del endpoint hijo: `GET <url>?id=<padre>` devuelve JSON array con objetos que contengan los campos `idBusqueda` y `nombreBusqueda`. Ejemplo: `ContratoController::buscaCentroOperacion` (l.1029-1037) usado en `form-inputs.blade.php` de esta vista con `url=gestion-humana/buscaCentroOperacion, selectPadre=EMPL_ID, selectHijo=CEOP_ID, nombreBusqueda=CEOP_DESCRIPCION`.
- Nota: en el formulario de planta nunca se pasa `msgModel`, asi que el aviso sale como "No se encontraron datos".

## Hallazgos (decisiones o riesgos)
- `cargarExcelPlantaPresupuesto` (routes.php:247) solo exige `auth`: los middleware de permiso del constructor llevan `only` para index/getData/create/store/edit/update/destroy y `cargaMasivaExcel` no esta; `new ModelController` dentro del metodo no ejecuta su middleware `app-model`. El boton se oculta con `@permission('app-model')`, pero la ruta es llamable por cualquier usuario autenticado (crear/actualizar/eliminar plantas). Lo mismo para `liquidarPresupuestoFromAjax`.
- En el camino CREAR, si el Excel no trae `NUEVA`, `validarReglasNegocio` devuelve `reglas = []` y no se valida nada (ni campos requeridos). En ACTUALIZAR no ocurre porque `update()` corre `validateRules` completo.
- En ACTUALIZAR se llama `validarReglasNegocio(..., $id = 0)`: las reglas que arma se descartan; `update()` valida de nuevo con las `rules($id)` del modelo.
- `getData`: `filterColumn('CAGE_DESCRIPCION')` hace referencia a una tabla/columna que no existe (resto de un copy/paste), no afecta hoy.
- `getArrays` usa `Gerencia, CentroCosto, Grupo, Turno, Cargo, CentroOperacion::class` sin `use` en el controlador (solo hay `use` de Presupuesto, TipoContrato, Empleador...). El `::class` resuelve a `SGH\Http\Controllers\CnfgPresupuesto\...`; funciona porque `model_to_array` resuelve el modelo por nombre base (no verificado el mecanismo exacto en `helpers.php`, `get_model`).
- Para una columna nueva visible en el listado hay que tocar 3 sitios en sincronia: `getData` (select), `<th>` y arreglo `columns` en `index.blade.php`.
- El `permission` display name de `plantapresupuesto-*` dice "niveles de cargos" (copiado), solo cosmetico.

## Pendiente
- Nada contrastado contra base ni API (no hay ambiente local y la unica credencial es de produccion): tipos reales de columna, indices, datos de `PARAMETROS` (`TIPOS_SALARIOS`, `PPTO_HORA_LABORAL`) y que roles tienen `plantapresupuesto-*`.
- Contenido de `TemplateImportPlantaPresupuesto.xlsx` (encabezados reales): solo se verifico que existe.
- `liquidarPresupuestoFromAjax` (l.235-1941) no se mapeo: es el motor de liquidacion, no de CRUD; solo se vio que lee `PLANTASPRESUPUESTOS`. Revisarlo si la nueva columna debe entrar en la liquidacion.
- Mecanismo exacto de `model_to_array`/`get_model` para clases sin `use`, `widgets.forms.input` (soporte `dependiente`), `destroyModel`, `restore`, `forceDelete` y `buttonDelete` de la base no se leyeron a fondo.
- Si `ContratoController::busca*` heredan permiso (constructor de `ContratoController` no revisado).
