---
name: push-antes-de-documentar
description: "Al cerrar un desarrollo, el push de las ramas de código va antes del control de cambios, el set de pruebas y el manual"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8c34b7cf-528c-4a38-9db5-224293c71ab9
  modified: 2026-10-19T13:28:04.707Z
---

En `finish-development`, en cuanto el código está verificado, commiteado e integrado con la base,
se hace el **push** de las ramas de código. El control de cambios, el set de pruebas y el manual se
arman **después**, mientras Fabian crea los MR.

**Why:** lo pidió Fabian el 2026-10-19 al cerrar el ticket 11411: el push estaba esperando a que
terminaran los textos y el manual, y él no podía abrir los MR mientras tanto. Hacerlo antes gana
tiempo en paralelo.

**How to apply:** después de la Fase 6 (volver a verificar tras el merge) se pide el sí y se hace el
push de cada repo; recién ahí se ofrecen `gen-changes-controls`, `gen-test-set` y `update-manual`.
El manual sigue en su propia rama y su propio push. Relacionado: [[conflictos-los-resuelve-el-usuario]].
