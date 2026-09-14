# AVL → Operaciones → Histórico GPS

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

- Ruta app (URL): /avl/gps-history | Backend module: Avl | Estado: `importado, sin verificar`| Actualizado: 2026-08-12

## Permisos
| Subject (ruta) | Abilities | Dónde se exige (router front / middleware backend) |
|---|---|---|
| `/avl/gps-history` | `read` (la UI solo ejercita `read`) | Front: `definePage({ meta:{ subject:'/avl/gps-history', action:'read' } })` en `src/pages/avl/gps-history/index.vue`. Backend: los 4 endpoints de histórico (`get-gps-history`, `get-gps-history-table`, `get-gps-history-map`, `export-gps-history`) **no** llevan middleware `permission:` (ver Estado). |
| `vehicle_locations` (CRUD estándar) | READ/UPDATE/DELETE | Backend: `permission:vehicle_locations,<accion>` en `get-all/show/update/delete` (no lo usa esta pantalla). |
| `/avl/user-locations` (CRUD estándar) | CREATE/READ/UPDATE/DELETE | Backend: `permission:/avl/user-locations,<accion>` en `get-all/store/show/update/delete/duplicate/export-data/get-select-data` (no lo usa esta pantalla). |

## Rutas / Endpoints
| Método | Endpoint | Controlador@método | Acción de UI que lo dispara | Auth/permiso |
|---|---|---|---|---|
| GET | `vehicle_locations/v0/get-gps-history-map` | `CustomGpsVehicleLocationController@getGpsHistoryMap` | Buscar (modo Vehículo) → carga del mapa | Solo sesión (sin `permission:`) |
| GET | `vehicle_locations/v0/get-gps-history-table` | `CustomGpsVehicleLocationController@getGpsHistoryTable` | Buscar / paginar / ordenar / buscar en tabla (Vehículo) | Solo sesión |
| GET | `vehicle_locations/v0/get-gps-history` | `CustomGpsVehicleLocationController@getGpsHistory` | (legado keyset; no lo usa esta vista — lo usa `vehicle-tracking/GpsHistory.vue`) | Solo sesión |
| POST | `vehicle_locations/v0/export-gps-history` | `CustomGpsVehicleLocationController@exportData` | Exportar (Vehículo) | Solo sesión |
| POST | `vehicle_locations/v0/gps-data/store` | `CustomGpsVehicleLocationController@storeData` | (ingesta de tramas; sin entry point en esta pantalla) | Solo sesión |
| GET | `user-locations/v0/get-gps-history-map` | `CustomUserLocationController@getGpsHistoryMap` | Buscar (modo Usuario) → carga del mapa | Solo sesión |
| GET | `user-locations/v0/get-gps-history-table` | `CustomUserLocationController@getGpsHistoryTable` | Buscar / paginar / ordenar / buscar en tabla (Usuario) | Solo sesión |
| GET | `user-locations/v0/get-gps-history` | `CustomUserLocationController@getGpsHistory` | (legado keyset con `COALESCE`; no lo usa esta vista) | Solo sesión |
| POST | `user-locations/v0/export-gps-history` | `CustomUserLocationController@exportData` | Exportar (Usuario) | Solo sesión |

Rutas front basadas en archivos (`src/pages/avl/gps-history/index.vue`). Endpoints backend en `routes/api/v0/Modules/Avl/vehicle_locations.php` y `user_locations.php`.

## Controladores
| Clase (archivo) | Métodos relevantes | Qué orquesta técnicamente |
|---|---|---|
| `CustomGpsVehicleLocationController` (`app/Http/Controllers/Modules/Avl/Vehicle_location/CustomGpsVehicleLocationController.php`) | `getGpsHistoryMap`, `getGpsHistoryTable`, `getGpsHistory`, `exportData`, `storeData` | Delega a `CustomGpsVehicleLocationService`; envuelve en `executeWithHandling` + `ApiResponse`. `exportData(ExportDataRequest)`: decodifica `filter` (json_decode si string), crea `Notification::create` (`active=true`) y despacha `ExportGpsHistoryJob::dispatch(APP_URL, userId, filter, 'vehicle', notify->id, fileName)`. |
| `CustomUserLocationController` (`app/Http/Controllers/Modules/Avl/UserLocation/CustomUserLocationController.php`) | `getGpsHistoryMap`, `getGpsHistoryTable`, `getGpsHistory`, `exportData` | Análogo, delega a `CustomUserLocationService`; `exportData` despacha `ExportGpsHistoryJob` con tipo `'user'`. |

