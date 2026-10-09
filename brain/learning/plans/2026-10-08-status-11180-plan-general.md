# Ticket 11180 — Plan general

Repos: `status-full/status-api` (rama `feature/11180-fabian-originDesa-AjusteCalculoPromedioToneladas`)
y `sipa` (rama con el mismo nombre, desde `desa`, se crea en el paso 7).
Despliegue de SIPA: no sale hasta produccion con status-api (lo coordina Fabian).

## Decisiones tomadas

- Monolito `status`: no se toca.
- Falta del mes procesado: deja de ser rechazo. **Plan A**: el backend no guarda nada y responde
  "requiere confirmacion"; si el usuario acepta, SIPA reenvia el mismo archivo con
  `confirmarSinMesProcesado: true`. Alcance agregado por Fabian (la HU no pide confirmacion).
- Validaciones del mes: sin depender del idioma del servidor (`fn_convertmesaingles`, numeros).
- Migracion del cargue (solo `procesaArchivoCSV`; `exportarDatos` y `exportarExcel` no) a
  servicio + controlador con estructura AIO y `ApiResponse`, y ajuste de las tres pantallas.
- Un commit por paso; cada commit con sus pruebas en verde.

## Lista de verificacion de cada paso (no se cierra sin todos)

1. El cambio hace lo que el paso dice, contrastado contra la HU (`tickets.py check 11180`).
2. Hay una prueba que falla antes del cambio y pasa despues.
3. `grep` de lo que el cambio deja sin uso (metodo, variable, import, mensaje); si nadie lo usa, se borra.
4. Docblock de maximo 3 renglones con `@param`/`@return`; sin comentarios sueltos; Swagger en endpoints.
5. Suite completa en verde y limpieza verificada (sin liquidaciones 2030, sin archivos en `/var/sftp/uploads`).
6. `review-overengineering` sobre el diff.
7. Commit aparte con mensaje del equipo, aprobado por Fabian.

## Pasos

| # | Paso | Quien | Detalle que no puede faltar |
|---|---|---|---|
| 1 | Pruebas de caracterizacion | Claude | Hecho: `f664423` |
| 2 | Mes sin depender del idioma | Fabian | `validarToneladasPeriodoActual` y `validarExistenciaFechaActual`: mes y anio de una sola resta de fecha, `campo4` traducido a numero, valores con `?`, sin el caso `'0101'`. Prueba nueva: filas de MARZO 2030 → rechazo "tiene toneladas reportadas a la fecha". Quitar `omitirSiMesesEnIngles` |
| 3 | Regla del 11180 con confirmacion | Por definir | Sin `confirmarSinMesProcesado`: no guarda, borra lo cargado, responde requiere confirmacion. Con el campo: acepta. Validar el campo en `EstructuraRequest` (opcional, booleano). Pruebas de los dos caminos |
| 4 | Calculo del promedio | Por definir | Leer `separarPorEstadoPrestador` y `fn_validacion_prestador_semestre` para el caso Melgar. Prueba por `procesar-toneladas`: promedio del semestre anterior, el mes vacio no cuenta como cero (criterios 2 y 3). Caso sin semestre anterior: promedio 0 |
| 5 | Listado de la pantalla | Por definir | Confirmar que `LiquidacionService::mostrarToneladasCargadas` (v2) no oculta una liquidacion sin toneladas del mes procesado |
| 6 | Migracion del backend | Por definir | Servicio en `app/Services/Sipa/CargarArchivos/`, controlador con estructura AIO, excepcion con log (referencia `CargueDeArchivoException`), dependencia de `MtEstructurasController` sin `new`, Swagger, `ApiResponse` (la confirmacion como 409 + `requiereConfirmacion`), limpieza en `finally`, decidir la conexion unica |
| 7 | Front de SIPA | Por definir | Rama desde `desa`. `cargueRecaudo/main.vue` pasa a `EstructuraService`. Las tres pantallas leen `ApiResponse` y sus `catch` muestran el mensaje y descargan el log. `CargueToneladas.vue`: dialogo de confirmacion y reenvio con `confirmarSinMesProcesado` |
| 8 | Cierre | Los dos | Prueba en pantalla del ciclo completo (si local no puede cargar por SFTP, decir donde se prueba), `update-tech-docs` (cambia una regla de negocio), manual (dialogo nuevo), bitacora y temario de la practica, `finish-development` |

## Pendientes anotados para el MR

- `fn_convertmesaingles` convierte un mes mal escrito en diciembre sin avisar.
- El controlador mezcla la conexion por defecto y `SmAprovechamiento`.
- La carga depende tambien del `DateStyle` del servidor (DMY); confirmar en desa.
- `DtRecaudoController.php:120` y `fnValidaPeriodoAnterior.sql` comparan meses por nombre (fuera del ticket).
- `exportarDatos` y `exportarExcel` quedan con la estructura vieja por decision.
