---
name: convenciones-temporales-ticket-7433
description: Dos convenciones que rigen SOLO mientras dure el ticket 7433 (separacion back/front de Status); se borran al cerrarlo.
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-21T22:52:33.836Z
---

**Vigencia limitada.** Estas dos reglas valen **solo mientras dure el ticket 7433**, la
separacion de backend y frontend de Status. Lo pidio Fabian asi el 2026-09-21: que no se
volvieran permanentes. **Al cerrar el ticket, borrar este archivo** y su linea en `MEMORY.md`.

**1. Status al cerrar cada grupo.** Cuando se termina un grupo de trabajo —una entidad, un lote
de vistas, un modulo— se entrega sin que lo pidan un estado con **lo que llevamos y lo que hace
falta**, medido contra el repositorio y no de memoria: endpoints documentados, controladores por
estilo de respuesta, entidades con servicio, vistas migradas.

**2. La vista que se toca, se mejora de apariencia.** Si un cambio obliga a entrar a una vista
del front, de una vez se le aplica el estandar visual:

- Cabecera: `<div class="encabezado">` con `<p class="encabezado__titulo">` y, si hay boton,
  `<div class="encabezado__acciones">`. Reemplaza la rejilla `vs-row` de 8-2-2 con su columna
  vacia de espaciador y el `<h3 class="text-primary">` en mayusculas escritas a mano.
- Columna Accion de las tablas: los iconos dentro de `<div class="acciones">`.
- Etiquetas de campo: `class="campo__label"` en vez de `vs-select--label`.
- Pantallas de acceso (ingreso, recuperar y actualizar contrasena): `class="acceso__titulo"`,
  que es la misma identidad a mayor tamano.

**El CSS NO se copia en el `<style scoped>` de cada vista.** Vive en
`src/assets/scss/status/_estandar-vistas.scss`, importado desde `main.scss`, asi que basta con
poner la clase. Se centralizo el 2026-09-21 porque el mismo bloque estaba duplicado en diez
archivos y cambiar el estandar obligaba a tocarlos uno por uno. La referencia de donde salieron
las reglas es gestion de tramites, pero ya no se copia de ahi: se usa el archivo compartido.

El alcance es el retoque, no el rediseno completo: extraer el popup a un componente editor y la
validacion visual por campo se deciden aparte, porque cambian comportamiento.

Ver [[servicios-front-espejan-al-back]] y [[swagger-en-controlador-tocado]].
