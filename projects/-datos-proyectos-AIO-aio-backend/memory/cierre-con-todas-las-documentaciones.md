---
name: cierre-con-todas-las-documentaciones
description: "Orden fijo del cierre: sobreingeniería, pares, verificación, docs, manual, commit y push (aprobados), control de cambios, set de pruebas y comentarios para QA, sin preguntar entre pasos"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-19T14:44:57.281Z
  originSessionId: fd3bbb4d-428b-4be7-8e7f-8cb9129fe5bc
---

Al cerrar un desarrollo, después del sí de Fabian a la prueba en pantalla, el cierre corre entero y en
este orden, sin pedir confirmación entre pasos:

1. Revisión de sobreingeniería.
2. Revisión de pares propia.
3. Verificación: build, lint, pruebas y prueba integral.
4. Documentación técnica.
5. Actualización de manuales.
6. Commit, integrar la base, verificar de nuevo y push de todos los repos a la vez. **Este sí lo
   aprueba Fabian, siempre.**
7. Control de cambios, con los niveles que decida Claude.
8. Set de pruebas.
9. Comentarios para QA: lo distinto o adicional a la HU, contrastado contra la HU vigente.

El commit del cerebro va aparte, una sola vez al terminar todo el desarrollo.

**Why:** Fabian lo fijó el 2026-11-19 al cerrar el 11730. El manual pasó antes del commit para hacer
un solo push de todo, y los comentarios para QA se agregaron para que QA no devuelva el ticket por un
punto que no cumple la HU al pie de la letra. Reemplaza el orden del 2026-10-19, que hacía el push
antes de documentar.

**How to apply:** es la sección «El orden del cierre» de `finish-development`. Solo se detiene ante un
hallazgo que impida aprobar, un check que falla, un conflicto o un archivo dudoso en el `git add`.
