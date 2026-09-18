---
name: servicios-front-espejan-al-back
description: Los servicios de status-frontend se organizan con la misma estructura de carpetas que app/Services del back.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-18T12:33:26.805Z
---

En `status-frontend`, los servicios van en `src/services/<Producto>/[Modulo]/<Entidad>/`, **la
misma estructura que `app/Services/` en `status-api`**: `Status`, `Sipa` y `Configuracion` como
primer nivel, el modulo cuando lo hay, y una carpeta por entidad.

Al crear o modificar un servicio se le crea su carpeta segun ese arbol; los que ya existen se
van trasladando de a poco, a medida que se tocan. No se hace una migracion masiva.

**Por que:** hoy el front tiene siete servicios sueltos (`DashboardService.js` en la raiz,
`GestorTransaccional/BloqueoService.js`, …) mientras el back ya esta ordenado por producto y
entidad. Con la misma forma en los dos lados, de una ruta se llega al controlador, al servicio
del back y al servicio del front cambiando solo la carpeta raiz. Lo pidio Fabian el 2026-09-18.

**Ojo:** el back todavia no es del todo consistente en esto —el dashboard general esta en
`Status/GestorTransaccional/Dashboard` y Top Reportes en `Status/Dashboard/TopReporte`—, asi
que antes de espejar una carpeta conviene mirar si el back tiene el caso resuelto.

Ver [[swagger-en-controlador-tocado]].
