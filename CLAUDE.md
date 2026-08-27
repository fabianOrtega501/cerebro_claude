# Cerebro propio — Fabian

Reglas y preferencias personales que aplican en **todos** los proyectos. Lo que sea especifico
de un repo va en el `CLAUDE.md` de ese repo, no aqui.

## Como se relaciona esto con el `.claude/` de los repos

Este directorio (`~/.claude`) es el cerebro y **tiene prioridad**. Los repos de trabajo traen su
propio `.claude/` versionado (skills y hooks del equipo); eso es una fuente de ideas, no una
autoridad.

Cuando un pull trae cambios en el `.claude/` de un repo, el hook `claude-upstream-notice` lo
detecta y hay que revisarlo con la skill `sync-brain`. Nunca se absorbe nada sin aprobacion, y
nunca se escribe desde aqui hacia el `.claude/` de un repo de trabajo.

Los cambios del cerebro **no se commitean jamas al repo de trabajo**. Este directorio es un repo
git aparte, local.

## Preferencias de trabajo

- Explicaciones en espanol, directas y sin relleno.
- Nombres de codigo (funciones, variables, archivos) en ingles; comentarios y JSDoc en espanol.
- Los JSDoc documentan el contrato, no repiten la firma: que significa el retorno, si lanza,
  unidades, y efectos que sorprenden.
- Nada de credenciales ni rutas absolutas en archivos que se versionan.
