---
name: build-assets-laravel-mix
description: Cómo compilar assets del front (Laravel Mix + Node moderno) y quirk de .copy() en watch
metadata: 
  node_type: memory
  type: reference
  originSessionId: 762d719d-5ee5-459c-9092-b4a002aa9484
  modified: 2026-07-21T20:40:24.938Z
---

Proyecto Vue2 + Vuesax + Laravel Mix (webpack). Build de assets:

**Node 17+ rompe el build** con `error:0308010C digital envelope routines::unsupported`. Siempre compilar con:
`NODE_OPTIONS=--openssl-legacy-provider npm run dev` (o `npm run prod`, o `... npm run watch`).

**Quirk de `.copy()` en manifest:** los archivos añadidos con `.copy()`/`.copyDirectory()` en `webpack.mix.js` se registran en `public/mix-manifest.json` solo en el **build completo**; en las recompilaciones incrementales de `npm run watch` el manifest se regenera **sin** esas entradas. Consecuencia: `{{ mix('css/...') }}` en el blade lanza "Unable to locate Mix file" cada vez que watch recompila.
→ Para assets copiados (p. ej. fuentes de íconos), referenciarlos en el blade con `asset('css/...')` **directo, sin `mix()`**. Apunta al archivo físico de `public/` (persiste, está en el mount) y no depende del manifest.

Ejemplo real: Material Symbols self-hosted vía npm `material-symbols`, copiado en [[dashboard-status-endpoints-patron]]; el `<link>` en `resources/views/application.blade.php` usa `asset()` directo por esto.
