---
name: sipa-roto-por-la-migracion
description: "Inventario de lo que habra que ajustar en SIPA al apuntar a status-api. En local ya apunta (rama 7433); en desa/prod depende de VUE_APP_API del despliegue."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-22T01:38:40.404Z
---

## Estado al 2026-10-08

- **Local**: el `.env` de SIPA (no versionado) apunta a `http://localhost:8087/api`, status-api.
  El ajuste del front al contrato nuevo vive en la rama `feature/7433-...ConexionConStatusApi`
  de SIPA, que aun no entra a `desa`.
- **desa / prod**: la URL sale de `VUE_APP_API` del despliegue (`docker/40-runtime-config.sh`);
  no se ve en el repo. Mientras el 7433 no este desplegado, se asume que siguen en el monolito,
  asi que un cambio hecho solo en status-api no llega al usuario de SIPA hasta entonces.

## Lo que se vio el 2026-09-22 (ya no vale en local)

Lo comprobo Fabian el 2026-09-22 y se verifico: **SIPA apunta al monolito, no a status-api**.

```
sipa/.env:  VUE_APP_API="http://localhost:8086/api"   <- el monolito
status-api corre en el 8087
```

El monolito sirve desde `routes/ModulosApi/` los mismos endpoints que SIPA llama —`Roles/select`,
`Usuarios/show`, `Permisos/store`, `Menu/showMenuExterior`, `cargue-archivos`,
`Municipios/select`—, con su propia implementacion y el contrato viejo. Asi que **migrar
`status-api` no afecta a SIPA**.

**Entonces para que sirve este archivo:** es el inventario de lo que habra que ajustar **el dia
que SIPA se apunte a status-api**. Ese dia, cada fila de abajo es un cambio pendiente. Mantenerlo
al dia: cada vez que se migre un endpoint que SIPA consuma, agregar su fila.

**El error que hay que no repetir:** se dio por roto a SIPA solo porque su codigo llamaba a esas
rutas, sin mirar **a que backend apuntaba**. Antes de declarar roto a un consumidor, revisar su
`baseURL`.

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

## Endpoints a ajustar cuando SIPA apunte a status-api

| Archivo de SIPA | Linea | Endpoint | Lee hoy | Debe leer |
|---|---|---|---|---|
| `views/configuracion/usuarios/acciones.vue` | 539 | `Roles/select` | `response.data.ArrayRoles` | `response.data.data` |
| `views/configuracion/permisos/main.vue` | 268 | `Roles/select` | `response.data.ArrayRoles` | `response.data.data` |
| `views/configuracion/roles/main.vue` | 372 | `Roles/indexAll` | `response.data` | `response.data.data` |
| `views/configuracion/usuarios/acciones.vue` | 393-401 | `Usuarios/show/{id}/3` | `response.data.ArrayUsuRoles[i]` | `response.data.data[i]` |
| `views/configuracion/permisos/main.vue` | 283 | `Permisos/show` | `response.data.ArrayPermisos` | `response.data.data` |
| `views/configuracion/permisos/main.vue` | 215 y 223 | `Permisos/store` | `response.data.status == "ok"` | `=== "success"` |
| `views/Paginas/authentication/ResetPassword.vue` | 178 | `Usuarios/updatePassword` | `response.data.status == "ok"` | `=== "success"` |
| `views/aprovechamiento/prestadores/acciones.vue` | 781 | `Municipios/select` | `response.data` | `response.data.data` |
| `views/aprovechamiento/actualizacionDatos/main.vue` | 258-260 | `Municipios/select` | `const { data } = ...` y luego `data.map()` | `data.data.map()` |
| `views/configuracion/empresas/acciones.vue` | 262 | `Paises/show` | `response.data.ListaPaises` | `response.data.data` |

**Dos avisos sobre las escrituras:**

- `Usuarios/updatePassword` **ya no acepta el `id` del cuerpo**: cambia la clave de quien manda
  el token. SIPA sigue enviando `id` y `usuario` (linea 170 y 172); esos campos sobran y, si el
  usuario del token no es el mismo, cambiara la clave equivocada. Era una falla de seguridad, no
  se va a revertir.
- `Permisos/store` **ya no acepta `usuario`** en el cuerpo (linea 332): tambien sale del token.

## Los que aun conservan el contrato viejo en status-api

| Endpoint | Archivos de SIPA |
|---|---|
| `Menu/showMenuExterior` | `views/Paginas/authentication/Login.vue`, `services/Configuracion/Menu/MenuService.js` |
| `Empresas/selectEmpresas` | `views/configuracion/usuarios/acciones.vue`, `.../accionesUsuariosPrestadores.vue` |
| `Empresas/index` | `views/configuracion/empresas/main.vue` |

**`v1/log/functionality` cambio de contrato pero NO rompe SIPA.** Su
`services/Funcionalidad/LogFuncionalidadService.js` hace `await axios.post(...)` y no lee la
respuesta, asi que el envoltorio nuevo le da igual. Se deja anotado para no volver a revisarlo.

**`Menu/showMenuExterior`** se dejo con el contrato viejo y con una prueba que lo fija
—`PermisosTest::testShowMenuExteriorConservaLaFormaAntigua`—. Esa decision se tomo creyendo que
SIPA dependia de el; como no es asi, se puede migrar cuando convenga y quitar esa prueba.

## Al arreglarlo

1. Rama propia en `/datos/proyectos/sipa` desde `desa`, con el mismo formato del equipo.
2. Crear los servicios en `sipa/src/services/Configuracion/`, que ya tiene esa estructura
   (`services/Configuracion/Menu/MenuService.js` existe).
3. Migrar tambien `showMenuExterior` en `status-api` y quitar la prueba que lo fija.
4. Los tres MR —status-api, status-frontend y sipa— entran juntos.

Ver [[buscar-consumidores-de-un-endpoint]].
