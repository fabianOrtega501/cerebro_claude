# Memory Index

Dos origenes, y la diferencia importa al escribir uno nuevo.

**Del equipo** — viven en `/datos/proyectos/AIO/aio-app/.claude/memory/`, versionadas y visibles para todos. Aqui solo
hay un enlace: **no se editan desde el cerebro, se editan en el repo**. Las mantiene `plug.mjs`.

- [commit-sin-numero-de-ticket](commit-sin-numero-de-ticket.md) — Formato del mensaje de commit en AIO cuando el desarrollo no tiene número de ticket GLPI
- [lint-del-aio-reformatea-todo](lint-del-aio-reformatea-todo.md) — En aio-app `pnpm lint` lleva --fix y reformatea todo el repo; nunca usarlo para verificar
- [locales-muertos-del-aio](locales-muertos-del-aio.md) — En aio-app solo es.json y en.json estan vivos; fr.json y ar.json son restos de la plantilla del tema, no traducciones atrasadas
- [run-artisan-via-sail](run-artisan-via-sail.md) — En los repos del AIO, ejecutar comandos artisan con sail, no con php artisan del host ni docker exec

**Propias** — se quedan aqui porque no le sirven a nadie mas: preferencias de como quiero que se
trabaje, o hechos que solo valen en esta maquina o en este clon.

- [cerebro-propio-claude](cerebro-propio-claude.md) — Fabian mantiene su configuracion de Claude en ~/.claude como repo git aparte ("el cerebro"), que tiene prioridad sobre el .claude/ de los repos de trabajo
- [conflictos-los-resuelve-el-usuario](conflictos-los-resuelve-el-usuario.md) — Los conflictos del merge con la rama origen los resuelve el usuario; hay que parar y esperar su orden para seguir
- [env-testing-skip-worktree](env-testing-skip-worktree.md) — .env.testing está marcado con skip-worktree en este clon; sus cambios locales no entran a commits
- [navegador-para-cdp-es-brave](navegador-para-cdp-es-brave.md) — Manejar el navegador por CDP en esta maquina exige CHROME_PATH=/snap/bin/brave; no hay Chrome ni Chromium instalados
