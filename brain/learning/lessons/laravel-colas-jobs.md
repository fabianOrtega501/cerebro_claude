# laravel-colas-jobs — Colas, Jobs y procesos en segundo plano

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente

## 1. Que problema resuelve

Hay trabajo que no cabe en una peticion HTTP: marcar fotos, generar un PDF de mil etiquetas, enviar
correos. Si se hace en la peticion, el usuario espera (o la peticion se corta por tiempo) y un fallo
de ese trabajo tumba la operacion principal. El Job es una **nota de pendiente** que se deja en una
bandeja (la cola) para que un trabajador (el worker) la atienda despues, en otro proceso.

## 2. Como funciona

- **Despachar** (`Job::dispatch($id)`) guarda una fila en la tabla `jobs` con el Job serializado.
  En AIO el driver es `database`: la cola es una tabla de PostgreSQL.
- **El worker** (`queue:work`, levantado por supervisor) lee la fila, rearma el Job y llama a
  `handle()`. Los servicios que necesita se piden como **parametros de `handle()`**: Laravel los
  inyecta igual que en un constructor de servicio.
- **Al Job se le pasan ids, no datos grandes.** Lo que se le pasa al constructor se guarda en la
  tabla; un binario de fotos ahi pesa megas por fila.
- **La cola tiene nombre** y cada nombre necesita un worker que la escuche. Sin worker, el Job se
  queda en la tabla para siempre, sin error.
- **`afterCommit()`**: hace que el Job se despache solo despues del commit, y que no se despache si
  hay rollback. **Ojo con el driver**: en AIO la cola es la tabla `jobs` de la **misma base y
  conexion**, asi que el INSERT del Job ya queda dentro de la transaccion (el worker no lo ve antes
  del commit y el rollback lo borra). Ahi `afterCommit()` es proteccion hacia adelante: con Redis u
  otra base, sin el, el worker podria procesar un registro que nunca se confirmo. Se usa igual.
- **Fallar en un Job no le llega al usuario.** Ya se le respondio. Por eso se registra con
  `ErrorLoggingService` y se decide si reintentar (`--tries`) o no.
- **Idempotencia**: correr dos veces el mismo Job ¿deja el mismo resultado? Una marca de agua no:
  la segunda corrida estampa encima. Por eso el carril `media` corre con `--tries=1`.
- **Al worker hay que reiniciarlo** cuando cambia el codigo: compila las clases al arrancar.

## 3. Como se ve en este repo

| Proyecto | Ejemplo | Nota |
|---|---|---|
| aio | `docs/arquitectura/colas-y-jobs.md` | Catalogo de colas, carriles y la regla de agregar un Job |
| aio | `app/Enums/QueueNames.php` | Los nombres de cola; nunca un string suelto |
| aio | `app/Jobs/Modules/Mobile/Visit/ProcessVisitAttachmentsJob.php` | Marca de agua del Censo: fecha del levantamiento, no de la ejecucion; encadena el acta al terminar |
| aio | `app/Services/Modules/Settings/Company/CustomCompanyService.php:171` | `formatDateByCountryCompany`: la unica forma vigente de pasar una fecha UTC a la hora de la empresa. Los Jobs viejos de marca de agua la reimplementan a mano (no copiar eso) |
| aio | `config/queue.php:42` | `after_commit => false` en todas las conexiones |

## 4. Errores tipicos

- Escribir el nombre de la cola a mano, o crear una cola sin su worker en los dos archivos de
  supervisor: los Jobs se acumulan en silencio.
- `public $queue = ...` en un Job: error fatal (lo declara `Queueable`). Se usa `onQueue()`.
- Despachar dentro de una transaccion sin `afterCommit()`.
- Usar `now()` en el Job para la fecha de algo que ocurrio antes (la carga de la foto): el Job puede
  correr minutos u horas despues.
- **Tuyo, ticket 11411** — copiar la referencia sin revisarla: el Job de Item traia la conversion de
  hora a mano y paso igual al nuevo, en vez de usar `CustomCompanyService`.

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 11411 | aio | Job de marca de agua de las fotos de PQR en `applyWatermark`, despachado con `afterCommit()` desde la transaccion de creacion | (pendiente) |

## Preguntas de cierre

1. Si quitas el `afterCommit()`, ¿que puede ver el worker y que pasa si la radicacion se revierte?
2. El Job corre 10 minutos despues de subir la foto. ¿Que fecha va en la marca y de donde la sacas?
3. Si el worker reintentara el Job tras un fallo a mitad, ¿que le pasa a la foto?
