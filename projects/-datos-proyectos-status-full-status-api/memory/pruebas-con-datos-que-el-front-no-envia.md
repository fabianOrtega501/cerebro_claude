---
name: pruebas-con-datos-que-el-front-no-envia
description: Una prueba que arma su propio payload en JSON limpio pasa aunque el front envie algo que el Form Request rechaza.
metadata:
  type: feedback
---

Una prueba que construye el payload a mano manda JSON con tipos reales: `true` booleano,
enteros, `null`. El front de Status manda **FormData**, donde todo viaja como texto:
`"true"`, `"false"`, `"null"`. Un Form Request con regla `boolean` pasa la prueba y rechaza
la peticion real.

**Why:** la prueba verde da una seguridad que no corresponde a nada. El error aparece en QA
o en produccion, en el unico camino que nadie ejercito: el que usa el usuario.

**How to apply:** al escribir la prueba de un endpoint, **copiar el payload del front**, no
inventarlo: mirar que manda la vista y con que tipos. Si va por FormData, normalizar en
`prepareForValidation` y dejar al menos un caso de prueba con los valores como texto.
Relacionado: [[reglas-al-escribir-un-form-request]].
