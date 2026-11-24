---
name: finish-development
description: Usar al TERMINAR un desarrollo, cuando el código ya funciona y toca subirlo, en cualquier proyecto. Limpia el código, verifica que compila y que la app arranca, revisa qué archivos se suben, commitea con el formato del equipo, integra la rama base, actualiza los manuales si cambió la interfaz y hace push. Dispara con "terminé el desarrollo", "ya quedó, súbelo", "cierra el ticket", "haz el push". También con "Ticket en desa": ahí corre solo su Fase 9 (control de cambios, set de pruebas y comentarios para QA). Es la pareja de `start-development`.
---

# Cerrar un desarrollo

Checklist para pasar de "ya funciona en mi máquina" a "está en la rama remota", sin subir basura
ni romper la rama de nadie.

**El orden importa y no es negociable.** Lo que más se salta —integrar la base y volver a
verificar— es justo lo que evita el fallo caro: subir código que compilaba antes del merge y ya no.

## El orden del cierre: se ejecuta sin preguntar

Con el sí de Fabian a la prueba en pantalla y a su set propio (`CLAUDE.md`, «Antes de
finish-development»), el cierre corre entero y en este orden, **sin pedir confirmación entre pasos**:

1. Revisión de sobreingeniería (Fase 1).
2. Revisión de pares propia (Fase 1b).
3. Verificación: build, lint, pruebas y prueba integral (Fases 2 y 2b).
4. Documentación técnica, `update-tech-docs` (Fase 7a).
5. Actualización de manuales, `update-manual` (Fase 7a).
6. Commit, integrar la base, verificar de nuevo y push de todos los repos a la vez (Fases 3 a 6 y 8).
   **Es el único paso que se detiene**: el commit y el push los aprueba Fabian, siempre.

El cierre termina en el push, con una línea: «Control de cambios, set de pruebas y comentarios para QA:
pendientes hasta que el ticket esté en desa». Esos tres van en la Fase 9, cuando Fabian avise
«Ticket en desa».

Lo que sí se detiene, aunque esté en la lista: un hallazgo que «Impide aprobar» o «Debe corregirse»,
un check que falla, un conflicto del merge o un archivo dudoso en el `git add`. Eso se dice y se espera.

El commit del cerebro no es parte del cierre del ticket: se ofrece **una sola vez, al terminar todo el
desarrollo** (`CLAUDE.md`, «El cerebro se commitea y se respalda»). Lo pidió Fabian el 2026-11-19.

## Reparto: qué hace un script y qué haces tú

Los scripts hacen lo mecánico y **no deciden nada**: leen estado y devuelven JSON. Las decisiones
—qué archivo entra, qué dice el commit, cómo se resuelve un conflicto— son del usuario, y se le
preguntan. Un script que decide por su cuenta qué se sube es exactamente el problema que esta
skill viene a resolver.

## Fase 0 — Preflight

**Antes de arrancar**: el desarrollo ya se probó en pantalla web, Fabian recibió su set de pruebas
propio y lo confirmó (`CLAUDE.md`, «Antes de finish-development»). Si no, se hace eso primero.

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

**¿Este ticket se hizo en modo práctica?**

```bash
node ~/.claude/brain/learning/lib/practice-session.mjs status
```

Si hay una marca abierta y es de esta rama, **el temario todavía no sabe nada de este ticket** y
este es el momento de registrarlo: cerrando el desarrollo ya se sabe cómo fue. Se hace la Fase 7
de `practice-ticket` —bitácora, lecciones, un `--record` por tema y `close`— antes de seguir.

Los números del registro **los da el usuario**: hay que preguntarle cómo le fue en cada tema. Un
`--hint` inventado corrompe el temario, que es justo lo que este registro existe para evitar.

Si la marca es de otra rama, se deja como está y se sigue: pertenece a otro ticket.

**Si `siblings` trae algo, el ticket toca los dos lados.** Son los demás repos del proyecto que
están en la **misma rama** y tienen cambios sin commitear o commits sin subir. No es un bloqueante
—cerrar este repo es válido— pero hay que **decirlo antes de empezar, no después del push**:

```json
"siblings": [{ "repo": ".../aio-backend", "role": "back", "dirty": true, "files": 2, "ahead": 0 }]
```

Preguntar si se cierran los dos en esta pasada. Cerrar el front y dejar el back en el disco es
exactamente el fallo que describe el `CLAUDE.md` del cerebro: el trabajo a medias en un lado
esperando a que se note después. Y se nota tarde, cuando el MR del front no funciona sin el otro.

## Fase 1 — Limpiar

Primero mirar qué hay, con criterio propio:

```bash
node ~/.claude/skills/finish-development/lib/classify-changes.mjs
```

El campo `smells` marca `console.log`, `dd()`, `debugger`, IPs y posibles credenciales en las
líneas **añadidas**. Revisar el diff completo, no solo esa lista: es una red de seguridad, no un
sustituto de leer lo que se escribió.

