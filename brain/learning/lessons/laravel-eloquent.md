# laravel-eloquent — Modelos, relaciones y consultas con Eloquent

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente

## 1. Que problema resuelve

El modelo es el **traductor** entre una fila de la tabla y un objeto de PHP. Sin el, cada
servicio escribiria su propio SQL, repetiria las mismas relaciones y cada uno calcularia a su
manera los datos derivados. El modelo concentra tres cosas: que columnas se pueden escribir
(`$fillable`), como se relaciona con otras tablas (`belongsTo`, `hasMany`) y que datos se
**calculan** a partir de las columnas (accessors).

Un **dato derivado** es uno que no se guarda porque se puede deducir de otros: la edad sale de la
fecha de nacimiento, el estado de una vigencia sale de `active` y de sus dos fechas. Guardarlo seria
tener dos verdades que se desincronizan: el 1 de julio la vigencia seguiria diciendo "Vigente" en la
columna aunque ya vencio, hasta que algun proceso la actualizara.

## 2. Como funciona

**Hay dos lugares donde se puede calcular un derivado, y sirven para cosas distintas:**

| Donde | Como | Sirve para | No sirve para |
|---|---|---|---|
| PHP, en el modelo | Accessor `getXAttribute()` + `$appends = ['x']` | **Mostrar**: el valor viaja en cada fila del JSON | **Filtrar**: la base no conoce ese valor, solo PHP despues de traer las filas |
| SQL, en la consulta | Condiciones sobre las columnas (`where`), o `CASE WHEN` | **Filtrar y ordenar**, y paginar bien | Nada: pero hay que escribir la regla una segunda vez |

Si se filtra en PHP (traer todo y descartar), la paginacion se rompe: la pagina 1 trae 10 filas,
PHP bota 7, y el usuario ve 3 con un `total` que miente.

Por eso **filtrar por un derivado es traducirlo a condiciones sobre columnas reales**. "Vigente"
no se busca como texto: se convierte en `active = true AND start_date <= hoy AND end_date >= hoy`.

**La precedencia importa.** Si una regla dice "Anulada gana sobre las otras", la condicion de
Anulada se evalua primero, y cada uno de los otros tres estados debe incluir `active = true`. Si no,
una vigencia anulada con fechas de hoy aparece al buscar "Vigente".

**"Hoy" no es trivial.** El servidor corre en UTC; la empresa vive en su huso (`countries.utc`). A
las 8 p. m. en Colombia ya es el dia siguiente en UTC: el estado cambiaria cinco horas antes de
tiempo. Con columnas `date` no hay que convertir las columnas, pero **si la fecha de hoy**.

**El filtro generico del repo tiene una trampa.** `BaseRepository::applyFilters()` solo aplica los
filtros cuyo nombre **es una columna de la tabla** (`Schema::hasColumn`). Un filtro `status` que no
es columna **se ignora en silencio**: la busqueda devuelve todo y nadie ve un error.

## 3. Como se ve en este repo

| Proyecto | Ejemplo | Nota |
|---|---|---|
| aio | `app/Models/Modules/Settings/IssueTypes/IssueTypes.php:39, 49-63` | Accessor + `$appends`: la etiqueta *Operaciones/Mantenimiento/Personal* sale de tres booleanos, no se guarda |
| aio | `app/Repositories/Eloquent/Common/Base/BaseRepository.php:277-330` | El filtro generico. Linea 293: `Schema::hasColumn` descarta lo que no sea columna |
| aio | `app/Repositories/Eloquent/Common/Base/BaseRepository.php:111-114` | Con `get_columns` los `$appends` se apagan: el derivado desaparece del JSON |
| aio | `app/Repositories/Eloquent/Modules/Operation/Route/RouteRepository.php:25-44` | **El molde para filtrar por algo que no es columna**: lee la llave propia, la quita del arreglo con `unset` y delega el resto a `parent::applyFilters()` |
| aio | `app/Models/Modules/VehicleControl/InspectionVehicleResponse/InspectionVehicleResponse.php:53` | Un `scope`: una condicion con nombre que se reutiliza (`->relevant()`) |

## 4. Errores tipicos

- **Guardar el derivado en una columna.** Se desincroniza con el paso del tiempo.
- **Filtrar en PHP despues de paginar.** Paginas cortas y `total` falso.
- **Olvidar la precedencia en el filtro.** "Vigente" sin `active = true` trae las anuladas.
- **Mandar un filtro que no es columna al filtro generico.** Se ignora sin error.
- **Calcular "hoy" con el reloj del servidor.** El estado cambia horas antes en la pantalla.
- **Poner el filtro en el servicio.** El servicio puede preparar o pasar el filtro, pero traducirlo
  a `where` es acceso a datos: va en `applyFilters()` del repositorio. Salio en el ticket 11308.
- **Escribir la regla dos veces y que diverjan.** El accessor dice una cosa y el filtro otra. Las
  dos deben salir de la misma definicion (constantes para los cuatro nombres, y la misma fecha de
  hoy).

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 11308 | aio | Estado de la vigencia derivado de `active` + dos fechas, mostrado en el listado y usado como filtro de busqueda | — |

## Preguntas de cierre

1. El listado pide mostrar el estado **y** buscar por el. ¿Donde calculas el estado para
   mostrarlo, y donde para buscar? ¿Por que no basta con uno solo?
2. Escribe con palabras las condiciones de las cuatro busquedas: Anulada, Vigente, Programada y
   Vencida. ¿Cual de las tres ultimas se rompe si olvidas `active = true`?
3. Un usuario en Colombia abre el listado el 30/06 a las 9 p. m. y hay una vigencia que termina el
   30/06. ¿Que estado deberia ver? ¿Que vera si "hoy" sale del reloj del servidor?
