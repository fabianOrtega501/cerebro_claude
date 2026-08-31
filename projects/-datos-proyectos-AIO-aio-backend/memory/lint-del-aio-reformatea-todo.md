---
name: lint-del-aio-reformatea-todo
description: En aio-app `pnpm lint` lleva --fix y reformatea todo el repo; nunca usarlo para verificar
metadata:
  type: project
---

> Copia identica en los `memory/` de **aio-app** y **aio-backend**, para que un ticket fullstack la
> vea desde cualquiera de los dos. Si cambias una, cambia la otra.
En `aio-app` el script `lint` del `package.json` es `eslint --fix`: **no verifica, formatea**, y lo
hace sobre **todo el arbol**, no sobre lo que tocaste. Al correrlo durante el cierre del ticket
10810 (2026-08-31) el repo paso de 5 archivos modificados a 266: 261 reformateos ajenos que hubo
que descartar con `git stash push -- <mios>` + `git checkout -- .` + `git stash pop`.

**Why:** el checklist de `finish-development` dice "pasar el formateador del proyecto", y aqui eso
contamina el arbol con cambios de otros modulos que no se pueden commitear ni distinguir a ojo.
Peor: si hubiera habido trabajo sin commitear de otro ticket, se habria mezclado.

**How to apply:** para verificar el front del AIO, correr **`eslint --no-fix` solo sobre los
archivos de la rama** y comparar el conteo contra `HEAD` (con `git stash`) para saber si aportas
errores nuevos; el repo arrastra ~1200 problemas preexistentes, asi que un fallo global no dice
nada. Lo que si demuestra que compila es `pnpm build`. `pnpm typecheck` tambien falla de base
(hoy por `WorkOrdersCalendar.vue:754`). Ver [[run-artisan-via-sail]] para el lado del back.
