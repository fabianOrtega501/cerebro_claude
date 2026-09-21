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
del front, de una vez se le ajusta el aspecto buscando parecerse a **gestion de tramites**
(`ListaTramites.vue` y `EditorTramite.vue`): cabecera flex con el titulo en versalitas sobre el
color primario en vez de la rejilla `vs-row` 8-2-2 con columna vacia de espaciador, los iconos de
la columna Accion dentro de un `.acciones` con `gap`, y las etiquetas unificadas con
`.campo__label`. El bloque `<style scoped>` se copia tal cual de esas vistas.

El alcance es el retoque, no el rediseno completo: extraer el popup a un componente editor y la
validacion visual por campo se deciden aparte, porque cambian comportamiento.

Ver [[servicios-front-espejan-al-back]] y [[swagger-en-controlador-tocado]].
