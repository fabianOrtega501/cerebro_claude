---
name: phpdoc-tres-renglones
description: PHPDoc y JSDoc en Status van a maximo 3 renglones, tecnicos, sin explicar nada interno ni citar tickets
metadata:
  type: feedback
---

En Status la documentacion de una funcion, metodo, clase o constante no pasa de **3 renglones de
prosa**, mas `@param` por argumento y `@return`. Se documenta que hace la pieza y sus entradas y
salidas. Nada interno: ni el porque de una condicion, ni como funciona un operador, ni el orden de
dos instrucciones. Nada de numeros de ticket, Mantis, GLPI ni historias de usuario.

**Why:** el `CLAUDE.md` del repo pedia "prosa con que hace, como lo hace y por que", y con eso se
escribieron docblocks de seis y ocho renglones que tapaban el codigo. Fabian lo corrigio el
2026-09-04, en la Etapa A del ticket 10841, despues de dos revisiones seguidas en que pasó.

**How to apply:** si el porque de una linea concreta importa, va como comentario suelto junto a esa
linea, no en la cabecera. Si la explicacion no cabe en 3 renglones, el problema es la funcion. La
regla general esta en `~/.claude/CLAUDE.md`, seccion "Documentar funciones", y aplica a todos los
proyectos. Ver [[dashboard-status-endpoints-patron]].
