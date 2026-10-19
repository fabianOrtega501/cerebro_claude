---
name: sync-brain
description: Usar cuando el `.claude/` de un repo de trabajo o los plugins de main-brain traen cambios que no se han contrastado contra el cerebro propio (~/.claude) — tipicamente despues de un `git pull` de `desa` o de un `fetch` de main-brain, cuando el hook lo avisa, o cuando el usuario pide revisar que trajo el equipo ("sincroniza el cerebro", "que hay nuevo en main-brain"). Baja los cambios de main-brain, clasifica lo que llego, recomienda que vale la pena absorber y solo mezcla lo que el usuario apruebe. Para enviar cambios propios a main-brain esta `contribute-main-brain`.
---

# sync-brain

Contrastar lo que trae el equipo contra el cerebro propio y decidir que se absorbe. Hay dos fuentes:

| Fuente | Que se vigila | Donde se declara |
|---|---|---|
| El `.claude/` de cada repo de trabajo | Memorias, flujos del manual, skills propias del proyecto, hooks, `settings.json`: lo que el estandar del equipo deja en el repo | Todos los repos de `brain/projects.json` |
| **main-brain** (`/datos/proyectos/main-brain`) | `plugins/` y `.claude-plugin/` de la rama del remoto en `upstream.ref`: **`origin/qa` mientras sea la base, despues `origin/prod`** | El proyecto `main-brain` de `brain/projects.json` |

**Se sigue trabajando en el cerebro.** main-brain es una fuente de cambios a revisar, no un reemplazo.

## Principio que no se negocia

**El cerebro propio (`~/.claude`) manda siempre.** Lo del repo es una propuesta, no una orden.
El flujo de esta skill es en una sola direccion: **repo o main-brain -> cerebro**. Nunca se escribe
dentro del `.claude/` de un repo de trabajo ni en main-brain desde aqui, y nunca se absorbe nada sin
aprobacion explicita. Lo que va del cerebro a main-brain es trabajo de `contribute-main-brain`.

Si algo del repo choca con algo propio, gana lo propio por defecto. Solo se cambia si el usuario
lo dice despues de ver la comparacion.

## Procedimiento

### 1. Levantar los hechos

```bash
node ~/.claude/skills/sync-brain/lib/report.mjs [ruta-del-repo]   # el .claude/ de un repo
node ~/.claude/skills/sync-brain/lib/report.mjs main-brain        # baja y revisa main-brain
```

Sin argumento usa el directorio actual. **Cuando el usuario pide sincronizar sin decir que,
se revisa main-brain y ademas el repo actual si tiene cambios.** Devuelve JSON con:

- `watch`: que se vigila (`ref`, `paths`) y si es una rama del remoto (`remote`).
- `fetched`: en main-brain el informe hace `git fetch` antes de comparar. `true` si bajo bien;
  `false` si fallo (sin red o sin VPN): se compara contra lo ultimo que se bajo y se dice. `fetch`
  no toca el directorio de trabajo del clon.
- `status`: `changed` (hay algo sin revisar), `clean`, `dismissed` o `unwatched` (sin linea base).
- `entries[]`: un registro por archivo que difiere de la ultima revision, con `change`
  (`added` / `modified` / `removed`), `piece` (la skill o el agente: `nombre` en un repo,
  `plugin:nombre` en main-brain) y `overridden_by_brain`. En un repo, el cerebro tiene una skill
  con ese nombre; en main-brain, `brain_equivalents` lista que piezas del cerebro le corresponden
  segun `brain/main-brain.json`.
- `plugins[]` (solo main-brain): por plugin tocado, `installed`, `version_before`, `version_now`
  y `changelog_added`, las lineas nuevas del CHANGELOG.
- `merged_contributions[]` (solo main-brain): aportes propios que ya entraron en la rama vigilada.
- `git_changes`: el `--name-status` de git desde la ultima revision, util para dar contexto.

Si `status` es `unwatched`, el repo no tiene linea base: es la primera vez. Dilo claramente
antes de listar nada, porque *todo* va a aparecer como nuevo y eso no significa que el equipo
haya agregado 30 cosas hoy.

### 2. Leer lo que cambio de verdad

