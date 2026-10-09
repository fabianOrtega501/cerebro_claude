# sql-consultas — Consultas SQL que no dependen del servidor ni de la entrada

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente

## 1. Que problema resuelve

Una consulta SQL no corre en el vacio: corre dentro de un servidor con su configuracion (idioma,
formato de fecha, zona horaria) y con valores que llegan de afuera. Si la consulta depende de esa
configuracion sin decirlo, funciona en un servidor y falla en otro **sin error**: simplemente
devuelve 0 filas. Y si mete los valores de afuera pegados al texto del SQL, cualquiera que controle
ese valor controla la consulta.

Analogia: una receta que dice "una taza de azucar" funciona en tu cocina porque conoces tu taza.
En otra cocina la taza es distinta y el postre sale mal sin que nadie sepa por que. La receta
buena dice "200 gramos": no depende de la cocina.

## 2. Como funciona

- **`TO_CHAR(fecha, 'TMMonth')`** escribe el nombre del mes en el idioma de `lc_time` del
  servidor. `TM` significa "traducido". Sin `TM`, `Month` siempre es ingles.
- **`TO_DATE(texto, 'Month')`** (sin `TM`) lee nombres de mes **en ingles**, en cualquier servidor.
  Por eso existe `fn_convertmesaingles`: pasa `FEBRERO` a `FEBRUARY` para poder leerlo con
  `TO_DATE` sin depender del idioma.
- **Comparar numeros en vez de nombres.** `EXTRACT(MONTH FROM ...)` devuelve 1 a 12 en cualquier
  servidor. Comparar `2 = 2` no depende de nada; comparar `'FEBRERO' = 'FEBRUARY'` si.
- **Que lado se transforma.** Se puede convertir la columna del archivo (el texto del csv) o el
  valor calculado (el periodo). Lo robusto es llevar los dos lados a la misma forma neutra: numero
  de mes y anio.
- **El anio va junto al mes.** "El mes anterior" a enero es diciembre **del anio anterior**. Si el
  mes se calcula con `- interval '1 month'` y el anio aparte, los dos tienen que salir de la misma
  fecha restada, o en enero no coinciden.
- **Bindings (`?`) en vez de pegar texto.** `whereRaw("campo3 = ?", [$anio])` manda el valor por
  separado y el servidor nunca lo interpreta como SQL. `"... '".$request->periodo."' ..."` pega el
  valor dentro del texto: si el periodo trae una comilla, rompe la consulta o la cambia (inyeccion
  SQL).

## 3. Como se ve en este repo

| Proyecto | Ejemplo | Nota |
|---|---|---|
| status-api | `app/Http/Controllers/Sipa/CargarArchivos/CargarArchivosController.php:608-623` | `validarToneladasPeriodoActual`: compara `campo4` contra `TMMonth` (depende del idioma), calcula el anio en PHP con el caso especial `0101` y el mes en SQL con `- interval '1 month'`, y pega `$request->periodo` en el texto |
| status-api | `CargarArchivosController.php:675-683` | `validarExistenciaFechaActual`: la misma comparacion por nombre, para el mes del periodo |
| status-api | `database/DBobjects/function/2023122002_fn_validacion_prestador_semestre.sql:21` | La forma robusta que ya existe: `EXTRACT(MONTH FROM TO_DATE(aprovechamiento.fn_convertmesaingles(campo4), 'Month'))` |
| status-api | `database/DBobjects/function/fnConvertirMesIngle.sql` | La funcion. **Ojo**: un mes que no reconoce sale `DECEMBER` (su `ELSE`), sin error |
| status-api | `CargarArchivosController.php:625-630` | `validarPeriodoCargueRecaudo`: ejemplo de binding bien usado, `whereRaw("... > ?", [$periodo])` |

## 4. Errores tipicos

- Comparar nombres de mes generados con `TMMonth`: funciona en el servidor en espanol y devuelve
  0 filas en uno en ingles. **Ticket 11180**: en el Postgres local (`en_US`) ninguna carga de
  toneladas pasaba.
- Fechas en texto `DD-MM-YYYY` leidas con el `DateStyle` del servidor: en `MDY`, `24-10-2019`
  revienta. Mismo tipo de error que el idioma.
- Calcular mes y anio por caminos distintos: en enero el mes es diciembre pero el anio sigue
  siendo el actual.
- Pegar valores del request dentro del SQL en vez de usar `?`.
- Confiar en un `ELSE` que "atrapa todo": `fn_convertmesaingles` convierte un mes mal escrito en
  diciembre y la consulta da un resultado falso en vez de fallar. Lo grave es cuando el mes
  buscado **es** diciembre (liquidacion de enero): un `NOVIEMRBE` cuenta como diciembre y un
  archivo sin diciembre pasa. La validacion de datos no lo frena: `campo4` es texto libre.
- Escribir la misma idea dos veces con herramientas distintas (anio en PHP con caso especial,
  mes en SQL con `interval`). Hoy coinciden; el riesgo es que una se corrija y la otra no. Una
  sola resta de fechas, y de ella `EXTRACT(YEAR ...)` y `EXTRACT(MONTH ...)`.
- Transformar el lado equivocado: el periodo ya es fecha y basta con `EXTRACT`; el que necesita
  traduccion es el texto del archivo. **Ticket 11180**: se respondio "se transforma el mes
  calculado".

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 11180 | status (status-api) | Las validaciones del mes de la carga de toneladas dependen del idioma del servidor; se reescriben comparando numero de mes y anio | (pendiente) |

## Preguntas de cierre

1. Para que la validacion no dependa del idioma, ¿que lado transformas: `campo4` (el texto del
   archivo) o el mes calculado desde el periodo? ¿A que forma los llevas?
2. Hoy el anio sale de PHP (con el caso `0101`) y el mes de SQL (`- interval '1 month'`). ¿Por
   que conviene que los dos salgan de la misma resta, si hoy dan el mismo resultado? (Decir
   explicito que "los dos" son anio y mes, y que hoy no falla: en el 11180 se planteo como si
   fallara y confundio.)
3. `fn_convertmesaingles('FEBRRO')` devuelve diciembre. En esta validacion, ¿eso puede hacer que
   un archivo mal escrito pase o que uno bueno se rechace?
