---
name: monolito-status-sin-desarrollo
description: El monolito status ya no se desarrolla desde el 2026-11-25; todo el trabajo va en status-api y status-frontend.
metadata:
  node_type: memory
  type: project
  originSessionId: 72c5fbcf-4137-4fee-b25a-d53519e6b7de
  modified: 2026-11-25T16:46:32.071Z
---

El monolito `status` (/datos/proyectos/status) ya no se desarrolla desde el 2026-11-25: no se
crean ramas, no se actualiza y no se propone tocarlo. Todo el trabajo de Status va en
status-api y status-frontend. Ya salio de `brain/projects.json`.

**Why:** lo decidio Fabian al arrancar el 12016; la rama que se creo ahi sobro.

**How to apply:** si una falla menciona el monolito, sirve solo como referencia del
comportamiento anterior, no como repo a corregir. Ver [[buscar-consumidores-de-un-endpoint]].
