# brain/

La memoria del cerebro sobre los repos de trabajo que vigila.

| Ruta | Que es |
|---|---|
| `lib/upstream.mjs` | Motor compartido: encuentra el repo, calcula la huella de su `.claude/`, guarda y lee la foto |
| `upstream/<repo>-<hash>/snapshot/` | Copia del `.claude/` del repo **tal como estaba en la ultima revision** |
| `upstream/<repo>-<hash>/state.json` | Sha del arbol y del commit revisados, fecha, y version descartada si la hay |

La foto es lo que permite responder "que cambio desde la ultima vez que miramos". Sin ella, cada
pull se veria como si todo fuera nuevo.

El sufijo de hash en el nombre de la carpeta viene de la ruta absoluta del repo: dos clones del
mismo proyecto en rutas distintas no se pisan la foto entre ellos.

Quien lo consume: el hook `~/.claude/hooks/claude-upstream-notice.mjs` (detecta) y la skill
`~/.claude/skills/sync-brain/` (clasifica y mezcla).
