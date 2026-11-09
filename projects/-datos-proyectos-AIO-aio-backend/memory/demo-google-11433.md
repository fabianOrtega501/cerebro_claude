---
name: demo-google-11433
description: Dónde está y cómo se levanta la demo de herramientas de Google del ticket 11433 (en pausa hasta decidir si se usa Google)
metadata:
  node_type: memory
  type: project
  originSessionId: 1006ea24-5216-4002-bd17-1b9666fa8e52
  modified: 2026-11-04T13:44:13.613Z
---

La demo de herramientas de Google del ticket 11433 vive en la copia `/datos/proyectos/AIO/aio-app-google` (worktree de aio-app), rama local `experiment/11433-google-demo`, commit a47b29f22, **sin push**. Sale del commit 9e8b68f37 de la rama del ticket, que tiene el satélite de Esri y sí tiene push.

Se levanta con `cd /datos/proyectos/AIO/aio-app-google && pnpm exec vite --port 5174`. La clave demo está en `AIO_GOOGLE_MAPS_DEMO_KEY` de `~/.claude/secrets.env` y en el `.env` de la copia (`VITE_GOOGLE_MAPS_DEMO_KEY`). Si la copia ya no existe: `git worktree add` desde aio-app sobre esa rama, `pnpm install` y la clave al `.env`.

Material de la decisión en `~/Documentos`: `Mapas-AIO-Esri-vs-Google-11433.pptx` y `Costos-Google-Maps-AIO-11433-v2.xlsx`.

**Why:** el ticket quedó en pausa el 2026-11-04 mientras el negocio decide si usa Google; puede hacer falta volver a presentar la demo con poco aviso.

**How to apply:** antes de presentar, abrir la demo un día antes (la clave demo puede tener límites o vencer). **Esta memoria se borra cuando se tome la decisión**, junto con la copia y la rama de experimento si Google se descarta.
