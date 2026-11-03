---
name: worker-sail-sigue-vivo
description: Detener sail artisan queue:work no mata el worker del contenedor; se acumulan workers con código viejo en la misma cola
metadata:
  node_type: memory
  type: project
  originSessionId: 5bfb5596-9e73-4121-b46b-49e4b7314afe
  modified: 2026-10-30T16:39:22.218Z
---

**Detener `sail artisan queue:work` no mata el worker del contenedor.** Al detener la tarea en segundo plano
solo se cierra el comando del computador; el `php artisan queue:work` sigue vivo dentro de `laravel.test` y
procesando la cola con el código con que arrancó.

**Why:** en el 11632 se acumularon tres workers de `reportsGenerator` y los reportes salían con código viejo
aunque el worker «se había reiniciado».

**How to apply:** para reiniciar el worker, listar con
`./vendor/bin/sail exec laravel.test ps -eo pid,lstart,args | grep "[q]ueue:work"`, matar los viejos por PID
con `./vendor/bin/sail exec laravel.test kill <pid>` y confirmar que queda uno solo. Relacionada:
[[run-artisan-via-sail]].
