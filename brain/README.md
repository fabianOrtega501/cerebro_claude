# El cerebro

Configuracion propia de Claude, viva en `~/.claude`, versionada en un repo git **local**
(no GitLab) y **compartida por todos los proyectos**: AIO, Epsilon, Status, SIPA, Ruta+,
manuales.

El principio: **el cerebro manda**. El `.claude/` que traen los repos de trabajo es una fuente
de ideas, no una autoridad. El flujo es siempre repo -> cerebro, nunca al reves, y nada se
absorbe sin aprobacion.

## Mapa

| Ruta | Que es | Alcance |
|---|---|---|
| `~/.claude/skills/` | Skills **transversales** | Todos los proyectos, sin configurar nada |
| `~/.claude/brain/projects/<proy>/skills/local-*` | Skills **de un proyecto** | Solo los repos de ese proyecto, via symlink |
| `~/.claude/brain/projects/<proy>/manual/` | Perfil del manual: adaptador, modulos, NOTES | Lo carga la skill `update-manual` |
| `~/.claude/brain/projects/<proy>/stack/` | Stack full-stack: repos, comandos, NOTES, verificador | Lo carga la skill `fullstack-ticket` |
| `~/.claude/brain/projects/_template/` | Plantillas para agregar un proyecto | — |
| `~/.claude/projects/<repo>/memory/` | Conocimiento de un repo | Ese repo; Claude lo recuerda solo |
| `~/.claude/CLAUDE.md` | Reglas y preferencias | Todos los proyectos, siempre cargado |
| `~/.claude/hooks/` | Disparadores automaticos | Segun como se registren en `settings.json` |
| `~/.claude/brain/projects.json` | Que repos componen cada proyecto | — |
| `~/.claude/brain/upstream/` | Foto del `.claude/` de cada repo en su ultima revision | — |

## Transversal o de proyecto?

**Transversal** si sirve igual en dos proyectos que no comparten codigo. Control de cambios,
manual web, sync-brain. Van a `~/.claude/skills/` y ya.

**De proyecto** si menciona rutas, modulos, endpoints, contenedores o convenciones de un solo
sitio. Van a `brain/projects/<proy>/skills/`, y **el nombre de la carpeta debe empezar por
`local-`**: ese prefijo es lo que las hace invisibles para el git del repo. Despues:

```bash
node ~/.claude/brain/lib/plug.mjs           # enchufa todo
node ~/.claude/brain/lib/plug.mjs aio       # solo un proyecto
node ~/.claude/brain/lib/plug.mjs --status  # solo reporta, no toca nada
```

En la duda, arranca transversal. Bajar una skill a un proyecto es mover una carpeta; subirla es
reescribirla para quitarle lo especifico.

## Proyecto nuevo

1. Agregarlo a `brain/projects.json` con sus repos.
2. `node ~/.claude/brain/lib/plug.mjs <proyecto>`.

Eso escribe las exclusiones locales en `.git/info/exclude` de cada repo, enchufa las skills que
tenga y fija la linea base de upstream. Es idempotente: se puede repetir sin dano.

## Skills transversales con perfil por proyecto

Dos skills son transversales pero necesitan saber de cada proyecto. En vez de duplicarlas, el
procedimiento vive una vez en `~/.claude/skills/` y lo especifico en un perfil bajo
`brain/projects/<proy>/`:

| Skill | Perfil | Como se invoca |
|---|---|---|
| `update-manual` | `<proy>/manual/` | Deduce el proyecto del repo actual |
| `fullstack-ticket` | `<proy>/stack/` | `/fullstack-ticket <proyecto>`, o deduce del repo actual |

Agregar un proyecto a cualquiera de las dos es escribir su perfil. **El motor no se toca**; si
hace falta tocarlo, lo que estas metiendo ahi es conocimiento que va en el perfil.

## Cuando un pull trae cambios en el `.claude/` del repo

El hook `claude-upstream-notice` lo detecta y arranca la skill `sync-brain`, que clasifica lo
que llego y recomienda. Ver `~/.claude/skills/sync-brain/SKILL.md`.

## Versionamiento

Repo git local en `~/.claude`, rama `main`. Nada sale a GitLab.

```bash
alias cerebro='git -C ~/.claude'    # comodo para el dia a dia

cerebro status                      # que cambio
cerebro log --oneline               # historia
cerebro diff                        # que llevo sin commitear
cerebro add -A && cerebro commit -m "..."
cerebro push backup main            # respaldo
```

**Respaldo**: remoto `backup` en `/datos/backups/claude-brain.git`, un repo bare en otra
particion. No protege de perder el disco entero, pero si de borrar `~/.claude` por accidente,
que es el riesgo real.

Restaurar todo: `git clone /datos/backups/claude-brain.git ~/.claude-restaurado` y copiar
encima. Deshacer una mezcla que salio mal: `cerebro revert <sha>`.

Probar algo arriesgado sin miedo: `cerebro switch -c prueba`, y si no sirve
`cerebro switch main && cerebro branch -D prueba`.

**Que se versiona**: el `.gitignore` es una **lista blanca** (`/*` ignora todo y se rescata lo
justo). Claude Code agrega carpetas nuevas con cada version; con lista negra, tarde o temprano
se colaria `.credentials.json` o los cientos de MB de transcripciones. Para versionar algo
nuevo hay que rescatarlo a mano en el `.gitignore`. Es a proposito.
