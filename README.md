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
| Documentar una regla de negocio del back | `/update-tech-docs` |
| Actualizar el manual de usuario | `/update-manual` |
| Redactar un control de cambios | `/gen-changes-controls` |
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
| `fullstack-ticket` | Ticket que cruza front y back, con contrato fijado antes de codificar | `<proy>/stack/` |
| `update-manual` | Manual de usuario: capturas reales con Chrome y copia al repo del manual | `<proy>/manual/` |
| `update-tech-docs` | Reglas de negocio en el `docs/` del backend | `<proy>/docs/` |
| `gen-changes-controls` | Texto del control de cambios de un desarrollo ya hecho | — |
| `sync-brain` | Contrastar el `.claude/` de un repo contra el cerebro y decidir que absorber | — |

### Hooks

| Hook | Cuando | Que hace |
|---|---|---|
| `claude-upstream-notice` | Despues de `git pull`/`merge`/`rebase` | Si el `.claude/` del repo cambio, lo avisa y arranca `sync-brain` |
| `docs-on-push` | Despues de `git push` | Avisa si quedo documentacion sin actualizar, tecnica o de manual |

Ninguno bloquea. Los dos avisan una sola vez por version.

### Agentes

| Agente | Modelo | Para que |
|---|---|---|
| `branch-starter` | Sonnet | La parte mecanica del arranque: actualizar ramas y crear la rama |

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
| `secrets.env` | Credenciales. Permisos 600 y **fuera del control de versiones** |
| `skills/` | Skills transversales |
| `agents/` | Subagentes |
| `hooks/` | Disparadores |
| `brain/projects.json` | Que repos componen cada proyecto. **Registro unico** |
| `brain/lib/` | Motores compartidos: proyectos, secretos, upstream, enchufe |
| `brain/projects/<proy>/` | Perfiles: `manual/`, `stack/`, `docs/`, `skills/local-*` |
| `brain/upstream/` | Foto del `.claude/` de cada repo en su ultima revision |
| `projects/<repo>/memory/` | Conocimiento por repo, que Claude recuerda solo |

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
cerebro push backup main            # respaldo
```

**Respaldo:** remoto `backup` en `/datos/backups/claude-brain.git`, un repo bare en otra particion.
No protege de perder el disco, si de borrar `~/.claude` por accidente o de una mezcla mal hecha.

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
