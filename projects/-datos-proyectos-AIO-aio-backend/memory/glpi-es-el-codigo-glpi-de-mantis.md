---
name: glpi-es-el-codigo-glpi-de-mantis
description: "El GLPI de un ticket es solo el campo \"Codigo GLPI\" de Mantis; el id de un adjunto es un número de documento, no un caso"
metadata:
  node_type: memory
  type: feedback
  originSessionId: df811c99-3ccb-4226-996f-01a8e2ee0efd
  modified: 2026-10-21T19:16:24.928Z
---

Al hablar del GLPI de un ticket solo se cita el campo "Codigo GLPI" del ticket de Mantis (en el 11467, el 57766). El id que `tickets.py` muestra para un adjunto (`glpi:59376`) es el `docid` del documento dentro de ese caso, no otro caso: se presenta como "doc 59376 del GLPI 57766".

**Why:** en el ticket 11467 presenté `glpi:59376` como si fuera el GLPI y Fabian creyó que el ticket apuntaba a otro caso. Lo pidió el 2026-10-21.

**How to apply:** en cualquier resumen, pregunta o reporte de `ticket-context`, el GLPI sale del campo "Codigo GLPI"; los adjuntos se nombran con su docid y el caso al que pertenecen.