El informe dice **que** archivos cambiaron, no **si valen la pena**. Eso hay que leerlo:

- Para cada skill nueva o modificada, lee su `SKILL.md`. La `description` del frontmatter dice
  para que sirve; el cuerpo, si el procedimiento aporta algo que no tengas.
- Para hooks nuevos, lee el archivo y mira en que evento se registra en el `settings.json` del
  repo. Un hook que bloquea merece mas atencion que uno que solo avisa.
- Cambios de `settings.json` del repo: normalmente son permisos. Casi nunca vale la pena
  copiarlos al cerebro, porque los permisos del repo ya aplican estando en el repo.
- Ignora ruido: reformateos, correcciones de tildes, renombres sin cambio de fondo.

### 3. Clasificar y recomendar

Presenta al usuario una tabla corta, una fila por cambio relevante, con estas categorias:

| Categoria | Que significa | Recomendacion por defecto |
|---|---|---|
| **Aporta** | Capacidad nueva que el cerebro no tiene y sirve mas alla de este repo | Absorber |
| **Mejora** | Toca algo que ya tienes propio, y la version del repo resuelve algo mejor | Absorber solo esa parte, no el archivo entero |
| **Choca** | Compite con algo propio (`overridden_by_brain: true`) sin aportar | Dejar como esta; lo propio gana |
| **Del repo** | Solo tiene sentido dentro de ese proyecto (rutas, modulos, endpoints suyos) | No absorber; ya funciona estando en el repo |
| **Ruido** | Formato, comentarios, cosas sin efecto | Ni mencionar en detalle, resumir en una linea |

Para cada fila: **una frase** de por que, y que ganaria el usuario. Nada de volcar diffs
completos salvo que los pida.

Cierra con una recomendacion clara: que absorberias tu y que no. No presentes un menu neutro.

**En main-brain, ademas, se agrupa por plugin** y se dice primero su version y el CHANGELOG
nuevo: es el resumen que el autor escribio de su cambio. Despues, segun el caso:

| Caso | Que se hace |
|---|---|
| **Plugin instalado** (`installed: true`) | No se copia nada: se ofrece actualizarlo. Solo llega si subio `version`; si cambio el codigo sin subirla, se dice, porque nadie lo va a recibir |
| **Plugin no instalado** | Se leen los cambios y se clasifican con la tabla de arriba contra `brain_equivalents`. Lo aprobado se lleva **a mano** a las piezas del cerebro |
| **Plugin o skill nueva** | Se presenta para decidir: instalar, absorber ideas o ignorar. Si se absorbe o se instala, se agrega a `equivalents` |
| **Aporte propio que volvio** (`merged_contributions`) | Se reconoce como propio y no se propone absorberlo |

### 4. Absorber solo lo aprobado

Espera la decision. Cuando el usuario diga que si a algo concreto:

- Skill nueva -> copiarla a `~/.claude/skills/<nombre>/`.
- Mejora puntual sobre algo propio -> editar el archivo propio a mano, tomando solo la idea.
  **No sobrescribir el archivo propio con el del repo**: se perderia lo que ya adaptaste.
- Hook -> copiar a `~/.claude/hooks/` y registrarlo en `~/.claude/settings.json`. Verificar
  que el hook no dependa de rutas del repo; si depende, adaptarlo o descartarlo.
- Regla o convencion que no es codigo -> a `~/.claude/CLAUDE.md`.

En main-brain, con el mismo cuidado:

- **Plugin instalado** -> `claude plugin marketplace update main-brain` y
  `claude plugin update <plugin>@main-brain`; el cambio se ve en una sesion nueva o con
  `/reload-plugins`.
- **Plugin no instalado** -> se edita la pieza propia, tomando solo la idea. Nunca se copia un
  archivo del plugin encima de uno propio.
- **Aporte propio** -> en `brain/main-brain.json`, su `status` pasa de `pending` a `merged`.
- **Mapa de equivalencias** -> si una skill del equipo empieza a corresponder a una pieza propia,
  se agrega en `equivalents`, para que la proxima revision la relacione sola.
- **La rama local del clon** queda donde estaba: el informe compara contra la rama del remoto.
  Si el usuario quiere el clon al dia, se le ofrece `git -C /datos/proyectos/main-brain pull --ff-only`
  y solo con el clon limpio y en esa rama.

