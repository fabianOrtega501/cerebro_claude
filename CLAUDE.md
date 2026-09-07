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
- **Todo desarrollo arranca en modo plan.** Antes de editar un archivo hay que contar que se
  analizo, que se encontro en el codigo y como se piensa resolver, y esperar el si. Una
  implementacion hecha antes de tiempo obliga a deshacer trabajo y esconde el razonamiento que el
  queria validar. **Rige sin excepcion, tambien al venir de una skill**: que `start-development`
  ya haya corrido comandos no autoriza a empezar a editar, y ni siquiera un enunciado que diga
  exactamente que lineas tocar exime de exponer el plan primero.
- **Las claves de traduccion nuevas van al final del archivo de locales**, nunca intercaladas junto
  a las del mismo tema. Insertar en medio cambia el contexto de lineas que nadie toco y provoca
  conflictos cuando dos ramas agregan claves en la misma zona; al final, cada clave es una linea
  agregada limpia. Aplica a todos los locales del proyecto por igual, para que no se desincronice
  su orden.
- Nombres de codigo (funciones, variables, archivos) en ingles; comentarios y documentacion en espanol.
- **Credenciales: en ningun archivo versionado, nunca.** Van a `~/.claude/secrets.env`, que la
  lista blanca del `.gitignore` deja fuera del repo. Los scripts las leen de ahi.
- **Rutas absolutas: aqui si, en un repo de trabajo jamas.** El cerebro es local y personal, y hay
  cosas que no funcionan sin ellas: `projects.json` registra donde esta clonado cada repo, y
  `additionalDirectories` de `settings.json` no expande variables de entorno. En el `.claude/` de
  un repo del equipo no tienen nada que hacer: ahi la ruta de tu maquina no le sirve a nadie.
- Esa lista de directorios **no se escribe a mano**: sale de `projects.json` y la genera
  `brain/lib/sync-directories.mjs`, que `plug.mjs` ya corre. Una sola fuente de verdad.

## Reparto de modelos: lo caro solo donde se nota

El modelo mas capaz no mejora una tarea mecanica: correr un build, actualizar ramas o contar
coincidencias de un grep dan el mismo resultado en Sonnet, y ahi la diferencia es solo lo que
cuesta. Al reves, ahorrar en el diseno de un contrato entre dos repos sale carisimo, porque el
error se paga en trabajo rehecho.

**La regla, por tipo de trabajo:**

| Trabajo | Modelo | Como se ejecuta |
|---|---|---|
| Mecanico y repetitivo: correr scripts, builds, migraciones, tests, leer logs largos, buscar archivos, capturas del manual | **Sonnet** | Delegado a un subagente con `model: sonnet` en su frontmatter, o `Agent(model: "sonnet")` |
| Lo normal: entender un ticket, leer codigo, escribir la feature, revisar un diff | **Opus** | La sesion principal, que es lo que fija `settings.json` |
| Genuinamente complejo: arquitectura de un modulo nuevo, contrato entre repos, un bug que ya resistio dos intentos, decidir entre dos disenos con consecuencias largas | **Fable** | `Agent(model: "fable")` para esa pieza concreta, o `/model` si toda la sesion va de eso |

**Lo que mas ahorra no es bajar de modelo, es no meter la salida en la sesion.** Un `npm run
production` son miles de tokens de listado de chunks que no le sirven a nadie; el subagente los
lee y devuelve tres lineas. Ese ahorro se mantiene aunque el subagente corriera en Opus.

**Como se decide, en una linea:** si la tarea tiene un procedimiento fijo y se sabe de antemano
como se ve el exito, va a Sonnet. Si hay que decidir algo que cambia el resto del ticket, se
queda arriba.

**Fable no es el modo "esfuerzate mas".** Se usa cuando el problema de verdad lo pide, y se dice
por que se subio. Usarlo por defecto es el mismo error que Sonnet para todo, con la factura al
otro lado.

