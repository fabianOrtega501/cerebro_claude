# Registro del aprendizaje

Lo que sobrevive de cada ticket hecho en **modo practica** (skill `practice-ticket`). Sin esto,
cada sesion arranca de cero y se repiten los mismos errores sin que nadie lo note.

| Pieza | Que es |
|---|---|
| `syllabus.json` | Temario vivo: los temas y en que nivel esta cada uno |
| `lib/syllabus.mjs` | La **unica** forma de leer y escribir el temario |
| `lessons/<tema>.md` | El material de la clase de ese tema |
| `lessons/_plantilla.md` | Plantilla de la leccion |
| `log/<fecha>-<proyecto>-<ticket>.md` | Bitacora de un ticket |
| `log/_plantilla.md` | Plantilla de la bitacora |

## Las lecciones

Un archivo por tema, no por ticket. Cada ticket en modo practica arranca con una **clase
completa** del tema, y esa clase **se dicta desde el archivo**: se relee, se corrige y se amplia.
Improvisarla de cero cada vez es reescribir lo mismo peor.

Cinco bloques: para que existe la pieza, como funciona, **como se ve en este repo** (con
`archivo:linea`), errores tipicos —incluidos los suyos, tomados del temario— y como aparecio en
cada ticket. El tercer bloque es el que hace que la leccion valga mas que un tutorial.

La leccion tambien guarda las **preguntas de cierre**, esas 2 o 3 que deciden diseno y se hacen
antes de dejarlo teclear.

## El temario

Un **tema** es una capacidad concreta y repetible —`laravel-migraciones`, `permisos-y-gates`—,
no un lenguaje entero. Un tema demasiado ancho nunca llega a `dominado` y deja de informar.

Cuatro niveles, y se mueven por regla, no a dedo:

| Nivel | Se alcanza cuando |
|---|---|
| `pendiente` | Nunca se ha ejercitado |
| `visto` | Se resolvio con pista de nivel 3 o 4 (esqueleto o codigo dado) |
| `practicado` | Se resolvio con pista de nivel 1–2 y el review no dejo bloqueantes |
| `dominado` | Dos tickets seguidos asi, sin bloqueantes |

Y **baja**: un bloqueante en un tema `dominado` lo devuelve a `practicado` y rompe la racha. Un
temario que solo sube miente a los tres meses.

## Comandos

```bash
node ~/.claude/brain/learning/lib/syllabus.mjs --status
node ~/.claude/brain/learning/lib/syllabus.mjs --suggest "filtro por tipo de vehiculo"
node ~/.claude/brain/learning/lib/syllabus.mjs --record --topic laravel-migraciones \
     --ticket 10850 --project status --hint 2 --blocking 0 --error "olvido el down()"
node ~/.claude/brain/learning/lib/syllabus.mjs --add-topic <slug> --label "..." --keywords "a,b,c"
```

`--hint` es el peldano de ayuda mas alto que hizo falta en ese tema (1 a 4, ver la escalera en el
`SKILL.md`). `--blocking`, cuantos findings bloqueantes dejo el review.

**El JSON no se edita a mano.** Para eso esta el script: a mano se inventan campos, se olvida la
racha y las reglas de nivel dejan de aplicarse.

## Que NO va aqui

Conocimiento del repo o del proyecto —donde vive un modulo, que comando levanta el contenedor—
va a `~/.claude/projects/<repo>/memory/`. Aqui va solo **que sabe hacer Fabian y con cuanta
ayuda**, que es lo unico que este registro puede responder y ningun otro puede.
