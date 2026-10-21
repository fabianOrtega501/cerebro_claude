---
name: cierre-con-todas-las-documentaciones
description: "Al cerrar un desarrollo se hacen siempre el manual, el control de cambios y el set de pruebas, sin preguntar cuáles"
metadata:
  node_type: memory
  type: feedback
  originSessionId: df811c99-3ccb-4226-996f-01a8e2ee0efd
  modified: 2026-10-21T20:48:45.636Z
---

En la Fase 7 de `finish-development` no se pregunta qué documentación se hace: se hacen todas, el manual de usuario (`update-manual`), el control de cambios (`gen-changes-controls`) y el set de pruebas (`gen-test-set`), después del push ([[push-antes-de-documentar]]). La documentación técnica va en el mismo commit del código.

**Why:** lo pidió Fabian el 2026-10-21 al cerrar el ticket 11467: «Siempre se deben hacer todas las documentaciones».

**How to apply:** tras el push, encadenar las tres sin ofrecerlas como opcionales. Cada skill conserva sus propias aprobaciones (niveles del control de cambios, capturas del manual, commit del manual).
