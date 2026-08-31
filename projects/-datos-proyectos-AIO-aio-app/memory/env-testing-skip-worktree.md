---
name: env-testing-skip-worktree
description: .env.testing está marcado con skip-worktree en este clon; sus cambios locales no entran a commits
metadata:
  type: project
---

> Copia identica en los `memory/` de **aio-app** y **aio-backend**, para que un ticket fullstack la
> vea desde cualquiera de los dos. Si cambias una, cambia la otra.
Desde el 2026-08-18, `.env.testing` está marcado con `git update-index --skip-worktree` en este clon del repo. Está listado en `.gitignore` pero **sí está versionado**, así que la regla de ignore no le aplica; skip-worktree es lo que mantiene los ajustes locales fuera de los commits.

**Why:** el usuario ajusta ese archivo en local para probar y no quiere que esos cambios viajen a `desa` en el MR; el archivo no se puede quitar del repo porque el CI lo necesita para la etapa de tests.

**How to apply:** si un `git merge`/`pull` desde `desa` falla con "your local changes would be overwritten by merge" en `.env.testing`, quitar la marca (`git update-index --no-skip-worktree .env.testing`), mezclar y volver a ponerla. La marca es local: no se propaga a otros clones ni se ve en `git status`. Verificar con `git ls-files -v .env.testing` (bandera `S`). Ver [[run-artisan-via-sail]].
