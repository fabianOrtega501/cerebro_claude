---
name: cada-rn-con-su-caso
description: "Antes de cerrar, cada RN de la HU tiene su fila en el plan y su caso en el set de pruebas; una condición heredada que la contradiga se decide antes de editar"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2d82b59f-1bcf-411e-8873-32538a78ff3c
  modified: 2026-11-12T14:01:48.160Z
---

Al planear y al armar el set de pruebas, una fila por cada regla de negocio (RN) de la HU, con el archivo o la condición que la cumple. Si el código ya trae una condición de otro ticket que la contradice (por ejemplo, un modo Ver que oculta acciones), se dice en el plan y se decide antes de editar.

**Why:** en el 10680 la RN07 ("mismo comportamiento en consulta y en edición de la ruta") quedó sin cumplir: el ocultamiento de acciones en modo Ver venía del 10462, el desarrollo se armó desde la falla visible y ningún caso de prueba revisó las acciones al abrir la ruta con Ver. QA lo vio y lo anotó como comportamiento, no como diferencia con la HU.

**How to apply:** en el plan, tabla RN → dónde se cumple; en `gen-test-set`, al menos un caso por RN. Relacionado con [[revision-de-pares-propia]].
