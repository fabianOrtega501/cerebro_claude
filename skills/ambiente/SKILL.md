---
name: ambiente
description: Muestra o cambia el ambiente de trabajo (local, desa, qa, pre, prod) y su modo (lectura o escritura). Solo la invoca el usuario; es la unica forma de activar produccion.
disable-model-invocation: true
argument-hint: "[local|desa|qa|pre|prod] [lectura|escritura]"
---

AMBIENTE-SOLICITADO: $ARGUMENTS

El hook de activacion ya aplico este cambio antes de que leyeras esto, y el ambiente que quedo
activo viene en el contexto que inyecto.

Confirmale al usuario, en una sola linea, el ambiente y el modo activos. Si falta el modo,
preguntale si vamos en lectura o en escritura. No ejecutes nada mas.
