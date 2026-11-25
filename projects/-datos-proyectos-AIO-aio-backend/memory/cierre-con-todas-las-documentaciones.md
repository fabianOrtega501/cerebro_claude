---
name: cierre-con-todas-las-documentaciones
description: "Orden fijo del cierre hasta el push (sobreingeniería, pares, verificación, docs, manual, commit y push aprobados) y el control de cambios al final; set de pruebas y comentarios para QA solo con «Ticket en desa»"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-25T15:58:24.375Z
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
7. Control de cambios, contra lo que se subió.

**Set de pruebas y comentarios para QA** se generan y entregan, sin preguntar y en ese orden, cuando
Fabian avisa «Ticket en desa» (Fase 9 de `finish-development`), aunque sea en otra sesión. El pendiente
queda en `~/.claude/cache/tickets/<clave>/pendiente-desa.md`.

El commit del cerebro va aparte, una sola vez al terminar todo el desarrollo.

**Why:** Fabian fijó el orden el 2026-11-19 al cerrar el 11730. El 2026-11-24, en el 11934, pidió que
los textos para QA salieran solo con el ticket en desa, contra lo que de verdad quedó desplegado. El
2026-11-25, en el 11786, movió el control de cambios al cierre: sin él no se puede pasar el ticket a desa.

**How to apply:** es la sección «El orden del cierre», la Fase 8b y la Fase 9 de `finish-development`. El
cierre solo se detiene ante un hallazgo que impida aprobar, un check que falla, un conflicto o un archivo
dudoso en el `git add`.
