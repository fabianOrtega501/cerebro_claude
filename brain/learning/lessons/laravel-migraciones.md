# laravel-migraciones — Migraciones y cambios de esquema en Laravel

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente

## 1. Que problema resuelve

El esquema de la base es codigo, y como tal tiene que viajar por las mismas ramas que el codigo
que lo usa: desa, qa, prod. Sin migraciones, el ALTER se corre a mano en cada ambiente, se
olvida en uno, y el error aparece en produccion como "column does not exist" a las 7 de la
manana. La migracion tambien deja **historial** (tabla `migrations`): se sabe que se aplico,
cuando, y como se deshace (`down()`).

Hay un segundo problema que resuelve, menos obvio: obliga a **separar estructura de datos**. Un
cambio de columnas es reversible casi siempre; una copia o un vaciado de datos no. Tenerlos en
archivos distintos permite revertir lo primero sin perder lo segundo.

## 2. Como funciona

- Cada archivo es una clase con `up()` y `down()`. Se ejecutan en orden de timestamp del nombre.
  El `down()` debe ser el inverso exacto del `up()`: si `up` crea, `down` dropea *esa* tabla.
- **`Schema::connection('X')`** elige la base/esquema. Sin el, la tabla nace en la conexion por
  defecto. En proyectos multi-esquema es la primera linea que se revisa.
- **Blueprint vs SQL directo.** El Blueprint cubre crear tabla, agregar columnas, FKs, indices.
  Para cambiar el tipo o la nulabilidad de una columna existente se usa `->change()`, que
  necesita `doctrine/dbal`. Cuando el motor exige algo que Blueprint no emite (el `USING` de
  PostgreSQL al cambiar tipo), se usa `DB::connection()->statement('ALTER ...')`.
- **Llaves foraneas**: `onDelete('cascade')` borra en silencio lo que cuelga. Sin cascade, el
  borrado de un padre con hijos falla con error de FK, y la aplicacion decide que decirle al
  usuario. La eleccion es de diseno, no de comodidad.
- **Migraciones de datos** (`DB::table()->insert/update` dentro de `up()`): van en un archivo
  propio, separadas del cambio de estructura, y **nunca destruyen la unica copia del dato** en
  el mismo paso que lo copian. Primero copiar, verificar con conteos, y solo despues vaciar.
- Orden seguro para "mover" una columna a otra tabla: (1) crear destino, (2) volver nulable el
  origen, (3) copiar, (4) el codigo deja de escribir el origen, (5) mas tarde, vaciar/eliminar.

## 3. Como se ve en este repo

| Proyecto | Ejemplo | Nota |
|---|---|---|
| status | `database/migrations/2026_08_03_090100_create_dt_formularios_tramites_table.php:16-31` | Tabla hija con `Schema::connection('SmGestorTrans')`, FK cualificada `gestor_transaccional.tramites`, auditoria NOT NULL, indices por FK. Lleva `onDelete('cascade')` en :21 — justo lo que la HU 55356 pide **no** repetir |
| status | `database/migrations/2021_05_07_082753_create_tramites_table.php:16-33` | El encabezado. Auditoria **nulable** (distinto de la hija). `down()` en :44 dropea `tramites_sui`: un `down` que no es el inverso del `up` |
| status | `database/migrations/2026_08_13_090000_cambiar_tipo_campo_tramite_a_tramites_tabla.php:24-31` | SQL directo con `USING` porque Blueprint no lo emite; `COMMENT ON COLUMN`; `down()` con regex para lo no convertible |
| status | `database/migrations/2026_08_03_090000_add_campos_gestion_tramites_to_tramites_table.php:16-22` | Agregar columnas nulables a tabla existente, `jsonb` |
| status | `composer.json:14` | `doctrine/dbal: 2.*` ya esta: `->change()` disponible |

Entorno: artisan solo corre en el contenedor (`docker exec status php artisan ...`), y
`migrate --pretend` **ejecuta de verdad** porque las migraciones usan `Schema::connection()`
explicita. Para probar: `migrate` real y `migrate:rollback`. (Memoria
`artisan-docker-y-pretend-inseguro`.)

## 4. Errores tipicos

- Olvidar `Schema::connection()`: la tabla nace en la base por defecto y el modelo no la ve.
- `down()` que no revierte el `up()` (dropea otra tabla, o no quita la columna): el rollback deja
  el esquema a medias y el siguiente `migrate` falla con "already exists".
- Copiar datos y vaciar el origen en la misma migracion: si la copia quedo incompleta, ya no
  hay de donde recuperarla.
- `onDelete('cascade')` puesto por defecto: al borrar un padre desaparecen hijos que el usuario
  no sabia que existian.
- Cambiar codigo y esquema en despliegues distintos cuando uno depende del otro: un `INNER JOIN`
  sobre una columna que quedo en `NULL` no falla, **devuelve vacio**.
- Extraer un dato de una cadena sin comprobar el formato (anio = 4 primeros caracteres de
  `periodo`): si algun registro viejo no cumple el formato, la copia mete basura sin avisar.
- Nueva FK sin indice: el join del listado escanea la tabla completa.

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 10841 | status | Tabla hija `dt_tramites_formularios`, 3 columnas a nulable, FK nueva sin cascade, copia de 146 tramites con verificacion separada del vaciado | (pendiente) |

## Preguntas de cierre

1. Para mover el formulario del encabezado a la tabla hija: ¿una migracion o varias, en que
   orden, y por que la copia y el vaciado no pueden ir juntas?
2. La auditoria de la tabla nueva: ¿NOT NULL como `dt_formularios_tramites` o nulable como
   `tramites`? ¿Que hecho decide eso, si la fila la va a crear tambien la migracion de copia?
3. Si el despliegue falla a mitad (tabla creada, copia no), ¿que hace el `down()` de cada archivo
   y que dato no debe tocar jamas?
