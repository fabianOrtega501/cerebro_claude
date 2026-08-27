---
name: start-development
description: Usar SIEMPRE al empezar un desarrollo nuevo, antes de escribir una línea de código, en cualquier proyecto. Pone al día todas las ramas, pregunta lo necesario para crear la rama de trabajo con el nombre del equipo, la crea desde la base indicada y recoge el enunciado del ticket. Dispara con "vamos a empezar un desarrollo", "nuevo ticket", "arrancamos con", "crea la rama para". La skill `fullstack-ticket` la ejecuta en su Fase 0.
---

# Arrancar un desarrollo

Checklist obligatorio antes de tocar código. Son dos pasos mecánicos y una recogida de contexto,
en ese orden. **No saltarse ninguno ni cambiar el orden**: la rama tiene que nacer de un origen
actualizado, y eso solo se garantiza actualizando primero.

## Paso 1 — Poner las ramas al día

```bash
node ~/.claude/skills/start-development/lib/update-branches.mjs
```

Sin argumentos toma los repos del proyecto actual desde `brain/projects.json`. Para otro
proyecto, pasar las rutas: `... update-branches.mjs /ruta/a /ruta/b`.

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

## Paso 2 — Crear la rama

Preguntar las cuatro cosas **en una sola interacción**, con `AskUserQuestion`:

| Pregunta | Opciones |
|---|---|
| ¿Feature o hotfix? | `feature` / `hotfix` |
| ¿De qué rama sale? | Las ramas base reales del repo (`desa`, `qa`, `prod`), leídas de git, no inventadas |
| Número de ticket | Texto libre; puede no haber |
| Descripción del desarrollo | Texto libre, corta |

Para las bases, ofrecer lo que el repo tenga de verdad:

```bash
git -C <repo> branch -r --format='%(refname:short)' | sed 's|origin/||' | grep -xE 'desa|qa|prod|main|master'
```

Después:

```bash
node ~/.claude/skills/start-development/lib/create-branch.mjs \
  --tipo <feature|hotfix> [--ticket <numero>] --base <rama> \
  --desc "<descripcion>" --repos <ruta> [--repos <ruta>...] [--dry-run]
```

El nombre queda así, y lo arma el script — **no escribirlo a mano**:

```
<tipo>/<ticket>-fabian-origin<Base>-<Descripcion>
feature/10842-fabian-originDesa-FiltroPorTipoDeVehiculo
hotfix/10999-fabian-originProd-CorreccionDeTotales
```

Sin ticket, el nombre sale sin él: `feature/fabian-originDesa-AjustesColumnas`.

**En un ticket que cruza dos repos, cada repo lleva su propia rama, con el mismo nombre.** Se
pasan los dos `--repos` en la misma invocación: el script comprueba **todos** antes de crear
ninguno, para no dejar un repo con rama y el otro sin ella.

Antes de crear, verifica que el árbol esté limpio, que la base exista y esté sincronizada con su
remoto, y que no haya ya una rama igual (ni una que solo difiera en mayúsculas). Si algo falla,
no crea nada y dice qué resolver.

## Paso 3 — Recoger el contexto del ticket

Con la rama ya creada, pedir al usuario, en una sola interacción:

1. **El enunciado del ticket**, pegado tal cual. Su texto crudo vale más que un resumen.
2. **¿Recurso nuevo o ajuste sobre algo existente?** Cambia el camino por completo: en el AIO,
   recurso nuevo entra por `CreateResourceFlow` y un ajuste no. Si no lo dice, asumir ajuste, que
   es lo frecuente, y decir que se asumió.
3. **Módulo o pantalla de referencia**, si conoce alguno parecido. Copiar el patrón que ya existe
   vale más que inventar.

## Al terminar

Reportar en tres líneas: qué se actualizó, qué rama quedó creada y en qué repos, y qué queda
pendiente de lo que no se pudo poner al día.

Si el desarrollo cruza los dos lados de un proyecto, **seguir con `fullstack-ticket`** desde su
Fase 1: la Fase 0 de aquella (situarse en el proyecto) y este checklist se complementan.

## Lo que esta skill NO hace

- **No commitea ni empuja nada.** Solo crea la rama local.
- **No resuelve divergencias.** Las reporta; qué hacer con una rama divergida lo decide el usuario.
- **No borra ramas locales** cuya remota desapareció. Lo menciona y ofrece.
