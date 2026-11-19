# 11927 — Solución de referencia (NO mostrar a Fabian salvo nivel 4)

Etapa única: selector de despachos del formulario de Apoyos. Toca back y front.

## Causa (verificada en local, 2026-11-17)

- `getSelectForWeights` con `start_datetime: 'YYYY-MM-DD'` genera
  `"operation"."dispatches"."start_datetime"::text like '%YYYY-MM-DD%'` → trae **todo el día**, sin mirar turno.
  (Laravel castea a `::text`; un `LIKE` directo sobre timestamp fallaría en Postgres.)
- Lo que recorta la lista es `service_id` del despacho actual: el despacho 670 (05:00) es COMERCIAL y en ese
  servicio solo había rutas a las 14:00. Las del mismo turno eran de otro servicio. **Hipótesis por confirmar
  con los datos de Istmo Green** (es el ejercicio de depuración; prod solo con aprobación y por psql directo).
- Además el rango es solo el día del despacho: falta el día anterior (turnos nocturnos).
- Centros operativos del usuario: no recortan en el caso de la captura (ofrece 655 y 656); se mantienen.

## Contrato

`GET dispatches/v0/get-select-for-weights?filter={...}` acepta una llave nueva **`support_date`** (`Y-m-d`, la
fecha de `start_datetime` del despacho que registra el apoyo). Con ella devuelve los despachos cuya fecha
programada está entre el día anterior y ese día, inclusive. Sin ella, el endpoint se comporta igual que hoy
(Distribución de pesos no cambia). Respuesta igual: `[{id, name}]`.

## Backend

| Archivo | Método / línea | Hoy | Debe quedar |
|---|---|---|---|
| `app/Services/Modules/Operation/Dispatch/CustomDispatchService.php` | `getSelectForWeights`, después del bloque de `dispatch_date` (~L1293) | — | Leer `support_date` de `$filters` con el mismo patrón `isset` + `unset` que `dispatch_date` (si no se quita, el filtro genérico lo ignora porque la columna no existe, pero se quita por claridad y simetría) |
| mismo | cadena del query, después del `->when($dispatchDate, ...)` (~L1312) | — | `->when($supportDate, fn ($q) => $q->whereDate('operation.dispatches.start_datetime', '>=', Carbon::parse($supportDate)->subDay()->toDateString())->whereDate('operation.dispatches.start_datetime', '<=', $supportDate))`. El archivo NO importa Carbon: agregar `use Carbon\Carbon;` |
| mismo | docblock del método (L1276-1280) | "Obtener un listado de despachospara registrar distribucion de pesos." | 1 renglón: `Despachos no anulados para distribuir pesos o registrar apoyos; con support_date, ese día y el anterior.` + `@param Request $request` + `@return \Illuminate\Support\Collection` |
| `app/Http/Controllers/Modules/Operation/Dispatch/CustomDispatchController.php` | `@OA` de `getSelectForWeights` (~L436-451) | example `{"company_id": 0, "dispatch_date": ..., "active": true}` | Agregar `"support_date": "2026-11-12"` al example o un `description` del parámetro que la mencione. No se pone PHPDoc encima del método |

No se toca: `QuerysFilters`, el Service/Controller estándar, Distribución de pesos.

## Frontend (aio-app)

| Archivo | Lugar | Hoy | Debe quedar |
|---|---|---|---|
| `src/views/pages/operations/dispatch-route-supports/forms/DispatchRouteSupportForm.vue` | `onMounted`, objeto `filters` (L157-162; `service_id` en L160) | `start_datetime: …slice(0,10)`, `active`, `service_id`, `company_id` | `support_date: props.dispatch?.start_datetime?.slice(0, 10)`, `active: true`, `company_id`. **Sin `service_id` ni `start_datetime`** |

El `.filter(item => item.id !== props.dispatch?.id)` se mantiene. `DispatchService.getSelectForWeights` no cambia.
(El `!` de `start_datetime!.slice` se cambia por `?.` de paso: nit opcional.)

## Prueba

Nuevo `tests/Feature/Modules/Operation/Dispatch/SupportDispatchSelectTest.php`, modelo
`tests/Feature/Modules/Operation/DispatchDownload/ClosedDispatchDistributionTest.php` (setUp con `actingAs`,
`RefreshDatabase`, `WithoutMiddleware`, `UserOperationalCenter::insert`).

1. `test_support_date_includes_previous_day` (≤5 palabras sin `test_`): despacho base 2026-11-12 05:00; crear en el
   mismo centro: otro servicio mismo día 05:00, mismo servicio 14:00, día anterior 22:00, dos días antes, día
   siguiente, uno anulado del mismo día. Llamar con `support_date=2026-11-12`, `company_id`, `user_id`. Afirmar
   contiene los tres primeros, no contiene los dos de fuera del rango ni el anulado.
2. `test_without_support_date_unchanged`: sin `support_date`, con `start_datetime` + `service_id` como envía la
   Distribución: solo el mismo día y servicio.

Correr: `./vendor/bin/sail artisan test tests/Feature/Modules/Operation/Dispatch/SupportDispatchSelectTest.php`
y la regresión `tests/Feature/Modules/Operation/DispatchDownload/ClosedDispatchDistributionTest.php`.
Verificar que la 1 falla quitando el `->when($supportDate…)`.

## Documentación

`docs/modules/operation/closed-dispatch-weight-distribution.md`: sección corta "Qué despachos ofrece el selector
de apoyos": cualquier servicio y turno, día del despacho y el anterior, sin anulados, centros del usuario; en la
Distribución de pesos, «Despachos del día» sigue con el mismo día y servicio, y «Despachos Apoyados» trae todo lo apoyado. Fecha del encabezado si lo tiene.

## Distribución de pesos (Fabian: "Revisamos", 2026-11-17; propuesta por confirmar)

Tipo 1 «Despachos Apoyados» (`weightTypes` en `WeightDistributionForm.vue` L34-37) ya está acotado por el apoyo
(`whereExists` sobre `dispatch_route_supports` con `drs.dispatch_id`, `CustomDispatchService` ~L1316-1331). El
`start_datetime` y el `service_id` que manda `getDispatches()` (L114-122) lo recortan de más.

| Archivo | Lugar | Debe quedar |
|---|---|---|
| `aio-app/.../dispatch-downloads/forms/WeightDistributionForm.vue` | `getDispatches()`, objeto `filters` L114-122 | `start_datetime` y `service_id` solo cuando `weight_distribution_type === 2` (Despachos del día). Tipo 1: `active`, `weight_distribution_type`, `dispatch_id`, `company_id` |

Backend: nada. Prueba: en el mismo test, `test_supported_dispatches_ignore_service_date`: apoyo del despacho
actual a uno de otro servicio y del día anterior; con `weight_distribution_type=1` + `dispatch_id` aparece.
Documentación: la misma sección menciona que el tipo 1 trae todo lo apoyado sin importar día ni servicio.
