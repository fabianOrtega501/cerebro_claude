---
name: error-logging-rompe-aislamiento-tests
description: En aio-backend un test que provoque un error manejado confirma la transaccion de RefreshDatabase y contamina los siguientes
metadata:
  type: project
---

`ErrorLoggingService::logErrorToDatabase()` hace `DB::beginTransaction()` y `DB::commit()` propios.
Dentro de un test con `RefreshDatabase` —que aisla cada caso en una transaccion— ese `commit`
**confirma la transaccion del test** y todo lo que llevaba creado queda persistido para los
siguientes.

Sintoma real (ticket 10614, 2026-09-02): `GenerateMassiveQrPdfTest > does not queue without base
url` falla con `Failed asserting that 1 is identical to 0` **solo al correr la suite completa**;
pasa aislado y pasa con su modulo entero (563 tests). La notificacion la dejo el test anterior de
la misma clase, que ejecuta un job que falla a proposito. **Falla igual en la rama base**: es
preexistente, no lo introduce quien lo encuentra.

**Why:** invita a buscar la causa en el cambio propio y a perder una hora. Y hace que la suite
completa no sea reproducible por partes: el resultado depende del orden.

**How to apply:** ante un test que falla solo en la suite completa, antes de investigar el propio
cambio comprobar si el test anterior provoca un error manejado; y verificar contra la rama base.
Correr la suite por el contenedor (`docker exec <container> php artisan test`, ver
[[run-artisan-via-sail]]) y **sin `| tail`**: el pipe retiene los ~875 s de salida hasta el final,
mejor redirigir a un archivo. Al escribir un test que ejercite el registro de errores, sustituir
la escritura con una subclase que sobreescriba `logErrorToDatabase` —tambien evita depender de
`public.fun_log_error`, que no existe en la base de pruebas.