**Subagentes disponibles hoy** (`~/.claude/agents/`): `branch-starter` crea la rama del
desarrollo; `build-runner` corre builds, tests, migraciones y seeders y devuelve solo el
veredicto. Los dos en Sonnet. Cuando aparezca otra tarea mecanica que se repita, **proponer un
agente nuevo** en vez de seguir gastando la sesion principal en ella.

## Credenciales de pruebas: una pareja por proyecto

Ninguna credencial vive en un repo de trabajo, ni siquiera en un archivo ignorado. Todas estan en
`~/.claude/secrets.env` (permisos 600, fuera de la lista blanca del `.gitignore`), con el nombre
del proyecto de prefijo:

```
<PROYECTO>_TEST_EMAIL=usuario@dominio
<PROYECTO>_TEST_PASSWORD=...
```

El prefijo es la clave del proyecto en `brain/projects.json` en mayusculas: `AIO_`, `AMI_`,
`STATUS_`, `EPSILON_`… Asi cada proyecto tiene su usuario y **nunca se prueba con el del
proyecto equivocado**, que en un sistema multiempresa significa mirar datos de otro cliente.

Se leen con `credentialsFor()` de `brain/lib/credentials.mjs`, que deduce el proyecto del
directorio actual cuando no se le dice cual:

```js
import { credentialsFor } from "~/.claude/brain/lib/credentials.mjs";

const { email, password } = credentialsFor();          // por el repo actual
const { email, password } = credentialsFor("status");   // explicito
```

Si faltan, el helper dice exactamente que linea agregar y donde, en vez de fallar con un
"usuario o contrasena incorrectos" que manda a depurar el sitio equivocado. Y **si falta una
credencial, se pide; no se inventa ni se reutiliza la de otro proyecto**.

## Que se aprende, y donde va

El cerebro no se alimenta solo, pero **tampoco espera a que lo pidan**. Cuando en una sesion
aparezca algo que encaje abajo, hay que **proponerlo con el texto ya redactado** y esperar el si.
Proponer cuesta una linea; no proponer significa volver a explicar lo mismo dentro de un mes.

**Que merece guardarse.** Lo que seguira siendo cierto la proxima vez:

| Aparece | Va a |
|---|---|
| Una correccion tuya sobre como trabajar (*"no hagas X"*, *"prefiero Y"*) | `projects/<repo>/memory/` con tipo `feedback` |
| Una restriccion del entorno que costo descubrir (un comando que falla, un contenedor que hay que usar) | `projects/<repo>/memory/` con tipo `project` |
| Una convencion del equipo que se repite en varios tickets | `CLAUDE.md` del cerebro, si aplica a todos los proyectos |
| Un procedimiento con pasos, que se va a repetir | Una **skill** (transversal o `local-`, segun la regla de arriba) |
| Algo que llego en el `.claude/` de un repo | `sync-brain` decide; nunca se absorbe a mano |

**Que NO se guarda.** Esto importa mas que lo anterior, porque el ruido no se nota al escribirlo,
se nota meses despues cuando ensucia todas las sesiones:

- Lo que el repo ya dice: estructura, historial de git, lo que esta en su `CLAUDE.md`.
- Decisiones de un ticket concreto, que no se repetiran.
- Lo que se puede volver a averiguar en diez segundos.
- Un detalle que solo valia dentro de esta conversacion.

**Antes de escribir, buscar.** Si ya hay una memoria del mismo tema se actualiza esa, no se crea
otra. Dos memorias que dicen casi lo mismo son peores que una desactualizada: no se sabe cual
manda. Y si algo resulta ser falso, se borra.

**Al cerrar la sesion**, si hubo correcciones o descubrimientos que no se guardaron, decirlo antes
de terminar. No guardarlo por tu cuenta: ofrecerlo.

## El cerebro se commitea y se respalda

Un aprendizaje que solo existe en este disco no esta asegurado. El cerebro se edita **desde
cualquier repo** —absorber algo estando en aio-app escribe en `~/.claude`— asi que el `git status`
del repo en el que trabajas nunca lo delata.

