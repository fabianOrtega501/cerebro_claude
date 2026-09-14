# brain/ — el motor del cerebro

> **El mapa completo esta en [`~/.claude/README.md`](../README.md).** Este archivo solo dice que
> hay dentro de `brain/`, para no mantener dos versiones de lo mismo: hasta el 2026-09-11 habia
> aqui una copia del manual entero, y se atraso —afirmaba que el unico respaldo era `backup`
> cuando ya existia `github`—. Una sola fuente de verdad.

`brain/` es lo que el cerebro sabe de **tus** proyectos: el registro de repos, los perfiles por
proyecto y los motores compartidos que usan las skills. Lo transversal —skills, agentes, hooks—
vive un nivel mas arriba.

| Ruta | Que es |
|---|---|
| `projects.json` | Que repos componen cada proyecto. **Registro unico**, se edita a mano |
| `lib/` | Motores compartidos: `projects`, `secrets`, `credentials`, `upstream`, `plug`, `sync-directories` |
| `projects/<proy>/manual/` | Perfil del manual de usuario. Lo carga `update-manual` |
| `projects/<proy>/stack/` | Perfil full-stack: repos, comandos, verificador. Lo carga `fullstack-ticket` |
| `projects/<proy>/docs/` | Perfil de documentacion tecnica. Lo carga `update-tech-docs` |
| `projects/<proy>/exploration/` | Mapa tecnico por modulo. Lo carga `exploration-memory` |
| `projects/<proy>/skills/local-*` | Skills de un solo proyecto. Se enchufan con `plug.mjs` |
| `projects/_template/` | Plantillas para agregar un proyecto |
| `learning/` | Modo practica: lecciones, temario y bitacoras. Lo carga `practice-ticket` |
| `sprints/` | El texto de la retrospectiva de cada sprint, que escribe `gen-sprint-summary` |
| `testing/pending.md` | Cola de desarrollos cerrados con el set de pruebas pendiente |
| `upstream/` | Foto del `.claude/` de cada repo en su ultima revision. **No se versiona** |

## Lo que hay que saber para tocar esto

**Un repo pertenece a un solo proyecto** en `projects.json`; ahi se declara quien es el dueno. Que
un proyecto *trabaje* sobre un repo ajeno se declara en su `stack/stack.json`: AMI comparte
`aio-backend`, que es de AIO.

**Motor + perfil.** `update-manual`, `fullstack-ticket` y `update-tech-docs` son transversales pero
necesitan saber de cada proyecto. Agregar un proyecto a cualquiera de ellas es **escribir su
perfil**, nunca tocar el motor. Si hace falta tocar el motor, casi siempre significa que lo que
estas metiendo ahi es conocimiento que va en el perfil.

**Proyecto nuevo:** agregarlo a `projects.json` y correr `node ~/.claude/brain/lib/plug.mjs <proy>`.
Es idempotente.

```bash
node ~/.claude/brain/lib/plug.mjs --status   # que ve el cerebro hoy, sin tocar nada
node ~/.claude/brain/lib/projects.mjs        # que proyectos y repos estan en disco
```
