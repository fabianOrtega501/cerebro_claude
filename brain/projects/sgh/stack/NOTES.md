# SGH en local (esta máquina)

Montado el 2026-11-09. Laravel 5.2 no corre en el PHP 8.5 del sistema: se usa un contenedor PHP 7.1 que
solo sirve de intérprete y monta el repo.

- **Imagen**: `sgh-php71`, construida con `docker build -t sgh-php71 ~/.claude/brain/projects/sgh/stack/docker`.
  Debian buster está archivado: el `Dockerfile` apunta apt a `archive.debian.org`.
- **Contenedor**: `sgh-app` en **http://localhost:8091** (el 8090 lo ocupa Status). Después de reiniciar:
  `docker start sgh-app`. Para crearlo de nuevo:
  `docker run -d --name sgh-app --user "$(id -u):$(id -g)" --add-host=host.docker.internal:host-gateway -v /datos/proyectos/sgh:/var/www -p 8091:8000 sgh-php71`
- **Comandos**: `docker exec sgh-app php artisan <comando>`. Tinker necesita `-e HOME=/tmp` y `-i`.
- **Base**: `sgh` en `postgres_postgis_17` (`host.docker.internal:5433` desde el contenedor), esquema `sgh`.
- **`.env`**: `MAIL_DRIVER=log` (Laravel 5.2 no lee `MAIL_MAILER`): los correos, incluido el de restablecer
  clave, quedan en `storage/logs/laravel.log`. El login exige captcha y usuario, no correo.
- **Datos**: copia parcial de prod del 2026-11-09. Estructura completa del esquema y datos solo de
  presupuesto, catálogos de la planta, parámetros, roles, permisos, menús y el usuario `fabian.rojas`
  (con el rol `admin` agregado solo en local). Sin datos de empleados.
- **Prod de SGH**: servidor de `DB_PRODSGH_HOST`, base `postgres`, esquema `sgh` (PostgreSQL 10.9). El usuario
  de soporte no puede leer las secuencias: `pg_dump --data-only` falla y se copia con `\copy (select …)` por
  tabla. `corporativo.sgh` (otro servidor de prod) es una integración que la aplicación no usa.
- **`composer dump-autoload`** falla por permisos porque `vendor/` es de root. Se corre así:
  `docker exec -u root -e HOME=/tmp sgh-app composer dump-autoload`.
- **Probar en pantalla desde Chrome por CDP**: el login pide un captcha de imagen. Se toma una captura del
  formulario, se lee el captcha en la imagen y se envía el formulario con usuario, clave y captcha
  (`credentialsFor("sgh")`). Antes de capturar, ocultar `.phpdebugbar`, que tapa el pie de la página.
- **Colas**: `QUEUE_DRIVER=database`; solo correos de tickets y reingresos.
  `docker exec -d sgh-app php artisan queue:work --daemon --tries=3`.
