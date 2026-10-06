---
name: gen-test-set
description: >-
  Genera el SET DE PRUEBAS (texto) de un desarrollo ya hecho, para ejecutarlo a mano en el ambiente
  de desarrollo, en cualquier proyecto. Sale del diff real de la rama y produce tres tipos de caso en
  un solo listado: que lo implementado funciona, que el sistema rechaza lo que debe rechazar, y que
  nada más se dañó. Formato fijo de cuatro campos (Funcionalidad a Probar, Objetivo, Resultado
  Esperado, Estado), listo para pegar en el aplicativo donde se documentan las pruebas. Solo produce
  TEXTO: no ejecuta las pruebas, no abre el navegador, no genera capturas ni documentos, y en base de
  datos solo lee. USO MANUAL: se ejecuta SOLO cuando el usuario lo pide (/gen-test-set o "genera el
  set de pruebas"), nunca por iniciativa propia. Palabras gatillo: set de pruebas, casos de prueba,
  pruebas del desarrollo, plan de pruebas, gen-test-set.
---

# Generador del set de pruebas de un desarrollo

Produces la lista de casos con que el usuario va a probar un desarrollo **a mano, en el ambiente de
desarrollo**, y que después documenta en un aplicativo aparte.

El set persigue dos cosas a la vez, y la segunda es la que se olvida:

1. Que **lo que se implementó funciona**.
2. Que **nada más se dañó**. Un desarrollo no se aprueba porque su pantalla nueva funcione; se
   aprueba cuando además sigue funcionando lo que compartía código con ella.

## Lo que esta skill NO hace

Está escrito antes que el resto porque es lo que más se malinterpreta:

- **No ejecuta las pruebas.** Las ejecuta el usuario, en su navegador.
- **No abre Chrome ni genera capturas.** La evidencia la toma él. Tú dices qué debe verse en ella.
- **No genera ningún documento ni archivo entregable.** La salida es texto en la conversación, para
  copiar y pegar.
- **No escribe en la base de datos.** Nunca `INSERT`, `UPDATE`, `DELETE`, migración ni seeder.
- **No hace commit, push ni se integra con ningún sistema.**

## Cuándo se usa

Manual, y **casi siempre en diferido**: las pruebas se hacen cuando el desarrollo ya está desplegado
en el ambiente de desarrollo, lo que puede ser **uno o dos días después** de haberlo cerrado. Por eso
`finish-development` lo ofrece pero espera un "después" como respuesta normal.

Eso obliga a algo: para entonces la rama ya se mezcló y `HEAD` no sirve como referencia. El rango se
reconstruye con `--commit` o `--since` (ver abajo), o con la sha que quedó apuntada en
`~/.claude/brain/testing/pending.md`.

## Fase 1 — Recolectar los hechos

El insumo no es la memoria de la conversación: es el diff. Se usa **el recolector que ya existe**, sin
modificarlo:

```bash
# Rama de trabajo actual, contra su base
node ~/.claude/skills/gen-changes-controls/lib/collect-changes.mjs --json

# Base explícita, cuando la autodetección no acierta
node ~/.claude/skills/gen-changes-controls/lib/collect-changes.mjs --base origin/desa --json

# En diferido: la rama ya se mezcló
node ~/.claude/skills/gen-changes-controls/lib/collect-changes.mjs --commit <sha> --json
node ~/.claude/skills/gen-changes-controls/lib/collect-changes.mjs --since "2 days ago" --json

# El ticket tocó los dos lados: front y back en una sola corrida
node ~/.claude/skills/gen-changes-controls/lib/collect-changes.mjs --repo /ruta/front --repo /ruta/back --json
```

De la salida importan cuatro cosas: `range` (qué se está mirando), `layers` (qué capas se tocaron),
`modules` y `signals`. Los archivos salen de `layers.<capa>.samples` y de `signals[].evidence`.

**`samples` viene truncado a propósito**, así que no sirve como lista de archivos. Para la Fase 3
hace falta la lista completa, y esa se pide a git directamente:

```bash
git -C <repo> diff --name-only <base-o-sha> HEAD
git -C <repo> show --name-only --format= <sha>     # en diferido, un solo commit
```

El reporte trae además `tickets`, con los números que aparecen en los mensajes de commit. Si hay uno,
usarlo para no preguntar lo que ya se sabe.

**Antes de escribir un solo caso, validar el rango.** Dos comprobaciones:

- Si `base.confidence` es `"baja"`, **preguntar contra qué rama se compara**. Pasa de verdad: en
  aio-app autodetecta `origin/prod` y mete más de cien commits de otras personas. Un rango mal
  elegido genera casos de prueba del trabajo ajeno, que es peor que no generar nada.
- Si el diff sale vacío, decirlo y preguntar qué rango se quería. No inventar casos.

**Si el ticket tocó front y back, el set es uno solo.** No dos listados. El usuario prueba una
funcionalidad, no dos capas.

## Fase 2 — Pedir el enunciado del ticket

El diff dice qué cambió; el ticket dice **qué se esperaba**, y los casos funcionales salen de ahí.
Los criterios salen de la HU vigente, no de lo que haya quedado en la conversación: con el número
de la rama, correr el paso de vigencia de `ticket-context` (`tickets.py check <clave>`) y leer su
`hu.md`; si no hay caché o la HU cambió, bajarla con esa skill. Solo si no hay ticket ni HU,
**pedir el enunciado** al usuario. Sin criterios de aceptación los
casos funcionales se adivinan, y un caso adivinado se prueba igual de bien que uno real: nadie nota
que faltaba lo importante.

Si el ticket no existe o no tiene criterios, decirlo y armar los casos solo con el diff, avisando de
que la cobertura funcional queda a juicio del usuario.

## Fase 3 — Averiguar a quién le puede doler

Esta es la fase que produce los casos de regresión, y no se puede saltar. Para cada pieza compartida
que el diff tocó —un componente, un servicio, un endpoint, un helper, una clave de traducción—
buscar **quién más la usa**:

```bash
grep -rn "NombreDelComponente" --include="*.vue" --include="*.js" <repo>/src
grep -rn "nombreDelMetodo\|/ruta/del/endpoint" <repo>
```

Lo que salga y **no** sea parte del desarrollo es una pantalla que hay que volver a probar aunque
nadie la haya tocado. Si un archivo solo lo usa el desarrollo, no hace falta caso de regresión por
él, y decirlo así en vez de rellenar.

## Fase 4 — Armar los casos

Un **solo listado numerado y continuo**, ordenado por flujo de uso, con las tres familias mezcladas.
No se separan en secciones: para quien documenta, los tres cuentan igual como evidencia.

### Familia 1 — Funcionales: que lo implementado funciona

Uno por criterio de aceptación. Camino normal, con datos válidos y el usuario que corresponde.

Sin casos de relleno: dos casos que recorren la misma pantalla con datos distintos son **un** caso,
salvo que los datos distintos ejerciten reglas distintas. Un set inflado se ejecuta a medias.

### Familia 2 — De rotura: que el sistema rechaza lo que debe rechazar

Aquí se busca activamente romperlo. **El resultado esperado es el rechazo con mensaje claro**, no que
la acción funcione. Un caso de rotura que "pasa" porque el sistema aceptó la basura es un caso
fallido.

Fuentes de casos, según lo que el diff muestre:

| Lo que hay en el diff | Caso de rotura |
|---|---|
| Un formulario o campo nuevo | Guardar con los obligatorios vacíos |
| Un campo numérico o de fecha | Valor fuera de rango, tipo equivocado, rango de fechas invertido |
| Un campo de texto | Texto larguísimo, caracteres especiales, espacios al inicio y final |
| Un botón que dispara una acción | Doble clic seguido: no debe ejecutarse dos veces |
| Un permiso nuevo o modificado | El mismo caso con un usuario que **no** debería poder: la opción no aparece, y entrando por URL directa se rechaza |
| Un filtro o buscador | Filtro sin resultados, y filtros combinados que se contradicen |
| Una carga de archivo | Formato no permitido, archivo vacío, archivo grande |
| Cualquier listado con paginación | Última página, y la pantalla sin datos |

En un sistema multiempresa, el caso de permisos incluye **el usuario de otra empresa**: no debe ver
los datos del desarrollo. Es la falla más cara de todas las que aquí se pueden detectar.

### Familia 3 — De regresión: que nada más se dañó

Salen de las señales del recolector y del `grep` de la Fase 3, no de la intuición:

| Señal | Caso de regresión que obliga |
|---|---|
| Componente, servicio o helper compartido modificado | Las otras pantallas que lo usan siguen funcionando igual |
| Ruta HTTP modificada o eliminada | Lo que ya la consumía sigue respondiendo; la pantalla vieja sigue cargando |
| Migración | Los listados, filtros y reportes de esa tabla siguen cargando |
| Cambio en archivos de i18n | Los textos vecinos siguen apareciendo, y en todos los idiomas del proyecto |
| Permiso nuevo o modificado | Los roles que ya tenían acceso lo conservan |
| Pantalla nueva dentro de un módulo existente | El menú del módulo y sus demás pantallas siguen bien |
| Cambio en un listado o tabla compartida | El orden, la paginación y la exportación siguen funcionando |

## Fase 5 — Confirmar antes de redactar

Antes de escribir el set completo, presentar **la lista de casos en una línea cada uno**, numerada, y
esperar que el usuario ajuste. Él sabe qué es crítico en ese módulo y qué no vale la pena probar; que
lo diga sobre una lista de doce líneas cuesta un minuto, y sobre el set ya redactado obliga a
rehacerlo.

## Formato de salida

**El estándar es fijo. No se agregan, quitan ni renombran campos**, porque el texto se pega tal cual
en el aplicativo donde se documentan las pruebas. Se entrega como texto normal, no dentro de un bloque
de código:

```
Caso Prueba #1
Funcionalidad a Probar:
Objetivo:
Resultado Esperado:
Estado: Exitoso
```

Qué va en cada campo:

- **Funcionalidad a Probar** — **la ruta de navegación completa, separada por `->`**, empezando por
  el sistema:

  ```
  Sistema -> Modulo -> Menu -> Submenu si lo requiere
  ```

  ```
  AIO -> AVL -> Categorías -> Acciones de la lista de categorías
  ```

  **El sistema va siempre**, aunque el desarrollo sea obvio en la conversación: quien lee el caso en
  el aplicativo de pruebas no sabe de qué proyecto salió, y ahí conviven AIO, Epsilon, Status y los
  demás. El último nivel es la pantalla, la sección o la acción concreta que se prueba; se omite
  cuando el menú ya la identifica sin ambigüedad.

  **La ruta técnica no va en este campo.** Nada de `(/avl/categories)` ni nombres de archivo: el
  campo es la ruta que el usuario recorre en el menú. Si el endpoint o el menú de permisos aporta
  precisión, va en el **Objetivo** (`…sobre el menú /avl/categories`).

  `Módulo de despachos` no ubica a nadie, y `AVL > Categorías` tampoco cumple: le falta el sistema
  y el separador no es el del estándar.
- **Objetivo** — qué se comprueba, con qué datos y **con qué usuario**. El rol importa: la mitad de
  los casos de rotura dependen de él.
- **Resultado Esperado** — observable **en la pantalla**. Qué se ve, qué mensaje sale, qué queda
  registrado. En los casos de rotura, el rechazo esperado.
- **Estado** — se entrega `Exitoso`, que es la expectativa; el usuario lo cambia a `Fallido` si la
  ejecución no coincide.

### Cómo se redacta cada caso: quien lo ejecuta no conoce el código

**La prueba de fuego: el caso lo tiene que poder ejecutar alguien que no participó en el desarrollo,
sin preguntar nada.** Si para saber dónde dar clic hay que reconstruir el flujo mentalmente, el caso
está mal escrito, y el que lo ejecuta acaba probando lo que cree que decía.

- **Nombrar cada elemento como se lee en pantalla**, con su texto literal: el botón `Siguiente`, la
  sección `Campos de Categoría`, la columna `ES REQUERIDO`. Si el texto de la pantalla está sin
  tilde o abreviado, se escribe así.
- **Los iconos sin texto se describen por su forma y su tooltip**: «el icono de lápiz (*Editar
  Categoría*)». Decir solo «la acción Editar» obliga a buscarla.
- **Nada de jerga interna.** Está prohibido *el paso 2*, *el modo show*, *el subject*, *el
  componente tal*, *el wizard*: son nombres del código, no de la interfaz. Se dice dónde se da clic y
  qué sección aparece.
- **El rol se enumera, no se abrevia.** «El rol de los cuatro permisos» no le dice nada a quien
  configura: se escriben los permisos activos y los inactivos sobre qué menú.
- **Un caso, un recorrido.** Si el objetivo necesita dos recorridos distintos, son dos casos.

El campo `Objetivo` dice **qué se comprueba y con qué usuario**; el `Resultado Esperado`, **qué se ve
en la pantalla**. Los pasos detallados no caben en el estándar de cuatro campos y por eso existe el
anexo: la referencia a la pantalla tiene que ser inequívoca en los dos, pero el paso a paso va abajo.

### Anexo de ejecución (aparte del bloque que se pega)

Después del set, y **claramente separado**, una lista corta por caso con:

- Los **pasos en pantalla**, en imperativo y sin adornos.
- **Qué capturar como evidencia**: qué debe verse en la captura para que sirva de prueba. Un mensaje
  de validación, el registro ya guardado en el listado, el menú sin la opción.

El estándar de cuatro campos no tiene dónde poner los pasos, y sin ellos hay que reconstruirlos al
ejecutar. Va aparte para que el bloque de arriba se pegue sin editarlo.

## Reglas de las pruebas

- **Nivel de vista, siempre.** Cada caso se ejecuta en la pantalla, como lo haría el usuario. En este
  ambiente eso es lo que hay, y además es lo único que prueba lo que el usuario va a vivir. Nada de
  `curl` ni de un query como prueba principal.
- **Base de datos: solo lectura.** Un `SELECT` para confirmar que lo que hizo la vista quedó bien
  guardado es válido y a veces necesario. Escribir, jamás: en un ambiente compartido eso destruye el
  dato de otro, y las tablas de auditoría guardan la petición pero no el estado anterior.
- **Si un caso necesita un dato que no existe, se crea desde la vista.** Si eso no es posible, el caso
  lo dice y se pregunta al usuario cómo conseguir el dato. No se inserta a mano.
- **Si algo solo se puede comprobar por API o por base de datos, se dice explícitamente** en ese caso.
  Disfrazarlo de prueba de vista hace que se documente como probado algo que nadie vio.

## Cuando un caso falla

No se maquilla. Si al ejecutar algo falla, el usuario vuelve con el resultado y entonces:

1. Se marca ese caso como `Fallido` con lo que realmente pasó.
2. Se **amplía el set alrededor del fallo**: un fallo casi nunca es de un solo caso, y los vecinos
   suelen fallar igual sin que nadie los haya probado.
3. Se arregla el código en el flujo normal de desarrollo, y se vuelve a correr el set completo, no
   solo el caso que falló.

## Guardrails

- **No inventar funcionalidad.** Todo caso se sostiene en el diff o en el ticket. Si algo no está en
  ninguno de los dos, no se prueba, y si parece que falta, se pregunta.
- **No inventar el resultado de una prueba.** La skill genera el set; los estados los llena quien
  ejecuta.
- Español, sin emojis, casos breves. Cada caso debe caber en su bloque de cuatro campos.
- Uso manual: solo cuando el usuario lo pide.
