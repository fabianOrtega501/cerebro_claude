---
name: finish-development
description: Usar al TERMINAR un desarrollo, cuando el código ya funciona y toca subirlo, en cualquier proyecto. Limpia el código, verifica que compila y que la app arranca, revisa qué archivos se suben, commitea con el formato del equipo, integra la rama base, actualiza los manuales si cambió la interfaz y hace push. Dispara con "terminé el desarrollo", "ya quedó, súbelo", "cierra el ticket", "haz el push". Es la pareja de `start-development`.
---

# Cerrar un desarrollo

Checklist para pasar de "ya funciona en mi máquina" a "está en la rama remota", sin subir basura
ni romper la rama de nadie.

**El orden importa y no es negociable.** Lo que más se salta —integrar la base y volver a
verificar— es justo lo que evita el fallo caro: subir código que compilaba antes del merge y ya no.

## Reparto: qué hace un script y qué haces tú

Los scripts hacen lo mecánico y **no deciden nada**: leen estado y devuelven JSON. Las decisiones
—qué archivo entra, qué dice el commit, cómo se resuelve un conflicto— son del usuario, y se le
preguntan. Un script que decide por su cuenta qué se sube es exactamente el problema que esta
skill viene a resolver.

## Fase 0 — Preflight

```bash
node ~/.claude/skills/finish-development/lib/preflight.mjs
```

Devuelve el contexto entero: repo, proyecto, rama, rama base (la lee del nombre, `originDesa`),
ticket, prefijo de commit, checks del proyecto y gestor de paquetes **realmente instalado**.

**Si `blockers` trae algo, se para y se le dice al usuario.** Los dos casos son serios:

- **Rama protegida** (`desa`, `qa`, `prod`): ahí el push despliega solo, sin MR ni revisión. No se
  cierra un desarrollo desde ahí. Ofrecer crear una rama de trabajo con `start-development`.
- **Nada que subir**: no hay cambios ni commits por delante. No hay nada que cerrar.

Si `base` viene `null`, la rama no codifica su origen: **preguntar contra qué rama se integra**.
No adivinarlo.

## Fase 1 — Limpiar

Primero mirar qué hay, con criterio propio:

```bash
node ~/.claude/skills/finish-development/lib/classify-changes.mjs
```

El campo `smells` marca `console.log`, `dd()`, `debugger`, IPs y posibles credenciales en las
líneas **añadidas**. Revisar el diff completo, no solo esa lista: es una red de seguridad, no un
sustituto de leer lo que se escribió.

Quitar lo que sobre y pasar el formateador del proyecto (`lint` suele traer `--fix`). **No
reescribir de paso cosas que no son del ticket**: un cierre no es una refactorización.

## Fase 2 — Verificar

```bash
node ~/.claude/skills/finish-development/lib/run-checks.mjs --repo <repo> \
     --check "<cada check del preflight>" --with-build
```

Traduce `pnpm` a `npm` si hace falta. `--with-build` agrega el build, que es lo único que
demuestra que el proyecto compila de verdad.

Y que arranque, que es distinto de que compile:

```bash
node ~/.claude/skills/finish-development/lib/smoke-test.mjs --url <url> --path <ruta tocada>
```

Necesita el dev server arriba. Recoge excepciones, `console.error` y peticiones fallidas. Con
`--login` entra a la app si el proyecto tiene sesión configurada; sin credenciales cubre solo la
pantalla de login, y **eso hay que decirlo, no dar por verificado lo que no se miró**.

**Si algo falla, se arregla antes de seguir.** No se commitea un árbol que no compila.

## Fase 3 — Decidir qué se sube

Volver a correr `classify-changes.mjs` tras la limpieza y **enseñarle al usuario el reparto**:

- `code`: lo que escribió. Va, salvo que diga lo contrario.
- `generated`: `auto-imports.d.ts`, `components.d.ts`, lockfiles. **Aquí se pregunta siempre.**
  A veces deben ir —si se agregó un componente, el cambio es real— y a veces son ruido de haber
  levantado el dev server. No hay regla fija; por eso se pregunta.
- `untracked`: archivos nuevos. Confirmar uno por uno que son del ticket.

**Nunca `git add .`.** Se añaden las rutas concretas y aprobadas:

```bash
git add <ruta> <ruta> ...
```

## Fase 4 — Commit

El mensaje lo propone la skill y **lo aprueba el usuario**. Formato: el `ticketPrefix` del
proyecto con el número que el preflight sacó de la rama, y una descripción de **cinco palabras
como mucho**.

```
0010842: SOFTWARE - AIO: Filtro por tipo vehiculo
```

Si el preflight no encontró ticket, preguntarlo. **No inventarlo ni poner un genérico**: el
historial de este equipo ya tiene commits llamados `.` y `Ajustes`, y no hay que sumar otro.

## Fase 5 — Integrar la rama base

```bash
node ~/.claude/skills/finish-development/lib/integrate.mjs --repo <repo> --base <base>
```

Hace `fetch` y `merge` de `origin/<base>`. Merge y no rebase: es lo que usa el equipo y no
reescribe commits que otro pueda tener.

**Si hay conflictos, el merge se queda a medias a propósito.** Resolverlos con el usuario, archivo
por archivo, entendiendo los dos lados. Nunca quedarse con "el mío" por comodidad.

## Fase 6 — Volver a verificar

**La fase que todo el mundo se salta.** Repetir la fase 2 completa después del merge.

Si el merge trajo cambios de otro, lo que se verificó antes ya no es lo que se va a subir. Sin
este paso se pushea roto con la conciencia tranquila, que es peor que pushear roto a secas.

Si el merge no trajo nada (`merged: false`, ya al día), se puede saltar.

## Fase 7 — Manuales

Si el desarrollo cambió **lo que el usuario ve** (vistas, tablas, modales, textos, flujos),
ofrecer `update-manual`. Si cambió una **regla de negocio, máquina de estados o integración**,
ofrecer `update-tech-docs`.

Ofrecer, no ejecutar sin permiso: el manual vive en otro repo, lleva su propio commit y las
capturas hay que revisarlas a ojo. No es automático y no hay que venderlo como tal.

## Fase 8 — Push

```bash
git push                      # si la rama ya tiene upstream
git push -u origin <rama>     # la primera vez
```

El preflight dice cuál de los dos con `hasUpstream`.

Después del push, recordar lo que queda fuera de esta skill: **abrir el MR** hacia la rama base.
Esta skill sube la rama, no la mezcla.

## Reglas duras

1. **Nunca `git add .`.** Rutas explícitas y aprobadas.
2. **Nunca cerrar desde una rama protegida.** Ahí el push despliega solo.
3. **Nunca resolver un conflicto sin el usuario.**
4. **Nunca saltarse la fase 6** cuando el merge trajo algo.
5. **Nunca decir "verificado" de lo que no se miró.** Si el humo test no entró a la pantalla por
   falta de credenciales, se dice.
