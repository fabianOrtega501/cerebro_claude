---
name: reemplazo-masivo-de-un-patron
description: Un sed o regex sobre un patron que se repite borra o daña lo que no se miro; revisar archivo por archivo antes de dar por buena la transformacion.
metadata:
  type: feedback
---

Transformar en masa un patron que aparece varias veces —el envoltorio de respuesta de un
controlador, el `.data.datos` de una vista— rompe casos que el patron alcanza pero que no
debia tocar.

Paso dos veces en el ticket 7433:

- Un regex que cambiaba `establecerArregloRetorno` por `ApiResponse` **borro el metodo
  `store` completo** de `IndiceDetalleController`, porque el bloque tenia un `if` intermedio
  que el patron no contemplo. Lo detecto `ResolucionDeClasesTest`, no yo.
- Un reemplazo de `.data.datos` por `.data` en el front alcanzo dos endpoints **que no se
  habian migrado** (`/detalle-lista-maestros/select/` y `/responsables/select`), que seguian
  devolviendo el envoltorio viejo. Ahi no habia prueba que lo detectara.

**Why:** el patron encaja en mas sitios de los que uno reviso, y en el front nadie avisa. Lo
que se rompe no es donde se aplico mal el cambio, es donde el cambio no debia aplicarse.

**How to apply:** despues de un reemplazo masivo, **listar los sitios afectados uno por uno**
y confirmar que cada uno de verdad iba a migrarse. En el back, correr
`ResolucionDeClasesTest` antes de seguir. En el front, listar las llamadas restantes de cada
archivo tocado y verificar contra que endpoint van. Si el patron tiene un `if` o un `return`
intermedio, hacerlo a mano: son cinco minutos contra un metodo borrado.
Relacionado: [[vigilar-en-cada-prueba-exhaustiva]].
