# laravel-validacion — Validacion de entrada con Form Requests

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente

## 1. Que problema resuelve

Todo lo que llega por la API es sospechoso: puede venir de la pantalla, de la app movil o de
alguien con Postman. Si nadie lo revisa, el dato malo llega a la base y pasa una de dos cosas:
PostgreSQL lo rechaza con un error tecnico (el usuario ve "inconsistencia en los datos" y un 500),
o peor, lo acepta y queda un dato falso que nadie nota.

El Form Request es el **portero de la puerta**: revisa el paquete antes de que entre a la casa. Si
algo falta o no cuadra, lo devuelve con una nota que dice exactamente que corregir (422, un mensaje
por campo), y el controlador ni se entera de que hubo intento.

## 2. Como funciona

El orden importa, porque cada paso ve lo que dejo el anterior:

1. El controlador **pide** el Form Request en su firma (`store(StoreXRequest $request)`). Laravel
   lo crea y lo ejecuta antes de entrar al metodo.
2. `prepareForValidation()` — limpia el paquete: convierte `"true"` en `true`, agrega un dato
   que falta. Corre antes de cualquier regla.
3. `rules()` — las reglas **por campo**: obligatorio, tipo, largo, que exista la FK. Se evaluan
   campo por campo, sin mirar a los vecinos (salvo reglas como `after_or_equal:start_date`).
4. `withValidator()` con `$validator->after(...)` — lo que es del **formulario completo** y no de
   un campo: "exactamente uno marcado", "este rango no se cruza con otro". Corre despues de las
   reglas por campo.
5. Si algo fallo, `failedValidation()` responde 422 y **nada mas se ejecuta**.

**Una regla propia** es una clase que implementa `ValidationRule` con un solo metodo,
`validate($attribute, $value, $fail)`. Para rechazar llama a `$fail('mensaje')`. Es como un
formulario de revision que se puede reutilizar en varios porteros.

**Como recibe los datos la regla**: por el **constructor** (explicito: quien la usa dice que le
pasa) o leyendo `request()` por dentro (oculto: la regla "adivina" de donde sacar el dato). El
constructor es la forma que se puede reutilizar y probar.

**El cruce de dos rangos de fechas.** Dos rangos `[A_ini, A_fin]` y `[B_ini, B_fin]` se cruzan si y
solo si:

```
A_ini <= B_fin  Y  B_ini <= A_fin
```

Con fechas completas (dias) los extremos **cuentan**: `<=`, no `<`. Una vigencia que termina el 30
y otra que empieza el 30 comparten ese dia, y se cruzan. Con horas (visitas) se usa `<`, porque
una visita que termina a las 10:00 y otra que empieza a las 10:00 no chocan.

La comparacion va **en la consulta SQL**, no trayendo todos los registros a PHP y recorriendolos:
la base filtra y responde `exists()`.

## 3. Como se ve en este repo

| Proyecto | Ejemplo | Nota |
|---|---|---|
| aio | `app/Http/Requests/Common/CommonFormRequest.php:9-52` | La base de todos los Form Requests: atajos como `$requiredDate`, `validateString()`, `mergeRules()` |
| aio | `app/Http/Requests/Common/CommonFormRequest.php:211-220` | `failedValidation`: la forma del 422 que el front sabe pintar |
| aio | `app/Rules/Modules/Respel/JobClassification/UniqueJobRoleForPosition.php:38-70` | Regla propia **con datos por constructor**, que excluye el propio id y solo cuenta activas. El molde a seguir |
| aio | `app/Http/Requests/Modules/Respel/JobClassification/StoreJobClassificationRequest.php:58-91` | `withValidator` + `after`: la regla solo corre si el registro se guarda activo, y el error va bajo una llave de negocio |
| aio | `app/Http/Rules/Modules/Settings/ClientVisits/ValidateVisitScheduleOverlapRule.php:136-152, 217` | Cruce de horarios. Sirve por la **formula**, no por la forma: lee todo de `request()`, trae los registros a PHP y usa `<` porque son horas |

**Dos carpetas de reglas conviven**: `app/Rules/Modules/...` y `app/Http/Rules/Modules/...`. En
Respel hay entidades en las dos. No hay una vigente declarada; se sigue la que ya use la entidad o
la que pida la HU, y se dice cual se eligio.

## 4. Errores tipicos

- **No excluir el propio registro al editar.** Abrir una vigencia y guardarla sin cambios falla
  contra si misma. El id sale de `$this->route('id')`.
- **Contar las inactivas.** Un registro anulado no ocupa lugar; si la consulta no filtra
  `active = true`, lo anulado sigue bloqueando.
- **`<` en vez de `<=` con fechas.** Deja pasar dos vigencias que comparten el ultimo dia.
- **Olvidar una columna de la llave.** Si el cruce no filtra por `company_id`, la vigencia de otra
  empresa bloquea a esta.
- **Leer `request()` dentro de la regla.** Funciona hasta que alguien la usa con otro nombre de
  campo o desde `Validator::make`, y entonces valida el dato equivocado en silencio (paso con las
  copias de `ValidEncryptedIdRule`).
- **Seguir despues de `$fail()`.** Sin `return`, la regla sigue consultando con datos que ya se
  sabe que estan mal.
- **Creer que "por constructor" significa "no valida".** Las dos formas validan igual; el
  constructor solo decide **de donde salen los datos**: el Form Request se los entrega a la regla
  (`new Regla($a, $b)`) y `validate()` hace la consulta. Salio en el ticket 11308.
- **Meter una advertencia en el Form Request.** Todo lo que el Form Request reporta **bloquea**. Un
  aviso que debe dejar guardar no puede vivir ahi.

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 11308 | aio | Regla reutilizable de cruce de vigencias por empresa + cliente + linea de negocio; fecha final >= inicial; aviso no bloqueante | — |

## Preguntas de cierre

1. La HU pide que al editar una vigencia con prestaciones ejecutadas se **advierta sin impedir
   guardar**. ¿Puede vivir esa advertencia en el Form Request? Si no, ¿donde, y como le llega al
   usuario?
2. Tu regla de cruce: ¿le pasas los datos por el constructor o los lee de `request()`? ¿Que te
   cuesta cada opcion?
3. Existe una vigencia activa del 01/01 al 30/06. Llega una nueva del 30/06 al 31/12. ¿Se cruza?
   Escribe la condicion con las cuatro fechas.
