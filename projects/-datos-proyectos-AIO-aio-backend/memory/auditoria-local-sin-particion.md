---
name: auditoria-local-sin-particion
description: En la base local de AIO la auditoría (log.audit_logs) se queda sin partición del mes porque no corre el programador de tareas
metadata:
  node_type: memory
  type: project
  originSessionId: a9b5b05d-556c-4866-b1bd-38d9d3a4ea48
  modified: 2026-10-24T14:52:58.130Z
---

En esta máquina no corre `schedule:run`, así que las particiones mensuales de `log.audit_logs` no se crean solas. Sin la del mes, el middleware de auditoría falla sin avisar (nunca interrumpe la petición) y no queda registro de ninguna petición que no sea GET. Así estuvo desde septiembre hasta el 2026-10-23, cuando se crearon octubre, noviembre y diciembre.

**Why:** el 2026-10-23 no se pudo averiguar quién borró el logo de la empresa 19 porque la auditoría local estaba vacía desde julio.

**How to apply:** si hace falta la auditoría local y sale vacía, revisar las particiones de `log.audit_logs` y crearlas con `./vendor/bin/sail artisan partition:create-audit-logs` (crea el mes actual y los dos siguientes). En enero de 2027 vuelve a faltar. Aplica igual a las otras tablas particionadas (`partition:create-*`). Relacionado: [[run-artisan-via-sail]].
