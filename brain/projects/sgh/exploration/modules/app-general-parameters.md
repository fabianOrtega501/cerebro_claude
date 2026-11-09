# App -> Parametros generales (menu: "Parametros del Sistema")

- Ruta (URL): `app/parametrosgenerales`  |  Modulo del backend: App  |  Estado: `parcial`  |  Actualizado: 2026-11-09
- Mapeado solo desde el codigo (monolito Laravel 5.2, Blade + jQuery, repo unico `/datos/proyectos/sgh`). No se toco API ni base: no hay entorno local.

## Permisos
| Subject | Abilities | Donde se exige |
|---|---|---|
| `app-parametrosgenerales` | uno solo, sin separar index/create/edit/delete | `$this->middleware('permission:app-parametrosgenerales')` en el constructor de [ParametroGeneralController](../../../../../../../datos/proyectos/sgh/app/Http/Controllers/App/ParametroGeneralController.php), junto a `auth`. Sembrado con `firstOrCreate` en `database/seeds/PermissionsTableSeeder.php` (~l.325); item de menu en `MenuTableSeeder.php` (~l.109) |

## Rutas / Endpoints
Una sola linea en `app/Http/routes.php:43`, dentro del grupo `prefix app`, `namespace App`: `Route::resource('parametrosgenerales', 'ParametroGeneralController')` (sin `parameters` ni nombres; el parametro de ruta es `{parametrosgenerale}` y el metodo lo recibe como `$PAGE_ID`).

| Metodo | Endpoint | Controlador@metodo | Accion de la interfaz | Permiso |
|---|---|---|---|---|
| GET | `app/parametrosgenerales` | index | Lista (`ParametroGeneral::all()`, sin paginar) | `app-parametrosgenerales` |
| GET | `app/parametrosgenerales/create` | create | Boton "+" | idem |
| POST | `app/parametrosgenerales` | store -> `parent::storeModel()` | Guardar | idem |
| GET | `app/parametrosgenerales/{id}/edit` | edit (`findOrFail`) | Boton editar | idem |
| PUT/PATCH | `app/parametrosgenerales/{id}` | update -> `parent::updateModel($id)` | Guardar edicion | idem |
| DELETE | `app/parametrosgenerales/{id}` | destroy -> `parent::destroyModel($id)` | Boton borrar + modal | idem |

Store/update/destroy usan la logica generica de `app/Http/Controllers/Controller.php` (`getRequest`, `validateRules` con `ParametroGeneral::rules($id)`, `fill`, `save`). Redirige al index con flash. Borrado: soft delete (ver modelo).
Ojo: existe otro modulo distinto, `app/parameters` (`ParametersController`, permiso `app-parameters`); no confundir.

## Servicios y consultas
No existe servicio ni contrato (`app/Services`, `app/Contracts` no mencionan parametros). La lectura es por helper o consulta directa; ver "Quien lee los parametros".

## Modelos / Tablas
| Modelo | Tabla | Relaciones | Notas |
|---|---|---|---|
| `SGH\Models\ParametroGeneral` ([archivo](../../../../../../../datos/proyectos/sgh/app/Models/ParametroGeneral.php)) extiende `ModelWithSoftDeletes` | `PARAMETROSGENERALES`, PK `PAGE_ID` | ninguna | Soft delete: `PAGE_FECHAELIMINADO` / `PAGE_ELIMINADOPOR`. Traza `PAGE_FECHACREADO`, `PAGE_FECHAMODIFICADO`, `PAGE_CREADOPOR`, `PAGE_MODIFICADOPOR` |

- Columnas: `PAGE_ID`, `PAGE_DESCRIPCION` string(100) (hace de clave), `PAGE_VALOR` string(**300**) NOT NULL, `PAGE_OBSERVACIONES` string(300) nullable, mas las 6 de traza.
- `$fillable`: `PAGE_DESCRIPCION`, `PAGE_VALOR`, `PAGE_OBSERVACIONES`.
- `rules($id)`: `PAGE_DESCRIPCION` `required|max:100|unique(...)`; `PAGE_VALOR` `required` (**sin max**); `PAGE_OBSERVACIONES` `max:300`.
- Migraciones: solo una toca la tabla, `database/migrations/2017_08_01_113928_create_parametros_generales_table.php`. Busqueda de `PARAMETROSGENERALES`/`PAGE_VALOR` en `database/migrations`: ninguna mas la altera, por lo que `PAGE_VALOR` sigue en `string(300)` (en pgsql `varchar(300)`).

