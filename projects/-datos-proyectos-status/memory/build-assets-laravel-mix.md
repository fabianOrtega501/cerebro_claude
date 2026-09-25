---
name: build-assets-laravel-mix
description: Cómo correr y compilar el front, por qué el pipeline compila en modo desarrollo y por qué no se pueden agregar dependencias de build
metadata:
  type: reference
---

Proyecto Vue2 + Vuesax + Laravel Mix 5 (webpack 4). Build de assets:

**Correr el front:** `npm run watch` compila y vigila; `npm run dev` compila una vez y termina. No
levantan servidor: compilan a `public/` y quien sirve es el contenedor Docker `status` (Apache) en
`http://localhost:${APP_PORT}` (8086 en local, del `.env`). Sin recarga automática: hay que
refrescar el navegador. **No usar `npm run hot`**: choca con el puerto 8080 de aio-backend, con
`publicPath=MIX_ROUTER_BASE` y con los assets cargados via `asset()`.

**`npm run dev` es el comando del despliegue y tiene que seguir siendo una compilación única.** Los
tres ambientes lo ejecutan en su `.gitlab-ci.yml`. Cuando se cambió para que vigilara (`--watch`), el
job se quedaba colgado hasta el timeout. Pasó el 2026-09-24 en producción.

**OpenSSL / versiones de Node:** Node 17+ rompe webpack 4 con `error:0308010C digital envelope
routines::unsupported`; el servidor de despliegue tiene **Node 14**, que rechaza el flag
`--openssl-legacy-provider`. Por eso `development` y `production` pasan por `scripts/webpack.js`,
que agrega el flag solo si Node >= 17. No hace falta poner `NODE_OPTIONS` a mano.
(Añadido 2026-09-03 en la rama feature/10841.)

**El pipeline compila en modo DESARROLLO, no en producción.** El paso de despliegue corre
`npm run dev`, o sea `NODE_ENV=development`, así que **todo lo que esté bajo
`if (!mix.inProduction())` en `webpack.mix.js` se ejecuta en los servidores**. Esa condición no
sirve para separar "local" de "servidor": para eso hay que colgarse del comando, no del entorno.

**Los servidores no instalan dependencias npm.** El paso está comentado en los tres ambientes del
`.gitlab-ci.yml` y `package-lock.json` está en el `.gitignore` (nunca estuvo versionado). El
`node_modules` de los servidores **no corresponde con el `package.json`**: en producción falta
`postcss-rtl`, que está declarado en `dependencies` desde 2021 y lo requiere `webpack.mix.js`.

Consecuencia dura: **no se puede agregar ninguna dependencia de build sin coordinar una instalación
en los servidores**, y conviene no requerir nada que no sea imprescindible. `webpack.mix.js` llegó a
hacer `require('dotenv')` sin necesidad —Laravel Mix ya carga el `.env` en su `src/index.js`, con su
copia anidada, antes de evaluar nuestro archivo— y eso solo tumbaba el despliegue.

**BrowserSync se intentó y se revirtió** (2026-09-03 a 2026-09-24) justo por lo anterior: al
registrarse bajo `!mix.inProduction()` terminaba exigiendo `browser-sync-webpack-plugin` en los
servidores. Antes de reintentarlo hay que resolver la instalación de dependencias.

**Quirk de `.copy()` en manifest:** los archivos añadidos con `.copy()`/`.copyDirectory()` en `webpack.mix.js` se registran en `public/mix-manifest.json` solo en el **build completo**; en las recompilaciones incrementales de `npm run watch` el manifest se regenera **sin** esas entradas. Consecuencia: `{{ mix('css/...') }}` en el blade lanza "Unable to locate Mix file" cada vez que watch recompila.
→ Para assets copiados (p. ej. fuentes de íconos), referenciarlos en el blade con `asset('css/...')` **directo, sin `mix()`**. Apunta al archivo físico de `public/` (persiste, está en el mount) y no depende del manifest.

Ejemplo real: Material Symbols self-hosted vía npm `material-symbols`, copiado en [[dashboard-status-endpoints-patron]]; el `<link>` en `resources/views/application.blade.php` usa `asset()` directo por esto.
