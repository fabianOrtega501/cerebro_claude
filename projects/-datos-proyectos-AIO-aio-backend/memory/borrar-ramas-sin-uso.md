---
name: borrar-ramas-sin-uso
description: Una rama de trabajo que queda sin cambios se borra sin pedir autorización
metadata:
  node_type: memory
  type: feedback
  originSessionId: 78dad690-367a-4a23-a3dc-017d7ef321eb
  modified: 2026-11-17T16:26:48.428Z
---

Cuando una rama creada para un ticket queda sin uso (por ejemplo, la del backend en un ticket que resultó ser solo de front), se borra de una vez, sin preguntar. Se comprueba antes que no tenga commits propios ni cambios sin commitear, y se borra con `git branch -d`.

**Why:** Lo pidió Fabian el 2026-11-17 (ticket 11907): pedir permiso para eso es un paso de más.

**How to apply:** Apenas se confirma que un repo no lleva cambios en el ticket, se pasa a la base y se borra la rama local; se informa en una línea.