## Front
| Vista | Notas |
|---|---|
| `resources/views/app/parametrosgenerales/index.blade.php` | Tabla DataTable (`datatable-export`) con Descripcion, Valor, Observaciones, Creado (muestra `PAGE_CREADOPOR`). Valor se imprime con `{{ }}` en una celda, sin truncar |
| `create.blade.php`, `edit.blade.php` | Ambos hacen `@rinclude('form-inputs')` |
| `form-inputs.blade.php` | `PAGE_DESCRIPCION` input text maxlength 100 required; **`PAGE_VALOR` input `text`, `maxlength` 3000, required**; `PAGE_OBSERVACIONES` ya es `textarea`, maxlength 300. Los inputs salen de `widgets.forms.input` que incluye `widgets.forms.input-<type>` (existe `input-textarea` porque Observaciones ya lo usa) |

Hallazgo: la vista deja escribir 3000 caracteres pero la columna es 300 y la regla no tiene `max`. Un valor de mas de 300 pasa la validacion y falla en la base (error de longitud, no mensaje de validacion). Cualquier ampliacion necesita migracion que cambie la columna (`change()` de Laravel 5.2 requiere doctrine/dbal; declarado en `composer.json` como `~2.3`, verificado 2026-11-09) y `max` en `rules()`.

## Quien lee los parametros (todos por codigo, sin servicio)
Lectura central: helper `getGlobalParameter($desc, $default)` en `app/Http/Helpers/helpers.php:390` (`ParametroGeneral::where('PAGE_DESCRIPCION', ..)->first()`, devuelve `PAGE_VALOR` como string o el default). Deriva: `getGlobalParameterToArrayCombine` (helpers ~l.465, hace `explode(',')` y `array_combine`) y `getFechaHabilAdicionada` (helpers ~l.408, `explode(',')` de `DIAS_FESTIVOS`). Ojo: el `first()` del helper no filtra por `PAGE_ELIMINADOPOR`; el soft delete del modelo (global scope) puede cubrirlo, **sin verificar** el trait.

Claves con `explode(',')` (afectadas si el valor pasa a ser multilinea/textarea; el separador es coma sin trim, un salto de linea quedaria dentro del elemento):
| Clave | Donde |
|---|---|
| `DIAS_FESTIVOS` | helpers (`getFechaHabilAdicionada`); `LiquidacionTurnoController:409` |
| `CONCEPTOS_INCAP_CARTERA` | `AusentismoController:518`, `Listeners/CreateAusentismoListener:34`, `CreateProrrogaAusentismoListener:34` |
| `EMPRESAS_INDICADORES` | `ContratoController:725,788,906` |
| `FLAG_VALID_RETIROS` | `ContratoController:1119` |
| `ANIOS_HISTORICOS`, `VALOR_AUXILIOTRANSPORTE_HISTORICO`, `VALOR_SMLMV_HISTORICO`, `CLASIFICACIONES_COSTEORM` | `RptContratosController:3206-3209` |
| `PPTO_CUENTAS_RESULTADOS` | `ConsolidadoPresupuestoController:302` |
| `PPTO_CUENTAS_TEMPORALES` | `RptPresupuestosController:28,317` |
| `PPTO_DOMINGOS_A_ORDINARIO`, `PPTO_DOMINGOS_A_FESTIVO` | `PlantaPresupuestoController:315-316` |
| `PPTO_FESTIVOS_A_ORDINARIO`, `PPTO_FESTIVOS_A_FESTIVO`, `PPTO_FESTIVOS_A_DOMINGO` | `PlantaPresupuestoController:592-594` |
| `CONCEPTOS_SIN_INCAPACIDAD` (consulta directa, `explode` + `intval`, filtra `whereNull('PAGE_ELIMINADOPOR')`) | `AusentismoController:201,280`, `ProrrogaAusentismoController:124,222` |
| Por **ID fijo** (`findOrFail(N)` + `explode`/valor): ids 3 (`MOT_RETIRO_EXCLUIDOS_INDICADOR`), 7 (`CONCEPTOS_INCAP_CARTERA`), 10 (`CPTOS_AUSENTISMO_PROGRAMADO`), 11 (`..._NO_PROGRAMADO`), 12 y 13 (factores/horas interpolados en SQL), 15 (festivos) | `RptContratosController:1365,2283`, `AusentismoRepository:23`, `RptAusentismosController:687,948,1019,1119,1188,1204`, `RptAsistenciasController:274`. Dependen de que el id exista; interpolar `PAGE_VALOR` en SQL crudo hace sensible el contenido del valor |