Despues de copiar, **probar que no rompe nada**: `node --check` sobre cada `.mjs` absorbido.

### 5. Cerrar la revision

Siempre, aunque no se haya absorbido nada:

```bash
# el usuario decidio (absorbio algo o dijo que nada); esta version pasa a ser la linea base
node ~/.claude/skills/sync-brain/lib/settle.mjs reviewed [ruta-del-repo | main-brain]

# no le interesa esta version pero quiere seguir comparando contra la revision anterior
node ~/.claude/skills/sync-brain/lib/settle.mjs dismissed [ruta-del-repo | main-brain]
```

En main-brain la foto se toma de la rama vigilada, no del directorio de trabajo: las ramas
`feature/*` que el usuario tenga abiertas en el clon nunca cuentan como cambios del equipo.

Sin este paso el hook vuelve a avisar en el proximo pull. Es a proposito: una revision a medias
no debe darse por hecha.

`settle.mjs` corre **Doctor** al final, siempre (`brain/lib/doctor.mjs`). No se salta ni se
corre aparte: la sincronizacion no esta cerrada hasta leer su diagnostico.

### 5b. Revisar la coherencia de lo absorbido

Doctor revisa lo mecanico —hooks vivos, README al dia, secretos, memorias—, pero no ve una regla
que contradice a otra. Eso se revisa aqui, **solo sobre lo que se absorbio en esta
sincronizacion** (`git -C ~/.claude diff` y los archivos nuevos):

- ¿Alguna instruccion absorbida choca con el `CLAUDE.md` del cerebro? Ejemplos que ya pasaron:
  una skill que commitea sin pedir permiso, un docblock largo, credenciales en `settings.json`.
- ¿Duplica algo que ya existe con otro nombre (una skill, un hook, una memoria)?
- ¿Menciona rutas, contenedores o nombres del repo de origen que en el cerebro no existen?

Cada hallazgo se cuenta al usuario con la correccion propuesta. No se corrige por cuenta propia.

### 6. Dejar historia

El cerebro es un repo git local. Si se absorbio algo, **proponer** el commit, con este orden y
sin saltarse ninguno:

1. El diagnostico de Doctor ya se leyo (paso 5) y la coherencia se reviso (paso 5b).
2. Se le muestra al usuario el resumen: que se absorbio, que dijo Doctor y el mensaje propuesto.
   **Si Doctor dio errores, se dicen antes de pedir nada**, y el usuario decide si se corrigen
   primero o se commitea igual.
3. Solo con su si:

```bash
git -C ~/.claude add <archivos absorbidos> && git -C ~/.claude commit -m "Absorb <que> from <repo>"
```

Solo los archivos de esta absorcion, nunca `git add -A`: otra sesion puede tener cambios a medias
en el cerebro. Mensaje en ingles, descriptivo, diciendo de donde vino. Sin este commit no hay como revertir
una mezcla que salio mal, que es justo lo que este repo existe para permitir. El push a los dos
remotos se ofrece aparte y tambien espera su si.

## Trampas conocidas

- **La foto excluye `settings.local.json`** a proposito: es local, tiene credenciales y no se
  versiona. No lo compares ni lo copies nunca al cerebro.
- **Una skill del repo con el mismo nombre que una propia no se usa en ese repo**: el nivel
  personal (`~/.claude/skills/`) tiene prioridad sobre el de proyecto, asi que manda la propia
  sin hacer nada.
- **Nunca metas nada del cerebro en un commit del repo de trabajo.** Si un cambio se te fue al
  staging del repo, sacalo antes de seguir.
- **La primera revision de main-brain** sale `unwatched` y con todo como nuevo: es su linea base,
  no 30 cambios de hoy. Se resume por plugin y se fija con `settle.mjs reviewed main-brain`.
- **Pasar de `qa` a `prod`** es cambiar `upstream.ref` en `brain/projects.json` y fijar la linea
  base de nuevo: lo que estaba en `qa` y aun no en `prod` ya se reviso.
- **Una skill de un plugin no pisa a una propia**: se cargan las dos, con el prefijo del plugin.
  Por eso un plugin que duplica una skill propia no se instala sin decidir cual se retira.