Quitar lo que sobre y dar formato **solo a los archivos de la rama**. Antes se lee
`~/.claude/brain/projects/<p>/standards/format.md`: dice qué formateador hay, qué no se corre y el
comando que verifica sin corregir. Un script `lint` suele traer `--fix` sobre todo el repo. **No
reescribir de paso cosas que no son del ticket**: un cierre no es una refactorización.

Después, **correr siempre** la skill `review-overengineering` sobre el diff de la rama: es
obligatoria, aunque el resultado sea "Nada que quitar". Se muestran los hallazgos y solo se aplican
los que el usuario elija. No se pasa a la Fase 2 sin haberla corrido.

## Fase 1b — Revisión de pares propia

Después de `review-overengineering`, **correr siempre** la skill `peer-review` en su **modo propio**
sobre cada repo del ticket: la rama actual con lo que está sin commit, contra las reglas del repo, las
del equipo y las del usuario, incluida la lista de la memoria del proyecto (en AIO,
`revision-de-pares-propia`) punto por punto. Se le muestran a Fabian los hallazgos por nivel; **lo que
«Impide aprobar» o «Debe corregirse» se corrige, o él lo acepta de forma explícita, antes de pasar a la
Fase 2**. No se propone el commit sin esta revisión, aunque salga sin hallazgos.

Y antes de cada `git add` se mira el diff de ese archivo: si trae líneas que no son del desarrollo, se
pregunta.

Lo pidió Fabian el 2026-10-19, tras un MR devuelto con 9 hallazgos y un commit que llevó cambios
ajenos sin que se notara.

## Fase 2 — Verificar

```bash
node ~/.claude/skills/finish-development/lib/run-checks.mjs --repo <repo> \
     --check "<cada check del preflight>" --with-build
```

Traduce `pnpm` a `npm` si hace falta. `--with-build` agrega el build, que es lo único que
demuestra que el proyecto compila de verdad.

**El build no compila las pruebas.** En un repo con Vitest, el check `related-tests.mjs` corre las
pruebas que importan los archivos cambiados (`vitest related`) y solo falla por las fallas nuevas:
las que también fallan en la base se reportan como heredadas, sin bloquear. En el 11549 se cambió
el nombre de una función, la prueba siguió con el nombre viejo, y lint y build pasaron.

Y que arranque, que es distinto de que compile:

```bash
node ~/.claude/skills/finish-development/lib/smoke-test.mjs --url <url> --login --path <ruta tocada>
```

Necesita el dev server arriba. Recoge excepciones, `console.error` y peticiones fallidas.

**`--login` casi siempre hace falta.** Sin él solo se ve la pantalla de acceso. Y con él hace
falta la empresa: sin empresa seleccionada los permisos no se cargan y **toda ruta interna rebota
a `not-authorized` sin lanzar un solo error**. Por eso se pasa `--company` (por defecto
`"Empresa Demo"`); si el usuario de pruebas trabaja en otra, hay que indicarla.

El campo `landed` dice dónde se acabó de verdad. Si no coincide con la ruta pedida, `ok` es
`false`: se pidió ver una pantalla y no se vio.

**Límite conocido**: una ruta que no existe **no** rebota —el router monta su página de error
manteniendo la URL—, así que pasa como buena. El humo test comprueba que lo que carga no explota,
no que la ruta que escribiste exista.

**Si algo falla, se arregla antes de seguir.** No se commitea un árbol que no compila.

**En el front, el lint además del build.** El build compila un import que falta o una variable que
no existe sin decir nada; el lint no. Dos de las devoluciones del 7433 —un import ausente y un
`data is not defined`— eran exactamente eso y pasaron el build:

Se usa el comando de la sección **Verificar solo lo de la rama** de `standards/format.md`. Sin ese
archivo, el genérico, sobre los archivos de la rama:

```bash
git diff --name-only --diff-filter=ACMR origin/<base>...HEAD -- '*.js' '*.ts' '*.vue' \
  | xargs -r pnpm exec eslint --no-fix   # o npx, según el preflight
```

El repo entero suele arrastrar errores de antes: un fallo se compara contra la versión del archivo
en la base. Si el repo no tiene ESLint, se dice y se sigue; no se instala nada en el cierre.

## Fase 2b — Prueba integral

Compilar y arrancar no es funcionar. Antes de commitear se corre la skill **`prueba-integral`**
sobre cada repo del ticket: deriva del diff todo lo que el cambio puede haber afectado, lo prueba
flujo por flujo y entrega la **tabla de cobertura**, con una fila por archivo.

**Lo que no se probó se dice en la tabla.** Un "todo bien" sin tabla no cierra esta fase.

El tamaño depende del cambio: una fila por archivo siempre; con «exhaustiva» —porque el usuario la
pide o porque el diff pasa de ~20 archivos— se agregan los flujos ejecutados con evidencia, los
casos límite y los consumidores en los otros repos.

Lo pidió Fabian el 2026-10-27, tras cuatro devoluciones de QA en el 7433 que obligaron a tocar
cincuenta archivos en una segunda revisión.

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