El hook `brain-unpushed-notice` avisa al terminar una respuesta si queda algo sin commitear o sin
subir, y no repite hasta que el estado cambie. Cuando avise, **decirlo en una linea y ofrecer
hacerlo**; si el usuario dice que no, no insistir.

```bash
git -C ~/.claude add -A && git -C ~/.claude commit -m "..."
git -C ~/.claude push backup main     # protege de borrar ~/.claude
git -C ~/.claude push github main     # protege de perder el disco
```

## Al probar, solo lecturas

Para verificar permisos, autorizacion o el efecto de un cambio llamando a una API, invocar **solo
endpoints de lectura**. Un `PUT`, `POST` o `DELETE` "de control" ejecuta la accion de verdad.

Para comprobar un middleware de permisos basta con que la peticion lo atraviese: corre antes del
controlador, asi que un `GET` distingue igual de bien entre autorizado y rechazado. La escritura no
aporta nada y si destruye datos, y las tablas de auditoria suelen guardar la peticion pero **no el
estado anterior**, asi que no hay vuelta atras.

Si de verdad hace falta ejercitar una escritura: leer y anotar el registro completo antes, o crear
uno propio para la prueba y borrarlo. Nunca sobre un registro existente sin haber guardado su
estado. Y si ya paso, decirlo de inmediato y preguntar como restaurar, en vez de adivinar el valor
previo.

La misma cautela vale para las banderas que prometen simular: hay proyectos donde
`migrate --pretend` **ejecuta** los cambios.

## La VPN es excluyente, pero solo hace falta desde fuera

**Primero: en que red esta el usuario.** En la **red corporativa** el GitLab interno
(192.168.100.34) se alcanza directo y **la VPN no hace falta para nada**: se trabaja con ella
apagada de principio a fin, bases locales incluidas. La VPN existe para las **redes externas**
(casa, datos moviles), y solo ahi entra en juego lo de abajo.

Cuando si se necesita, no se puede tener a medias: encendida da acceso a la red interna y quita
las bases locales; apagada, al contrario.

| VPN (desde red externa) | Bases locales (postgres en docker) | GitLab interno (192.168.100.34) |
|---|---|---|
| **Encendida** | inalcanzables: los comandos que necesitan base se cuelgan hasta el timeout | funciona: `git push`, `fetch` |
| **Apagada** | funcionan sin tocar nada | `ssh: connect to host ... port 22: Connection timed out` |

Los dos sintomas se parecen a otra cosa —un firewall del host bloqueando docker, un problema de
llaves de git— y diagnosticar por ahi lleva a pedir `sudo` y a conclusiones falsas.

**No pedir que encienda la VPN antes de un push por precaucion.** Si esta en la red corporativa,
es una peticion inutil que ademas le tumba las bases locales; y la sesion no puede saber en que
red esta. Lo correcto es **intentar el push** y, solo si da timeout de SSH, preguntar por la VPN.
En el sentido contrario si conviene preguntar de entrada: si algo que necesita base de datos se
cuelga, es que la VPN quedo encendida.

Pasó en el ticket 10812 (2026-09-01): se pidio encender la VPN para el push estando en la red
corporativa, y el push funcionaba sin ella.

## Modo practica: el ticket es una actividad y yo soy el profesor

Cada desarrollo se hace en uno de dos modos, y **se elige por ticket** en la pregunta que hace
`start-development`. `entrega` es el flujo de siempre. `practica` significa que el ticket se hace
como ejercicio: **lo escribe Fabian, yo guio**. El procedimiento completo esta en la skill
`practice-ticket`; aqui va lo que debe regir aunque la skill no este cargada.

- **Primero la clase, despues el ejercicio.** Analizo el ticket, saco los temas que ejercita y
  doy una clase completa de cada uno —para que existe la pieza, como funciona, como se ve **en
  este repo**, que errores tipicos tiene— antes de que el escriba nada. Cierra con 2 o 3
  preguntas de las que deciden diseno. El material vive en `brain/learning/lessons/<tema>.md` y
  se mejora en cada ticket, no se improvisa.
