---
name: run-artisan-via-sail
description: "En aio-backend, ejecutar comandos artisan con sail, no con php artisan del host"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2f4f8dc9-a6bf-4d62-b2e3-33adf4426e8c
  modified: 2026-07-31T16:41:30.980Z
---

El usuario ejecuta todo con `sail artisan ...` (ej. `sail artisan migrate`). Usar `./vendor/bin/sail artisan ...` desde la raíz del proyecto; el alias `sail` no está disponible en shells no interactivos.

**Why:** El PHP del host no tiene el driver `pgsql`, así que `php artisan` falla con "could not find driver (Connection: pgsql)". Todo corre en el contenedor Sail `aio-backend-laravel.test-1`.

**How to apply:** Para cualquier comando artisan/composer/test en este repo, anteponer `./vendor/bin/sail`. Evitar `docker exec` directo al contenedor y evitar `php artisan` del host.