## Servicios
| Clase (archivo) | Métodos | Responsabilidad técnica (incl. topes MAP_POINT_CAP/TABLE_COUNT_CAP, ST_Covers/bbox, export sin tope) |
|---|---|---|
| `CustomGpsVehicleLocationService` (`app/Services/Modules/Avl/Vehicle_location/CustomGpsVehicleLocationService.php`) | `getGpsHistoryMap`, `getGpsHistoryTable`, `gpsHistoryExportQuery`, `getGpsHistory` (legado), `listAllExportData`, `getInformationModel`, `processBatch` | `MAP_POINT_CAP=30000` (privado): `getGpsHistoryMap` usa query builder (no Eloquent), proyecta solo columnas del mapa (`ST_X/ST_Y(ST_Transform(...,4326))`), sin hidratar modelos ni el blob `gps_geometry`; `limit = min(MAP_POINT_CAP, max(1, limit_pedido))`; `ORDER BY vl.date_gps DESC, vl.id DESC`. `TABLE_COUNT_CAP=20000` (privado): `getGpsHistoryTable` calcula total capado con subconsulta `SELECT 1 ... LIMIT cap+1` envuelta en `count()` → `total=min(rawCount,cap)`, `capped=rawCount>cap`; `per_page=min(100,...)`; `sort_by ∈ {plate_vehicle,date_gps}` (fallback `date_gps`); búsqueda `ILIKE` sobre `plate_vehicle`/`address`. `gpsHistoryExportQuery` **sin tope** (para el job CSV): `ORDER BY id`. Filtro espacial `ST_Covers(ST_GeogFromText(?), gps_geometry)`; alcance por empresa con `whereExists` a `vehicles→business_units.company_id` cuando no hay vehículo específico. `SET jit = off` al inicio de cada método. |
| `CustomUserLocationService` (`app/Services/Modules/Avl/UserLocation/CustomUserLocationService.php`) | `getGpsHistoryMap`, `getGpsHistoryTable`, `gpsHistoryExportQuery`, `getGpsHistory` (legado), `customCreate`, `customUpdate`, `listAllExportData`, `getInformationModel` | Mismos topes y patrón que vehículos. `getGpsHistoryMap`/`getGpsHistoryTable` ordenan/filtran por `date_gps` plano (indexado). El legado `getGpsHistory` sí usa `COALESCE(date_gps_ms, date_gps)` con keyset `(COALESCE,id) < (?,?)` y relación `user:id,document,first_name,last_name`. Alcance por empresa con `whereExists` a `user_units→business_units.company_id`. Tabla une `public.users` para exponer `document` + `concat(first_name,' ',last_name) as user_name`; búsqueda `ILIKE` sobre `document`/`first_name`/`last_name`; `sort_by ∈ {document,date_gps}`. `gpsHistoryExportQuery` sin tope, `ORDER BY id`. `SET jit = off` en cada método. |

## Query builders / Requests / Rules
| Artefacto | Archivo | Qué construye/valida |
|---|---|---|
| `VehicleGpsHistoryRequest` | `app/Http/Requests/Modules/Avl/Vehicle_location/VehicleGpsHistoryRequest.php` | Valida `filter.*`. `plate_vehicle`/`code_vehicle` requeridos salvo si `polygon_wkt` presente (→ `nullable`). `start_date`/`end_date` `date_format:Y-m-d H:i`, `end_date after_or_equal start_date`. Regla de rango por closure: si `is_historical` → `diffInDays>90` falla (3 meses); si no → `diffInHours>=24` falla (24h). Acepta `limit, cursor_ts, cursor_id, bbox, page, per_page(max 100), search, sort_by, sort_desc`. `prepareForValidation` hace `json_decode` de `filter` si llega como string. |
| `UserGpsHistoryRequest` | `app/Http/Requests/Modules/Avl/UserLocation/UserGpsHistoryRequest.php` | Igual, pero valida `filter.user_id` (`ForeignKeyExists public.users`), requerido salvo con `polygon_wkt`. Mismas reglas de fecha/rango y mismos campos de paginación. |
| `ExportDataRequest` | `app/Http/Requests/Modules/Standard/ExportDataRequest.php` | Request estándar de exportación usado por `exportData` (filtro + filename). |
| `QuerysFilters::applyFilters` | `app/Console/Utils/QuerysFilters.php` | Aplica los filtros dinámicos residuales de `$filters` (tras quitar fechas/company/polygon/paginación) sobre el modelo Eloquent en tabla y export. |