Claves de valor unico (sin explode): `DIAS_NOTIFICACION_TICKETS`, `DIAS_NOTIFICACION_CONTRATOS` (Jobs y Commands `TicketsTemporal/TicketsFinalizar/ProximosFinalizar`), `PRORROGAS_RENOVACION_ANUAL`, `DIAS_RENOVACION_ANUAL` (`ProrrogaContratoController:295`), `CONCEPTO_INCAP_ACCIDENTE`, `DIAS_INCAP_ASUME_EMPRESA` (`AusentismoController:425,526`), `URL_DEL_SISTEMA` (`CarneController`), `URL_VALIDA_CERTIFICADOS`, `CERTIFICADOS_CUSTOMIZE` (`CertificadoContratoController:78-79`), `COPIA_TICKETS_ENREVISION` (`Jobs/SendEmailNewTicket:68`), `ORDEN_VALORACION_INFORMATIVA` (`ConceptoReingresoController:180`), `VALOR_TEMPERATURA_RIESGO` (Create/UpdateTemperaturaListener), `DIASFILTRO_ASISTENCIAS` (`MovimientoEmpleadoController:73`, `AsistenciaEmpleadoController:28`), `GRUPO_EMPALME_ID` (`RptPlantasController:69`), `VALOR_VIGENTE_SMLMV` (`ContratoController:506` y validador `salario` en `AppServiceProvider:77`, consulta directa), `MOT_RETIRO_EXCLUIDOS_INDICADOR` (`ContratoController:902`, por clave), `MOTIVORETIRO_TEMPORALIDAD_ID` (`ContratoController:1121`), `CATEGORIA_DESPLIEGA_MOVIL_TICKETS` (`TicketController:214`), `PPTO_SMLMV`, `PPTO_AUXILIO_TRANSPORTE` (`PlantaPresupuestoController:1263-1264`), `FACTOR_COSTEO_PRSTRANSPORTE` (`RptContratosController:3210`). Comentado: `CONS_HORA_AUS_PROGRAMADAS`.

Lectura por `whereIn` con `ParametroGeneralController::obtenerValorParametro(array)` (metodo publico, instanciado con `new` desde otros controladores, devuelve coleccion de `PAGE_DESCRIPCION, PAGE_VALOR`): `PlantaPresupuestoController:2136` (`PPTO_HORA_LABORAL`), `RptPresupuestosController:1019` (`PPTO_VALOR_BASE`, `PPTO_VALOR_IVA`). Tambien `LiquidacionTurnoController:130` (consulta propia con `whereIn` y `switch`, claves de valor de hora dominical/festivo) y `ProspectoController:376-378,656-658` (`TALLA_ROPA`, `TALLA_PANTALON`, `TALLA_CALZADO`, que se parten por coma en la vista/controlador; no se verifico donde).

## Seeders y migraciones que siembran parametros
| Archivo | Que siembra | Idempotente |
|---|---|---|
| `database/seeds/ParametrosGeneralesTableSeeder.php` (llamado desde `DatabaseSeeder:72`) | 24 claves base (DIAS_FESTIVOS, FLAG_VALID_*, CPTOS_AUSENTISMO_*, TIPOS_SALARIOS, VALOR_VIGENTE_SMLMV, CONCEPTOS_SIN_INCAPACIDAD, etc.) con `new ParametroGeneral` + `save()`, `PAGE_CREADOPOR='SYSTEM'` | No (insertaria duplicados; la regla `unique` solo vive en el formulario) |
| `DotacionHojasDeVida.php` (TALLA_*), `ValorHorasSeeder.php` (VALOR_HORA_ORDINARIA, VALOR_DOMINICAL_*, VALOR_FESTIVO_*), `FormulasPresupuesto.php` (PPTO_HORA_LABORAL, PPTO_VALOR_BASE, PPTO_VALOR_IVA) | Claves puntuales, mismo patron `new ParametroGeneral` | No |
| `ParametrosLiquidacionTurnosSeeder.php` | `VALOR_DOMINICAL_COMPENSADO_DIURNO/NOCTURNO` con `DB::table('PARAMETROSGENERALES')->insert`. Lo llama la migracion `2025_09_29_102502_add_domcomdiurnos_domcomnocturnos_to_liquidacionturnos_table.php` con `Artisan::call('db:seed', ['--class' => ParametrosLiquidacionTurnosSeeder::class])` | No |

Patron de referencia a imitar para un seeder idempotente invocado desde migracion: `database/seeds/VacunasModuloSeeder.php` (`DB::table(...)->where('name',$n)->value('id')`, inserta solo si es null; permisos en `sgh.permissions`) llamado por `database/migrations/2026_07_25_000002_seed_modulo_vacunas.php` (`up()` hace `Artisan::call('db:seed', ['--class' => 'VacunasModuloSeeder', '--force' => true])`, `down()` vacio). Las claves `PPTO_CUENTAS_*`, `PPTO_DOMINGOS_*`, `PPTO_FESTIVOS_*`, `PPTO_SMLMV`, `PPTO_AUXILIO_TRANSPORTE`, `DIAS_NOTIFICACION_*` se leen pero **no aparecen en ningun seeder**: viven solo en las bases (creadas a mano por la pantalla).

## Pendiente
- No se confirmo nada contra base ni API (sin entorno local): tipo real de `PAGE_VALOR` en cada base, ids reales (3, 7, 10-13, 15), lista real de claves existentes.
- `ModelWithSoftDeletes` (scope global) y `unique()` de `rules()` no se leyeron.
- Donde se parten `TALLA_*` por coma tras la lectura en `ProspectoController`.
