---
name: sync-brain
description: Usar cuando el `.claude/` de un repo de trabajo trae cambios que no se han contrastado contra el cerebro propio (~/.claude) — tipicamente despues de un `git pull` de `desa`, cuando el hook lo avisa, o cuando el usuario pide revisar que trajo el equipo en su configuracion de Claude. Clasifica lo que llego, recomienda que vale la pena absorber y solo mezcla lo que el usuario apruebe.
---

# sync-brain

Contrastar el `.claude/` de un repo contra el cerebro propio y decidir que se absorbe.

## Principio que no se negocia

**El cerebro propio (`~/.claude`) manda siempre.** Lo del repo es una propuesta, no una orden.
El flujo es en una sola direccion: **repo -> cerebro**. Nunca se escribe dentro del `.claude/`
de un repo de trabajo desde aqui, y nunca se absorbe nada sin aprobacion explicita.

Si algo del repo choca con algo propio, gana lo propio por defecto. Solo se cambia si el usuario
lo dice despues de ver la comparacion.

## Procedimiento

### 1. Levantar los hechos

```bash
node ~/.claude/skills/sync-brain/lib/report.mjs [ruta-del-repo]
```

Sin argumento usa el directorio actual. Devuelve JSON con:

- `status`: `changed` (hay algo sin revisar), `clean`, `dismissed` o `unwatched` (repo sin
  linea base todavia).
- `entries[]`: un registro por archivo que difiere de la ultima revision, con `change`
  (`added` / `modified` / `removed`) y `overridden_by_brain` (el cerebro ya tiene una skill
  con ese nombre, o sea que compiten).
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

### 4. Absorber solo lo aprobado

Espera la decision. Cuando el usuario diga que si a algo concreto:

- Skill nueva -> copiarla a `~/.claude/skills/<nombre>/`.
- Mejora puntual sobre algo propio -> editar el archivo propio a mano, tomando solo la idea.
  **No sobrescribir el archivo propio con el del repo**: se perderia lo que ya adaptaste.
- Hook -> copiar a `~/.claude/hooks/` y registrarlo en `~/.claude/settings.json`. Verificar
  que el hook no dependa de rutas del repo; si depende, adaptarlo o descartarlo.
- Regla o convencion que no es codigo -> a `~/.claude/CLAUDE.md`.

Despues de copiar, **probar que no rompe nada**: `node --check` sobre cada `.mjs` absorbido.

### 5. Cerrar la revision

Siempre, aunque no se haya absorbido nada:

```bash
# el usuario decidio (absorbio algo o dijo que nada); esta version pasa a ser la linea base
node ~/.claude/skills/sync-brain/lib/settle.mjs reviewed [ruta-del-repo]

# no le interesa esta version pero quiere seguir comparando contra la revision anterior
node ~/.claude/skills/sync-brain/lib/settle.mjs dismissed [ruta-del-repo]
```

Sin este paso el hook vuelve a avisar en el proximo pull. Es a proposito: una revision a medias
no debe darse por hecha.

### 6. Dejar historia

El cerebro es un repo git local. Si se absorbio algo, commitear:

```bash
git -C ~/.claude add -A && git -C ~/.claude commit -m "Absorbe <que> desde <repo>"
```

Mensaje en espanol, descriptivo, diciendo de donde vino. Sin este commit no hay como revertir
una mezcla que salio mal, que es justo lo que este repo existe para permitir.

## Trampas conocidas

- **La foto excluye `settings.local.json`** a proposito: es local, tiene credenciales y no se
  versiona. No lo compares ni lo copies nunca al cerebro.
- **Una skill del repo con el mismo nombre que una propia gana en ese repo**, porque el nivel
  de proyecto tiene prioridad sobre el de usuario. Si quieres que la tuya mande dentro de ese
  repo, hay que enchufarla con un symlink local ignorado en `.git/info/exclude` — no tocando
  el `.gitignore` versionado.
- **Nunca metas nada del cerebro en un commit del repo de trabajo.** Si un cambio se te fue al
  staging del repo, sacalo antes de seguir.