## Modelos / Tablas / Migraciones
| Modelo | Tabla | Relaciones | Índices/particiones/defaults técnicos |
|---|---|---|---|
| `Vehicle_location` (`app/Models/Modules/Avl/Vehicle_location/Vehicle_location.php`) | `gps.vehicle_locations` | Sin relaciones ORM declaradas | Tabla `PARTITION BY RANGE (date_gps)`; PK `(id, date_gps)`; `gps_geometry geography(point,4326) NOT NULL`. Índices btree: `gps_vehicle_locations_date_gps_index`, `..._plate_vehicle_index`, `..._device_gps_index`. Índice GiST espacial `gps_vehicle_locations_geom_gist` (migración `2026_08_04_193000_add_gist_index_to_gps_locations.php`). Migración base `2025_03_20_211421_create_locations_table.php`. |
| `UserLocation` (`app/Models/Modules/Avl/UserLocation/UserLocation.php`) | `gps.user_locations` | `user()` → `belongsTo(User, user_id, id)` | Tabla `PARTITION BY RANGE (date_gps)`; PK `(id, date_gps)`; `gps_geometry geography(point,4326) NOT NULL`; `created_at/updated_at DEFAULT CURRENT_TIMESTAMP`. Índices btree `gps_user_locations_user_id_idx`, `gps_user_locations_date_gps_idx`; GiST `gps_user_locations_geom_gist`. Columna extra `date_gps_ms timestamp(3)` (migración `2026_02_12_184703_...`, seed = `date_gps`). Partición inicial vía `Artisan::call('partition:create-gps-user-locations')`. Migración `2025_06_09_142759_create_gps_user_locations_table.php`. |
| Esquema `gps` | — | — | Creado en `2025_03_20_211420_create_gps_schema.php`. |

## Frontend (técnico)
| Vista (.vue) | Servicio TS | Composables/stores | Notas técnicas |
|---|---|---|---|
| `src/views/pages/avl/gps-history/gpsHistoryView.vue` (~1720 líneas), montada vía `gpsHistory.vue` desde `src/pages/avl/gps-history/index.vue` (tab único) | `VehicleLocationService` (`src/services/avl/vehicle-locations/VehicleLocationService.ts`), `UserLocationService` (`src/services/avl/user-locations/UserLocationService.ts`) — métodos `getGpsHistoryMap/getGpsHistoryTable/exportGpsHistory` con `$api` | `useGpsData` (fetch mapa/tabla/export + `cancelActiveLoad`), `useItemSearch` (autocomplete vehículo/usuario, mín. 3 chars, debounce), `useMapCore`, `useMapLayers` (capas compartidas con Seguimiento GPS), `useMapMarkers` (clustering/colores por hash), `usePlayback` (animación con `setInterval`, sin red), `geometryHelpers`/`mapMarkerHelpers` | El front siempre envía `is_historical: true` (líneas ~594/875) → nunca ejercita la rama de 24h del Request. `SAMPLE_LIMIT = 20000` es el `limit` que pide al mapa (backend lo recapa a `MAP_POINT_CAP=30000`). Tabla server-side: `page/per_page/search/sort_by/sort_desc`. `routeEnabled = selectedItem && !isPolygonSearch && isSingleDayRange` (`start_date === end_date`). Diálogo "Alto volumen" cuando `capped`. |

## Bloqueos (solo bugs que impidieron continuar; vacío si no hubo)
Ninguno. No hubo bugs bloqueantes del módulo. El único obstáculo fue ambiental (recargas frecuentes de la SPA en el entorno MCP que borraban el estado del formulario a mitad de interacciones multi-paso); no es un bug del módulo.

## Comparación con el manual (log del paso de manual; no es lógica de negocio)
**Manual encontrado**: sí. Archivo fuente `manua-web/docs/AIO/AVL/HistoricoGps/index.md`, publicado en `https://services.datint.co/Manual/docs/AIO/AVL/HistoricoGps/`. El contenido en vivo coincide con el `.md` fuente.

**Coincide** (correcto y vigente, no se tocó): apertura del módulo (menú AVL), filtros "Por Vehículo" (código/placa) y "Por Usuario" (documento/nombre), rango máximo de 3 meses con advertencia, botones Buscar/Exportar, capas del mapa (Puntos de Interés, Elementos, Rutas con popup y modal de detalle de solo lectura), agrupación/clustering, herramientas de medición, coordenadas bajo el mapa. Imágenes existentes (`1.png`, `agrupacion.png`, `capas.png`, `capa_puntos_interes.png`, `capa_elementos.png`, `capa_elementos_2.png`, `capa_rutas.png`, `popup_ruta.png`, `popup_ruta_detalle.png`, `modal_detalle_ruta.png`, `medicion.png`, `medicion_2.png`, `coordenadas.png`) siguen siendo representativas — no se reemplazaron.

**Discrepancia corregida**: el manual afirmaba que el mapa muestra "trayectoria y lista de eventos (alarmas, paradas, exceso de velocidad)" y que cada punto incluye "descripción del evento". No corresponde a Histórico GPS: la tabla real trae Placa/Fecha-Hora GPS/Longitud/Latitud/Velocidad(Km/h)/Posición (vehículos) o Documento/Nombre Usuario/Fecha-Hora GPS/Longitud/Latitud/Posición (usuarios); esas alarmas/eventos son el módulo aparte "Eventos GPS". Se corrigió el texto.

