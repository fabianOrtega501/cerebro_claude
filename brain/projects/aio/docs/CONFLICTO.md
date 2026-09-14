# Los dos arboles de documentacion de aio-backend — RESUELTO

> **Resuelto el 2026-09-14.** Se unifico todo en `docs/modules/` y se reescribio el estandar.
> Lo que sigue se conserva porque explica por que el arbol que quedo NO es el que mandaba el
> estandar viejo: si alguien encuentra un enlace muerto a `docs/modulos/`, esta es la razon.

## Que pasaba

El repo tenia dos arboles: `docs/modulos/` (espanol, 18 archivos, lo que pedia el estandar en su
§2.3) y `docs/modules/` (ingles, 8 archivos, alimentado por el agente `backend-logic-doc` del
`.claude/` de un companero). `AVL/gps-history/README.md` estaba en los dos, con contenido y
fechas distintas — justo el caso que el §2.7 del propio estandar advierte: *documentacion
equivocada es peor que no tener documentacion*.

El inventario del 2026-08-27 conto 7 contra 5. Al resolverlo, el 2026-09-14, iban 18 contra 8:
los dos crecian.

## Como se resolvio

Fabian decidio **ingles**, para que las rutas de `docs/` espejen las de `app/`, que ya lo estan.
Se hizo en su rama del ticket 10987:

- Los 17 archivos de `docs/modulos/` se movieron con `git mv` (conserva el historial) a
  `docs/modules/`, con el nombre traducido a kebab-case en ingles.
- De `AVL/gps-history/README.md` se conservo **la version del arbol ingles**, que era la mas
  reciente (2026-08-14 contra 2026-08-11) y la mas completa.
- `docs/modulos/` se elimino.
- Se actualizaron las 8 referencias del repo: el estandar `docs/README.md` (§2.3, la tabla de
  indice y la regla de nombres, que ahora pide ingles en la **ruta** y espanol en el
  **contenido**), el `CLAUDE.md` del repo con sus diez `@docs/modulos/...`,
  `docs/arquitectura/capas.md`, la skill `crear-hu` del equipo y cuatro archivos PHP de `app/`
  que citaban un documento en su docblock.
- De paso, los 8 documentos del arbol ingles entraron al indice del `docs/README.md`, donde
  nunca habian estado.

## Que cambio en el cerebro

`profile.json` apunta a `docs/modules` y mapea `Avl -> avl` (el arbol ingles usa minuscula).
La skill `update-tech-docs` escribe ahi.

## Lo que hay que saber de aqui en adelante

El estandar que manda es el **nuevo**: rutas en ingles. Si aparece un `docs/modulos/` en una
rama vieja sin mezclar, es de antes de esta unificacion y hay que moverlo, no recrear la carpeta.
