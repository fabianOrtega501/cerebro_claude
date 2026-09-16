---
name: no-commitear-sin-autorizacion
description: "En los repos de trabajo hay que mostrar los archivos y el diff, y esperar el sí antes de commitear."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-15T21:31:56.006Z
---

Antes de commitear en un repo de trabajo hay que mostrar qué archivos se tocaron y
el diff, y esperar autorización explícita. Aprobar un bloque de trabajo no autoriza
el commit de ese bloque.

**Why:** Fabian revisa qué entra al historial del equipo antes de que entre, no
después. Un commit hecho por iniciativa propia lo obliga a auditar hacia atrás
trabajo que ya está escrito, y a deshacer si algo no le convence. Lo pidió el
2026-09-15, tras trece commits seguidos en status-api que no autorizó.

**How to apply:** Al terminar un bloque, mostrar la lista de archivos y el diff, y
parar ahí. Commitear solo cuando lo diga. Esto ya regía para `~/.claude` y ahora
aplica igual a los repos de trabajo.
