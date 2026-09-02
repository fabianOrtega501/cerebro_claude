# Memory Index

- [Ejecutar artisan con Sail](run-artisan-via-sail.md) — `./vendor/bin/sail artisan`; el PHP del host no tiene driver pgsql
- [Commit sin número de ticket](commit-sin-numero-de-ticket.md) — usar `SOFTWARE - AIO: <descripción>` cuando no hay GLPI
- [.env.testing con skip-worktree](env-testing-skip-worktree.md) — está versionado pese al .gitignore; la marca local mantiene sus cambios fuera de los commits
- [El lint del AIO reformatea todo](lint-del-aio-reformatea-todo.md) — en aio-app `pnpm lint` es `eslint --fix` sobre todo el repo: verificar con `--no-fix` y `build`
- [Los conflictos los resuelve el usuario](conflictos-los-resuelve-el-usuario.md) — parar el merge y esperar su orden antes de commitear
- [El navegador para CDP es Brave](navegador-para-cdp-es-brave.md) — `CHROME_PATH=/snap/bin/brave` y `TMPDIR=~/aio-shots/tmp`; sin eso no arranca
- [Pint solo sobre los archivos del ticket](pint-solo-archivos-del-ticket.md) — `php vendor/bin/pint`, y el repo entero ya incumple su estilo
- [El registro de errores rompe el aislamiento de los tests](error-logging-rompe-aislamiento-tests.md) — su `DB::commit()` confirma la transaccion de `RefreshDatabase`
- [No usar git stash para comparar con la base](no-usar-stash-para-comparar-con-la-base.md) — aplica stashes de otras ramas; usar `git show <ref>:<archivo>`
