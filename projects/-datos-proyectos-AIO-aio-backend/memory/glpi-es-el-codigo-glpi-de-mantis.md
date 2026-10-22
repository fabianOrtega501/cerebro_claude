---
name: glpi-es-el-codigo-glpi-de-mantis
description: "El GLPI de un ticket es solo el campo \"Codigo GLPI\" de Mantis; el id de un adjunto es un número de documento, no un caso"
metadata:
  node_type: memory
  type: feedback
  originSessionId: df811c99-3ccb-4226-996f-01a8e2ee0efd
  modified: 2026-10-22T19:08:28.984Z
---

Al hablar del GLPI de un ticket solo se cita el campo "Codigo GLPI" del ticket de Mantis (en el 11467, el 57766; en el 11488, el 57871). El id de un adjunto es el `docid` del documento dentro de ese caso, no otro caso. Desde el 2026-10-22, `tickets.py` trae cada adjunto con su `case` y un `label` listo para mostrar ("documento 59493 del GLPI 57871 (nombre.pdf)"): se muestra ese `label`, y `glpi:<id>` solo va dentro del comando `--pick`.

**Why:** en el 11467 presenté `glpi:59376` como si fuera el GLPI. La memoria sola no bastó: en el 11488 volví a escribir `glpi:59493`, y Fabian pidió el 2026-10-22 corregirlo en la fuente (script, agente `ticket-reader` y skill `ticket-context`).

**How to apply:** en cualquier resumen, pregunta o reporte de `ticket-context`, el GLPI sale del campo "Codigo GLPI" y los adjuntos se nombran con su `label`. Si una salida vieja no trae `label`, se arma igual: "documento <id> del GLPI <Codigo GLPI>".
