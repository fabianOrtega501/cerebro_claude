---
name: mensaje-de-commit-que-y-donde
description: "El mensaje de commit dice que se hizo y donde, sin mencionar otros proyectos como AIO."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-21T22:12:01.331Z
---

El mensaje de commit dice **que se hizo y donde**, despues del numero de ticket:

```
7433: servicios, validacion de borrado y documentacion Swagger en Modulos y Menu
```

**Que evitar:** referencias a otros proyectos. Nada de "con la estructura de AIO", aunque la
estructura efectivamente venga de ahi.

**Por que:** quien lee el historial de este repo no tiene el contexto de AIO, asi que esa
mencion no le dice nada y ocupa el lugar de lo que si importa —que cambio y en que modulo—.
Lo corrigio Fabian el 2026-09-21, sobre el mensaje `7433: dejar modulos y menu con la
estructura de AIO y su documentacion`.

**Como aplicarlo:** nombrar el trabajo concreto (servicios, Form Requests, documentacion,
validacion) y la entidad o modulo donde quedo. Cada repo describe lo suyo: el commit del
backend y el del front no repiten el mismo texto.

Ver [[no-commitear-sin-autorizacion]] y [[swagger-en-controlador-tocado]].
