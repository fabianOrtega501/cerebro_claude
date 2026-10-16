# AIO 11411 — Etapa 2: marca de agua — solucion de referencia

Estado al 2026-10-16. Ya hecho por Fabian: Job, cola `applyWatermark`, `afterCommit()` en
`CustomPqrsService::createAttachments`, prueba de encolado en `CustomStoreTest`,
`formatUploadedAt` con `CustomCompanyService` e imports limpios.

## Falta

### A. Docblocks — `app/Jobs/Modules/Operation/PqrAttachment/ProcessPqrAttachmentJob.php`

| Linea | Metodo | Prosa (max 2 renglones) | Etiquetas |
|---|---|---|---|
| 26 | `__construct` | Encola la marca del adjunto en `applyWatermark`. | `@param int $attachmentId` |
| 31-33 | `handle` | (ya tiene prosa) | `@param` de los 4 servicios, `@return void` |
| 88 | `isSupportedImageType` | Indica si la extension admite marca (jpeg, jpg, png). | `@param string $type`, `@return bool` |
| 93 | `resolveMimeType` | Subtipo MIME de la imagen; `jpg` se publica como `jpeg`. | `@param string $type`, `@return string` |
| 98 | `buildDataUriFromBinary` | Data URI en base64 del binario guardado; null si viene vacio. | `@param mixed $binaryFile`, `@param string $mime`, `@return string|null` |
| 112-115 | `coordinatesFromPqr` | Latitud y longitud del POINT del PQR; `0.0000` si no hay ubicacion. | `@param mixed $location`, `@return array{0: string, 1: string}` |
| 124 | `resolveAddress` | Direccion del PQR o, si no tiene, la de OSM por coordenadas; «Sin direccion» si no resuelve. | `@param` x4, `@return string` |
| 139 | `formatUploadedAt` | Fecha de carga en la hora de la empresa, para estampar en la marca. | `@param` x3, `@return string` |
| 144 | `decodeDataUri` | Binario de la imagen marcada; null si el data URI no es una imagen valida. | `@param string $dataUri`, `@return string|null` |

### B. Prueba nueva — `tests/Feature/Modules/Operation/Pqrs/PqrWatermarkTest.php`

Molde: `tests/Feature/Modules/Mobile/Visit/CensusWatermarkTest.php` (doble de `ImageWatermarkService`
en :121, doble de `OsmService` en :91). La imagen de CI no trae Imagick: el servicio real no se usa.

| Prueba (<= 5 palabras) | Que comprueba |
|---|---|
| `testJobMarksPhotoWithUploadDate` | Corre el Job sobre un adjunto jpg: el DTO llega con `created_at` en la hora de la empresa (pais con `utc` -5) y `file` queda con lo que devolvio el doble |
| `testJobSkipsNonImageAttachment` | Adjunto `pdf`: el doble no se llama y `file` no cambia |
| `testJobUsesOsmWithoutAddress` | PQR sin `address`: la direccion del DTO es la de OSM; si OSM falla, «Sin direccion» |

Verificacion: `./vendor/bin/sail artisan test tests/Feature/Modules/Operation/Pqrs/`.

### C. Documentacion — en el cierre del ticket

- `docs/arquitectura/colas-y-jobs.md:68`: agregar `ProcessPqrAttachmentJob` a la fila de `applyWatermark`.
- Documento del flujo de PQR (lo arma `update-tech-docs`): RN-05, fecha = `created_at` del adjunto,
  direccion del PQR con respaldo OSM, y que el Job se despacha con `afterCommit()`.

## No se hace
- Cola o worker nuevos: `applyWatermark` ya existe en los dos archivos de supervisor.
- Reintentos: el carril `media` corre con `--tries=1` a proposito (la marca no es idempotente).
