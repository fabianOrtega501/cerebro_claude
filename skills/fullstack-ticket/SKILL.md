---
name: fullstack-ticket
description: Usar cuando un ticket toca el backend y el frontend a la vez — endpoint nuevo, módulo nuevo, campo nuevo, o un ajuste a algo que ya existe y que cruza los dos repos. También cuando se empieza un ticket sin saber todavía si toca los dos. Sirve para cualquier proyecto (AIO, Epsilon, …): el proyecto se indica al invocarla, `/fullstack-ticket aio`. Coordina los dos repos desde una sola sesión, sin abrir otra ventana. Es la versión del cerebro y sustituye a las copias `develop-fullstack-ticket` que traen los repos.
---

# Desarrollar un ticket full-stack

Trabaja los dos lados de un proyecto desde **una sola sesión**, sin abrir otra ventana ni cambiar
de proyecto.

Esta skill son **los pasos**. El conocimiento de cada proyecto —su stack, sus trampas, su
contrato— está en `~/.claude/brain/projects/<proyecto>/stack/`.

> Los repos traen copias propias llamadas `develop-fullstack-ticket`. **Usa esta.** Aquellas son
> del equipo y se quedan como están.

## Cuándo NO usar esta skill

- El ticket toca **solo el front** (estilos, textos, una tabla, validación ya soportada por el
  backend) → trabajo normal en el repo del front.
- El ticket toca **solo el back** (una consulta, un job, una migración sin reflejo en pantalla) →
  trabajo normal en el repo del back.

Ante la duda, empieza con la skill: la fase 1 decide si hace falta seguir, y salir temprano es
barato.

## Fase 0 — Situarse en el proyecto

**Siempre lo primero.** El usuario indica el proyecto al invocar (`/fullstack-ticket aio`). Si no
lo dijo, **se pregunta; nunca se deduce del directorio**: la sesión puede estar abierta en otro
repo, y la rama terminaría en el equivocado.

```bash
node ~/.claude/skills/fullstack-ticket/lib/stack.mjs <proyecto>
```

Imprime el contexto de trabajo y comprueba lo que puede arruinar el ticket a mitad de camino:

| Comprueba | Por qué importa |
|---|---|
| Los dos repos existen | Obvio, pero falla en máquinas recién configuradas |
| Los dos son **escribibles** desde esta sesión | Un repo que se lee pero no se escribe deja el ticket a medias con la mitad ya hecha |
| En qué rama está cada uno | Trabajar sobre `desa`/`qa`/`prod` por descuido |
| Si hay cambios sin commitear | Distinguir lo tuyo de lo que ya estaba |
| Contenedores arriba | Solo si el ticket necesita probar en vivo |

**Sale con código 2 si algún repo no es escribible.** Eso es bloqueante: el repo tiene que estar
registrado en `brain/projects.json`; después se corre `node ~/.claude/brain/lib/plug.mjs`, que
regenera `additionalDirectories`, y se **reinicia la sesión**. Decirlo y parar; seguir a ciegas genera trabajo que hay que rehacer.

Si el proyecto no tiene stack definido, el script dice cómo crearlo desde la plantilla.

**Si algún repo está en una rama protegida —o si es un desarrollo nuevo y todavía no hay rama—,
ejecutar la skill `start-development` antes de seguir.** Ese checklist pone las ramas al día,
pregunta lo necesario y crea la rama de trabajo en los dos repos. Volver aquí con la rama ya
creada; su paso 4 recoge el enunciado del ticket, que es justo lo que necesita la fase 1.

**Después, leer el `NOTES.md` del stack.** Ahí está lo específico del proyecto: cómo encuadrar,
dónde buscar, qué se olvida siempre en cada lado, y cómo cerrar. Sin eso, los pasos que siguen son
genéricos y producen código que ignora las convenciones del proyecto.

## Fase 1 — Encuadrar el ticket

Determinar, con el enunciado en la mano, **qué lado toca y por qué**. No asumir que un ticket "de
pantalla" no toca el backend: un campo nuevo visible casi siempre arrastra migración, request,
service y permiso.

Las preguntas concretas que lo deciden están en el `NOTES.md` del proyecto.

Si solo toca un lado, decirlo y salir de la skill.

## Fase 2 — Reconocimiento en los dos repos

