---
name: python-sin-pip-en-esta-maquina
description: El Python del sistema no trae pip ni ensurepip; las librerias del cerebro son solo stdlib y cualquier paquete externo exige pedir sudo apt
metadata:
  node_type: memory
  type: project
  originSessionId: f018cb24-ecb6-43d9-9e28-8db27e6ca8cc
  modified: 2026-09-28T14:54:03.583Z
---

En este computador `python3` (3.12) no tiene `pip`, `pipx` ni `uv`, y `python3 -m venv` crea
entornos sin pip porque falta `ensurepip`. Instalar cualquier paquete de PyPI exige antes
`sudo apt install python3-venv`, y eso lo decide Fabian.

**Why:** se descubrio el 2026-09-28 al querer probar MarkItDown para convertir las HU. Por eso
`brain/lib/tickets/` quedo escrito solo con la libreria estandar mas `pdftotext` y `pdfimages`
(poppler), que si estan instalados.

**How to apply:** una libreria nueva del cerebro en Python no debe depender de paquetes
externos. Si de verdad hace falta uno (MarkItDown para .xlsx o .pptx, por ejemplo), pedir
permiso para el `apt` y usar un venv en `~/.claude/cache/venv`, nunca el Python del sistema.
Relacionado: [[conexion-tickets-mantis-glpi]].
