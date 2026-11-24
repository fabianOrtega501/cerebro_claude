# 11934 · Etapa 1 (backend) — Solución de referencia

> No se muestra a Fabian. De aquí salen el plan de construcción y las pistas.

## Archivos

| # | Archivo | Nuevo / toca | Qué queda |
|---|---|---|---|
| 1 | `app/Queries/Modules/Operations/Dispatch/DispatchVehicleDriverQueryBuilder.php` | Nuevo | `currentByVehicles(array $vehicleIds, array $nowByCompany): Collection` |
| 2 | `app/Services/Modules/Operation/Dispatch/DispatchVehicleDriverService.php` | Nuevo | `currentByVehicles(array $vehicleIds): Collection` keyed por `vehicle_id` |
| 3 | `app/Services/Modules/Settings/Vehicle/CustomVehicleService.php` | Toca | Inyecta el servicio 2; `getVehiclesByCompanyAvl` mezcla los tres campos; método nuevo `getAvlDispatchDriver(int $id)` |
| 4 | `app/Http/Controllers/Modules/Settings/Vehicle/CustomVehicleController.php` | Toca | Método `getAvlDispatchDriver($id)` con `@OA\Get`, sin PHPDoc |
| 5 | `routes/api/v0/Modules/Settings/vehicles.php` | Toca | `GET /v0/avl-dispatch-driver/{id}` con `$permissionMiddlewareVehicleTracking . Permissions::READ` |
| 6 | `tests/Feature/Modules/Settings/Vehicle/AvlDispatchDriverTest.php` | Nuevo | Casos de la HU contra el listado y el endpoint individual |
| 7 | `docs/modules/avl/vehicle-tracking-driver.md` + índice en `CLAUDE.md` §9, `docs/README.md` (fila Avl) y `docs/modules/avl/README.md` | Nuevo / toca | Reglas de despacho, conductor, ventana de 12 h y por qué el aviso en vivo no lo trae |

No se toca: `presentAvlVehicle` / `selectAvlVehicle` (`SelectVehicleTrait`), porque los comparte
`ListenForVehicleChanges` (aviso en vivo); calcular ahí el conductor haría una consulta por trama.
No se toca `VehicleService` ni `IVehicleService` (estándar intacto).

## 1. QueryBuilder

Clase con docblock de clase de un renglon. Arranca en el modelo `Dispatch::query()->toBase()->from('operation.dispatches as d')` (patrón de `DispatchOverviewQueryBuilder`), `use DispatchOverviewSqlTrait` para `routeCodeSql()` (alias `r`).

`currentByVehicles(array $vehicleIds, array $nowByCompany): Collection`

- `$nowByCompany`: `[company_id => 'Y-m-d H:i:s']` hora actual de cada empresa. Viaja como **un binding JSON**:
  `d.execution_start_date <= (?::jsonb ->> d.company_id::text)::timestamp`
  `d.execution_start_date >= (?::jsonb ->> d.company_id::text)::timestamp - interval '12 hours'`
  (patrón de `DispatchRouteCoverageQueryBuilder.php:386-389`).
- Filtros: `d.vehicle_id = ANY(?::bigint[])` (o `whereIn`, la página es ≤ 200), `d.active`, `d.dispatch_status = 1`,
  `d.company_id = (SELECT bu.company_id FROM vehicles v JOIN business_units bu ... WHERE v.id = d.vehicle_id)` — RN-01 misma empresa del vehículo.
- `JOIN operation.routes r ON r.id = d.route_id`.
- `DISTINCT ON (d.vehicle_id)` + `ORDER BY d.vehicle_id, d.execution_start_date DESC, d.id DESC` (patrón `PublicRouteQueryBuilder.php:212-224`).
- Select: `d.vehicle_id`, `d.id AS dispatch_id`, `routeCodeSql() AS dispatch_route_code`, y `driver_names` como
  `COALESCE(<por ruta>, <por cargo>)`, cada uno subconsulta con
  `STRING_AGG(TRIM(s.first_name || ' ' || s.last_name), ', ' ORDER BY TRIM(...))`:
  - Por ruta: `dispatch_crews dc JOIN staff s` con `dc.dispatch_id = d.id AND dc.active AND s.active AND EXISTS (route_staffs rs WHERE rs.route_id = d.route_id AND rs.staff_id = dc.staff_id AND rs.is_driver AND rs.active)`.
  - Por cargo: igual pero `EXISTS (wastes.job_classifications jc WHERE jc.job_position_id = s.job_position_id AND jc.is_driver AND jc.active)`.
  - `STRING_AGG` de cero filas es `NULL` → el `COALESCE` cae al segundo; ambos nulos = sin conductor.
  - Duplicados: un tripulante con dos filas activas en `dispatch_crews` saldría dos veces → `STRING_AGG(DISTINCT nombre, ', ' ORDER BY nombre)`.
