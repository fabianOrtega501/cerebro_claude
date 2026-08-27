---
name: artisan-docker-y-pretend-inseguro
description: Artisan solo corre dentro del contenedor status; migrate --pretend SÍ ejecuta cambios cuando la migración usa Schema::connection()
metadata: 
  node_type: memory
  type: reference
  originSessionId: e07b6243-6810-4bcc-8202-9f49cdd0938a
  modified: 2026-08-03T14:57:09.121Z
---

`vendor/` está vacío en el host (es un volumen Docker), así que `php artisan ...` falla en el host. Ejecutar siempre `docker exec status php artisan ...` (el contenedor monta `/datos/proyectos/status -> /var/www/html`).

**Trampa verificada el 2026-08-03:** `php artisan migrate --pretend` **no simula** las migraciones de este proyecto, las **ejecuta de verdad**. Motivo: el migrator activa el modo pretend sobre la conexión por defecto, pero las migraciones usan `Schema::connection('SmGestorTrans')` / `'SmGestorMaestros'` explícitamente, y esa conexión no queda en modo pretend. Peor: el cambio se aplica pero **no** se registra en la tabla `migrations`, dejando el esquema y el historial desincronizados (un `migrate` posterior falla con "Duplicate column").
→ Para validar una migración nueva, no usar `--pretend`; correr `migrate` real y `migrate:rollback` si hay que revertir, o revisar el `down()` a mano.

`php artisan route:list` está roto por un typo preexistente en [routes/ModulosApi/Aprovechamiento.php](routes/ModulosApi/Aprovechamiento.php) (`MtPrestadofresController`, commit 0225910b). Para verificar rutas usar `docker exec status php artisan tinker --execute="foreach (Route::getRoutes() as \$r) {...}"`.

Ver también [[build-assets-laravel-mix]] para el front.
