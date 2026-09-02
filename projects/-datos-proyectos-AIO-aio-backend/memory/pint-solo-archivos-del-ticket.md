---
name: pint-solo-archivos-del-ticket
description: En aio-backend pint se invoca con `php vendor/bin/pint` y solo sobre los archivos de la rama; el repo entero no cumple su estilo
metadata:
  type: project
---

En `aio-backend`, `./vendor/bin/pint` **no tiene permiso de ejecucion** (`Permiso denegado`): hay
que invocarlo como **`php vendor/bin/pint`**. Y hay que pasarle **los archivos concretos de la
rama, nunca una carpeta**: al pasarle `app/Exceptions/Common/` durante el ticket 10614
(2026-09-02) reformateo `QueryException.php`, un archivo que nadie habia tocado, y hubo que
revertirlo con `git checkout`.

Mas importante: **el codigo que ya esta en el repo no cumple el estilo de pint.** De los 7
archivos modificados en ese ticket, los 7 fallaban `pint --test` **antes** del commit
(`concat_space`, `ordered_imports`, `phpdoc_align`, `statement_indentation`). Un `fail` de pint no
significa que aportaste el problema.

**Why:** el `CLAUDE.md` del repo pide respetar la indentacion del archivo que se edita en vez de
reformatearlo completo, porque un reformateo masivo hace ilegible el diff del MR. Pero
`finish-development` pide "pasar el formateador", y hacerlo sin criterio contradice esa regla y
mete ruido de archivos ajenos.

**How to apply:** formatear con pint **solo los archivos nuevos** del ticket, y en los modificados
respetar el formato existente. Para verificar sin reescribir, `php vendor/bin/pint --test <archivos
de la rama>`; si falla, comprobar si ya fallaba en `HEAD` extrayendo la version previa con
`git show <commit>^:<archivo>` a un directorio aparte —no con `git stash`, ver
[[no-usar-stash-para-comparar-con-la-base]]. Es el equivalente en el back de
[[lint-del-aio-reformatea-todo]].
