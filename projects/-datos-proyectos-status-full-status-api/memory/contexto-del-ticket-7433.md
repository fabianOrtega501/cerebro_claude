---
name: contexto-del-ticket-7433
description: "El 7433 no tiene HU utilizable; se valida contra la separacion del monolito, Laravel 13 y la estandarizacion tipo AIO."
metadata:
  node_type: memory
  type: project
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-10-28T14:49:36.287Z
---

El ticket 7433 no tiene HU utilizable: es muy antiguo y el documento sufrio demasiados cambios.
El unico adjunto del caso GLPI no es reconocible como HU. El contexto contra el que se valida es:
separar el monolito en back y front, actualizar a Laravel 13, y estandarizar buscando similitud
con AIO. Lo confirmo Fabian el 2026-10-28.

**Why:** sin esto, cada sesion intenta bajar una HU que no existe y pierde el criterio para decidir
si un cambio esta completo.

**How to apply:** no correr `ticket-context` para el 7433; si se corre, devuelve codigo 4. Al revisar
un cambio, contrastarlo contra esos tres objetivos. Cuidado con "similitud con AIO": no es literal.
AIO no tiene aviso global de errores —cada vista llama `notify()`— y status-frontend si lo tiene, a
proposito, porque sus llamadas heredadas del monolito no manejan el error. Ver
[[el-aviso-global-de-errores-del-front]].
