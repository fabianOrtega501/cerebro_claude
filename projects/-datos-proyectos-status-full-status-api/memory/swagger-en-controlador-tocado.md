---
name: swagger-en-controlador-tocado
description: "En status-api, todo controlador que se toque queda con su documentacion Swagger y con la estructura de AIO."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-18T12:23:21.166Z
---

En `status-api`, **todo controlador que se cree, modifique o simplemente se toque queda con
su documentacion Swagger (`@OA`) antes de darlo por terminado**. No se aplaza para un ticket
de documentacion posterior.

Junto con eso, el controlador se deja con la estructura de AIO, que en este repositorio esta
representada por `app/Http/Controllers/Status/GestionTramites/FormularioTramite/FormulariosTramitesController.php`:
Form Request propio por metodo, servicio inyectado en el constructor, respuestas con
`ApiResponse::success` / `ApiResponse::error`, retorno tipado `JsonResponse` y los mensajes
repetidos como constante de clase.

**Por que:** el proyecto tiene 191 controladores sin documentar y cuatro estilos de respuesta
conviviendo. Si cada cambio deja el controlador como estaba, la deuda nunca baja; si cada
cambio lo deja al dia, la migracion ocurre sola por donde el trabajo va pasando. Lo pidio
Fabian el 2026-09-18, al ver que estabamos modificando muchos controladores sin unificarlos.

**Como aplicarlo:** al tocar un controlador, migrarlo entero a esa estructura, no solo el
metodo que motivo el cambio. Cuidado con el envoltorio: pasar de `establecerArregloRetorno`
(`code`/`success`/`message`/`datos`) a `ApiResponse` (`status`/`message`/`data`) **cambia la
forma de la respuesta y rompe al front**, que lee `datos`. Esa migracion se coordina con el
front, no se hace sola.

Ver [[no-commitear-sin-autorizacion]].
