# permisos-y-gates — Permisos, roles y control de acceso

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente

## 1. Que problema resuelve

No todos los usuarios deben poder hacer todo. Un asesor comercial consulta costos; quiza solo el
director los modifica. El permiso responde una pregunta en cada peticion: **¿este usuario puede
hacer esta accion sobre este recurso?**

Y hay que responderla en **dos lugares**, por dos motivos distintos:

- **En el backend, para proteger el dato.** Es la cerradura de la puerta. Aunque alguien arme la
  peticion a mano con Postman, el servidor la rechaza.
- **En el front, para no ofrecer lo que no se puede usar.** Es no pintarle la puerta a quien no
  tiene llave. Mostrar un boton que siempre responde "No cuenta con los permisos" es mala
  experiencia, y la HU lo exige explicito: el que no tiene permiso **no ve** la opcion.

Una sin la otra falla: solo front = cualquiera entra por la API; solo back = el usuario ve botones
que no funcionan.

## 2. Como funciona

En el AIO **el permiso es una URL de menu**, no un nombre ni un rol:

```
usuario → sus roles → fila en permissions (role_id, menu_id) → la bandera de la accion en true
                                               ↑
                                  menus.url = '/respel/x'
```

Cuatro acciones, cuatro columnas booleanas: `create`, `read`, `update`, `delete`.

**Backend** — cada ruta declara la URL y la accion:
`->middleware('permission:/respel/x,' . Permissions::READ)`. Declarar la variable
`$permissionMiddleware` no protege nada: **solo protege la ruta que la invoca**.

**Front** — la misma URL es el `subject` de CASL:
- La pagina: `definePage({ meta: { subject: '/respel/x', action: 'read' } })`.
- Un boton u opcion: `v-if="$can('read', '/respel/x')"`.

**Si las dos URLs no coinciden caracter por caracter**, el usuario entra a la pagina y el listado
responde 403, o no ve nada.

**De donde sale el menu**: `database/initialData/menus/<app>.json` → `MenusSeeder` (crea por
`name` + modulo, con `firstOrCreate`) → `PermissionsSeeder` (le da las cuatro acciones **solo al rol
1, Administrador**). Los despliegues de desa/qa/prod corren `db:seed --force`, asi que un menu
**nuevo** llega solo. Renombrar o cambiar la URL de uno existente **no**: eso va por migracion.

**El `name` del menu es una clave de traduccion.** Sin la clave en `es.json` y `en.json`, el menu y
la pantalla de Roles y Permisos muestran el texto tecnico crudo.

## 3. Como se ve en este repo

| Proyecto | Ejemplo | Nota |
|---|---|---|
| aio | `routes/api/v0/Modules/Respel/job_classifications.php:8-24` | Una URL por archivo y una accion por ruta. Ojo: la linea 25 **no** tiene permiso |
| aio | `app/Http/Middleware/CheckPermissionsMiddleware.php:30-42` | El middleware: parte `url,accion` y pregunta a `PermissionCheckerService` |
| aio | `database/initialData/menus/respel.json:195-206` | La entrada de menu de Clasificacion de Trabajo |
| aio | `docs/arquitectura/permisos-por-url.md` | Las trampas: URLs duplicadas, renombrar crea otro menu, el front no filtra `active` |
| aio-app | `src/pages/respel/job-classifications/index.vue` | `definePage` con el `subject` de la pagina |
| aio-app | `src/views/pages/respel/clients/ClientTable.vue:835-855` | Las opciones del menu de tres puntos, cada una con su `$can` y el filtro por modo `client` |
| aio-app | `src/components/dialogs/AddEditRoleDialog.vue:52, 363` | La pantalla de permisos traduce `name` con `t(...)`: de ahi la clave de i18n |

## 4. Errores tipicos

- **Ruta sin `->middleware(...)`.** La variable existe pero la ruta queda abierta a cualquier
  usuario autenticado.
- **URL distinta entre back y front.** Un guion, una `s` de mas, `operation` vs `operations`.
- **Accion equivocada.** Un boton que se muestra con `update` y llama una ruta que pide `delete`: se
  ve habilitado y responde 403.
- **Copiar un archivo de rutas y arrastrar el permiso de otro recurso.** Concede de mas y bloquea
  de menos a la vez (paso con `issues`).
- **Olvidar la traduccion del `name`.** El permiso aparece como `clientOperationCosts` y el
  administrador no sabe que esta concediendo.
- **Esconder en el front y olvidar el back**, o al reves.
- **Proteger la anulacion con `delete`.** Anular no borra: cambia `active`, asi que es `update`. Con
  `delete` habria que conceder la casilla de borrar a quien solo debe anular. Salio en el ticket
  11308, junto con la idea de que el rechazo es un 404: es un error con el mensaje «No cuenta con los
  permisos necesarios.»

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 11308 | aio | Menu y permiso nuevos `/respel/client-operation-costs`; opcion condicionada en el menu del cliente; clave de i18n del permiso | — |

## Preguntas de cierre

1. La opcion «Costos de Operacion» del cliente se esconde con `$can`. Si solo haces eso y no
   proteges las rutas, ¿que puede pasar? ¿Y si proteges las rutas pero no escondes la opcion?
2. Asigna la accion (`create`, `read`, `update`, `delete`) a cada endpoint: `get-all`, `store`,
   `show`, `update`, `export-data`, `get-select-data`, y la **anulacion**. ¿Cual es la que mas se
   presta a duda y por que?
3. El menu nuevo llega por `respel.json` + seeders. ¿Hace falta ademas una migracion? ¿En que caso
   si haria falta?
