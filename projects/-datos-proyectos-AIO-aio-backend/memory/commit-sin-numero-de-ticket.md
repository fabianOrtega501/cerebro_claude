---
name: commit-sin-numero-de-ticket
description: Formato del mensaje de commit en AIO cuando el desarrollo no tiene número de ticket GLPI
metadata:
  type: feedback
---

En AIO, cuando un desarrollo **no tiene número de ticket GLPI**, el commit se hace omitiendo el
número y el separador, dejando solo el prefijo del proyecto:

```
SOFTWARE - AIO: Lectura de id encriptado
```

Es decir, `SOFTWARE - AIO: <descripción corta>`, sin los siete dígitos ni los dos puntos que los
siguen. Con ticket sigue vigente el formato completo del equipo: `0010842: SOFTWARE - AIO: <descripción>`.

**Why:** El formato del equipo asume que siempre hay ticket, pero hay hotfix que nacen sin uno.
Ante esa falta no se inventa un número ni se pone un genérico —el historial del repo ya arrastra
commits llamados `.` y `Ajustes`—: se recorta el prefijo y se conserva la descripción.

**How to apply:** En la fase de commit de `finish-development`, si el preflight devuelve
`ticket: null`, no bloquear preguntando el número: proponer directamente
`SOFTWARE - AIO: <descripción de cinco palabras como mucho>` y confirmar el texto con el usuario.
