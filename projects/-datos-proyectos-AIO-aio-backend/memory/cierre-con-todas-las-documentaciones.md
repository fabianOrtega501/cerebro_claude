---
name: cierre-con-todas-las-documentaciones
description: "Orden fijo del cierre hasta el push (sobreingeniería, pares, verificación, docs, manual, commit y push aprobados); control de cambios, set de pruebas y comentarios para QA solo con «Ticket en desa»"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-24T19:00:04.285Z
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

El cierre termina ahí. **Control de cambios, set de pruebas y comentarios para QA** se generan y
entregan, sin preguntar y en ese orden, cuando Fabian avisa «Ticket en desa» (Fase 9 de
`finish-development`), aunque sea en otra sesión. El pendiente queda en
`~/.claude/cache/tickets/<clave>/pendiente-desa.md`.

El commit del cerebro va aparte, una sola vez al terminar todo el desarrollo.

**Why:** Fabian fijó el orden el 2026-11-19 al cerrar el 11730. El 2026-11-24, en el 11934, pidió que
los tres textos para QA y el equipo salieran solo con el ticket en desa: se escriben contra lo que de
verdad quedó desplegado, después de las correcciones del MR, y no contra la rama del cierre.

**How to apply:** es la sección «El orden del cierre» y la Fase 9 de `finish-development`. El cierre
solo se detiene ante un hallazgo que impida aprobar, un check que falla, un conflicto o un archivo
dudoso en el `git add`.
