---
name: selectores-sin-opciones-en-espanol
description: "En status-frontend, un selector sin opciones dice \"No se encontraron opciones\"; ya esta resuelto globalmente en main.js."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-18T17:25:35.168Z
---

En `status-frontend`, cuando un `v-select` no tiene opciones que mostrar, el mensaje debe ser
**"No se encontraron opciones"**, no el `Sorry, no matching options` que trae vue-select.

**Ya esta resuelto y no hay que hacer nada en cada vista.** `src/main.js` registra `v-select`
envuelto en un componente funcional que inyecta el slot `no-options` por defecto, asi que los 87
selectores del proyecto —y cualquiera que se agregue— lo heredan solos. Una vista que necesite
otro texto pasa su propio `#no-options` y ese gana, porque los slots del contexto se aplican
despues del predeterminado.

**Por que asi y no vista por vista:** Fabian lo pidio el 2026-09-18 para todos los selectores,
pero sin rehacer lo ya migrado. El envoltorio global cumple las dos cosas con un solo archivo
tocado. Antes de hacerlo se verifico que ningun `v-select` del proyecto usa `ref` —que un
componente funcional no propaga— ni slots propios, asi que no habia con que chocar.

**Ojo al tocar `main.js`:** `globalComponents.js` tambien importa `vSelect` y le muta
`props.components.default` para los iconos, pero su `Vue.component(vSelect)` no registra nada
porque le falta el nombre. El registro que manda es el de `main.js`, que corre despues.

Ver [[servicios-front-espejan-al-back]].