Localizar lo que ya existe **antes** de diseñar nada. Casi siempre hay una entidad parecida que
marca el patrón a seguir; copiarlo vale más que inventar.

El `NOTES.md` dice dónde mirar en cada lado y qué trampas de nombres tiene ese proyecto.

**Leer el inventario de lo reutilizable**, `brain/projects/<proyecto>/standards/reuse.md`, si existe.
El contrato y el plan de la Fase 3 llevan la tabla **Se reutiliza / No se implementa / Se escribe
nuevo** que describe `start-development` en su Paso 5.

Si el stack declara un verificador, mirar el estado del contrato para ese recurso **antes** de
empezar, para no confundir un fallo heredado con uno propio.

## Fase 3 — Fijar el contrato (punto de control)

**Esta es la fase que hace que la skill valga.** Antes de escribir código, escribir el contrato y
**confirmarlo con el usuario**: qué recurso, qué endpoints, qué campos, qué permiso, qué forma
tiene la respuesta. La tabla concreta está en el `NOTES.md`.

Presentarlo como tabla y **esperar confirmación**. Un contrato mal fijado se paga en las dos
fases siguientes, multiplicado por dos repos.

Solo cuando el contrato está fijo tiene sentido paralelizar. Si el ticket es grande y los dos
lados son independientes una vez fijado el contrato, lanzar **dos subagentes en el mismo
mensaje** —uno por repo, cada uno con el contrato completo en el prompt— y esperar a los dos. Si
es pequeño, hacerlo secuencial: el backend primero, porque el front necesita algo contra qué
probar.

## Fase 4 — Ejecutar

> **Antes de escribir código en un repo que no es la raíz de la sesión, leer su `CLAUDE.md`.** No
> se carga solo: `additionalDirectories` concede acceso a los archivos y nada más. Es un paso, no
> una sugerencia: sin él se escribe código que ignora las convenciones de ese repo.

Los recordatorios de cada lado —lo que más se olvida, y los caminos que no se mezclan— están en
el `NOTES.md`. Los comandos de calidad de cada repo los imprime `stack.mjs`.

## Fase 5 — Verificación cruzada

El fallo caro de este tipo de ticket **no rompe el build de ninguno de los dos repos**: los
chequeos de tipos pasan, el análisis estático pasa, y la pantalla falla en runtime. Por eso esta
fase no es opcional.

Si el stack declara un verificador, correrlo. El `NOTES.md` explica cómo leer su salida.

Un verificador estático **no sustituye probar contra el backend corriendo**. Para lo que el
ticket haya tocado, probar el endpoint de verdad y ver la pantalla real.

## Fase 6 — Cierre

- **Cada repo lleva su propio commit y su propio MR**, para que se puedan revisar por separado.
  Nunca un commit que mezcle los dos. Mismo prefijo de ticket en ambos (el formato está en el
  `NOTES.md`).
- **Commitear solo cuando el usuario lo pida**, y por repo: el commit lo decide y lo revisa él,
  no la skill.
- Al describir cada MR, mencionar el del otro repo: son independientes para revisarlos, pero **la
  funcionalidad solo existe con los dos desplegados**. Hay que coordinar el orden de mezcla.
- Si cambió algo que el usuario ve, **ofrecer la skill `update-manual`**.
- Lo demás específico del cierre está en el `NOTES.md`.
- Si tocaste esta skill o el stack de un proyecto, **ofrece commitear el cerebro**: primero se
  corre `node ~/.claude/brain/lib/doctor.mjs` y su resultado se muestra con el mensaje propuesto;
  el commit y el push se hacen solo con el sí del usuario.

## Agregar un proyecto

1. Copiar `~/.claude/brain/projects/_template/stack/stack.json` a
   `~/.claude/brain/projects/<proyecto>/stack/stack.json` y llenarlo.
2. Escribir su `NOTES.md` al lado: cómo encuadrar, dónde buscar, qué se olvida en cada lado.
   Puede empezar corto y crecer con cada ticket.
3. Un verificador de contrato es opcional. El del AIO sabe de rutas de Laravel y subjects de
   CASL; otro proyecto necesita el suyo, no una adaptación de aquel.

**Esta skill no se toca al agregar un proyecto.** Si al hacerlo hace falta tocarla, probablemente
lo que estás metiendo aquí es conocimiento que va en el `NOTES.md`.
