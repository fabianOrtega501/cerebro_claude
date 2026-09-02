---
name: no-usar-stash-para-comparar-con-la-base
description: No usar git stash para comparar la rama contra su base; aplica stashes ajenos y deja conflictos en archivos de otros tickets
metadata:
  type: feedback
---

Para comparar el comportamiento de la rama contra la base **no usar `git stash`**. En el ticket
10614 (2026-09-02) el ida y vuelta de `stash push` / `stash pop` acabo aplicando el
`stash@{1}` de **otra rama** (`feature/10718-...-ReciclajeVoluminosos`) y dejo marcadores de
conflicto (`UU`) dentro de `PublicItemService.php`, un archivo ajeno al ticket. Se detecto solo
porque el conteo de archivos modificados subio de 18 a 19.

**Why:** `git stash pop` sin argumento aplica `stash@{0}`, y ese indice **se desplaza** cada vez
que se hace un push nuevo. Si en la pila hay trabajo de otra rama —cosa normal— un pop de mas lo
mezcla en el arbol actual. El riesgo real no es el conflicto visible: es commitear contenido de
otro ticket sin darse cuenta, o perder el stash ajeno.

**How to apply:** para leer una version anterior de un archivo, `git show <ref>:<archivo>` a un
directorio temporal; no hace falta mover el arbol. Si de verdad hay que guardar el trabajo,
`git stash push -m "<etiqueta>"` y recuperarlo **por su nombre** (`git stash pop stash@{N}` tras
comprobar `git stash list`), nunca a ciegas. Antes de cualquier ida y vuelta, respaldar con
`git diff > patch` y un `tar` de los archivos sin seguimiento. Y al terminar, comprobar
`git stash list` y el conteo de archivos.
