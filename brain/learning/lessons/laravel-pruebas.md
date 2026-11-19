# laravel-pruebas — Pruebas de Feature en Laravel

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente (primera clase en el ticket 11927 de AIO, 2026-11-18).

## 1. Que problema resuelve

Probar a mano demuestra que el cambio funciona **hoy, en tu computador, con tus datos**. No dice
nada de mañana: el siguiente que toque `getSelectForWeights` puede devolver el filtro de un solo
día y nadie lo nota hasta que el operador vuelva a quejarse.

Una prueba automática es un **guardia que repite tu prueba manual en cada MR**. El CI del AIO corre
las pruebas como gate obligatorio: si alguien rompe la regla, el pipeline se pone rojo antes de
llegar a desa.

Regla del cerebro: **toda corrección lleva una prueba que falle sin ella**. Una prueba que nunca se
vio fallar no está verificada, solo está escrita.

## 2. Como funciona

Una prueba de **Feature** hace una petición HTTP de verdad contra la aplicación (sin navegador) y
revisa la respuesta. Tiene siempre tres partes, en este orden (**Preparar, Actuar, Afirmar**):

1. **Preparar**: crear en la base exactamente los datos del escenario, con *factories*.
2. **Actuar**: llamar al endpoint con `$this->get(...)` o `$this->post(...)`.
3. **Afirmar**: comprobar lo que salió con `assert*`.

Piezas que la hacen funcionar:

| Pieza | Qué hace | Si falta |
|---|---|---|
| `extends Tests\TestCase` | Arranca Laravel para cada prueba | No hay aplicación que llamar |
| `use RefreshDatabase` | Cada prueba corre dentro de una transacción que se revierte al terminar: la base de pruebas (`.env.testing`) arranca vacía cada vez | Los datos de una prueba ensucian la siguiente |
| `use WithoutMiddleware` | Salta `auth`, `permission` y `audit_log` | Hay que armar rol, menú y permiso para cada prueba |
| `setUp()` | Corre antes de **cada** prueba: crea el usuario y hace `actingAs` | `auth()->id()` es nulo |
| Factory | Fabrica un registro válido con datos inventados; tú fijas solo lo que importa al escenario | Hay que llenar a mano todas las columnas obligatorias |
| `test_` al inicio del método | Así PHPUnit sabe que es una prueba | El método no corre |

Afirmaciones más usadas en un listado: `assertStatus(200)`, `assertContains($id, $ids)`,
`assertNotContains($id, $ids)`. Se pone siempre un mensaje como tercer argumento: cuando falla,
dice qué regla se rompió.

Se corre con Sail: `./vendor/bin/sail artisan test <ruta del archivo>` o con `--filter <nombre>`.

## 3. Como se ve en este repo

Modelo: `tests/Feature/Modules/Operation/DispatchDownload/ClosedDispatchDistributionTest.php`.
Ya prueba el mismo endpoint `get-select-for-weights` (alrededor de la línea 165):

```php
UserOperationalCenter::insert([[ 'user_id' => $this->user->id,
    'operational_center_id' => $closed->operational_center_id, ... 'active' => true ]]);

$response = $this->get('/api/dispatches/v0/get-select-for-weights?filter='
    .json_encode(['user_id' => $this->user->id]));

$ids = array_column($response->json('data') ?? [], 'id');
$this->assertContains($closed->id, $ids, 'El despacho cerrado debe ofrecerse como destino.');
```

La trampa de este repo: **`DispatchFactory` crea una empresa, un servicio y un centro operativo
nuevos para cada despacho**. Si el escenario necesita "mismo centro" o "misma empresa", hay que
crear el primero y pasarle sus ids a los demás:

```php
$base = DispatchFactory::new()->create(['start_datetime' => '2026-11-12 05:00:00']);
$sameCenter = ['company_id' => $base->company_id, 'operational_center_id' => $base->operational_center_id];
$previousDay = DispatchFactory::new()->create($sameCenter + ['start_datetime' => '2026-11-11 22:00:00']);
```

| Proyecto | Ejemplo | Nota |
|---|---|---|
| aio | `ClosedDispatchDistributionTest.php` | Mismo endpoint; usa `WithoutMiddleware` y `UserOperationalCenter::insert` |
| aio | `tests/Feature/Modules/Operation/Dispatch/OverviewPermissionTest.php` | Cuando lo que se prueba **es** el permiso: sin `WithoutMiddleware` |

No copiar del modelo los comentarios sueltos dentro del método (`// El que ya no tiene...`): en el
código nuevo no van.

## 4. Errores tipicos

- **Probar solo el caso feliz.** Afirmar que sale lo que debe salir, pero no que lo de fuera del
  rango no sale. Con eso, una consulta que trae todo también pasa.
- **Datos que no aíslan la regla.** Si el despacho del día anterior es además de otro servicio, la
  prueba no distingue si salió por la fecha o por el servicio. Cada registro del escenario cambia
  **una sola cosa** respecto al base.
- **Olvidar que la factory crea centros nuevos.** El despacho queda en otro centro, el filtro de
  centros del usuario lo saca y la prueba falla por una razón que no es la regla.
- **No verla fallar.** Se devuelve el cambio (por ejemplo, el `whereDate` de un día) y se corre: si
  sigue pasando, la prueba no prueba nada.
- **Nombres largos.** Máximo 5 palabras sin contar `test_`; el detalle va al docblock.
- **Tuyo, ticket 11927** — Dejar el valor aleatorio de la factory (`active => faker->boolean`): la
  prueba pasa unas veces y otras no. Todo lo que la regla mira se fija a mano.
- **Tuyo, ticket 11927** — Confundir ids: `->id` de la fila de una tabla de relación no es el id
  del servicio. Lo que guarda una factory es el registro que crea.
- **Tuyo, ticket 11927** — Tapar un error con `?? null`: la afirmación compara contra `null` y
  siempre pasa. Si algo se queja, se corrige la causa.
- **Tuyo, ticket 11927** — Enviar en la prueba algo distinto de lo que envía el consumidor real
  (la fecha con hora en vez de `Y-m-d`): la prueba prueba otra cosa.

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 11927 | aio | Prueba del rango de fechas de `get-select-for-weights` (día anterior a día posterior) y servicio con vehículo | 4 |

## Preguntas de cierre

1. Si tu prueba pasa con el código viejo, ¿qué te está diciendo?
2. ¿Por qué el despacho del día anterior debe ser del **mismo** centro y servicio que el base?
3. ¿Qué registro del escenario demuestra que la Distribución de pesos no cambió?
