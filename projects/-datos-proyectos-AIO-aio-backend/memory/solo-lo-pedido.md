---
name: solo-lo-pedido
description: "No agregar trabajo, validaciones ni protecciones que no se pidieron; cada pieza de más termina en un comentario de revisión"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8979624c-4b25-43b3-ac31-030daf0a4d7a
  modified: 2026-10-05T21:32:15.424Z
---

Se implementa solo lo que pide el ticket o la instrucción del momento. Nada de validaciones,
protecciones "por si acaso", métodos de conveniencia, cachés ni ajustes de paso que nadie pidió.
Si algo parece necesario y no está pedido, se propone y se espera el sí; no se agrega.

**Why:** en el ticket 11308 (2026-10-05) el MR del back volvió con siete comentarios, casi todos sobre
piezas que nadie pidió: exigir la empresa en el listado, bloquear el cambio de empresa, un caché del
UTC, un servicio estándar sobrescrito. Fabian: «estás haciendo trabajo adicional que te pedí no hacer».

**How to apply:** antes de escribir una validación o un método, preguntarse si lo pide la HU o el
usuario. Si no, va como propuesta en el plan, no en el código. Relacionado: [[estandar-intacto]],
[[validaciones-con-el-estandar]], [[buscar-antes-de-crear]].