**Faltante que se agregó** (funcionalidad real no cubierta): 1) switch "Filtrar por polígono" + búsqueda espacial ("todos" dentro de un polígono, combinable con ítem específico); 2) modo "recorrido" (línea + puntos + control "Ver Recorrido" con reproducción) y su condición de activación (1 ítem, sin polígono, un solo día); 3) clustering multicolor por entidad (paleta de 12 colores por hash) vs. burbujas numéricas de zoom alejado; 4) alerta "Alto volumen de puntos" (20.000 tabla / 30.000 mapa); 5) paginación en servidor, buscador de tabla y orden por columnas; 6) Exportar como proceso asíncrono (encola job + notificación). Se editó `docs/AIO/AVL/HistoricoGps/index.md` con tablas + pasos y se agregó captura `filtro_poligono.png`. Quedaron pendientes por inestabilidad del entorno las capturas de la alerta de volumen, la paginación visible y el clustering multicolor abierto (documentadas por texto con nota de captura pendiente).

## Estado / próximos pasos

### Observación de seguridad (técnica)
Los 4 endpoints de histórico (`get-gps-history`, `get-gps-history-table`, `get-gps-history-map`, `export-gps-history`) de **ambos** módulos (`vehicle_locations.php` y `user_locations.php`) **no tienen middleware `permission:` propio**, a diferencia del CRUD estándar (`get-all/store/show/update/delete`, que sí lo tienen). El control de acceso queda delegado al guard de rutas del front (`definePage` + CASL): cualquier sesión válida que golpee el endpoint puede usarlo sin importar sus abilities sobre `/avl/gps-history`. No es explotable desde la UI normal, pero es una diferencia real frente al resto de esos controladores.

### Dato técnico de rendimiento/estrés (medido, solo lectura; no es lógica de negocio)
Volumetría real medida en BD (company_id=$AIO_COMPANY_ID, `SET jit=off`): `gps.vehicle_locations` ≈ 1.137.605 puntos y `gps.user_locations` ≈ 1.706.895 puntos entre 2026-04-01 y 2026-06-30.

Tiempos medidos vía API (mismo token/params, HTTP 200, `curl -w time_total`) con polígono amplio + rango 3 meses:

| Endpoint | Filtro | Tiempo | Resultado |
|---|---|---|---|
| `vehicle_locations/get-gps-history-map` | polígono + 3 meses, `limit=20000` | 0.54s | 20.000 filas, ~4.1 MB |
| `vehicle_locations/get-gps-history-map` | igual, `limit=30000` (tope `MAP_POINT_CAP`) | 2.03s | 30.000 filas |
| `vehicle_locations/get-gps-history-table` | igual, página 1 | 0.48s | `total:20000, capped:true` |
| `vehicle_locations/get-gps-history-table` | igual, página 1500 (offset 14990) | 0.99s | 10 filas |
| `user-locations/get-gps-history-map` | igual, `limit=20000` | 1.24s | 20.000 filas |
| `user-locations/get-gps-history-table` | igual, página 1 | 0.31s | `total:20000, capped:true` |

Mismas consultas directas en BD (`psql`, `SET jit=off`): mapa (`ORDER BY date_gps DESC,id DESC LIMIT 30000`) 645 ms vehículos / 1.297 ms usuarios; conteo capado (`LIMIT 20001`) 373 ms / 430 ms; página con offset alto 391 ms. Un conteo del mismo filtro **sin** tope (forzado con `LIMIT 400000` de seguridad) tardó 13,75 s solo para contar hasta 400.000 filas — >30× el conteo capado; evidencia por qué el diseño acota siempre (`LIMIT` bajo + orden por `date_gps` btree + evitar hidratación Eloquent). `SET jit = off` es obligatorio: JIT + PostGIS (`ST_Covers`) puede provocar segfault de Postgres en rangos amplios (comentario explícito en código).

Diferencia histórica ya corregida (memoria `gps-history-map-perf.md`, vigente en el código): los métodos de mapa/tabla de usuarios ordenan/filtran por `date_gps` plano (indexado), **no** por `COALESCE(date_gps_ms, date_gps)`; el `COALESCE` solo queda en el legado `getGpsHistory` (Eloquent), que esta pantalla no usa.

### Pendientes potencialmente destructivos (no probados)
- `POST vehicle_locations/v0/gps-data/store` (ingesta de tramas) / `ProcessGpsDataJob`: sin entry point en esta pantalla; crearía datos GPS reales.
- No se verificó el procesamiento real del worker de `ExportGpsHistoryJob` ni el CSV resultante (fuera de alcance).
