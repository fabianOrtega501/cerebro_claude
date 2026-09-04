# laravel-servicios — Capa de servicios, transacciones y reglas de negocio

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente

## 1. Que problema resuelve

Un controlador que valida, consulta, decide y guarda termina siendo un archivo de 800 lineas que
nadie se atreve a tocar, y la misma regla ("un tramite cerrado no se edita") se copia en tres
controladores y se olvida en el cuarto. El servicio es **el unico sitio donde vive la regla de
negocio**: el controlador traduce HTTP a llamadas y respuestas; el Request valida la forma de la
entrada; el servicio decide y persiste. Asi la regla se prueba una vez y se reutiliza desde
cualquier entrada (API web, gestor transaccional, un job).

El segundo problema es la **consistencia**: un tramite con encabezado pero sin formularios es un
dato roto. La transaccion garantiza que o se guarda todo o no se guarda nada, y su frontera la
fija el servicio, no el controlador.

## 2. Como funciona

- **Reparto por capas**: Request = forma (tipos, requeridos, existencia de ids). Servicio =
  regla (pertenencia, estado, dependencias, calculos). Controlador = orquestacion y respuesta
  HTTP. Si una regla necesita mirar otra tabla para decidir, casi siempre es del servicio.
- **Transaccion**: `DB::connection(X)->transaction(fn)`. Todo lo que ocurre dentro se confirma al
  salir sin excepcion, y se revierte si algo lanza. Por eso dentro de la transaccion **se lanza,
  no se devuelve false**: una excepcion es lo unico que hace rollback. La conexion de la
  transaccion debe ser la misma que usan los modelos que escribe.
- **Sincronizar una coleccion** (lo que llega es el estado final): se recorre lo recibido, se
  crea lo que no tiene id, se edita lo que si, y se borra lo que no llego. Con dos niveles
  (formulario -> formatos) se sincroniza **de adentro hacia afuera**: primero los hijos de cada
  padre que sigue, y solo despues se evaluan los padres que sobran. Un padre que sobra pero tiene
  hijos es un rechazo, no un borrado.
- **Errores de negocio hacia el usuario**: una excepcion propia con mensaje concreto (que
  formulario, cuantos formatos) que el controlador convierte en `ApiResponse::warning`. Un error
  de FK crudo llega como "fallo de plataforma" y termina en una incidencia.
- **Autorizacion por datos**: lo que el cliente manda como filtro es un deseo, no un permiso. El
  servidor resuelve las empresas del usuario y las **intersecta** con lo pedido. Si el criterio
  ya existe en otro sitio (el selector de formularios), se **extrae** a algo reutilizable, no se
  copia.
- **Servicios que colaboran**: un servicio inyecta a otro por constructor y el hijo no abre su
  propia transaccion; participa de la del padre.

## 3. Como se ve en este repo

| Proyecto | Ejemplo | Nota |
|---|---|---|
| status | `app/Services/Status/GestionTramites/GestionTramitesService.php:132-155` | `crear`: transaccion sobre la conexion explicita, encabezado + seguimiento + formatos + evidencia. La frontera correcta |
| status | `GestionTramitesService.php:187-212` | `actualizar`: `fill()->save()` y despues `sincronizar` dentro de la misma transaccion |
| status | `GestionTramitesService.php:60-105` | `consultar`: las empresas llegan del front (`:62`, `:87`) y se aplican tal cual. El `join` a `mt_formularios` (`:81`) es INNER sobre `tra.idformulario`. La restriccion por `creado_por` para no superusuario (`:97-100`) |
| status | `FormulariosTramites/FormulariosTramitesService.php:104-124` | `sincronizar` de un nivel: id buscado acotado al tramite (`:111-113`), borrado por diferencia con centinela `?: [0]` (`:122-124`) |
| status | `app/Http/Controllers/GestionTramites/GestionTramitesController.php:75-95` | El controlador orquesta: `notFound`, `warning` por cerrado, `validated()` al servicio, `ApiResponse` |
| status | `app/Http/Controllers/GestorMaestros/MtFormulariosController.php:469-503` | El criterio de formularios habilitados: cadena aplicabilidad -> linea de tiempo -> cargo -> responsable -> usuario por documento, exento para superusuario. Vive en un controlador: por eso hay que extraerlo |
| status | `app/Http/Controllers/GestorTransaccional/TramitesController.php:34-70` | `storeTramite`: el camino legado, tres Actions **sin transaccion**. Segunda via de creacion que debe seguir el mismo contrato |
| status | `app/Http/Responses/ApiResponse.php` | `success`, `warning`, `notFound`, `error` |

## 4. Errores tipicos

- Dejar la regla en el controlador: la segunda via de creacion (gestor transaccional) no la
  aplica y nacen tramites que violan la regla.
- Abrir la transaccion en una conexion y escribir modelos de otra: el rollback no cubre esos
  modelos.
- Devolver `false` o un mensaje desde dentro de la transaccion en vez de lanzar: se confirma lo
  que ya se escribio.
- Confiar en el filtro que manda el cliente como si fuera autorizacion.
- Copiar una consulta de criterio (formularios habilitados) en vez de extraerla: dos copias
  divergen al primer ajuste.
- Sincronizar de afuera hacia adentro: se borra el padre y la FK falla, o peor, el cascade borra
  los hijos en silencio.
- Reescribir la consulta del listado sin pensar en la columna que quedara en NULL: el INNER JOIN
  devuelve vacio sin error.
- Olvidar la segunda via de escritura (Action legada) al cambiar donde vive el dato: los tramites
  del gestor transaccional siguen escribiendo el encabezado.

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 10841 | status | Formularios como arreglo en crear/actualizar, sincronizacion de dos niveles con rechazo por dependencias, visibilidad por empresa y formato en el servidor, contar formularios con subconsulta | (pendiente) |

## Preguntas de cierre

1. "No se puede eliminar un formulario con formatos afectados": ¿en que capa vive esa regla y
   como llega al usuario el mensaje con el nombre y la cantidad?
2. La sincronizacion de dos niveles: ¿en que orden recorres formularios y formatos, y en que
   momento decides que un formulario que no llego se puede borrar?
3. Las empresas del listado: ¿que haces con el parametro `empresas` que sigue mandando el front,
   y donde pones el criterio de formularios habilitados para que lo usen el listado y el selector?