- Docblock: «Despacho en operación más reciente de cada vehículo, con su ruta y conductores. Una fila por vehículo con despacho.» + `@param` x2 + `@return`.

## 2. DispatchVehicleDriverService

Constructor: `DispatchVehicleDriverQueryBuilder`, `CustomCompanyService`.

`currentByVehicles(array $vehicleIds): Collection`
- Vacío → `collect()`.
- Empresas de esos vehículos: se pide al query builder o se recibe del llamador. Opción limpia: el llamador (CustomVehicleService) ya tiene `company_id` por vehículo vía `businessUnits.company_id` → firma `currentByVehicles(array $companyIdByVehicle)` (`[vehicle_id => company_id]`).
- `$nowByCompany = collect(array_unique(values))->mapWithKeys(fn ($c) => [$c => $this->customCompanyService->getActuallyDateByCountryCompany($c)])`.
- Devuelve `->keyBy('vehicle_id')`.

## 3. CustomVehicleService

- Constructor: agregar `protected DispatchVehicleDriverService $dispatchVehicleDriverService` (al final, `use` arriba).
- `getVehiclesByCompanyAvl`: guardar el paginador sin `through`, construir `[$v->id => $v->businessUnits?->company_id]` de `getCollection()`, pedir `$drivers`, y `through(fn ($v) => $this->presentAvlVehicle($v) + $this->avlDispatchFields($drivers->get($v->id)))`.
- Ayudante privado `avlDispatchFields(?object $row): array` → `['dispatch_id' => $row?->dispatch_id, 'dispatch_route_code' => $row?->dispatch_route_code, 'driver_names' => $row?->driver_names]`.
- `getAvlDispatchDriver(int $vehicleId): array`:
  - Vehículo activo cuya `business_unit_id` esté en `getUserBusinessUnitsByCompany(null)->flatten()`; si no → `throw ValidationException::withMessages(['vehicle' => 'El vehículo no pertenece a sus unidades de negocio.'])` (422 por `BaseController`).
  - Retorna `['vehicle_id' => $id] + avlDispatchFields(...)`.

## 4. Controller

`getAvlDispatchDriver($id)` con `executeWithHandling` y `ApiResponse::success($data, $this->messageSuccessFound)`. Bloque `@OA\Get` path `/api/vehicles/v0/avl-dispatch-driver/{id}`, tag `Vehicle - v0`, `security sanctum`, parámetro `id` en path, respuestas 200 y 422.

## 5. Ruta

Debajo de `get-all-avl`, misma variable de permiso.

## 6. Pruebas (`AvlDispatchDriverTest`, RefreshDatabase + WithoutMiddleware, patrón de `AvlIndexTest`)

| Prueba (≤5 palabras) | CA/RN |
|---|---|
| `test_route_driver_wins` | CA-05 |
| `test_falls_back_to_position` | CA-07 |
| `test_drivers_sorted_and_joined` | CA-10, RN-07 |
| `test_inactive_crew_ignored` | CA-09 |
| `test_without_driver_keeps_dispatch` | CA-08 |
| `test_latest_dispatch_wins` | RN-03 |
| `test_outside_twelve_hours` | CA-14 |
| `test_closed_and_future_ignored` | RN-02, hueco 5 |
| `test_single_endpoint_returns_fields` | CA-13 |
| `test_foreign_vehicle_returns_422` | CA-15 |

Fechas: `execution_start_date` relativo a la hora de la empresa (`getActuallyDateByCountryCompany`), nunca `now()` pelado.

## 7. Docs

Archivo nuevo con encabezado obligatorio, tabla de reglas, la ventana en hora de la empresa, el criterio de conductor, el 422 y la nota de que `VehicleUpdatedEvent` no lleva los campos (el front los conserva).
