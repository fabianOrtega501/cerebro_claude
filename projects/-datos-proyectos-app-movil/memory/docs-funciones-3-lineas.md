---
name: docs-funciones-3-lineas
description: "La documentacion de una funcion son maximo 3 lineas de descripcion, mas @param y @returns"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d9aa497b-fcc8-4e8e-b2c9-86ad9e43df9c
  modified: 2026-08-28T17:19:09.875Z
---

El bloque de documentacion de una funcion lleva **maximo 3 lineas de descripcion**, y despues
`@param` y `@returns`. Nada de parrafos explicando el contexto, la causa de un bug o por que se
eligio una tecnica.

**Why:** el usuario ya lo pidio antes y se reincidio (JSDoc de 10 lineas en `resolveAddress`,
aio-backend). La documentacion larga tapa el codigo: se lee mas prosa que implementacion, y lo
unico importante queda enterrado entre lineas que el lector ya sabia.

**How to apply:** en la descripcion va que hace y que devuelve, concreto. Si un retorno tiene
semantica (un valor centinela, que no lanza, unidades), esa es la linea que no se puede omitir.
El **porque** de una decision tecnica no va en la cabecera: va como comentario suelto junto a la
linea que lo necesita. Ver tambien [[i18n-keys-al-final]] para otra correccion ya reincidida.
