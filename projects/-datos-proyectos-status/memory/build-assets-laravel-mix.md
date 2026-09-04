---
name: build-assets-laravel-mix
description: Cómo correr y compilar el front (Laravel Mix + Node moderno), dónde se sirve, y quirk de .copy() en watch
metadata:
  type: reference
---

Proyecto Vue2 + Vuesax + Laravel Mix 5 (webpack 4). Build de assets:

**Correr el front:** `npm run watch` (o `npm run dev`). No levanta servidor: compila a `public/` y quien
sirve es el contenedor Docker `status` (Apache) en `http://localhost:${APP_PORT}` (8086 en local, del
`.env`). El script imprime un banner con las URLs Local/Network/API antes de arrancar
(`scripts/dev-banner.js`). Sin hot reload: recargar el navegador. **No usar `npm run hot`**: choca con
el puerto 8080 de aio-backend, con `publicPath=MIX_ROUTER_BASE` y con los assets cargados via `asset()`.

**OpenSSL / versiones de Node:** Node 17+ rompe webpack 4 con `error:0308010C digital envelope
routines::unsupported`; el servidor de despliegue tiene **Node 14**, que rechaza el flag
`--openssl-legacy-provider`. Por eso `development` y `production` pasan por `scripts/webpack.js`,
que agrega el flag solo si Node >= 17. No hace falta poner `NODE_OPTIONS` a mano.
(Añadido 2026-09-03 en la rama feature/10841.)

**BrowserSync (desde 2026-09-03):** `npm run dev` levanta un proxy en el puerto 3000 hacia el contenedor.
Se trabaja en esa URL; la del contenedor (8086) no recarga. Configurado en `webpack.mix.js` con
`injectChanges: false` (con la inyección de CSS en caliente la pantalla no se refrescaba) y
`watchEvents: ['change','add']` (los chunks salen con hash nuevo). Consola reducida a banner y
"Compiled": sin `--progress`, `stats` solo errores/warnings, BrowserSync `logLevel: silent`, y un
`sassLogger` inyectado con `mix.override` en todos los sass-loader que filtra avisos con origen en
`node_modules`. `quietDeps` no sirvió: el import de ag-grid entra por un `.scss` importado desde un
`.vue` (regla de Mix para Vue), no por `mix.sass()`.

**Quirk de `.copy()` en manifest:** los archivos añadidos con `.copy()`/`.copyDirectory()` en `webpack.mix.js` se registran en `public/mix-manifest.json` solo en el **build completo**; en las recompilaciones incrementales de `npm run watch` el manifest se regenera **sin** esas entradas. Consecuencia: `{{ mix('css/...') }}` en el blade lanza "Unable to locate Mix file" cada vez que watch recompila.
→ Para assets copiados (p. ej. fuentes de íconos), referenciarlos en el blade con `asset('css/...')` **directo, sin `mix()`**. Apunta al archivo físico de `public/` (persiste, está en el mount) y no depende del manifest.

Ejemplo real: Material Symbols self-hosted vía npm `material-symbols`, copiado en [[dashboard-status-endpoints-patron]]; el `<link>` en `resources/views/application.blade.php` usa `asset()` directo por esto.
