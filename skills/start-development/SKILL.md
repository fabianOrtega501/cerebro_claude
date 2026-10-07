---
name: start-development
description: Usar SIEMPRE al empezar un desarrollo nuevo, antes de escribir una línea de código, en cualquier proyecto. Pone al día todas las ramas, pregunta lo necesario para crear la rama de trabajo con el nombre del equipo, la crea desde la base indicada y recoge el enunciado del ticket. Dispara con "vamos a empezar un desarrollo", "nuevo ticket", "arrancamos con", "crea la rama para". La skill `fullstack-ticket` la ejecuta en su Fase 0.
---

# Arrancar un desarrollo

Checklist obligatorio antes de tocar código. Pasos mecánicos, después la recogida de contexto y el
plan, en ese orden. **No saltarse ninguno ni cambiar el orden**: la rama tiene que nacer de un origen
actualizado, y eso solo se garantiza actualizando primero.

## Paso 0 — Leer lo que ya dijo el usuario

**Lo primero que se dice es el ambiente activo** (local, desa, qa, pre o prod), en una línea: el
desarrollo se hace contra él.

**Antes de preguntar nada.** El usuario puede haber pasado los datos al invocar:

```
/start-development aio feature desa 10842 Filtro por tipo de vehiculo
```

```bash
node ~/.claude/skills/start-development/lib/parse-request.mjs <lo que escribió>
```

Reconoce cada dato por lo que es, **en cualquier orden**, y devuelve `missing` con lo que falta.
Preguntar solo eso. Si `missing` viene vacío, **no se pregunta nada**: se va directo al paso 2.

Preguntar por algo que el usuario ya escribió es el peor defecto que puede tener un checklist:
lo vuelve un peaje en lugar de una ayuda.

## Reparto de modelos

Los pasos 2 y 3 son mecánicos —correr dos scripts y leer su salida— y no necesitan un modelo
pesado. **Cuando no falte ningún dato, delegarlos al subagente `branch-starter`, que corre en
Sonnet**, con el proyecto, tipo, base, ticket, descripción y lado en el prompt ("no lo sé" va
como `both`):

```
Agent(subagent_type: "branch-starter", run_in_background: false,
      prompt: "proyecto: aio | tipo: feature | base: desa | ticket: 10842 | descripción: ... | lado: both")
```

El paso 4 y todo lo que sigue —entender el enunciado, decidir si toca los dos lados, fijar el
contrato— se quedan en la sesión principal, que es donde el modelo pesado sí aporta.

Si faltan datos que haya que preguntar, hacerlo primero en la sesión principal (el subagente no
pregunta) y delegar después, ya con todo resuelto.

## Paso 1 — Preguntar el proyecto

**Si el paso 0 no lo resolvió, se pregunta. Nunca se deduce.** El usuario dice "iniciemos
desarrollo" sin más: tomar el proyecto del directorio en el que está la terminal es cómo se acaba
creando la rama en el repo equivocado, y peor, sin que nadie se entere.

```bash
node ~/.claude/brain/lib/projects.mjs
```

Lista los proyectos registrados y marca a cuál pertenece el repo actual. Preguntar con
`AskUserQuestion` usando **esas** claves como opciones —nunca inventadas— y, si el repo actual
pertenece a uno, ponerlo primero indicando que es el del directorio actual. Esa es una sugerencia
razonable; **la decisión sigue siendo del usuario**.

Si el proyecto que quiere no está en la lista, hay que agregarlo a `brain/projects.json` antes de
seguir.

A partir de aquí, **todo lleva `--project <clave>`**. No volver a deducir nada.

## Paso 2 — Poner las ramas al día

> Con todos los datos resueltos, este paso y el siguiente los ejecuta el subagente
> `branch-starter` en Sonnet. Lo de abajo es lo que hace, y lo que hay que hacer a mano si se
> corre sin él.

```bash
node ~/.claude/skills/start-development/lib/update-branches.mjs --project <clave>
```

Trae de todos los remotos con `--prune` y adelanta **cada rama local que se pueda**, solo por
fast-forward. Lo que no se puede adelantar se reporta sin tocarlo.

Al leer la salida:

| Dice | Qué significa | Qué hacer |
|---|---|---|
| `adelantadas` | Se pusieron al día | Nada |
| `tiene N commit(s) sin subir` | Hay trabajo local sin empujar | Mencionarlo. Solo importa si es la base del desarrollo |
| `divergió` | La local y la remota se separaron | Mencionarlo; **no** resolverlo por cuenta propia |
| `su rama remota ya no existe` | Se mezcló y se borró en el servidor | Normal. Ofrecer borrar la local si estorba |

**Si la rama que se va a usar como base aparece en `sin tocar`, decirlo y parar.** Nacer de una
base atrasada no falla ahora: falla al mezclar, con conflictos que no eran necesarios.

