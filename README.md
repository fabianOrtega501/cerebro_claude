# El cerebro

Configuracion propia de Claude Code. Vive en `~/.claude`, es un **repo git local** (sin GitLab) y
la comparten **todos los proyectos**: AIO, AMI, Epsilon, Status, SIPA, Ruta+, manuales.

**Principio unico: el cerebro manda.** Los repos de trabajo traen su propio `.claude/` con skills
del equipo. Eso es una fuente de ideas, no una autoridad. El flujo va siempre **repo -> cerebro**,
nunca al reves, y nada se absorbe sin aprobacion.

---

## Empezar aqui

| Quiero... | Escribe |
|---|---|
| Arrancar un desarrollo | `/start-development` (o con datos: `/start-development aio feature desa 10842 Descripcion`) |
| Trabajar un ticket que toca front y back | `/fullstack-ticket aio` |
| Hacer el ticket como ejercicio, con clase primero | `/practice-ticket` |
| Cerrar el desarrollo y subirlo | `/finish-development` |
| Documentar una regla de negocio del back | `/update-tech-docs` |
| Actualizar el manual de usuario | `/update-manual` |
| Redactar un control de cambios | `/gen-changes-controls` |
| Armar el set de pruebas | `/gen-test-set` |
| Armar la diapositiva del sprint | `/gen-sprint-summary` |
| Ver que trajo el equipo en su `.claude/` | `/sync-brain` |

Nada mas hay que configurar. Todo lo de abajo es para cuando quieras **cambiar** como funciona.

**Como se encadenan entre si:** [FLUJO.md](FLUJO.md), con el mapa mental.

---

## 1. Las tres piezas, en simple

**Skill = una receta.** Instrucciones con pasos que Claude sigue. No se ejecuta sola: la invocas
con `/nombre`, o Claude la carga cuando la situacion encaja con su `description`.

**Hook = un disparador automatico.** Un comando que ejecuta el programa —no Claude— siempre en
cierto momento: al terminar un turno, despues de un `git push`. No depende de que nadie se acuerde.

**Agente = un ayudante aparte.** Otra instancia de Claude, con su propio contexto y su propio
modelo, que hace una tarea y devuelve solo el resultado.

> **skill = que hacer · hook = cuando dispararlo · agente = quien lo hace aparte**

El reparto que se repite en todo el cerebro: **el hook detecta, la skill ejecuta.** Un hook nunca
escribe codigo ni documentacion; avisa y se aparta.

---

## 2. Que hay hoy

### Skills

| Skill | Para que | Perfil por proyecto |
|---|---|---|
| `start-development` | Checklist de arranque: proyecto, ramas al dia, crear rama, enunciado | usa `projects.json` |
| `practice-ticket` | El ticket como ejercicio: clase primero, despues el usuario teclea y Claude guia | `brain/learning/` |
| `fullstack-ticket` | Ticket que cruza front y back, con contrato fijado antes de codificar | `<proy>/stack/` |
| `finish-development` | Cierre: limpiar, verificar, commitear, integrar la base y hacer push | usa `projects.json` |
| `update-manual` | Manual de usuario: capturas reales con Chrome y copia al repo del manual | `<proy>/manual/` |
| `update-tech-docs` | Docblocks de las funciones tocadas y reglas de negocio en el `docs/` del backend | `<proy>/docs/` |
| `gen-changes-controls` | Texto del control de cambios de un desarrollo ya hecho | — |
| `gen-test-set` | Set de pruebas manual, sacado del diff de la rama | — |
| `gen-sprint-summary` | La diapositiva del sprint: texto y PNG, desde las ramas de los ultimos dias | — |
| `exploration-memory` | El mapa tecnico de un modulo, para no releer el mismo codigo cada ticket | `<proy>/exploration/` |
| `explore-module` | Decide si vale la pena mapear un modulo y coordina al explorador | `<proy>/exploration/` |
| `manage-memory` | Decide si un hecho se guarda, si es del equipo o propio, y donde | — |
| `sync-brain` | Contrastar el `.claude/` de un repo contra el cerebro y decidir que absorber | — |

`start-development` y `finish-development` son pareja: abren y cierran el mismo desarrollo. Las
tres `gen-*` son **manuales**: no se disparan solas nunca.

### Hooks

| Hook | Cuando | Que hace |
|---|---|---|
| `claude-upstream-notice` | Despues de `git pull`/`merge`/`rebase` | Si el `.claude/` del repo cambio, lo avisa y arranca `sync-brain` |
| `docs-on-push` | Despues de `git push` | Avisa si quedo documentacion sin actualizar, tecnica o de manual |
| `brain-unpushed-notice` | Al terminar una respuesta | Avisa si el cerebro tiene algo sin commitear o sin subir a `backup`/`github` |
| `i18n-keys-guard` | Antes y despues de editar un locale | **Deniega** la clave intercalada y la que repite un texto que ya existe; avisa de JSON roto y de paridad |
| `practice-unrecorded-notice` | Al terminar una respuesta | Avisa si un ticket de practica se cerro sin registrar sus temas en el temario |

