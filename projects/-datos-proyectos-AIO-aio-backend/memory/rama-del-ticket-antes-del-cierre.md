---
name: rama-del-ticket-antes-del-cierre
description: "Antes del cierre, confirmar que cada repo sigue en la rama del ticket; otra sesión puede hacer checkout en el mismo clon y dejar los cambios sin commitear encima de otra rama"
metadata:
  node_type: memory
  type: project
  originSessionId: ac44bea9-1087-4d3a-a3d3-7ce222d716a3
  modified: 2026-11-25T14:19:02.439Z
---

Antes de cerrar un desarrollo, se confirma que cada repo del ticket sigue en **la rama del ticket**
(`git branch --show-current` contra el nombre que creó `start-development`). Varias sesiones trabajan
sobre el mismo clon: si otra hace checkout de su rama, los cambios sin commitear de este ticket quedan
encima de la rama equivocada, sin ningún aviso.

**Why:** en el 11786 (2026-11-25), otra sesión hizo checkout de la rama del 11934 en aio-backend justo
después de crear la del 11786. Todo el desarrollo se hizo sobre la rama del 11934 y solo se notó en el
preflight de `finish-development`. Se pasó con un parche guardado en el scratchpad, sin stash (ver
[[no-usar-stash-para-comparar-con-la-base]]).

**How to apply:** al retomar un ticket y en el preflight del cierre, mirar la rama de cada repo. Si no es
la del ticket, se para y se dice antes de commitear. Para mover los cambios: guardar `git diff` y los
archivos nuevos fuera del repo, dejar limpia la otra rama, hacer checkout de la del ticket y rehacer los
cambios con Edit/Write (el hook no deja `git apply` desde Bash).
