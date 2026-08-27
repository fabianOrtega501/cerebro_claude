---
name: start-development
description: Usar SIEMPRE al empezar un desarrollo nuevo, antes de escribir una línea de código, en cualquier proyecto. Pone al día todas las ramas, pregunta lo necesario para crear la rama de trabajo con el nombre del equipo, la crea desde la base indicada y recoge el enunciado del ticket. Dispara con "vamos a empezar un desarrollo", "nuevo ticket", "arrancamos con", "crea la rama para". La skill `fullstack-ticket` la ejecuta en su Fase 0.
---

# Arrancar un desarrollo

Checklist obligatorio antes de tocar código. Tres pasos mecánicos y una recogida de contexto, en
ese orden. **No saltarse ninguno ni cambiar el orden**: la rama tiene que nacer de un origen
actualizado, y eso solo se garantiza actualizando primero.

## Paso 0 — Leer lo que ya dijo el usuario

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
Sonnet**, con el proyecto, tipo, base, ticket y descripción en el prompt:

```
Agent(subagent_type: "branch-starter", run_in_background: false,
      prompt: "proyecto: aio | tipo: feature | base: desa | ticket: 10842 | descripción: ...")
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

Faltan cuatro datos, y **solo dos de ellos son elecciones**. `AskUserQuestion` sirve para elegir
entre opciones; el ticket y la descripción son texto libre y meterlos ahí sale mal:

- Una "pregunta" con una sola opción **se rechaza** — la descripción no cabe.
- Una opción etiquetada *"Escribir el número"* **se puede seleccionar como si fuera la
  respuesta**, y entonces hay que volver a pedir el número igualmente. Pasó en la segunda prueba.

Así que: **una llamada a `AskUserQuestion` con las dos preguntas reales, y en el mismo turno una
petición de texto con los dos datos libres.** Un solo intercambio, sin trampas.

| Pregunta (opciones) | Valores |
|---|---|
| ¿Feature o hotfix? | `feature` / `hotfix` |
| ¿De qué rama sale? | Las ramas base **reales**, no inventadas |

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

**Cada repo del proyecto lleva su propia rama, con el mismo nombre.** `--project` los toma todos
de `projects.json` y el script comprueba **todos** antes de crear ninguno, para no dejar un repo
con rama y el otro sin ella.

Antes de crear, verifica que el árbol esté limpio, que la base exista y esté sincronizada con su
remoto, y que no haya ya una rama igual (ni una que solo difiera en mayúsculas). Si algo falla,
no crea nada y dice qué resolver.

## Paso 4 — Recoger el contexto del ticket

Con la rama ya creada, pedir al usuario, en una sola interacción:

1. **El enunciado del ticket**, pegado tal cual. Su texto crudo vale más que un resumen.
2. **¿Recurso nuevo o ajuste sobre algo existente?** Cambia el camino por completo: en el AIO,
   recurso nuevo entra por `CreateResourceFlow` y un ajuste no. Si no lo dice, asumir ajuste, que
   es lo frecuente, y decir que se asumió.
3. **Módulo o pantalla de referencia**, si conoce alguno parecido. Copiar el patrón que ya existe
   vale más que inventar.

## Al terminar

Reportar en tres líneas: qué proyecto y qué se actualizó, qué rama quedó creada y en qué repos, y
qué queda pendiente de lo que no se pudo poner al día.

Si el desarrollo cruza los dos lados de un proyecto, **seguir con `fullstack-ticket`** desde su
Fase 1: la Fase 0 de aquella (situarse en el proyecto) y este checklist se complementan.

## Lo que esta skill NO hace

- **No commitea ni empuja nada.** Solo crea la rama local.
- **No resuelve divergencias.** Las reporta; qué hacer con una rama divergida lo decide el usuario.
- **No borra ramas locales** cuya remota desapareció. Lo menciona y ofrece.
