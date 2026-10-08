---
name: no-trabajar-en-el-monolito
description: Los ajustes de backend de SIPA y Status van solo en status-api; el monolito /datos/proyectos/status no se toca salvo que Fabian lo pida.
metadata:
  node_type: memory
  type: feedback
  originSessionId: dcebdb2e-0f62-4b53-9cb0-5faf4c4f5a7c
  modified: 2026-10-08T14:04:24.615Z
---

No se trabaja en el monolito `/datos/proyectos/status` salvo que Fabian lo pida explicitamente.
Los ajustes de backend de SIPA y Status van solo en `status-full/status-api`, aunque el mismo
codigo siga duplicado en el monolito.

**Why:** lo decidio Fabian el 2026-10-08 (ticket 11180): el monolito quedo congelado tras la
migracion a status-api.

**How to apply:** al crear ramas del proyecto `status`, crearla solo en status-api, a mano o con
`--side`: `create-branch.mjs` la crearia en los dos repos porque el proyecto no tiene `stack.json`
con roles. No proponer replicar un cambio en el monolito. Ver [[sipa-roto-por-la-migracion]].
