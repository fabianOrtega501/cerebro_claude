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

Quitar lo que sobre y pasar el formateador del proyecto (`lint` suele traer `--fix`). **No
reescribir de paso cosas que no son del ticket**: un cierre no es una refactorización.

Después, **correr siempre** la skill `review-overengineering` sobre el diff de la rama: es
obligatoria, aunque el resultado sea "Nada que quitar". Se muestran los hallazgos y solo se aplican
los que el usuario elija. No se pasa a la Fase 2 sin haberla corrido.

## Fase 2 — Verificar

```bash
node ~/.claude/skills/finish-development/lib/run-checks.mjs --repo <repo> \
     --check "<cada check del preflight>" --with-build
```

Traduce `pnpm` a `npm` si hace falta. `--with-build` agrega el build, que es lo único que
demuestra que el proyecto compila de verdad.

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

## Fase 7 — Documentación: manuales, control de cambios y set de pruebas

Cuatro cosas que se ofrecen, **ninguna se ejecuta sin permiso**:

| Si el desarrollo cambió | Ofrecer |
|---|---|
| **Lo que el usuario ve**: vistas, tablas, modales, textos, flujos | `update-manual` |
| Una **regla de negocio, máquina de estados o integración** | `update-tech-docs` |
| Cualquier cosa que vaya a un despliegue | `gen-changes-controls` |
| Cualquier cosa que haya que probar en el ambiente de desarrollo | `gen-test-set` |

El manual vive en otro repo, en su propia rama nacida de `qa` (mismo nombre que esta, por
defecto), lleva su propio commit y las capturas hay que revisarlas a ojo. No es automático y no
hay que venderlo como tal.

**El control de cambios se ofrece siempre, aquí.** `gen-changes-controls` está marcada como de uso
manual y **no se dispara sola**: eso significa que no se genera sin pedirlo, no que no haya que
ofrecerlo. Este es el punto donde toca, porque es el único momento en que están a la vez el diff, el
porqué del ticket y lo que se descubrió al probar —los tres apartados que el formato pide—, y
reconstruirlo una semana después sale peor y más lento.

Ofrecerlo en una línea, con el ticket y el nombre de la rama. Si el usuario dice que no, no
insistir.

**El set de pruebas se ofrece aquí, pero lo normal es que se genere después.** Las pruebas se
ejecutan cuando el desarrollo ya está desplegado en el ambiente de desarrollo, y eso puede tardar
uno o dos días. Preguntar en una línea si se genera ahora con `gen-test-set` o más adelante.

Si la respuesta es "después", **apuntarlo antes de seguir**, una línea en
`~/.claude/brain/testing/pending.md`:

```
| fecha | proyecto | ticket | rama | base | sha de la base |
```

La sha es la parte que importa. Dos días más tarde la rama ya se mezcló y la base se movió, así que
sin ella el diff del desarrollo no se puede reconstruir y el set se acaba armando de memoria, que es
justo lo que la skill viene a evitar. Sale del preflight y de `git rev-parse origin/<base>`.

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
