---
name: repetir-revision-tras-corregir
description: "Si la revisión de pares propia lleva a corregir algo, después de corregir se vuelve a correr completa antes de seguir; solo se avanza cuando sale sin hallazgos nuevos"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 5bfb5596-9e73-4121-b46b-49e4b7314afe
  modified: 2026-11-03T16:47:36.251Z
---

Cuando la revisión de pares propia (`peer-review` en modo propio) deja hallazgos y se corrigen, **se vuelve
a correr la revisión completa** sobre el diff ya corregido, antes de la revisión de sobreingeniería, la
prueba integral o el commit. Se repite hasta que una pasada no traiga hallazgos nuevos de «Impide aprobar»
o «Debe corregirse».

**Why:** las correcciones también son código nuevo y pueden traer fallas propias: en el ticket 11632 la
primera revisión llevó a reescribir el reemplazo de filtros, el permiso de dos rutas, la firma de
`generate` y las funciones del mapa. Fabian lo pidió el 2026-11-03: «después de la corrección se deberá
volver a realizar la revisión de pares propia para confirmar que no se encuentra nada nuevo».

**How to apply:** después de aplicar las correcciones y correr las pruebas, se lanza otra vez la revisión
independiente con el mismo encargo, sin contarle lo que ya se encontró, y se informa si salió limpia o qué
trajo. Aplica a todo ticket del AIO. Relacionado: [[revision-de-pares-propia]].
