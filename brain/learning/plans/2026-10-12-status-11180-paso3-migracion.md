# Ticket 11180 — Paso 3: migracion del cargue csv de SIPA a la estructura nueva

Repo: `status-full/status-api`. Modo entrega. **No cambia ninguna regla de negocio**: cambia donde
vive el codigo y la forma de la respuesta. Las pruebas de `ProcesarArchivoCsvTest` solo cambian en
lo que miran del envoltorio; lo que miran de la base queda igual.

Referencia que se copia: el cargue de Status ya migrado en el 7433 —
`Status/GestorTransaccional/CargueArchivo/CargueArchivosController::procesaArchivoCSV`,
`CargueDeFormatoService` (orquesta, `try/finally` con `limpiar()`), `CargueCsvService` (mecanica
del csv y log) y `CargueDeArchivoException` (rechazo con log).

## Lo que se encontro

- `procesaArchivoCSV` + `procesar` usan 26 de los 31 metodos del controlador; ningun otro archivo
  llama a ese controlador (solo sus 3 rutas).
- `exportarDatos` y `exportarExcel` se quedan (decision) con `validNumeric`, `validString` y
  `configStorage`. Ojo: `configStorage` solo se llenaba en `procesaArchivoCSV`; en una peticion
  de exportacion vale `''`. Se anota para el MR, no se toca.
- `ToneladasAprobadasService` se inyecta y nadie lo usa: sale.
- `MtEstructurasController` presta tres metodos con `new`: `consultaAplicabilidad` (tambien la usan
  el mismo controlador y dos exports), `validaEstructuraTabla` y `validaDatosArchivo` (solo este cargue).
- `EstructuraRequest` extiende `CommonFormRequest`, cuyo `failedValidation` responde HTTP 200 con
  `{code: 500}`: hay que sobrescribirlo con `ApiResponse::warning()` (422).
- El controlador mezcla la conexion por defecto y `SmAprovechamiento`: se conserva tal cual (cambiarla
  es cambiar comportamiento).

## Piezas

| Pieza | Que hace |
|---|---|
| `app/Services/Sipa/CargarArchivos/CargarArchivosService.php` | Orquesta `procesar(array $datos): int` dentro de `try/finally` (limpia tabla temporal y archivo siempre) y las reglas de cada tipo de cargue (toneladas, recaudo, recaudo de reliquidacion). Cada `return false` con mensaje pasa a `throw new CargueDeArchivoException($mensaje, $log)` |
| `app/Services/Sipa/CargarArchivos/ArchivoCsvService.php` | Mecanica del csv: tabla temporal, filtro por municipio, validacion de estructura y datos, tabla base, carga, log, limpieza. Estado propio por peticion (se pide con `app(...)`, como el hermano) |
| `CargarArchivosController::procesaArchivoCSV` | Solo traduce: `success` 200 con `idLiquidacion`; `CargueDeArchivoException` → 409 con `archivoLog`; otra excepcion → 500 con `verificarExcepciones`. Bloque `@OA`, sin PHPDoc |
| `EstructuraRequest` | `failedValidation` → `ApiResponse::warning()` 422 |
| `ProcesarArchivoCsvTest` | Mismos 8 casos; asserts de envoltorio: `status`, codigo HTTP, `message`, `data.archivoLog` |

## Respuestas

| Caso | Hoy | Despues |
|---|---|---|
| Aceptada | 200 `{code:201, success:true, message, idLiquidacion}` | 200 `{status:"success", message, data:{idLiquidacion}}` |
| Rechazo de negocio | 200 `{code:400, success:false, message, log, archivoLog}` | 409 `{status:"failed", message, data:{archivoLog}}` (`archivoLog` vacio si el rechazo no tiene log) |
| Falla inesperada | 200 `{code:500, success:false, message:<excepcion>}` | 500 `{status:"failed", message:"Error en el sistema…"}` y registro en `log_errores` |
| Request invalido | 200 `{code:500, …}` | 422 `ApiResponse::warning` |

## Decisiones pendientes (Fabian)

1. `MtEstructurasController`: (a) servicio nuevo `MtEstructurasService` con las tres consultas;
   `consultaAplicabilidad` del controlador delega en el; las otras dos se quitan del controlador (sin
   uso). (b) Copiar las consultas al servicio y no tocar el controlador.
2. Excepcion: reutilizar `CargueDeArchivoException` tal cual, o crear una de SIPA.
3. Partir en dos servicios (orquestacion / mecanica del csv) como el hermano, o uno solo.

## Verificacion

1. Primero se ajustan las pruebas al envoltorio nuevo y se ven fallar contra el controlador actual.
2. Se migra; las 8 en verde. Suite completa en verde. Limpieza en cero.
3. `grep` de los metodos movidos en el controlador: no queda ninguno salvo exportaciones.
4. `php artisan l5-swagger:generate` sin error.
5. `review-overengineering` y commit (local; el push al final).
