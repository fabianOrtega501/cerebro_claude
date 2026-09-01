# Memory Index

- [Ejecutar artisan con Sail](run-artisan-via-sail.md) — `./vendor/bin/sail artisan`; el PHP del host no tiene driver pgsql
- [Commit sin número de ticket](commit-sin-numero-de-ticket.md) — usar `SOFTWARE - AIO: <descripción>` cuando no hay GLPI
- [.env.testing con skip-worktree](env-testing-skip-worktree.md) — está versionado pese al .gitignore; la marca local mantiene sus cambios fuera de los commits
- [El lint del AIO reformatea todo](lint-del-aio-reformatea-todo.md) — en aio-app `pnpm lint` es `eslint --fix` sobre todo el repo: verificar con `--no-fix` y `build`
- [Cerebro propio de Claude](cerebro-propio-claude.md) — ~/.claude es un repo git aparte que manda sobre el .claude/ de los repos
- [Los conflictos los resuelve el usuario](conflictos-los-resuelve-el-usuario.md) — parar el merge y esperar su orden antes de commitear
