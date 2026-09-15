---
name: no-usar-pint-en-aio
description: En aio-backend no se corre pint; el formato lo pone Intelephense y el estilo lo manda el CLAUDE.md del repo
metadata:
  type: feedback
---

No correr `pint` sobre los archivos del ticket en aio-backend. Fabian formatea con PHP
Intelephense desde el editor, y el estilo que rige es el que exige el `CLAUDE.md` del repo.

**Why:** pint no tiene archivo de configuración en este repo, así que corren sus defaults, y dos
de ellos contradicen la norma escrita: `no_superfluous_phpdoc_tags` borra el `@return` que el
`CLAUDE.md` exige siempre, y `php_unit_method_casing` renombra los métodos de prueba a
`snake_case` cuando todas las pruebas del repo usan `camelCase`. Pint no está en el CI, así que
la divergencia no la delata nada. Intelephense no toca docblocks ni nombres de métodos, por eso
no choca.

**How to apply:** al cerrar un desarrollo, omitir el paso de pint y verificar solo con phpstan y
las pruebas. Si hace falta ver qué opinaría, `php vendor/bin/pint --test`, que no escribe. Ver
[[pint-solo-archivos-del-ticket]], la memoria del equipo que sigue describiendo cómo invocarlo
para quien sí lo use.
