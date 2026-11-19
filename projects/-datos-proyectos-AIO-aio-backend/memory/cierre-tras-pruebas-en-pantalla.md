---
name: cierre-tras-pruebas-en-pantalla
description: "Orden acordado el 2026-11-18: cuando terminan las pruebas en pantalla de Claude, se sigue con finish-development de todos los tickets abiertos"
metadata:
  node_type: memory
  type: project
  originSessionId: 0329e7f7-2889-4508-8bb0-838b7c65259f
  modified: 2026-11-19T14:45:06.842Z
---

Orden de trabajo pedido por Fabian el 2026-11-18 (ticket 11927, rama `feature/11927-fabian-originDesa-ErrorDespachos` en aio-backend y aio-app): primero Claude termina sus pruebas en pantalla; terminadas, se procede con la finalización (`finish-development`) de **todos** los tickets que estén abiertos, no solo el de la sesión.

**Why:** Fabian lo pidió al invocar `/finish-development` con el 11927 ya probado en pantalla por Claude (Apoyos y los dos tipos de la Distribución de pesos), para no perder el orden si la sesión se corta.

**How to apply:** al retomar, confirmar con Fabian qué tickets siguen abiertos y cerrarlos uno por uno con `finish-development`, con todas sus fases. El 11927 se hizo en modo práctica: antes de su cierre va el registro de la práctica, con los números que da Fabian. Las reglas de cierre siguen igual: [[cierre-con-todas-las-documentaciones]], [[revision-de-pares-propia]].
