---
name: dashboard-status-endpoints-patron
description: "Patrón para endpoints/componentes nuevos del Dashboard de Status (TopReportes, ResumenVariables)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 762d719d-5ee5-459c-9092-b4a002aa9484
  modified: 2026-07-21T20:40:36.589Z
---

Patrón establecido para nuevos endpoints del dashboard (ej. TopReportes, ResumenVariables), con archivos independientes por feature:

- **Ruta:** `routes/api/v0/Status/Dashboard/<Feature>.php` → prefijo `status/v0/dashboard`, middleware `auth:sanctum`. Se autocarga (loadDynamicRoutes escanea `routes/api`). Endpoint: `GET api/status/v0/dashboard/<recurso>/{param}`.
- **Controlador:** `App\Http\Controllers\Dashboard\<Feature>Controller` extends Controller; usa `App\Http\Responses\ApiResponse` (`ApiResponse::success($data, $msg)` / `ApiResponse::error($this->verificarExcepciones($e), 500)`). Este es el estándar actual (guiarse por `RecaudoController`, NO por el viejo `establecerArregloRetorno`).
- **Servicio:** `App\Services\Status\Dashboard\<Feature>Service`. Consultas complejas con `DB::select` (SQL crudo). Parámetros repetidos con binding posicional `?` (PDO/Postgres no admite named repetidos).
- **Servicio front:** `resources/js/src/services/Dashboard/<Feature>Service.js` (clase con `apiClient` de `@/axios`), espeja la carpeta del back.
- **Gate de visualización por parámetro:** llaves en tabla `parametros`, valor JSON `[{"visualiza": true}]` (ej. `visualizacion_top_reportes`, `visualizacion_resumen_variables`). El servicio devuelve `{visualiza: bool, <datos>: [...]}`; si es false no ejecuta la consulta. El componente Vue oculta todo con `v-if` si `!visualiza` o no hay datos.
- **id de usuario/empresa** viaja desde el front como parámetro de ruta; el componente lee el usuario de `localStorage.getItem("AppActiveUser").data.user.id`.

Íconos: `<feather-icon>` (Feather), `<i class="material-icons">` (clásico) y `<i class="material-symbols-outlined">` (Material Symbols self-hosted). Ver [[build-assets-laravel-mix]].
