# Cerebro propio — Fabian

Reglas y preferencias personales que aplican en **todos** los proyectos. Lo que sea especifico
de un repo va en el `CLAUDE.md` de ese repo, no aqui.

Este cerebro es **compartido por todos los proyectos**: AIO, Epsilon, Status, SIPA, Ruta+,
manuales. El mapa completo y el modo de uso estan en `~/.claude/brain/README.md`.

## Skills: transversales o de proyecto

Una skill es **transversal** si sirve igual en dos proyectos que no comparten codigo; va en
`~/.claude/skills/` y se ve en todas partes. Es **de proyecto** si menciona rutas, modulos,
endpoints o contenedores de un solo sitio; va en `~/.claude/brain/projects/<proy>/skills/`,
con el nombre de carpeta empezando por `local-`, y se enchufa con
`node ~/.claude/brain/lib/plug.mjs`.

Al crear una skill nueva, preguntar a cual de las dos pertenece antes de escribirla. En la duda,
transversal.

## Como se relaciona esto con el `.claude/` de los repos

Este directorio (`~/.claude`) es el cerebro y **tiene prioridad**. Los repos de trabajo traen su
propio `.claude/` versionado (skills y hooks del equipo); eso es una fuente de ideas, no una
autoridad.

Cuando un pull trae cambios en el `.claude/` de un repo, el hook `claude-upstream-notice` lo
detecta y hay que revisarlo con la skill `sync-brain`. Nunca se absorbe nada sin aprobacion, y
nunca se escribe desde aqui hacia el `.claude/` de un repo de trabajo.

Los cambios del cerebro **no se commitean jamas al repo de trabajo**. Este directorio es un repo
git aparte, local.

## Preferencias de trabajo

- Explicaciones en espanol, directas y sin relleno.
- Nombres de codigo (funciones, variables, archivos) en ingles; comentarios y documentacion en espanol.
- Nada de credenciales ni rutas absolutas en archivos que se versionan.

## Si el desarrollo cambia de lado, se dice y se cambia de skill

Al arrancar, el usuario declara si el ticket toca **front**, **back**, **los dos** o **no lo sabe**.
Eso es su expectativa, no un veredicto: un campo nuevo visible casi siempre arrastra migracion,
request, service y permiso, y eso no se ve desde el enunciado.

**En cuanto descubras que hace falta el otro lado, parate y dilo.** No sigas "resolviendolo por
encima" en el repo en el que estas, y sobre todo no dejes el trabajo a medias en un lado esperando
que se note despues.

Que hacer, en este orden:

1. **Decirlo explicitamente**: que encontraste, por que obliga al otro lado, y que faltaria hacer.
2. **Esperar confirmacion.** Puede que el usuario prefiera partir el ticket en dos.
3. **Crear la rama que falta** en el otro repo, con el mismo nombre:
   `node ~/.claude/skills/start-development/lib/create-branch.mjs --project <p> --side <lado que falta> ...`
4. **Pasar a `fullstack-ticket`** desde su Fase 3, la de fijar el contrato. Las fases 1 y 2 ya las
   hiciste sin saberlo: descubrir que falta el otro lado *es* haber encuadrado el ticket.

Senales tipicas de que un ticket "solo de front" toca el backend: un campo que hay que persistir,
una pantalla o accion nueva (necesita permiso), un filtro que la API no soporta, un dato que no
viene en la respuesta actual. Al reves, un ticket "solo de back" toca el front cuando cambia la
forma de una respuesta que alguien ya consume.

## Documentar funciones: maximo 3 renglones

**Tres renglones por funcion. Ni uno mas.** El limite es duro y no admite "es que esta funcion
es especial": si no cabe, el problema es la funcion, no el limite.

En esos tres renglones va, en este orden de prioridad:

1. **Que hace**, concreto. Que devuelve o que cambia, no una categoria. `Corre git y devuelve la
   salida limpia` sirve; `Gestiona la ejecucion de comandos` no dice nada.
2. **Entradas y salidas**, solo cuando la firma no las explique sola. Que significa un `null`,
   en que unidad viene un numero, si lanza o devuelve el error.

Nada de bloques `@param` uno por argumento, nada de `@returns` que repita el tipo, nada de
parrafos explicando por que se hizo asi. Si de verdad hace falta un porque, va como **comentario
suelto junto a la linea que lo necesita**, no en la cabecera de la funcion.

```js
// Bien
/** Sha del arbol de `.claude/` en HEAD. `null` si la carpeta no esta versionada. */

// Mal: parrafo de contexto, @param que repite la firma, historia del bug que lo motivo
```

**Por que el limite.** Sin el, la documentacion crece hasta tapar el codigo: se lee mas prosa que
implementacion, y lo unico importante —que un retorno vacio significa algo— queda enterrado entre
lineas que el lector ya sabia. Documentacion de mas no es cautela, es ruido.

**El codigo que ya existe en el cerebro NO cumple esta regla.** Se escribio con la regla anterior
y el 25% de sus lineas son comentarios; hay bloques de quince renglones. Se dejo asi a proposito,
no es que nadie se haya dado cuenta. **No lo tomes como ejemplo ni copies su estilo** al tocar un
archivo viejo: lo que se escriba de nuevo va a 3 renglones, aunque quede al lado de un bloque
largo. Si de paso puedes recortar el bloque que ya estabas editando, mejor; no abras una limpieza
por tu cuenta.