## Paso 3 — Crear la rama

Faltan varios datos, y **solo algunos son elecciones**. `AskUserQuestion` sirve para elegir
entre opciones; el ticket y la descripción son texto libre y meterlos ahí sale mal:

- Una "pregunta" con una sola opción **se rechaza** — la descripción no cabe.
- Una opción etiquetada *"Escribir el número"* **se puede seleccionar como si fuera la
  respuesta**, y entonces hay que volver a pedir el número igualmente.

Así que: **una llamada a `AskUserQuestion` con las preguntas de opciones que falten, y en el mismo turno una
petición de texto con los dos datos libres.** Un solo intercambio, sin trampas.

| Pregunta (opciones) | Valores |
|---|---|
| ¿Feature o hotfix? | `feature` / `hotfix` |
| ¿De qué rama sale? | Las ramas base **reales**, no inventadas |
| ¿Qué lado toca? | `front` / `back` / los dos / **no lo sé** |
| ¿Modo entrega o modo práctica? | `entrega` (lo escribo yo) / `practica` (lo escribe él, yo guío) |

**Sobre el modo**: `entrega` es el flujo de siempre. `practica` significa que el ticket se hace
como ejercicio —primero una clase de los temas que ejercita, después él teclea mientras yo guío
con pistas graduadas y reviso— y lo desarrolla la skill `practice-ticket`. Se pregunta por ticket, no se deduce: un hotfix urgente no tiene por qué pagar
el costo de la práctica, y a la inversa, un ticket tranquilo es la ocasión de aprovecharlo.
El modo **no** afecta el nombre de la rama ni ningún script.

**Sobre el lado: se pregunta como expectativa, no como veredicto.** Decide dónde se crea la rama,
no si el análisis sobra. "No lo sé" es una respuesta perfectamente válida y frecuente —para eso
está la Fase 1 de `fullstack-ticket`— y hay que ofrecerla sin que parezca la opción mala.

En proyectos de un solo repo la pregunta no aplica: omitirla.

Las bases reales las devuelve `parse-request.mjs` en `bases`: son las que existen en **todos** los
repos del proyecto. Una base que solo está en uno dejaría el desarrollo cojo.

**Preguntar solo lo que esté en `missing`.** Si el usuario ya dijo el tipo, no se le vuelve a
preguntar.

Y en el texto del mismo turno, pedir:

1. **Número de ticket** — solo dígitos; decir que puede no haberlo, y entonces el nombre sale sin él.
2. **Descripción corta** — una frase; el script la normaliza a PascalCase sin tildes.

Después:

```bash
node ~/.claude/skills/start-development/lib/create-branch.mjs --project <clave> \
  --tipo <feature|hotfix> [--ticket <numero>] --base <rama> \
  --desc "<descripcion>" [--dry-run]
```

El nombre queda así, y lo arma el script — **no escribirlo a mano**:

```
<tipo>/<ticket>-fabian-origin<Base>-<Descripcion>
feature/10842-fabian-originDesa-FiltroPorTipoDeVehiculo
hotfix/10999-fabian-originProd-CorreccionDeTotales
```

Sin ticket, el nombre sale sin él: `feature/fabian-originDesa-AjustesColumnas`.

**Cada repo lleva su propia rama, con el mismo nombre.** `--side` decide en cuáles: `front` o
`back` crean solo en el repo de ese rol —los roles salen del `stack.json` del proyecto—, y sin
`--side`, o con `both` y con "no lo sé", se crea en todos. El script comprueba **todos** antes de
crear ninguno, para no dejar un repo con rama y el otro sin ella.

Crear la rama solo donde se necesita evita ramas huérfanas en el otro repo. Y si más adelante
resulta que sí hacía falta, se crea entonces: es una línea.

Antes de crear, verifica que el árbol esté limpio, que la base exista y esté sincronizada con su
remoto, y que no haya ya una rama igual (ni una que solo difiera en mayúsculas). Si algo falla,
no crea nada y dice qué resolver.

## Paso 4 — Recoger el contexto del ticket

Con la rama ya creada, **traer el ticket y su HU con la skill `ticket-context`**, usando el
mismo número de la rama. No se pide pegar el enunciado: se baja de Mantis y GLPI, y solo cuenta
la HU descargada en esa ejecución. Si la skill devuelve que no hay HU o que hay varias
candidatas, se resuelve con el usuario antes de seguir. Sin número de ticket, pedir el código de
GLPI o, en último caso, el enunciado pegado tal cual.

En la misma interacción en que se presente el resumen de la HU, preguntar:

