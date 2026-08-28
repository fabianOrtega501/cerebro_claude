---
name: i18n-keys-al-final
description: "Las claves de traduccion nuevas van al final del archivo de locales, no junto a claves relacionadas"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d9aa497b-fcc8-4e8e-b2c9-86ad9e43df9c
  modified: 2026-08-28T17:13:52.369Z
---

Al agregar una clave de traduccion nueva, va **al final** del archivo de locales (`es.json`,
`en.json`, y el equivalente en cualquier proyecto), nunca insertada en medio junto a claves
tematicamente relacionadas.

**Why:** insertar en medio ensucia el diff —cambia el contexto de lineas que nadie toco— y
obliga a resolver conflictos cuando dos personas agregan claves en la misma zona. Al final, cada
clave nueva es una linea agregada limpia.

**How to apply:** localizar la ultima clave del objeto, agregarle la coma si no la tiene, y poner
la clave nueva debajo. No buscar "donde encaja tematicamente". Aplica a todos los locales del
proyecto por igual, para que los archivos no se desincronicen en orden.
