---
name: vigilar-en-cada-prueba-exhaustiva
description: "Dos cosas que hay que mirar en cada barrida de pruebas del ticket 7433: quien usaba /carguepdf y como se ejercita GenerateSHP."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-22T11:15:06.646Z
---

**Vigencia limitada.** Vale mientras dure el ticket 7433. Al cerrarlo, resolver o trasladar lo
que siga abierto y borrar este archivo.

Cuando se haga una prueba exhaustiva de la aplicacion —una barrida por pantallas, no una prueba
puntual—, revisar estos dos puntos ademas de lo que se este probando.

## 1. Quien usaba `/carguepdf`

La ruta `POST /carguepdf` se **retiro el 2026-09-22**. Recibia la ruta de un directorio en el
cuerpo de la peticion y hacia que el servidor la recorriera, asi que cualquier usuario con sesion
podia apuntar a la carpeta que quisiera. No la consumia ninguna pantalla de `status-frontend` ni
de `sipa`.

El controlador **se conserva** en `app/Http/Controllers/Configuracion/CarguePdf/`, con una nota
que explica por que quedo sin ruta.

**Que buscar:** una pantalla que cargue PDF masivamente desde una carpeta y que ahora falle, o
alguien del equipo que pregunte por ese proceso. Si aparece el dueno, **no se restaura la ruta
como estaba**: la carpeta se fija en configuracion, no se recibe del cliente.

## 2. GenerateSHP: probarlo de verdad

`GET /generate-shp-zip` —`GenerateSHPController::generateShapefile`, que cuelga del archivo de
rutas de Modulos— **no se migro a proposito**. Tiene inyeccion SQL:

```php
DB::table($tabla)->select($request->foranea . ' as id')->where('id', $id)
```

El nombre de la tabla y el de la columna llegan del cliente. Cerrarlo bien pide una lista blanca
de tablas y columnas, y eso sale de como se usa la pantalla, no del codigo.

Lo consume `views/GestorInformacion/Estandar/CargarShapeFile.vue`.

**Que hacer en la prueba:** ejercitar esa pantalla y **anotar con que valores de `tabla`,
`tablapadre` y `foranea` se llama en cada caso**. Esa lista es justamente la lista blanca que
falta para poder cerrarlo sin romper nada.

Ver [[sipa-roto-por-la-migracion]] y [[convenciones-temporales-ticket-7433]].