1. **¿Recurso nuevo o ajuste sobre algo existente?** Cambia el camino por completo: en el AIO,
   recurso nuevo entra por `CreateResourceFlow` y un ajuste no. Si no lo dice, asumir ajuste, que
   es lo frecuente, y decir que se asumió.
2. **Módulo o pantalla de referencia**, si conoce alguno parecido. Copiar el patrón que ya existe
   vale más que inventar.

**Con el módulo ya identificado, mirar si el cerebro lo tiene mapeado**:
`brain/projects/<proy>/exploration/index.md`.

- Si está `explorado`, **leer su archivo antes de abrir el código**: ahí está qué endpoint atiende
  cada acción, qué permiso la exige y qué servicio la resuelve. Eso ahorra media exploración.
- Si está `importado, sin verificar`, sirve de punto de partida pero **hay que verificar lo que se
  vaya a tocar**.
- Si no está y el ticket va a recorrer el módulo entero, **proponer `explore-module`** antes de
  escribir código. Proponer, no arrancar sola: para un ajuste puntual no compensa, y ahí se hace
  el ticket y se guarda lo aprendido al cerrar.

## Paso 5 — El plan lleva diagrama de flujo. Siempre

Antes de tocar un archivo hay que exponer el plan y esperar el sí —eso ya lo exige el `CLAUDE.md`—,
y **ese plan incluye un diagrama de flujo del comportamiento nuevo**, en Mermaid. No es opcional ni
depende del tamaño del ticket.

El diagrama va **junto al plan, antes de implementar**, no como resumen al terminar. Su valor está
en que el usuario vea el recorrido completo y detecte la rama que falta *mientras corregirlo cuesta
una frase*. Puesto al final ya no evita nada: solo documenta lo que se hizo.

**Qué tiene que mostrar:**

- El **camino completo** de la petición o del proceso: desde donde entra hasta donde sale.
- **Cada punto de decisión** con su condición escrita, no un `¿válido?` genérico.
- **Cada salida**, incluidas las de error, con lo que ve el usuario.
- Lo que **no cambia**, si el ticket es un ajuste: sombreado o anotado, para que se distinga de lo
  nuevo de un vistazo.

Un diagrama que solo dice `entrada -> validar -> guardar` no sirve: lo que se está validando es
justamente donde están las decisiones que el usuario tiene que confirmar.

**Si el ticket tiene varios flujos** —crear y editar, síncrono y asíncrono, API y job—, va un
diagrama por cada uno. Meterlos todos en uno los vuelve ilegibles.

Y un diagrama **no reemplaza la prosa del plan**: qué archivos se tocan, qué regla vive dónde y qué
se decidió no hacer sigue yendo escrito. El diagrama muestra el recorrido; el texto, las razones.

## Al terminar — a dónde va cada camino

Reportar en tres líneas: qué proyecto y qué se actualizó, qué rama quedó creada y en qué repos, y
qué queda pendiente de lo que no se pudo poner al día. Después, según el lado:

| Lado declarado | Qué sigue |
|---|---|
| **Los dos** | Seguir con `fullstack-ticket` desde su **Fase 1**. Su Fase 0 y este checklist se complementan |
| **No lo sé** | Seguir con `fullstack-ticket` igualmente: su Fase 1 existe justo para decidirlo, y salir temprano es barato |
| **Solo front** | Desarrollo normal en el repo del front |
| **Solo back** | Desarrollo normal en el repo del back |

**El lado declarado no cierra la puerta.** Si durante el desarrollo aparece que hace falta el otro
lado, hay que decirlo y cambiar de skill: el procedimiento está en `~/.claude/CLAUDE.md`, sección
*"Si el desarrollo cambia de lado"*. Vive ahí y no aquí porque tiene que seguir vigente mucho
después de que esta skill haya terminado.

**Y según el modo**, encima de lo anterior:

| Modo | Qué sigue |
|---|---|
| **Entrega** | Todo igual que siempre |
| **Práctica** | Encadenar `practice-ticket`, que conduce el desarrollo entero. Si el lado es "los dos" o "no lo sé", el contrato lo sigue fijando `fullstack-ticket` y su resultado entra como insumo de la Fase 3 de `practice-ticket` |

En modo práctica, el borrador del plan del paso 5 lo escribe **el usuario**; yo lo corrijo, dibujo
el diagrama con sus decisiones ya corregidas y redacto el plan de construcción, como dice la Fase 4
de `practice-ticket`.

## Lo que esta skill NO hace

- **No commitea ni empuja nada.** Solo crea la rama local.
- **No resuelve divergencias.** Las reporta; qué hacer con una rama divergida lo decide el usuario.
- **No borra ramas locales** cuya remota desapareció. Lo menciona y ofrece.
- **No decide qué lado toca el ticket.** Recoge lo que el usuario espera; determinarlo de verdad es
  la Fase 1 de `fullstack-ticket`.
