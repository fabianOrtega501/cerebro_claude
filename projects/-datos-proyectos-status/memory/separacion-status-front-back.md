---
name: separacion-status-front-back
description: Proximo desarrollo grande de Status — separar el monorepo en repo de backend y repo de front; contexto, tamano real y cual es la referencia valida
metadata:
  type: project
---

El siguiente ticket grande de Status separa el monorepo Laravel+Vue en dos repos, como ya estan
AIO y Epsilon. Anunciado por Fabian el 2026-09-10; a esa fecha no hay enunciado ni decisiones
tomadas todavia.

**Why:** dos datos medidos el 2026-09-10 mandan sobre la planeacion. Primero, el front son **334
componentes `.vue` y ~107.000 lineas** en Vue 2.7 con Vuesax, y Vuesax no tiene version para Vue 3;
si el front nuevo va en Vue 3 —que es lo que usan AIO y Epsilon— esto no es mover carpetas, es
reescribir la capa de interfaz, y hay que decirlo antes de que alguien lo estime como una mudanza.
Segundo, **Epsilon no sirve de referencia de Laravel**: su backend es Node con Express y Sequelize,
sin `composer.json` ni `artisan`. El unico par Laravel+Vue ya separado es AIO.

**How to apply:** tomar el stack y las convenciones de AIO (ver [[patron-separacion-aio]]) y de
Epsilon solo el artefacto de proceso: el documento de contrato duplicado en los dos repos con su
verificador estatico. Antes de estimar, resolver tres preguntas que cambian todo el alcance: si el
front nuevo va en Vue 3 o se queda en Vue 2 mudado de repo; si se migran las 334 pantallas de una o
por modulos conviviendo las dos aplicaciones; y que pasa con ag-grid 21, Tailwind 1.9 y el Node 14
de los servidores. Lo que hay que tocar del lado de Status esta en
[[acoples-front-monorepo-status]]; los dos frentes mas caros, en
[[archivos-al-separar-origenes]] y [[permisos-y-menu-al-separar]].
