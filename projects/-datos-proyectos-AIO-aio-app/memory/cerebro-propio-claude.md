---
name: cerebro-propio-claude
description: Fabian mantiene su configuracion de Claude en ~/.claude como repo git aparte ("el cerebro"), que tiene prioridad sobre el .claude/ de los repos de trabajo
metadata:
  type: project
---

Desde 2026-08-27, la configuracion personal de Claude de Fabian vive en `~/.claude`
convertido en **repo git local** (sin remoto), llamado "el cerebro". Contiene sus skills,
hooks, `CLAUDE.md` global y, en `brain/upstream/`, una foto del `.claude/` de cada repo
vigilado. Es **compartido por todos sus proyectos** (AIO, Epsilon, Status, SIPA, Ruta+,
manuales), registrados en `brain/projects.json`. Sin GitLab: rama `main` local con remoto de
respaldo `backup` en `/datos/backups/claude-brain.git`.

Skills **transversales** en `~/.claude/skills/`; skills **de un proyecto** en
`brain/projects/<proy>/skills/local-*`, enchufadas por symlink con `brain/lib/plug.mjs`.
El manual de uso completo esta en `~/.claude/brain/README.md`.

**El cerebro manda sobre el `.claude/` de los repos.** Lo del repo es propuesta, no autoridad.
El flujo es siempre repo -> cerebro, y nunca se absorbe nada sin que el lo apruebe.

Cuando un `git pull`/`merge`/`rebase` trae cambios en el `.claude/` de un repo, el hook
`~/.claude/hooks/claude-upstream-notice.mjs` (PostToolUse sobre Bash) lo detecta e inyecta
contexto para revisarlo en ese mismo turno con la skill `sync-brain`. Al terminar hay que
correr `sync-brain/lib/settle.mjs reviewed|dismissed`, si no el aviso se repite.

**Why:** queria dejar de depender de lo que el equipo commitea en `.claude/` sin perderse las
mejoras que traen, y sin subir nada suyo al repo.

**How to apply:** nunca commitear cambios de configuracion personal al repo de trabajo; las
skills privadas dentro de un repo van con prefijo `local-` (ya excluidas en
`.git/info/exclude`, no en el `.gitignore` versionado). Absorber algo al cerebro implica
commitear en `~/.claude`. Ver [[gen-changes-controls]].
