---
name: update-tech-docs
description: Usar cuando un cambio altera una regla de negocio, una máquina de estados, un efecto secundario o una integración, y hay que reflejarlo en la documentación técnica del repo (`docs/`). También cuando el hook del push avisa de módulos sin documentar, o al crear un módulo nuevo. Sirve para cualquier proyecto con perfil de docs. No confundir con `update-manual`, que es el manual de usuario y va del front.
---

# Documentación técnica del repositorio

Las reglas de negocio que un desarrollador no puede deducir leyendo el código: por qué existe un
estado, qué dispara una notificación, qué pasa si un tercero no responde.

**No es el manual de usuario.** Aquello documenta lo que el usuario ve y vive en otro repo; para
eso está `update-manual`. Y **no es el contrato HTTP**: eso lo publica Swagger desde las
anotaciones del código.

## 1. Situarse

```bash
node ~/.claude/skills/update-tech-docs/lib/check-docs.mjs --project <clave>
```

Compara la rama actual contra el punto donde se separó de su base y dice **qué módulos tienen
lógica cambiada y no tienen documentación tocada**. Sale 1 si hay pendientes.

Opciones: `--base <rama>` si el nombre de la rama no codifica su origen, `--branch <rama>` para
revisar otra sin cambiarse a ella, `--json` para procesar.

Si el proyecto no tiene perfil, el script dice dónde crearlo. Un proyecto sin `docs/` no necesita
esta skill.

## 2. Leer el estándar del repo — antes de escribir nada

**El estándar no está en esta skill.** Cada repo define el suyo y es del equipo; el perfil solo
dice dónde está (campo `standard`). En el AIO es `docs/README.md`, y está completo: qué se
documenta y qué no, dónde va cada archivo, formato, encabezado obligatorio y dos plantillas.

Leerlo cada vez. Es corto y cambia.

**No inventar estructura ni formato.** Si el estándar no cubre el caso, preguntar al usuario en
vez de improvisar: una convención inventada se propaga y luego hay que deshacerla.

## 3. Entender el cambio antes de redactarlo

Este es el paso que hace que la skill valga, y el único que no puede automatizarse.

Para cada módulo pendiente, leer **el diff, no solo los nombres de archivo**:

```bash
git -C <repo> diff <forkPoint> HEAD -- app/Services/Modules/<Modulo>/
```

Y contestar, con el código delante:

- ¿Cambió una **regla** de negocio, o solo la implementación? Un refactor no se documenta.
- ¿Apareció o cambió un **estado**? ¿Quién dispara la transición y bajo qué condición?
- ¿Hay un **efecto secundario** nuevo: notificación, PDF, job en cola, escritura por SFTP?
- ¿Cambió una **integración** con un tercero?
- ¿De dónde viene la regla: normativa, requerimiento del cliente, acuerdo operativo?

**Si la respuesta a todo es no, no hay nada que documentar.** Decirlo y salir. Documentar un
refactor añade ruido que luego hay que mantener.

Lo que el usuario te contó del ticket vale más que el diff para el *porqué*. El diff dice qué
cambió; solo él sabe por qué se pidió.

## 4. Escribir

Según el estándar del repo. En el AIO:

- Regla de un flujo concreto → `docs/modulos/<modulo>/<flujo-kebab>.md`
- Algo del módulo entero → `docs/modulos/<modulo>/README.md`
- Transversal al sistema → `docs/arquitectura/`

Tres cosas que se olvidan siempre:

1. **Actualizar la fecha** del encabezado.
2. **Registrar el documento** en la tabla del `README.md` de su módulo y, si aplica, en el índice
   general.
3. **Si el módulo no tiene carpeta**, crearla con su `README.md` a partir de la plantilla del
   estándar. `check-docs.mjs` avisa cuando no existe.

Enlaces al código **relativos y al archivo real**: se rompen de forma visible cuando algo se
mueve, y esa es la señal de que el documento quedó obsoleto.

## 5. Cerrar

- La documentación va **en el mismo MR que el código**. Es lo que pide el estándar y es la única
  forma de que no se quede atrás.
- Volver a correr `check-docs.mjs`: debe salir 0.
- Reportar qué se escribió y qué se dejó fuera por no ser regla de negocio.

## Agregar un proyecto

Crear `~/.claude/brain/projects/<proyecto>/docs/profile.json` con el repo, dónde vive su `docs/`,
qué carpetas de código cuentan como lógica de negocio y cómo se saca el módulo de una ruta. El de
`aio` sirve de ejemplo. **Esta skill no se toca.**

## Lo que esta skill NO hace

- **No documenta el front.** Ahí no hay reglas de negocio que no estén en el backend; lo que el
  usuario ve va al manual (`update-manual`).
- **No documenta endpoints.** Los publica Swagger desde las anotaciones del código.
- **No escribe sola en un push.** El hook `docs-on-push` solo avisa: redactar exige entender el
  cambio, y eso se revisa antes de commitear.
