# lectura-de-codigo — Seguir un flujo heredado de punta a punta antes de cambiarlo

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente

## 1. Que problema resuelve

La HU describe lo que el usuario **ve**, no donde esta la causa. "SIPA no calcula el promedio"
suena a que hay que tocar la formula, pero el bloqueo puede estar tres pasos antes, en una
validacion que ni siquiera deja llegar al calculo. Quien cambia codigo sin haber seguido el
recorrido completo arregla el sitio equivocado, o arregla el correcto y rompe otro que pasaba
por ahi.

Analogia: un plomero al que le dicen "no sale agua en la cocina". El buen plomero no cambia la
llave de la cocina de una vez: sigue el tubo desde el contador hasta la llave y encuentra la
valvula cerrada a mitad de camino. Leer codigo es seguir el tubo.

## 2. Como funciona

- **Se empieza por donde el usuario actua**: el boton del front. De ahi sale una peticion HTTP
  (verbo + URL). Esa URL se busca en `routes/`, la ruta dice que controlador y metodo la
  atienden, y desde ese metodo se sigue cada llamada hacia abajo.
- **Se anota el recorrido como una lista numerada** mientras se lee: archivo:linea y que decide
  cada paso. Si no se anota, a la tercera clase se pierde el hilo.
- **El nombre no es contrato.** Un metodo llamado `validarToneladasPeriodoActual` puede validar
  el mes anterior. Lo que manda es el cuerpo: que consulta, que compara, que devuelve.
- **Los comentarios y docblocks envejecen.** El codigo se ejecuta y el comentario no, asi que
  cuando no coinciden, gana el codigo. Un comentario se verifica, no se cree.
- **Codigo sin ruta no se ejecuta.** Antes de estudiar un metodo, comprobar que alguien lo llama
  (`grep` del nombre). Si nadie lo llama, es historia, no flujo.
- **Lo que esta en la base tambien es codigo.** Funciones SQL, vistas y triggers deciden cosas
  que el PHP no muestra. Si el PHP llama `select * from fn_algo(...)`, el flujo sigue dentro de
  esa funcion.
- **Herramientas**: `grep -rn "<nombre>" app routes`, `git log -S "<texto>"` para saber cuando y
  por que aparecio una linea, y `git blame` para ver quien la toco.

## 3. Como se ve en este repo

| Proyecto | Ejemplo | Nota |
|---|---|---|
| sipa | `src/@core/components/cargue-toneladas/CargueToneladas.vue:28` y `:240-297` | La misma pantalla tiene **dos tubos**. Boton "Cargar" → `EstructuraService.js:33` → `procesar-archivo-csv` → `CargarArchivosController::procesar`: llena `dt_cargue_toneladas` y valida |
| sipa | `CargueToneladas.vue:60` y `:333-337` | Boton "Procesar" (uno por fila) → `procesar-toneladas` → `ToneladasAforadasController`: calcula. La fila solo existe si el tubo de carga termino bien |
| status-api | `app/Http/Controllers/Sipa/CargarArchivos/CargarArchivosController.php:126-199` | `procesar`: la carga del csv. Una cadena de validaciones que cortan con `return false` antes de que exista algo que calcular |
| status-api | `CargarArchivosController.php:608-623` | `validarToneladasPeriodoActual`: el nombre dice "periodo actual" y la consulta pide el mes **anterior** al periodo (`- interval '1 month'`). El nombre engaña |
| status-api | `app/Services/Sipa/CalculoToneladasAforadas/ToneladasAforadasServices.php:29-41` | El docblock habla de un trabajo en segundo plano segun 10.000 registros; el cuerpo no despacha ningun job. Comentario envejecido |
| status-api | `database/DBobjects/function/2023122002_fn_validacion_prestador_semestre.sql` | Parte del flujo vive en la base: aqui se decide si un prestador es "nuevo" o "antiguo" |

## 4. Errores tipicos

- Seguir el boton que suena al tema ("Procesar") cuando la falla ocurre en un tubo anterior de la
  misma pantalla ("Cargar"). Antes de elegir boton, preguntarse en que paso del uso real se tranca
  el usuario segun la HU. **Ticket 11180**: la clase senalo "Procesar" como punto de partida y
  desvio la lectura; la HU decia "debe modificar el archivo .csv", que apunta a la carga.
- Ir directo al archivo que suena al tema de la HU ("promedio" → el servicio de calculo) sin
  verificar que el flujo llega hasta ahi.
- Creerle al nombre de un metodo o a su docblock sin leer el cuerpo.
- Estudiar codigo muerto: un metodo sin ruta ni llamador (`ToneladasController::procesarToneladas`
  en status-api) que se parece mucho al que si corre.
- Parar la lectura en el PHP cuando la decision sigue dentro de una funcion SQL.
- Olvidar que el mismo codigo puede estar copiado en otro repo (el monolito `status`).

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 11180 | status (status-api) | La HU pide "calcular el promedio"; hay que descubrir en que punto del recorrido carga → calculo se corta hoy | (pendiente) |

## Preguntas de cierre

1. La HU habla del "mes procesado". En el codigo, ¿que mes es ese respecto al `periodo` de la
   liquidacion, y como lo comprobarias sin preguntarle a nadie?
2. Si la regla que hay que cambiar aparece en dos puntos del recorrido (la carga y el calculo),
   ¿con que criterio decides cual tocar?
3. Un docblock dice que el proceso corre en segundo plano. ¿Como verificas si es verdad?