Todos menos uno no bloquean: detectan y se apartan. **`i18n-keys-guard` si deniega**, y es la
excepcion a proposito: una clave intercalada o un texto duplicado no se arreglan avisando, porque
para cuando el aviso se lee ya entraron al archivo. Solo deniega lo mecanico —donde quedo la clave
y si su texto ya existia—; la paridad entre idiomas avisa y nunca bloquea. Los dos primeros avisan una sola vez por version; el tercero, una sola vez por
estado: mientras no cambie lo pendiente, no repite.

### Agentes

| Agente | Modelo | Para que |
|---|---|---|
| `branch-starter` | Sonnet | La parte mecanica del arranque: actualizar ramas y crear la rama |
| `build-runner` | Sonnet | Builds, tests, migraciones y seeders: devuelve solo el veredicto, no el listado |
| `module-explorer` | Sonnet | Mapea un modulo leyendo los dos repos, en solo lectura. Devuelve el veredicto; el mapa queda en el archivo |

Una skill **no puede** cambiar el modelo de la sesion; solo `/model` lo hace. Un subagente si corre
en el modelo que se le indique, y de ahi sale el reparto: lo mecanico en Sonnet, el analisis en la
sesion principal.

### Statusline

Muestra **modelo │ proyecto │ rama**. Opus sale en amarillo y Sonnet en verde: el color dice
*caro/barato*, no bueno/malo. Las ramas protegidas (`desa`, `qa`, `prod`, `main`) en rojo.

---

## 3. El mapa

| Ruta | Que es |
|---|---|
| `CLAUDE.md` | Reglas y preferencias. **Se carga en todas las sesiones, de todos los proyectos** |
| `settings.json` | Permisos, hooks y statusline |
| `statusline.mjs` | La barra de estado: modelo, proyecto y rama. La invoca `settings.json` |
| `hooks/i18n-keys-guard.mjs` | Guarda de traducciones. Transversal: no necesita perfil por proyecto |
| `secrets.env` | Credenciales. Permisos 600 y **fuera del control de versiones** |
| `skills/` | Skills transversales |
| `agents/` | Subagentes |
| `hooks/` | Disparadores |
| `brain/projects.json` | Que repos componen cada proyecto. **Registro unico** |
| `brain/lib/` | Motores compartidos: proyectos, secretos, upstream, enchufe |
| `brain/projects/<proy>/` | Perfiles: `manual/`, `stack/`, `docs/`, `skills/local-*` |
| `brain/upstream/` | Foto del `.claude/` de cada repo en su ultima revision |
| `brain/projects/<proy>/exploration/` | Mapa tecnico por modulo: donde esta cada endpoint, permiso y servicio |
| `brain/learning/` | Modo practica: lecciones, temario y bitacoras |
| `brain/sprints/` | El texto de la retrospectiva de cada sprint |
| `brain/testing/pending.md` | Cola de desarrollos cerrados con el set de pruebas pendiente |
| `projects/<repo>/memory/` | Memorias **propias** del repo, mas enlaces a las del equipo. Las enlaza `plug.mjs` |
| `<repo>/.claude/memory/` | Memorias **del equipo**: viven en el repo, versionadas. Unica cosa que el cerebro escribe ahi |

Lo demas que hay en `~/.claude` lo escribe Claude Code y **no se versiona**.

---

## 4. Transversal o de proyecto

Es la decision que mas se repite al agregar algo.

**Transversal** si sirve igual en dos proyectos que no comparten codigo. Va en `skills/` y se ve
en todas partes.

**De proyecto** si menciona rutas, modulos, endpoints, contenedores o convenciones de un solo
sitio. Va en `brain/projects/<proy>/skills/`, con el nombre empezando por **`local-`**, y se
enchufa con:

```bash
node ~/.claude/brain/lib/plug.mjs            # todo
node ~/.claude/brain/lib/plug.mjs aio        # un proyecto
node ~/.claude/brain/lib/plug.mjs --status   # solo reporta
```

El prefijo `local-` no es cosmetico: es lo que hace que el git del repo **no la vea**. Las
exclusiones estan en `.git/info/exclude` de cada repo —local, no versionado— para no ensuciarle
el `.gitignore` al equipo.

**En la duda, transversal.** Bajar una skill a un proyecto es mover una carpeta; subirla es
reescribirla para quitarle lo especifico.

### El patron de "motor + perfil"

`update-manual`, `fullstack-ticket` y `update-tech-docs` son transversales pero necesitan saber de
cada proyecto. En vez de duplicarlas: el procedimiento vive una vez en `skills/`, y lo especifico
en un perfil bajo `brain/projects/<proy>/`.

Agregar un proyecto a cualquiera de ellas es **escribir su perfil**. Si al hacerlo hace falta tocar
el motor, casi siempre significa que lo que estas metiendo ahi es conocimiento que va en el perfil.

---

## 5. Proyecto nuevo

1. Agregarlo a `brain/projects.json` con sus repos.
2. `node ~/.claude/brain/lib/plug.mjs <proyecto>`

