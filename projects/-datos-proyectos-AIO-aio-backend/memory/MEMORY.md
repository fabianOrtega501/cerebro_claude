# Memory Index

Dos origenes, y la diferencia importa al escribir uno nuevo.

**Del equipo** — viven en `/datos/proyectos/AIO/aio-backend/.claude/memory/`, versionadas y visibles para todos. Aqui solo
hay un enlace: **no se editan desde el cerebro, se editan en el repo**. Las mantiene `plug.mjs`.

- [commit-sin-numero-de-ticket](commit-sin-numero-de-ticket.md) — Formato del mensaje de commit en AIO cuando el desarrollo no tiene número de ticket GLPI
- [error-logging-rompe-aislamiento-tests](error-logging-rompe-aislamiento-tests.md) — En aio-backend un test que provoque un error manejado confirma la transaccion de RefreshDatabase y contamina los siguientes
- [pint-solo-archivos-del-ticket](pint-solo-archivos-del-ticket.md) — En aio-backend pint se invoca con `php vendor/bin/pint` y solo sobre los archivos de la rama; el repo entero no cumple su estilo
- [run-artisan-via-sail](run-artisan-via-sail.md) — En los repos del AIO, ejecutar comandos artisan con sail, no con php artisan del host ni docker exec
- [cada-consulta-en-su-entidad](cada-consulta-en-su-entidad.md) — Una consulta vive en las capas de la tabla que consulta; los datos de otra entidad se piden a su servicio y endpoint
- [validaciones-con-el-estandar](validaciones-con-el-estandar.md) — Llaves foráneas con mergeRules + ForeignKeyExists y tipos con CommonFormRequest; nada armado a mano
- [buscar-antes-de-crear](buscar-antes-de-crear.md) — Antes de escribir una función, buscarla en CustomCompanyService, BaseService, BaseRepository, CommonFormRequest y traits
- [fecha-de-la-empresa](fecha-de-la-empresa.md) — Nunca now() para una fecha de negocio; la fecha de la empresa sale de CustomCompanyService
- [estandar-intacto](estandar-intacto.md) — El Service, la interfaz y el Controller del estándar no se modifican; la lógica va en Custom* o applyFilters()

**Propias** — se quedan aqui porque no le sirven a nadie mas: preferencias de como quiero que se
trabaje, o hechos que solo valen en esta maquina o en este clon.

- [docker-exec-rompe-el-log-del-dia](docker-exec-rompe-el-log-del-dia.md) — Correr artisan con docker exec crea el log del dia como root y deja el backend devolviendo 500 en toda peticion, sin rastro en ningun log
- [conflictos-los-resuelve-el-usuario](conflictos-los-resuelve-el-usuario.md) — Los conflictos del merge con la rama origen los resuelve el usuario; hay que parar y esperar su orden para seguir
- [env-testing-skip-worktree](env-testing-skip-worktree.md) — .env.testing está marcado con skip-worktree en este clon; sus cambios locales no entran a commits
- [lint-del-aio-reformatea-todo](lint-del-aio-reformatea-todo.md) — En aio-app `pnpm lint` lleva --fix y reformatea todo el repo; nunca usarlo para verificar
- [navegador-para-cdp-es-brave](navegador-para-cdp-es-brave.md) — Manejar el navegador por CDP en esta maquina exige CHROME_PATH=/snap/bin/brave; no hay Chrome ni Chromium instalados
- [no-usar-pint-en-aio](no-usar-pint-en-aio.md) — No correr pint en aio-backend: el formato lo pone Intelephense y sus defaults contradicen el CLAUDE.md
- [no-usar-stash-para-comparar-con-la-base](no-usar-stash-para-comparar-con-la-base.md) — No usar git stash para comparar la rama contra su base; aplica stashes ajenos y deja conflictos en archivos de otros tickets
- [solo-lo-pedido](solo-lo-pedido.md) — No agregar trabajo, validaciones ni protecciones que no se pidieron; lo que parezca necesario se propone, no se agrega
