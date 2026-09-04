---
name: artisan-docker-y-pretend-inseguro
description: Artisan solo corre dentro del contenedor status; migrate --pretend SÍ ejecuta cambios con Schema::connection(); ERR_CONNECTION_RESET = entrypoint esperando a Postgres
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

**`ERR_CONNECTION_RESET` en localhost:8086** (añadido 2026-09-03): el entrypoint sigue esperando a
Postgres y Apache no arrancó; confirmar con `docker logs status`. Desde esa fecha `docker/entrypoint.sh`
espera `DB_WAIT_TIMEOUT` segundos (20 en local vía `docker-compose.yml`, 0 = infinito en servidores) y
arranca igual sin migrar ni sembrar. El contenedor lee el `.env` al **crearse**: tras cambiar `DB_HOST`
hay que `docker compose up -d` (recrea), no basta `restart`; si cambia el entrypoint, `--build`. El
`.env` local a veces apunta a la base de QA (172.17.10.14), inalcanzable sin VPN y que además colisiona
con la red `docker0` (172.17.0.0/16); para trabajar en local: `DB_HOST=host.docker.internal`,
`DB_PORT=5433` (contenedor `postgres_postgis_17`, base `status`).
