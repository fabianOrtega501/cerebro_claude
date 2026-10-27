---
name: auditoria-local-sin-particion
description: En la base local de AIO las tablas particionadas (auditoría y GPS) se quedan sin partición del mes porque no corre el programador, y la secuencia de gps.events va atrasada
metadata:
  node_type: memory
  type: project
  originSessionId: a9b5b05d-556c-4866-b1bd-38d9d3a4ea48
  modified: 2026-10-27T15:01:26.202Z
---

En esta máquina no corre `schedule:run`, así que las particiones mensuales de `log.audit_logs`, `gps.events`, `gps.vehicle_locations` y `gps.user_locations` no se crean solas.
- Sin la partición de `log.audit_logs`, el middleware de auditoría falla sin avisar: no queda registro de ninguna petición que no sea GET.
- Sin la de las tablas GPS, el insert falla con «no partition of relation … found for row» y la pantalla muestra un error de sistema.

**Why:** el 2026-10-23 la auditoría local llevaba vacía desde julio. El 2026-10-27, rechazar una inspección (ticket 11491) dio error de sistema porque `gps.events` solo tenía particiones hasta agosto.

**How to apply:** ante un error de sistema al escribir en una de esas tablas, o una auditoría vacía, revisar las particiones y crearlas con `./vendor/bin/sail artisan partition:create-*` (`audit-logs`, `gps-events`, `vehicle-locations`, `gps-user-locations`). Cada uno crea el mes actual y los dos siguientes; en enero de 2027 vuelven a faltar.

Además, en local `gps.events` tiene eventos cargados con id escrito a mano y su secuencia iba atrasada. Un evento nuevo recibía un id bajo y quedaba en la página 2 de Eventos GPS, que ordena por id. Se corrigió el 2026-10-27 con `setval('gps.events_id_seq', max(id))`; si vuelve a pasar, se repite. Relacionado: [[run-artisan-via-sail]].
