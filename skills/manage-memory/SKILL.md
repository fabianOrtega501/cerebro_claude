---
name: manage-memory
description: >-
  Usar cuando aparezca algo que valga la pena recordar la proxima vez —una restriccion del entorno que
  costo descubrir, una convencion del equipo, una correccion sobre como trabajar— y haya que decidir si
  se guarda, donde y en que formato. Tambien al revisar una memoria vieja o al montar la carpeta de
  memoria de un proyecto nuevo. Decide entre publicarla en el repo, para que la consuma el equipo, o
  dejarla en el cerebro por ser personal o de esta maquina. Dispara con "guarda esto", "recuerda que",
  "esto deberia quedar anotado", "no se te olvide para la proxima".
---

# Administrar la memoria

Una memoria es **un hecho que seguira siendo cierto la proxima vez** y que cuesta volver a
descubrir. No es un apunte de la conversacion ni el resumen de un ticket.

**Proponer, no guardar por tu cuenta.** Cuando algo encaje, se redacta el texto completo y se
ofrece. Proponer cuesta una linea; no proponer significa volver a explicar lo mismo dentro de un
mes. Pero guardarlo sin permiso llena la memoria de ruido que nadie noto entrar.

## 1. Decidir si merece guardarse

**Si.** Lo que sobrevive al ticket:

- Una restriccion del entorno que costo descubrir: un comando que falla, una bandera que miente,
  un contenedor que hay que usar.
- Una convencion del equipo que se repitio en varios tickets.
- Una correccion sobre como trabajar: *"no hagas X"*, *"prefiero Y"*.
- Un patron del codigo que se copia cada vez que se crea algo parecido.

**No.** Y esto importa mas, porque el ruido no se nota al escribirlo, se nota meses despues:

- Lo que el repo ya dice: su estructura, su historial, lo que esta en su `CLAUDE.md`.
- Lo que ya dice el `CLAUDE.md` del cerebro. Repetir una regla global en una memoria de proyecto
  crea dos fuentes y ninguna manda.
- Decisiones de un ticket concreto, que no se repetiran.
- Lo que se averigua otra vez en diez segundos.

**Antes de escribir, buscar.** Si ya hay una memoria del mismo tema se **actualiza esa**. Dos
memorias que dicen casi lo mismo son peores que una desactualizada: no se sabe cual manda. Y si una
resulta falsa, se borra.

## 2. Decidir donde va — la pregunta que lo decide todo

> **¿Esto sigue siendo cierto en la maquina de otra persona del equipo?**

| Respuesta | Donde va |
|---|---|
| **Si** | `<repo>/.claude/memory/` — **del equipo**, versionada, entra en el MR |
| **No, es de mi maquina o de mi clon** | `~/.claude/projects/<slug>/memory/` — propia |
| **No, es como quiero que se trabaje** | `~/.claude/projects/<slug>/memory/` — propia |
| Aplica a todos los proyectos por igual | No es memoria: va al `CLAUDE.md` del cerebro |
| Tiene pasos y se va a repetir | No es memoria: es una **skill** |

**Publicar lo que no corresponde hace daño activo.** Decirle al equipo que su Chrome esta en
`/snap/bin/brave` o que su `.env.testing` tiene `skip-worktree` es informacion falsa para todos
menos para ti. Ante la duda, **propia**: subirla despues es mover un archivo; bajarla ya es
desmentir algo que otro leyo.

**Nunca se publica** una credencial, un nombre de cliente, un id de empresa ni una ruta absoluta de
tu maquina. Eso va a `secrets.env` y se referencia por su variable.

## 3. Escribirla

Un archivo por hecho, en kebab-case:

```markdown
---
name: <slug-igual-al-archivo>
description: <una linea; es lo unico que se lee para decidir si la memoria es relevante>
metadata:
  type: project | feedback | reference | user
---

<El hecho, concreto y con su evidencia: el comando exacto, el mensaje de error, la fecha en que se
midio.>

**Why:** <por que es asi, o que paso cuando se ignoro. Sin esto la memoria se obedece sin criterio
y no se sabe cuando ya no aplica.>

**How to apply:** <que hacer la proxima vez, en concreto.>
```

- **Fechas absolutas.** "La semana pasada" no significa nada dentro de tres meses.
- **Enlaces `[[otra-memoria]]`** para relacionar. En las publicadas se escriben como enlace normal
  de Markdown, que el equipo tambien lo lee.
- **Al publicar, quitar el vocabulario del cerebro.** Nombres de skills, rutas de `~/.claude`,
  "el cerebro": para quien abre el repo eso no existe. Se dice el hecho, no de donde salio.

## 4. Indexar

Toda memoria lleva su linea en el `MEMORY.md` de su carpeta. Si no esta indexada, no se recuerda.

Los indices del cerebro separan **del equipo** (enlaces al repo) de **propias** (archivos reales).

## 5. Enlazarla

Las del repo se leen porque `plug.mjs` las enlaza en la carpeta que mira el mecanismo nativo:

```bash
node ~/.claude/brain/lib/plug.mjs <proyecto>
```

**El cerebro no copia memorias, apunta.** La fuente de verdad de una memoria del equipo es el
repo, siempre. Si `plug.mjs` reporta un conflicto es que hay un archivo propio con el mismo nombre
que uno publicado: se resuelve a mano decidiendo cual de los dos sobra.

## Proyecto nuevo

Crear `<repo>/.claude/memory/MEMORY.md` y correr `plug.mjs`. Si el repo ignora `.claude/` en su
`.gitignore`, **no se publica ahi**: o el equipo cambia esa exclusion, o las memorias de ese
proyecto se quedan propias. No sirve de nada versionar algo que git no va a ver.
