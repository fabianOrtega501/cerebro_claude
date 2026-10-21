---
name: vscode-autoguardado-pisa-cambios
description: "El autoguardado de VS Code pisa los cambios hechos desde fuera del editor (git checkout, git apply) sin dejar nada pendiente"
metadata:
  node_type: memory
  type: project
  originSessionId: 340563f4-1428-4be9-bac7-2e0a14433bc6
  modified: 2026-10-21T17:23:52.275Z
---

En esta máquina VS Code tiene autoguardado. Si un archivo está abierto en el editor y se cambia desde
fuera —`git checkout --`, `git apply`, un script—, el editor puede volver a escribir la versión que
tenía en memoria y deshacer el cambio. No queda nada en "cambios pendientes": el archivo vuelve a ser
idéntico al de la rama.

**Why:** pasó el 2026-10-21 en el ticket 11442. Para mostrar el "antes" se revirtió
`ClientVisitsForm.vue` con `git checkout` y se volvió al "ahora" con `git apply`; el autoguardado
reescribió el "antes" y el commit del front salió vacío. Se notó solo porque el `git diff` previo al
`add` vino en blanco.

**How to apply:** los cambios a archivos del repo se hacen con Edit/Write, que VS Code detecta. Si de
verdad hace falta `git checkout` o `git apply` (por ejemplo, para mostrar un antes y un después),
confirmar con `git diff` justo antes del `git add` que el cambio sigue ahí, y commitear enseguida.
Relacionado: [[no-usar-stash-para-comparar-con-la-base]].
