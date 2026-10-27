---
name: sipa-arma-la-url-de-descarga
description: "SIPA concatenaba baseURL con el enlace y le quitaba /api con replace; el enlace de la API es relativo al servidor, no a su prefijo."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-10-27T13:40:37.763Z
---

Los enlaces de descarga que entrega `status-api` —el buzon, los adjuntos— son **relativos al
servidor** (`/storage/...`), no al prefijo `/api`. SIPA tiene su `baseURL` **con** ese prefijo,
asi que concatenar las dos cosas da una URL que no existe.

## El patron que habia, y por que es fragil

```js
let full_enlace = axiosIns.defaults.baseURL + enlace;
link.href = full_enlace.replace('/api', '');
```

`replace` sin bandera global cambia **la primera** aparicion de `/api`, venga de donde venga. Si
el host del ambiente la contiene —`https://api-status.datint.co`, o una ruta con `/api/` en el
medio— recorta el pedazo equivocado y el enlace apunta a otro sitio. Funciona en local por
casualidad, porque ahi `/api` solo aparece al final del `baseURL`.

## Como queda

```js
const origen = new URL(axiosIns.defaults.baseURL, window.location.origin).origin;
link.href = new URL(enlace, origen).href;
```

`URL(...).origin` se queda con esquema, host y puerto, y descarta **cualquier** ruta del
`baseURL` sin importar que contenga. Despues `new URL(enlace, origen)` resuelve el enlace
relativo contra ese origen. No hay recorte de texto, asi que no hay nada que se pueda recortar mal.

## Lo que hay que recordar

- **Un enlace que entrega la API no se concatena con el `baseURL` del cliente.** El `baseURL`
  lleva el prefijo del API; el enlace no lo lleva.
- **Quitar un pedazo de una URL con `replace` es siempre sospechoso.** Si de verdad hace falta
  separar origen y ruta, eso lo hace `new URL()`, que entiende la estructura.
- El mismo error esta listado como algo que no se debe copiar de AIO al separar repos: el
  `split('/api')` y la URL horneada en el bundle.

Ver [[servicios-front-espejan-al-back]] y [[buscar-consumidores-de-un-endpoint]].