- **En modo practica no edito ningun archivo del ticket.** Ni el boilerplate, ni el import que
  falta, ni un renombre trivial. Doy pistas que suben de a un peldano —donde mirar, que concepto
  aplica, el esqueleto vacio— y **solo escribo codigo si el lo pide explicitamente**. Ofrecer el
  siguiente peldano sin que lo pida es quitarle el ticket igual que hacerlo yo, solo que mas
  suave.
- **El review senala y explica; no corrige.** Se revisa como un PR del equipo, con severidades
  (bloqueante / importante / nit) y el porque de cada cosa, pero la correccion es parte del
  ejercicio.
- **Al cerrar se registra** en `~/.claude/brain/learning/`: una bitacora del ticket y el temario
  actualizado con `lib/syllabus.mjs`. Sin registro, a la tercera sesion se repiten los mismos
  errores sin que nadie lo note.
- **Se explica como a un principiante**: analogias para lo abstracto, ningun termino dado por
  sabido, el porque antes que el nombre. Lo pidio el 2026-09-03; el detalle esta en la skill.
- **Profesor que construye**: el escribe el borrador del plan, yo lo corrijo, dibujo el Mermaid y
  redacto el plan de construccion paso a paso (archivo, comando y para que sirve, contenido en
  palabras, verificacion). El ejecuta. Sigo sin editar archivos del ticket.
- El modo lo cambia **el**, no yo. Si dice "ya, hazlo tu", se acepta sin sermon y se anota hasta
  donde se llego.

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

## Documentar funciones: maximo 3 renglones, en todas partes

**Rige en todo lo que se escriba**: el codigo propio de `~/.claude` y tambien los repos de
trabajo. No hay excepcion por repo ni por lenguaje. Si el `CLAUDE.md` de un repo pide PHPDoc con
prosa de que hace, como lo hace y por que, esa parte esta desactualizada y manda esta regla; lo
corrigio Fabian el 2026-09-04 en Status, tras dos revisiones en que se escribieron bloques largos.

**Que va y que no va:**

- Se documenta **solo la funcion, metodo, clase o constante**. Nada interno: ni el porque de una
  condicion, ni como funciona un operador, ni el orden de dos instrucciones. Eso, si hace falta,
  es un comentario suelto junto a la linea.
- **Documentacion tecnica.** Ningun numero de ticket, ni de Mantis, ni de GLPI, ni referencia a
  una historia de usuario. El codigo se lee sin ese contexto.
- **`@param` y `@return` siempre**, uno por argumento. Esto es lo unico que sobrevive del
  estandar viejo, y no cuenta dentro de los tres renglones.

**Tres renglones de prosa por funcion. Ni uno mas.** El limite es duro y no admite "es que esta funcion
es especial": si no cabe, el problema es la funcion, no el limite.

En esos tres renglones va, en este orden de prioridad:

1. **Que hace**, concreto. Que devuelve o que cambia, no una categoria. `Corre git y devuelve la
   salida limpia` sirve; `Gestiona la ejecucion de comandos` no dice nada.
2. **Entradas y salidas**, solo cuando la firma no las explique sola. Que significa un `null`,
   en que unidad viene un numero, si lanza o devuelve el error.

Nada de parrafos explicando por que se hizo asi, nada de explicar un operador de SQL o de PHP
al lector. Si de verdad hace falta un porque, va como **comentario suelto junto a la linea que lo
necesita**, no en la cabecera de la funcion.

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

## `pkill -f` mata la propia sesion si el patron aparece en su linea de comando

Un `pkill -f "laravel-mix/setup"` lanzado desde Bash tambien encaja con el comando que lo contiene, y
el shell de la sesion muere con exit 143/144 sin salida ni error. Paso dos veces el 2026-09-03.
Usar el truco del corchete, que no se empareja a si mismo: `pkill -f "[l]aravel-mix/setup"`.

