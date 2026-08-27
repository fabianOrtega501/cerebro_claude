# AIO — notas del stack full-stack

Lo específico del AIO para trabajar un ticket que cruza `aio-app` y `aio-backend`. El
procedimiento general está en `~/.claude/skills/fullstack-ticket/SKILL.md`.

El contrato entre los dos repos —los tres ejes, el mapa de carpetas, las trampas de nombres—
está en `docs/contrato-backend.md`, **dentro de cada repo** (hay dos copias idénticas).
**Tenlo presente desde la fase 3**: esas notas son los pasos, no el conocimiento.

## Encuadrar: preguntas que deciden si toca los dos lados

- ¿Hay un dato nuevo o cambia uno existente? → toca backend.
- ¿Cambia lo que el usuario ve o hace? → toca frontend.
- ¿Aparece una pantalla, pestaña o acción nueva? → toca **permiso** (fila en `menus` +
  `permissions`), que es lo que más se olvida.
- ¿Cambia la forma de una respuesta que ya existe? → hay que buscar **todos** los consumidores,
  incluido `app-movil`.

## Reconocimiento

En el backend, para una entidad `Foo` del módulo `Bar`:

```bash
ls "$AIO_BACKEND"/app/Http/Controllers/Modules/Bar/Foo/ \
   "$AIO_BACKEND"/app/Services/Modules/Bar/Foo/ \
   "$AIO_BACKEND"/app/Models/Modules/Bar/ 2>/dev/null
grep -rn "prefix('/foos'" "$AIO_BACKEND"/routes/
```

En el front, el módulo equivalente: `src/models/`, `src/services/`, `src/views/pages/` y
`src/pages/`. **Ojo con las dos trampas de nombres** (`Operation`→`operations`,
`DocumentaryFilm`→`document-manager`): están en el contrato.

## Qué fijar en el contrato

| Qué | Detalle |
|---|---|
| Recurso | `kebab-case` plural, el mismo string en el `Route::prefix` y en el `$api(...)` |
| Endpoints | Verbo + path + qué recibe + qué devuelve |
| Campos | Nombre `snake_case`, tipo, obligatoriedad, valor por defecto |
| Permiso | El subject exacto — misma cadena en `permission:` del back y en `subject:` del front |
| Respuesta | Qué entra en `data` y si el listado es paginado (`meta`) |

## Backend — lo que más se olvida, en orden de frecuencia

1. **La fila del permiso.** Sin ella el endpoint es inaccesible incluso para un administrador.
2. **La profundidad de carpetas.** `ServiceBindingServiceProvider` escanea con `depth == 3`: un
   archivo mal ubicado no se vincula y **falla en runtime, en silencio**.
3. **Filtrar por `company_id`.** No hay global scope; un listado sin filtro expone datos de otras
   empresas.
4. **`active`, no `SoftDeletes`.**
5. **Tests Feature del módulo.** Son gate obligatorio del CI: sin ellos el MR no pasa.

## Frontend — dos caminos que no se mezclan

**Caso A — recurso, CRUD o módulo nuevo.** Empieza por el `*Model.json` en
`src/models/<modulo>/<recurso-plural>/` y genera con `pnpm CreateResourceFlow`. **Ese generador
es el motor del estándar del equipo**: produce la interface, el service y la vista con la misma
forma que tiene todo lo demás del repo. Escribir esos archivos a mano da un recurso que se ve
distinto al resto y hay que corregirlo después.

**Caso B — ajuste sobre algo que ya existe.** Un campo más, una validación, una columna en la
tabla, un estado nuevo, un botón. **Aquí no se entra a `CreateResourceFlow`.** El generador crea
recursos; volver a correrlo sobre uno existente no es el camino. Se editan los archivos que ya
están: el `*Model.json` si cambian campos, headers o reglas —y de ahí salen las validaciones—,
más la interface, el service y la vista.

En la duda, es caso B: los tickets de ajuste son mucho más frecuentes que los de recurso nuevo.

Para los dos casos:

1. **Nunca llamar a la API desde un componente**: siempre una clase en `src/services/`.
2. **El `subject` del `definePage` es la cadena del contrato**, carácter por carácter.
3. Textos por i18n. Reutilizar `src/components/Standard/`. Sin `console.log`.

## El verificador

```bash
node ~/.claude/brain/projects/aio/stack/check-contract.mjs --resource <recurso>
```

Corre desde cualquier sitio: las rutas de los dos repos salen de `stack.json`. Sale `0` si cada
llamada del front tiene ruta en el back y cada subject tiene permiso.

| Señal | Qué significa |
|---|---|
| `✗ llamada sin ruta` | El front llama un endpoint que no existe → 404 |
| `✗ subject sin permiso` | Falta la fila en `menus` → 403 o pantalla vacía |
| `⚠ permiso sin fila en menus` | El endpoint no lo alcanza nadie. **Puede ser tu base local sin sembrar**: contrastar antes de actuar |
| `ℹ llamada dinámica` | URL construida en runtime, no verificable estáticamente: revisar a mano |

Es estático y **no sustituye probar contra el backend corriendo**.

## Cierre

- Mismo prefijo de ticket en los dos repos: `0010461: SOFTWARE - AIO: <descripción>`.
- Si el backend cambió una regla de negocio, un estado o una integración, su documentación va
  **en el mismo MR** (`aio-backend/docs/`). Usa la skill `update-tech-docs`; el estándar completo
  está en `aio-backend/docs/README.md` y es normativo.
- Si cambió algo que el usuario ve, **ofrecer la skill `update-manual`** del cerebro (funciona
  desde cualquiera de los dos repos, a diferencia de la copia `update-web-manual` que solo está
  en el front).

## Las copias del repo

`aio-app` y `aio-backend` traen una copia propia de `develop-fullstack-ticket`, duplicada entre
ellos, con su propio `check-contract.mjs`. Son del equipo y se quedan como están.

**Esta versión del cerebro es la que usamos.** Si un pull trae cambios en aquellas, el hook
`claude-upstream-notice` avisa y `sync-brain` decide si vale la pena absorber algo.