**Las traducciones de la rama tienen que seguir al final después del merge.** Si la base también
agregó claves al final, git deja las suyas debajo de las de la rama, y las nuestras quedan en medio
sin que ningún hook lo vea: el `i18n-keys-guard` solo revisa las ediciones, no los merges. Por eso
`integrate.mjs` devuelve `i18nNotAtEnd` con las claves desplazadas por archivo. Si no viene vacío:

```bash
node ~/.claude/brain/lib/i18n-tail.mjs --repo <repo> --base origin/<base> --fix
```

Mueve solo las líneas de las claves de la rama al final, en el mismo orden en todos los locales, y
deja byte por byte las demás. Se commitea aparte y se vuelve a verificar.

**Solo se mueven las claves propias que todavía no están en la base**, y solo cuando el merge trajo
claves de otras personas que quedaron después. Las que ya están en la base —por ejemplo, porque el
MR anterior del mismo ticket ya se mezcló— no se mueven nunca, aunque hayan quedado en medio:
moverlas sería tocar líneas que ya son de todos. El script ya decide así; no hay que filtrar a mano.

**Vale también para todo
merge hecho a mano** —el que cierra un conflicto o el de "pon al día la rama"—: después de
cerrarlo se corre el mismo comando sin `--fix` para comprobar.

## Fase 6 — Volver a verificar

**La fase que todo el mundo se salta.** Repetir la fase 2 completa después del merge.

Si el merge trajo cambios de otro, lo que se verificó antes ya no es lo que se va a subir. Sin
este paso se pushea roto con la conciencia tranquila, que es peor que pushear roto a secas.

Si el merge no trajo nada (`merged: false`, ya al día), se puede saltar.

## Fase 7a — Documentación técnica y manuales, antes del commit

Van antes del commit para que todo se suba en un solo push. Se ejecutan sin preguntar:

| Si el desarrollo cambió | Se ejecuta |
|---|---|
| Una **regla de negocio, máquina de estados o integración** | `update-tech-docs`, en el mismo commit que el código |
| **Lo que el usuario ve**: vistas, tablas, modales, textos, flujos | `update-manual` |

El manual vive en otro repo, en su propia rama nacida de `qa` (mismo nombre que esta, por
defecto), lleva su propio commit y las capturas hay que revisarlas a ojo. No es automático y no
hay que venderlo como tal. Su commit y su push se aprueban junto con los del código.

Si el desarrollo no cambió nada de eso, se dice en una línea y se sigue.

## Fase 8 — Push

```bash
git push                      # si la rama ya tiene upstream
git push -u origin <rama>     # la primera vez
```

El preflight dice cuál de los dos con `hasUpstream`.

Después del push, recordar lo que queda fuera de esta skill: **abrir el MR** hacia la rama base.
Esta skill sube la rama, no la mezcla.

## Fase 9 — Ticket en desa: control de cambios, set de pruebas y comentarios para QA

**No corre en el cierre.** Corre cuando Fabian avisa «Ticket en desa» (o lo dice con otras palabras:
«ya está en desa», «pasó a desa»), aunque sea en otra sesión: se escriben contra lo que de verdad quedó
en desa, después de las correcciones del MR. Antes de ese aviso no se generan, aunque el cierre haya
terminado. Lo pidió Fabian el 2026-11-24.

Con el aviso, se generan y se entregan sin preguntar, en este orden. Antes, `tickets.py check <clave>`:
los tres se contrastan contra la HU vigente, no contra la de memoria. Si existe
`~/.claude/cache/tickets/<clave>/pendiente-desa.md`, se lee primero: guarda lo que el cierre dejó dicho
para esta fase.

1. **Control de cambios** con `gen-changes-controls`. Los niveles de riesgo e impacto los decide
   Claude con su justificación; no se espera confirmación.
2. **Set de pruebas** con `gen-test-set`. La lista de casos se entrega redactada, sin el paso previo
   de aprobarla.
3. **Comentarios para QA**: un texto para pegar en Mantis con todo lo que el desarrollo hizo distinto
   o adicional a la HU, y por qué. Se arma recorriendo la HU sección por sección contra el código y
   el `docs/` del cambio: lo que pedía y se hizo de otra forma (también por la revisión de pares), los
   casos que la HU no definía y cómo se resolvieron, y lo visible que se agregó. Se numera, en
   lenguaje de QA, sin lo puramente técnico que no se ve. No se publica: Mantis solo se lee.

Los tres van como texto normal, no en bloque de código. Lo pidió Fabian el 2026-11-19, para que QA
no devuelva el ticket por un punto que no cumple la HU al pie de la letra.

## Reglas duras

1. **Nunca `git add .`.** Rutas explícitas y aprobadas.
2. **Nunca cerrar desde una rama protegida.** Ahí el push despliega solo.
3. **Nunca resolver un conflicto sin el usuario.**
4. **Nunca saltarse la fase 6** cuando el merge trajo algo.
5. **Nunca decir "verificado" de lo que no se miró.** Si el humo test no entró a la pantalla por
   falta de credenciales, se dice.