Eso escribe las exclusiones locales, enchufa las skills que tenga y fija la linea base de upstream.
Es idempotente: se puede repetir sin dano.

Los perfiles (`manual/`, `stack/`, `docs/`) se agregan cuando hagan falta, no antes. Hay plantilla
en `brain/projects/_template/`.

---

## 6. Versionamiento

Git normal, solo que **local**. Historial, diffs, ramas y revert; lo unico que no hay es servidor.

```bash
alias cerebro='git -C ~/.claude'    # comodo para el dia a dia

cerebro status
cerebro log --oneline
cerebro add -A && cerebro commit -m "..."
cerebro push backup main            # respaldo local
cerebro push github main            # respaldo remoto
```

**Dos respaldos, porque protegen de cosas distintas:**

| Remoto | Donde | De que protege |
|---|---|---|
| `backup` | `/datos/backups/claude-brain.git` (repo bare, otra particion) | Borrar `~/.claude`, una mezcla mal hecha |
| `github` | `github.com/fabianOrtega501/cerebro_claude` (privado) | Perder el disco: las dos particiones son del mismo NVMe |

El hook `brain-unpushed-notice` avisa cuando falta subir a cualquiera de los dos, se este
trabajando en el repo que se este.

- Restaurar: `git clone /datos/backups/claude-brain.git` y copiar encima.
- Deshacer: `cerebro revert <sha>`.
- Probar algo arriesgado: `cerebro switch -c prueba`, y si no sirve se borra.

**Commitear al absorber o cambiar algo.** Sin commit no hay como volver atras.

### Que se versiona

El `.gitignore` es una **lista blanca**: `/*` ignora todo y se rescata lo justo. Claude Code agrega
carpetas con cada version; con lista negra, tarde o temprano se colaria `.credentials.json` o los
cientos de MB de transcripciones. Para versionar algo nuevo hay que rescatarlo a mano. Es a
proposito.

---

## 7. Credenciales

Van en `~/.claude/secrets.env`, con permisos 600 y fuera del control de versiones.

```
AIO_TEST_EMAIL=...
AIO_TEST_PASSWORD=...
```

**Nunca dentro de un repo**, ni siquiera en un archivo ignorado: un `.gitignore` mal editado, un
`git add -f` o un `git clean -xfd` bastan para exponerlas o perderlas.

Las rutas y puertos si siguen en el `settings.local.json` de cada repo, que es donde tienen sentido.

---

## 8. Cuando un pull trae cambios en el `.claude/` de un repo

El hook `claude-upstream-notice` lo detecta y arranca `sync-brain`, que clasifica cada cambio en
**Aporta / Mejora / Choca / Del repo / Ruido** y recomienda. Absorber es siempre decision tuya, y
va en una sola direccion: repo -> cerebro.

Al terminar hay que cerrar la revision, o el aviso se repite:

```bash
node ~/.claude/skills/sync-brain/lib/settle.mjs reviewed [repo]    # decidido
node ~/.claude/skills/sync-brain/lib/settle.mjs dismissed [repo]   # no interesa esta version
```

---

## 9. Reglas al agregar cosas

- **Idioma:** nombres de skill, archivo, funcion y variable **en ingles**; comentarios, JSDoc y el
  cuerpo del `SKILL.md`, **en espanol**.
- **Documentar funciones: maximo 3 renglones.** Que hace, y entradas y salidas cuando la firma no
  las explique. El detalle esta en `CLAUDE.md`. *(El codigo que ya existe no cumple esta regla; se
  escribio antes. No lo tomes como ejemplo.)*
- Una skill es un **procedimiento con pasos**. Si es conocimiento sin pasos, va en `CLAUDE.md` o en
  el `NOTES.md` de un perfil.
- La `description` del frontmatter dice **cuando** usar la skill, no que hace: es lo unico que
  Claude ve para decidir si la carga.
- Los scripts de una skill viven **dentro de su carpeta**. Nunca en el `src/` de un proyecto ni en
  su `package.json`.
- **Nada de rutas absolutas ni credenciales** en lo que se versiona.
- **Nunca escribir desde aqui hacia el `.claude/` de un repo de trabajo.**

---

## 10. Si algo no funciona

**Cambie un hook, un agente o la statusline y no pasa nada.** Se leen al arrancar: reinicia la
sesion. Las skills si se recogen en caliente.

**Una skill no aparece.** Tiene que estar en `skills/<nombre>/SKILL.md` con frontmatter `name` y
`description`. Si es de proyecto, ademas enchufada con `plug.mjs`.

**Un script no encuentra una variable.** El orden es: entorno -> `secrets.env` -> el
`settings.local.json` del repo -> `settings.json`. Las credenciales solo salen de `secrets.env`.

**Un flujo del manual falla esperando el login.** Casi seguro hay un navegador huerfano ocupando el
9222 (con Chrome de snap no se pueden matar por senal):

```bash
node ~/.claude/skills/update-manual/lib/close-orphans.mjs
```

**Que proyecto ve Claude desde aqui:** `node ~/.claude/brain/lib/projects.mjs`
