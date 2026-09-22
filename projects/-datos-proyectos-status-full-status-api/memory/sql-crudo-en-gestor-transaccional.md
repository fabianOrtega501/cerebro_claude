---
name: sql-crudo-en-gestor-transaccional
description: "Mapa de los 40 puntos de SQL crudo de GestorTransaccional, cuales se cerraron y cuales quedan como deuda sin riesgo externo."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-22T12:17:59.592Z
---

Rastreo hecho el 2026-09-22 sobre los 85 controladores de
`app/Http/Controllers/Status/GestorTransaccional/`. **40 puntos** construyen SQL
concatenando variables. De ellos, **11 los controlaba el cliente** y ya estan cerrados; los
otros **29 no son explotables desde fuera** y quedan como deuda.

## Como se hizo el barrido

El primer intento busco solo `$request` pegado al `whereRaw` y encontro 7 de 40: se le
escaparon todos los que pasan por una variable intermedia. El barrido bueno cubre **todos**
los metodos que aceptan SQL crudo:

```bash
grep -rnE '(whereRaw|orWhereRaw|havingRaw|orderByRaw|selectRaw|groupByRaw|joinRaw|DB::raw|DB::select|DB::statement|DB::table)\([^)]*["'"'"']\s*\.\s*\$' \
  app/Http/Controllers/Status/GestorTransaccional/
```

Y despues hay que **rastrear de donde sale cada variable**: el conteo por si solo engana.

## Cerrado (11 puntos)

| Archivo | Que recibia | Solucion |
|---|---|---|
| `Bloqueo` | nombre de tabla, iba a un `UPDATE` | regla `TablaBloqueable` |
| `Formulario44111` ×2 | `$request->tabla` en texto | bindings |
| `ActualizacionEstacion` ×2 | `$request->campos["campo2"]` | bindings |
| `TarifaTercero` | `$request->idTransaccion` | binding |
| `ArchivoTransaccion:150` | `$request->formulario` | binding |
| `FormularioTablaCalculada:512` | `$request->datosResumen[...]` | binding |
| `FormularioEstandar` ×4, `FormularioEstandarPdf` ×4, `ShapeFile:377` | nombre de tabla | regla `TablaDeTransaccion` |

Las dos reglas viven en `app/Rules/` y validan **contra el catalogo de la base**, no contra
una lista escrita a mano: asi no envejecen. `TablaBloqueable` acepta las tablas de
`gestor_transaccional` que tienen `idbloqueo` y `estado` (hoy 4). `TablaDeTransaccion`
acepta cualquier tabla de ese esquema.

**Por que no rompen nada:** el conjunto permitido es justo aquel con el que el codigo ya
funcionaba —cualquier otro valor produce hoy un error de SQL—. Comprobado: de los **132
nombres de tabla configurados** en `dt_aplicabilidades`, `mt_opcion_cargues` y
`mt_disformatos`, la regla **no rechaza ninguno**.

## Deuda sin riesgo externo (29 puntos)

| Archivo | Puntos | Por que no es explotable |
|---|---:|---|
| `CargueArchivo` | 13 | `$tabla` y `$version` salen de `$aplicabilidad[0]`, que viene de la base; `$this->nombreTabla` es `'tmp_' . $usuario . '_' . rand()` con `$usuario` tipado `int` |
| `VariableTecnicaApsCsv` | 3 | misma tabla temporal interna |
| `ShapeFile` | 3 | `$tablaShapefile = $aplicabilidad['dato']`, de la base |
| `Bloqueo`, `Reversion` | 2 | `$query` se arma dentro con un id de la base |
| `Escalamiento`, `EscalamientoReversion` | 2 | reciben `int $usuario` **tipado**: PHP castea |
| resto | 6 | variables derivadas de las anteriores |

**No tocarlos por tocarlos.** Cambiarlos es mucho ruido sobre el flujo de cargue, que es
delicado, para cerrar un riesgo que desde fuera no existe. Se hacen cuando esos
controladores se migren de todos modos.

## Lo que ensena este rastreo

- **Un tipado `int` en la firma ya cierra la inyeccion**: PHP castea y un texto lanza TypeError.
  Antes de tocar, mirar la firma del metodo.
- **Laravel no ejecuta una regla no implicita sobre un valor vacio.** Una regla propia sin
  `required` al lado deja pasar `''`. Las pruebas tienen que ejercitar **el mismo conjunto de
  reglas que corre en el controlador**, no la regla aislada.
- **Comparar antes de cambiar**: ejecutar la consulta vieja y la nueva con datos reales y
  cotejar el resultado. Ahi se ve si el cambio preserva el comportamiento, incluidos detalles
  como si el cotejo distingue mayusculas.

Ver [[vigilar-en-cada-prueba-exhaustiva]] para el caso de `GenerateSHP`, que sigue abierto.
