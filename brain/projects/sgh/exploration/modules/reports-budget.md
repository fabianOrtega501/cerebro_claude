# Reportes → Presupuesto (reportes 800 a 807)

- Ruta (URL): `/reportes` (POST a `reportes/<id>`)  |  Modulo del backend: Reportes (`app/Http/Controllers/Reportes`)  |  Estado: `explorado`  |  Actualizado: 2026-11-09

Mapa sacado solo del codigo: SGH no tiene ambiente local, asi que no hubo `GET` ni `SELECT`. Lineas con `~` son aproximadas.

## Permisos
| Subject (ruta) | Abilities | Donde se exige |
|---|---|---|
| `reportes` | unico del modulo | `ReporteController::__construct` (`middleware('permission:reportes')`), heredado por `RptPresupuestosController` via `parent::__construct()`; grupo de rutas con `auth` (`app/Http/routes.php:95`). Sembrado en `database/seeds/PermissionsTableSeeder.php:344`; menu en `MenuTableSeeder.php:820` |
| Visibilidad por rol | — | `ReporteController::getReportArray()` (~l.470). Los 800-807 estan solo en `$reportesgh` (~l.131-139): roles `admin` y `gesthum`. Las rutas POST no revalidan el rol |
| Filtro de datos | — | `get_permisosgenerales($query)` en `app/Http/Helpers/helperModels.php:206`: filtra `EMPLEADORES.EMPL_ID` segun rol |

## Como se registra un reporte
No hay tabla de reportes:
1. Item en los arrays de `ReporteController.php` (`['id' => segmento URL, 'title' => '800 - ...', 'filterRequired' => bool]`). El numero solo vive en el `title`.
2. `Route::post('<id>', 'RptXxxController@metodo')` en `routes.php` (presupuesto l.167-174).
3. Filtros en `resources/views/reportes/formRep<id>.blade.php`, pedidos por `GET reportes/viewForm?form=<id>`.
4. El nombre del CSV sale del `title` (`getReportFileName`).

## Rutas / Endpoints (todos POST, `RptPresupuestosController.php`)
| Reporte | Endpoint | Metodo → consulta | Notas |
|---|---|---|---|
| 800 | `reportes/PresupuestosPlanta` | `plantaPresupuesto` (~l.768) → `getQueryPlanta` (l.503) | Sin groupBy, una fila por planta |
| 801 | `reportes/PresupuestosPlantaDominical` | `plantaPresupuestoDominical` (~l.795) → `getQueryPlantaDominical` (l.560) | |
| 802 | `reportes/PresupuestosDetalle` | `detallePresupuesto` (~l.686) → `getQuery` (l.25-262) | Sin groupBy; ~125 columnas |
| 803 | `reportes/PresupuestosConsolidado` | `consolidadoPresupuesto` (~l.712) → `getQueryConsolidado` (l.268) | |
| 804 | `reportes/PresupuestosConsolidadoCargue` | `consolidadoPresupuestoCargue` (~l.729) → `getQueryConsolidadoCargue` (l.314-500) | groupBy en l.732-743 |
| 805 | `reportes/PresupuestosDetalleGh` | `detallePresupuestoGh` (~l.821) → `getQueryPresupuestoGh` (l.611) | |
| 806 | `reportes/PresupuestosConsolidadoGh` | `consolidadoPresupuestoGh` (~l.847), consulta inline | groupBy por alias l.882-891 |
| 807 | `reportes/PresupuestosPlantaGeneral` | `plantaPresupuestoGeneral` (~l.919), consulta inline | groupBy por alias l.986-993 |

Todos terminan en `buildJson($query, 'empresa')`. La consulta vive en el controlador, sin capa de servicio.

`CEOP_DESCRIPCION AS CENTRO_OPERACION`: 802 l.174 · 803 l.279 · 804 l.461 · 800 l.520 · 801 l.578 · 805 l.630 · 806 l.862 · 807 l.957.

