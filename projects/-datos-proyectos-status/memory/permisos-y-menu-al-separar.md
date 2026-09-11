---
name: permisos-y-menu-al-separar
description: El menu e IMEC de Status son mejor punto de partida que lo que hicieron AIO y Epsilon; que no heredar al separar
metadata:
  type: project
---

Al separar los repos hay que decidir como viajan el menu y los permisos al front. Status parte de una
posicion mejor que los dos proyectos ya separados y conviene no perderla.

**Why:** Status ya tiene el menu completo en base de datos (`modulos` → `menu` → `permisos`) con IMEC
por rol, y el front lo pide al entrar y lo guarda en `localStorage`. Eso es dato, no codigo. En
cambio **Epsilon dejo el menu hardcodeado en el front** (`src/service/MenuService.js`) y el backend
solo devuelve los ids permitidos: cada pantalla nueva exige tres cambios sincronizados —ruta, entrada
del menu y seeder— y su guard solo comprueba que exista el token, no autoriza. **AIO usa CASL** y su
backend devuelve las reglas ya en ese formato, pero el string del permiso **es la URL de la pagina
del front**: mover un archivo en `src/pages/` cambia la URL, la URL es el permiso, y la autorizacion
se rompe sin tocar el backend. Ademas su middleware responde **400 en vez de 403** cuando falta el
permiso.

**How to apply:** conservar el modelo de Status —el menu y el IMEC salen de la base de datos y el
identificador del permiso es la fila de `menu`, no la ruta del front— y exponerlo como endpoint que
el front consuma al iniciar sesion. Si se adopta CASL para pintar la interfaz, mapear IMEC a acciones
(`insertar/modificar/eliminar/consultar` → `create/update/delete/read`) en el backend y mandar las
reglas ya armadas, como hace AIO, pero con el `idmenu` de sujeto en vez de la URL. Dos cosas que hoy
Status no tiene y hacen falta al separar: **middleware de permisos en el backend** —hoy la unica
proteccion de ruta es `auth:sanctum` y la autorizacion la hace la pantalla, lo que deja de ser
suficiente cuando el front es un cliente cualquiera— y respuesta **403** para permiso denegado. Y de
AIO vale copiar una idea: los permisos se recargan **al elegir empresa**, no solo al iniciar sesion,
que es justo lo que necesita un sistema multiempresa como Status.
