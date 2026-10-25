---
name: adaptar-lo-nuevo-al-manejo-existente
description: "Si un ajuste del ticket choca con un manejo global que ya existía, no se cambia ese manejo; se adapta lo nuevo, solo para los campos del ticket"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a9b5b05d-556c-4866-b1bd-38d9d3a4ea48
  modified: 2026-10-24T14:52:53.784Z
---

Cuando lo que agrega un ticket choca con un manejo que ya existía y que usan otros casos (por ejemplo, el formulario de Empresa envía un campo vacío como el texto "null"), **no se modifica ese manejo global**. Se adapta lo nuevo a como funcionaba: en el backend y solo para los campos del ticket, siguiendo el patrón que ya existe (en Empresa, el `logo == 'null'` de `CustomCompanyService::createCompany`/`editCompany`).

**Why:** en el ticket 11488 cambié `CustomCompanyService.ts` del front para que todo campo vacío viajara como cadena vacía. La revisión de pares lo marcó como cambio global fuera de la HU, y Fabian pidió el 2026-10-23 «no modifiquemos el manejo actual, adaptemos lo nuestro a lo que estaba».

**How to apply:** antes de corregir algo en un servicio, interceptor o componente compartido, preguntarse si la corrección alcanza a casos fuera del ticket. Si es así, se propone resolverlo solo para lo del ticket; el arreglo global se deja anotado como propuesta aparte. Relacionado: [[estandar-intacto]], [[solo-lo-pedido]], [[revision-de-pares-propia]].
