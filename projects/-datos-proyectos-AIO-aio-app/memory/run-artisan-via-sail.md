---
name: run-artisan-via-sail
description: "En los repos del AIO, ejecutar comandos artisan con sail, no con php artisan del host ni docker exec"
metadata:
  node_type: memory
  type: project
---

> Copia identica en los `memory/` de **aio-app** y **aio-backend**, para que un ticket fullstack la
> vea desde cualquiera de los dos. Si cambias una, cambia la otra.

Los comandos de Laravel se corren con **sail**, desde la raiz de `aio-backend`:

```bash
./vendor/bin/sail artisan migrate
./vendor/bin/sail artisan db:seed --class=MenusSeeder
./vendor/bin/sail artisan test tests/Feature/Modules/<Modulo>
```

Usar la ruta completa `./vendor/bin/sail`: el alias `sail` no existe en shells no interactivos.

**Why:** el PHP del host no tiene el driver `pgsql`, asi que `php artisan` falla con "could not find
driver (Connection: pgsql)". Todo corre en el contenedor `aio-backend-laravel.test-1`. Y sail resuelve
por su cuenta el contenedor, el usuario y las variables del compose, que un `docker exec` a mano se
salta.

**How to apply:** cualquier `artisan`, `composer` o `test` de este repo va por `./vendor/bin/sail`.
Nada de `php artisan` del host ni de `docker exec ... php artisan`.

**Lo que si se hace con `docker exec`:** consultar la base directamente, contra el contenedor de
postgres (`docker exec -e PGPASSWORD=... postgres_postgis_17 psql -U postgres -d aio -c "..."`). Es
la via fiable para verificar un dato o comparar el antes y el despues de una migracion.

Si un comando de artisan se queda colgado sin devolver nada, sospechar de la red antes que del
comando: casi siempre es que la base esta inalcanzable. La causa habitual esta en el `CLAUDE.md` del
cerebro, seccion *"La VPN es excluyente"*. Ver [[env-testing-skip-worktree]].
