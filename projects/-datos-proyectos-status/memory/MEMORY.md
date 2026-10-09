# Memory Index

- [Patrón endpoints Dashboard Status](dashboard-status-endpoints-patron.md) — cómo crear endpoints/componentes nuevos del dashboard (ruta, controlador ApiResponse, servicio, gate de visualización)
- [Build assets Laravel Mix](build-assets-laravel-mix.md) — correr el front, el pipeline compila en modo desarrollo, los servidores no instalan dependencias npm, flag OpenSSL condicional, quirk de .copy() en watch
- [Artisan en Docker y --pretend inseguro](artisan-docker-y-pretend-inseguro.md) — artisan solo en el contenedor; migrate --pretend ejecuta de verdad; route:list roto; ERR_CONNECTION_RESET = entrypoint esperando a Postgres, recrear con compose up -d
- [CSS sin ::v-deep](css-no-v-deep.md) — en los .vue de Status siempre :deep(), nunca ::v-deep ni >>> (avisos de Vue 2.7)
- [Separar front y back de Status](separacion-status-front-back.md) — proximo desarrollo grande: 334 .vue y 107k lineas en Vue 2.7+Vuesax, AIO es la unica referencia Laravel valida
- [Patron de separacion de AIO](patron-separacion-aio.md) — el par Laravel 10 + Vue 3/Vite, su docs/contrato-backend.md y el verificador de contrato de Epsilon
- [Acoples del monorepo de Status](acoples-front-monorepo-status.md) — las 8 variables MIX_, el catch-all, la subruta y el CORS a revisar
- [Archivos al separar origenes](archivos-al-separar-origenes.md) — descargas y cargues hay que rediseñarlos; que hicieron AIO y Epsilon y que no copiar
- [Permisos y menu al separar](permisos-y-menu-al-separar.md) — el IMEC en base de datos es mejor punto de partida; falta middleware de permisos y 403
