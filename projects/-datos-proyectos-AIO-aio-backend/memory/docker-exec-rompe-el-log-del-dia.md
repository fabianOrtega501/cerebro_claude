---
name: docker-exec-rompe-el-log-del-dia
description: Correr artisan con docker exec en aio-backend crea el log del dia como root y deja el backend devolviendo 500 en toda peticion
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e05af616-d1d3-4c85-ae50-8336b3f2770b
  modified: 2026-09-22T23:15:29.039Z
---

No invocar artisan con `docker exec` en aio-backend, ni siquiera para pasarle una variable de
entorno. Va siempre por `./vendor/bin/sail`.

**Why:** dentro del contenedor, `docker exec` corre como **root** y php-fpm corre como **sail**.
El primer comando del dia que escriba en el log crea `storage/logs/laravel-AAAA-MM-DD.log` con
dueño root y permisos `644`; a partir de ahi `sail` no puede añadir una linea. Como Laravel
registra en casi toda peticion, **el backend empieza a devolver 500 en todo**, incluido un 422
de validacion que deberia salir limpio. Lo caro es el diagnostico: el que falla es el propio
sistema de registro, asi que no queda rastro **ni en `laravel.log` ni en `error_logs`**, y el
front solo muestra `Unknown error`. Paso el 2026-09-22: se perdio mas de media hora buscando la
causa en el codigo del ticket, en el merge y en las migraciones, y no estaba en ninguno.

**How to apply:** usar `sail` para todo artisan. Si hace falta forzar una variable —el caso real
fue `DB_DATABASE`, porque `phpunit.xml` fija `testing` y esa base no existe en local—, ponerla
delante de sail (`DB_DATABASE=aio_testing ./vendor/bin/sail artisan test ...`), no recurrir a
`docker exec -e`. Si ya ocurrio, el sintoma es 500 sin cuerpo y sin log; se arregla con
`docker exec <contenedor> chown -R sail:sail /var/www/html/storage/logs`. Ver
[[run-artisan-via-sail]], la memoria del equipo que dice que se use sail: esta le agrega por que
`docker exec` no es un atajo inocuo.
