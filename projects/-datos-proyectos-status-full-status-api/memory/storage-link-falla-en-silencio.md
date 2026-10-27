---
name: storage-link-falla-en-silencio
description: "El enlace public/storage no se crea si ya hay algo en esa ruta, y toda descarga por URL publica responde 404 sin un solo error en el log."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-10-27T13:40:20.971Z
---

Las descargas por URL publica —adjuntos de normatividad, exportables del buzon— salen de
`storage/app/public` y llegan al navegador por `public/storage`, que es un enlace simbolico.
**Si ese enlace no existe, el archivo esta bien guardado y aun asi la descarga responde 404.**

## Por que se rompe sin avisar

`php artisan storage:link` **no hace nada si la ruta ya esta ocupada**. Devuelve exito, no
escribe en el log y deja el enlace sin crear. Pasa en tres casos reales de despliegue:

| Estado de `public/storage` | Que hace `storage:link` |
|---|---|
| No existe | lo crea, bien |
| Enlace correcto | lo deja, bien |
| **Enlace roto** (apunta a una ruta que ya no esta) | **no lo toca**: sigue roto |
| **Directorio real** (lo creo un volumen mal montado) | **no lo toca**: las descargas siguen en 404 |

El entrypoint viejo empeoraba el ultimo caso: preguntaba `if [ ! -L public/storage ]`, asi que
un directorio real ni siquiera entraba al `if`, y el `|| true` del final se comia cualquier queja.

## Como esta resuelto

`docker/entrypoint.sh` borra lo que haya y rehace el enlace cuando es un enlace o no existe, y
**aborta el arranque** si al final `public/storage` no resuelve a un directorio. Un bind-mount
legitimo en esa ruta pasa la verificacion a proposito: por eso la condicion es `-d` y no comparar
rutas con `readlink -f`, que abortaba con un montaje valido.

`HealthCheckService::checkEnlacePublico` lo reporta ademas en `/api/health`, como
`storage_publico`. Ahi la comprobacion si es estricta —compara `realpath` de los dos lados—
porque ese endpoint informa y no tumba nada: el healthcheck del contenedor apunta a `/up`.

## Como se comprueba

```bash
docker exec <contenedor> ls -la /var/www/html/public/storage
curl -s http://<host>/api/health | python3 -m json.tool | grep storage_publico
```

Si una descarga da 404 y el archivo existe en `storage/app/public`, **mirar el enlace antes que
el controlador**: el codigo casi nunca es el culpable.

Ver [[vigilar-en-cada-prueba-exhaustiva]].
