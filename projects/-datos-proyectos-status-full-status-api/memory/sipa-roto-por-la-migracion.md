---
name: sipa-roto-por-la-migracion
description: "Inventario exacto de lo que quedo roto en el front de SIPA por migrar el contrato de status-api, con archivo, linea y correccion."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-22T01:38:40.404Z
---

El front de SIPA (`/datos/proyectos/sipa`) consume `status-api` igual que `status-frontend`,
pero **no entro en el ticket 7433**. Al migrar endpoints a `ApiResponse` sus pantallas quedaron
rotas. Fabian decidio el 2026-09-21 **seguir migrando sin detenerse por SIPA** y arreglarlo
despues en su propia rama, con su propio MR.

**Este archivo es el listado de lo que hay que arreglar.** Mantenerlo al dia: cada vez que se
migre un endpoint que SIPA consuma, agregar la fila aqui.

## Como cambio el contrato

| Antes | Ahora |
|---|---|
| `response.data.ArrayRoles` y demas claves propias | `respuesta.data` (todo cuelga de `data`) |
| `response.data.status == "ok"` | `respuesta.status === "success"` |
| el usuario que firma iba en el cuerpo (`usuario:`) | sale del token; el campo sobra |
| error con HTTP 200 | codigo real: 409, 422, 404 |

En SIPA las llamadas usan `this.$http`, asi que `response` es la respuesta de axios y el cuerpo
es `response.data`. Con el contrato nuevo el arreglo queda en **`response.data.data`**. Lo limpio
es pasar por un servicio, como se hizo en `status-frontend`.

## Roto a 2026-09-21

| Archivo de SIPA | Linea | Endpoint | Lee hoy | Debe leer |
|---|---|---|---|---|
| `views/configuracion/usuarios/acciones.vue` | 539 | `Roles/select` | `response.data.ArrayRoles` | `response.data.data` |
| `views/configuracion/permisos/main.vue` | 268 | `Roles/select` | `response.data.ArrayRoles` | `response.data.data` |
| `views/configuracion/roles/main.vue` | 372 | `Roles/indexAll` | `response.data` | `response.data.data` |
| `views/configuracion/usuarios/acciones.vue` | 393-401 | `Usuarios/show/{id}/3` | `response.data.ArrayUsuRoles[i]` | `response.data.data[i]` |
| `views/configuracion/permisos/main.vue` | 283 | `Permisos/show` | `response.data.ArrayPermisos` | `response.data.data` |
| `views/configuracion/permisos/main.vue` | 215 y 223 | `Permisos/store` | `response.data.status == "ok"` | `=== "success"` |
| `views/Paginas/authentication/ResetPassword.vue` | 178 | `Usuarios/updatePassword` | `response.data.status == "ok"` | `=== "success"` |

**Dos avisos sobre las escrituras:**

- `Usuarios/updatePassword` **ya no acepta el `id` del cuerpo**: cambia la clave de quien manda
  el token. SIPA sigue enviando `id` y `usuario` (linea 170 y 172); esos campos sobran y, si el
  usuario del token no es el mismo, cambiara la clave equivocada. Era una falla de seguridad, no
  se va a revertir.
- `Permisos/store` **ya no acepta `usuario`** en el cuerpo (linea 332): tambien sale del token.

## Todavia sano, pero se rompera cuando se migre

| Endpoint | Archivos de SIPA |
|---|---|
| `Menu/showMenuExterior` | `views/Paginas/authentication/Login.vue`, `services/Configuracion/Menu/MenuService.js` |
| `Municipios/select` | `views/aprovechamiento/actualizacionDatos/main.vue`, `views/aprovechamiento/prestadores/acciones.vue` |
| `Paises/show` | `views/configuracion/empresas/acciones.vue` |
| `v1/log/functionality` | `services/Funcionalidad/LogFuncionalidadService.js` |
| `Empresas/selectEmpresas` | `views/configuracion/usuarios/acciones.vue`, `.../accionesUsuariosPrestadores.vue` |
| `Empresas/index` | `views/configuracion/empresas/main.vue` |

**`Menu/showMenuExterior` es el login de SIPA.** Se dejo a proposito con el contrato viejo y con
una prueba que lo fija —`PermisosTest::testShowMenuExteriorConservaLaFormaAntigua`—, porque
migrarlo dejaria a SIPA sin acceso, no con un selector vacio. Al arreglar SIPA se migran los dos
lados a la vez y se quita esa prueba.

## Al arreglarlo

1. Rama propia en `/datos/proyectos/sipa` desde `desa`, con el mismo formato del equipo.
2. Crear los servicios en `sipa/src/services/Configuracion/`, que ya tiene esa estructura
   (`services/Configuracion/Menu/MenuService.js` existe).
3. Migrar tambien `showMenuExterior` en `status-api` y quitar la prueba que lo fija.
4. Los tres MR —status-api, status-frontend y sipa— entran juntos.

Ver [[buscar-consumidores-de-un-endpoint]].
