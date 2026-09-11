---
name: acoples-front-monorepo-status
description: Inventario de lo que ata el front de Status a Laravel — las 8 variables MIX_, el blade y la subruta; medido para la separacion
metadata:
  type: project
---

Puntos exactos donde el front de Status depende hoy del backend en el mismo repo, medidos el
2026-09-10 para planear la separacion.

**Why:** la buena noticia es que el acople es mas pequeno de lo que parece.
`resources/views/application.blade.php` **no inyecta ningun dato al front**: solo carga los CSS y
`js/app.js`, asi que no hay que desmontar variables de Blade ni `@json`. Y `resources/js/src/axios.js`
ya crea la instancia con `baseURL: process.env.MIX_PATH_API`, o sea que apuntar a otro host es
configuracion, no codigo. Lo que si hay que reencuadrar son ocho variables y una suposicion de ruta.

**How to apply:** al armar el front nuevo, resolver una por una estas ocho variables `MIX_` que hoy
lee `resources/js/`: `MIX_PATH_API` (base del API), `MIX_ROUTER_BASE`, `MIX_PATH_DOWNLOAD` (arma URLs
a archivos que sirve Laravel, ver [[archivos-al-separar-origenes]]), `MIX_IFRAME_HOME` (el Power BI
embebido del home), `MIX_APP_MODULOS_MENU`, `MIX_DEV`, `MIX_NAME_APP` y `MIX_DESCRIPCION_APP`.
Ademas:

- **La app se sirve desde una subruta** (`/STATUS-DESA/public/`), y de ahi salen `MIX_ROUTER_BASE`, el
  `publicPath` de webpack y `mix.setResourceRoot("../")`. Un front propio vive en su host y eso
  desaparece; hay que revisar que no quede ninguna ruta relativa asumiendo el prefijo.
- **El catch-all** `Route::get('/{any}', 'ApplicationController')` de `routes/web.php` es lo que hoy
  hace de fallback de la SPA. En el front separado ese papel pasa al servidor web
  (`try_files ... /index.html`) y la ruta del backend se puede quitar.
- **CORS ya esta en `allowed_origins => ['*']` con `supports_credentials => true`**, combinacion que
  hoy no molesta porque es el mismo origen y la sesion va por token Bearer. Al mover el front a otro
  origen hay que ponerlo en `false` como en AIO, porque el navegador rechaza `*` cuando la peticion
  manda credenciales.
- Los assets copiados con `.copy()` en `webpack.mix.js` (vuesax, iconfont, material-icons, material
  symbols, fuentes, imagenes) hoy los sirve `public/` de Laravel y pasan al front.