## Servicios y consultas
| Clase (archivo) | Metodos | Que resuelve |
|---|---|---|
| `ReporteController` (`app/Http/Controllers/Reportes/ReporteController.php`) | `buildJson` (~l.290-420), `getReportArray`, `getReportFileName` | Envuelve la consulta en `select * from (<sql>) as sub`. Mas de 2000 filas → CSV (`;`, BOM UTF-8) en `public/storage/<userId>/`; si no, JSON `{keys, data, ...}` |
| 804: `getQueryConsolidadoCargue` | `CASE` de `CCUENTA` / `CUENTA_DESCRIPCION` segun `CECO_TIPO` y `TICO_ID` | Temporales (`TICO_ID=2`) usan el parametro `PPTO_CUENTAS_TEMPORALES`; `PPTO_VALOR_BASE` y `PPTO_VALOR_IVA` via `obtenerValoresParametro()` (l.1014) |

**groupBy del 804** (l.732-743): `PRES_NOMBRE, PRES_ANO, CODIGO_EMPRESA, CEOP_CODIGO, CEOP_DESCRIPCION, CCUENTA, CUENTA_DESCRIPCION, CECO_CODIGO, CECO_DESCRIPCION, CECO_TIPO, TIPOSCONTRATOS.TICO_ID`. Mezcla columnas y alias. Toda columna nueva no agregada va tambien aqui o PostgreSQL rechaza la consulta.

## Modelos / Tablas
| Reporte | Modelo base | Tablas |
|---|---|---|
| 800 | `PlantaPresupuesto` | PRESUPUESTOS, EMPLEADORES, GERENCIAS, CENTROSCOSTOS, CENTROSOPERACIONES, CARGOS, GRUPOS, TURNOS, TIPOSCONTRATOS |
| 802 | `LiquidacionPresupuesto` | PLANTASPRESUPUESTOS, PRESUPUESTOS, EMPLEADORES, GERENCIAS, GRUPOS, TURNOS, CARGOS, CENTROSCOSTOS, CENTROSOPERACIONES, TIPOSCONTRATOS, RUBROSPRESUPUESTOS, CUENTAS (x2), leftJoin PLANTASDOMINICALES |
| 803 | `ConsolidadoPresupuesto` | PRESUPUESTOS, EMPLEADORES, CENTROSOPERACIONES, CUENTAS, CENTROSCOSTOS |
| 804 | `LiquidacionPresupuesto` | PLANTASPRESUPUESTOS, RUBROSPRESUPUESTOS, PRESUPUESTOS, EMPLEADORES, CENTROSCOSTOS, CENTROSOPERACIONES, TIPOSCONTRATOS (CUENTAS por subselect) |
| 805 / 806 | `ItemLiquidacion` | PLANTASPRESUPUESTOS, ITEMSPRESUPUESTOS, PRESUPUESTOS, EMPLEADORES, CENTROSCOSTOS, CENTROSOPERACIONES, TIPOSCONTRATOS, CUENTAS (805 suma GERENCIAS, GRUPOS, TURNOS, CARGOS) |
| 807 | — | PRESUPUESTOS, EMPLEADORES, GERENCIAS, CENTROSOPERACIONES, CARGOS |

Todas filtran borrado logico (`*_FECHAELIMINADO` null). PLANTASPRESUPUESTOS: migracion `2019_02_04_000039_create_plantas_presupuestos_table.php`.

## Front
| Vista | Que hace | Notas |
|---|---|---|
| `resources/views/reportes/index.blade.php` | Selector `#REPO_ID`, `POST reportes/<id>` con `serialize()`; `buildDataTable()` arma `columns` desde `keys` | El alias SQL es el titulo y el orden del select es el orden de columnas: **agregar un campo al select basta** para pantalla y exportaciones |
| `public/assets/scripts/datatable/init.js` | Botones `csvHtml5`, `excelHtml5`, `pdfHtml5`, `colvis` | Exportan en el cliente lo que hay en la tabla; no hay export en el servidor |

## Hallazgos fuera de alcance
- `orderBy('A','B','C',...)` en 802, 804 (l.745), 805, 806 y 807: en Laravel 5.2 el segundo argumento es la direccion, asi que ordena solo por la primera columna. `'CUENTA'` no es un alias existente.
- `plantaPresupuesto` repite el filtro de presupuesto (inofensivo).
- Ocultar un reporte a un rol depende solo del catalogo: las rutas solo exigen `reportes`.

## Pendiente
- Nada probado en vivo: SQL generado, groupBy con columna nueva, columnas reales de CENTROSOPERACIONES, aspecto del Excel/PDF.
- No se leyeron los `formRepPresupuestos*` salvo el del 804, ni `ParametroGeneralController::obtenerValorParametro`.
