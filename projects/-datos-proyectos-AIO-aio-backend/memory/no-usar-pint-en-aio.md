---
name: no-usar-pint-en-aio
description: En aio-backend no se corre pint; el formato lo pone Intelephense y el estilo lo manda el CLAUDE.md del repo
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8fdca9ab-57cd-401b-8c04-10c339bd8ff3
  modified: 2026-10-09T16:50:19.662Z
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

**Excepción: los archivos nuevos del ticket sí pasan Pint**, solo ellos y con
`./vendor/bin/sail php vendor/bin/pint <archivo>`. La revisión de pares del ticket 11041, el
2026-10-09, pidió el formato de Pint en un archivo creado en la rama (espacio después de `!`,
concatenación sin espacios, `use` en vez del nombre completo en el docblock). Los archivos que ya
existían no se tocan con Pint: el formato de esos lo pone Intelephense. Después de correrlo, revisar
el diff: si borró un `@return` o renombró una prueba, se restituye a mano.
