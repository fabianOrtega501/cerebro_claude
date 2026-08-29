---
name: update-tech-docs
description: Usar cuando un cambio altera una regla de negocio, una máquina de estados, un efecto secundario o una integración, y hay que reflejarlo en la documentación técnica del repo (`docs/`). También documenta las funciones nuevas o sin docblock de los archivos que toca la rama, con qué hacen, cómo lo hacen y por qué. También cuando el hook del push avisa de módulos sin documentar, o al crear un módulo nuevo. Sirve para cualquier proyecto con perfil de docs. No confundir con `update-manual`, que es el manual de usuario y va del front.
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
node ~/.claude/skills/update-tech-docs/lib/undocumented-functions.mjs --project <clave>
```

El primero compara la rama actual contra el punto donde se separó de su base y dice **qué módulos
tienen lógica cambiada y no tienen documentación tocada**. Sale 1 si hay pendientes.

El segundo lista **las funciones sin docblock de los archivos que toca la rama**, separando las
`nuevas` (declaradas en líneas añadidas) de las que `ya existían sin doc`. Sale 1 si hay funciones
nuevas sin documentar.

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

## 3. Documentar las funciones tocadas

**Antes que el Markdown.** Un `.md` explica por qué existe un flujo; el docblock explica qué hace
la función que tienes delante. Se pierde menos tiempo leyendo lo segundo, y es lo que encuentra
quien abre el archivo dentro de seis meses.

**Qué se documenta, y solo eso:**

- Las funciones **nuevas**. Sin excepción: código nuevo sale documentado.
- Las que **ya existían sin docblock** en un archivo que estás tocando. Ya lo tienes abierto.

**Lo que NO se toca:** las funciones que ya tienen docblock, aunque se pueda mejorar, y las de
archivos que el ticket no toca. Reescribir documentación ajena infla el MR y entierra el cambio
real entre ruido.

**Qué va dentro**, en este orden: **qué hace**, **cómo lo hace** y **por qué**. El *por qué* es el
que de verdad falta: el qué se intuye del nombre y el cómo se lee en el cuerpo, pero la razón de
que algo esté resuelto así solo la sabe quien lo escribió.

```php
/**
 * Dirección cercana a la visita, o 'Sin dirección' si PostGIS no resuelve el punto.
 *
 * Consulta la función `osm.fun_get_nearby_directions` dentro de una transacción anidada, para
 * que un fallo suyo no aborte la transacción del envío: en PostgreSQL una consulta que falla
 * invalida la transacción entera, y se perdería la visita completa por no poder calcular una
 * dirección.
 *
 * @param object $visit Visita con `latitude` y `longitude`.
 *
 * @return string
 */
```

**Formato: el del repo, no el del cerebro.** Prosa más `@param`, `@return` y `@throws`, como los
métodos que ya existen. La regla de los tres renglones del `CLAUDE.md` del cerebro **no aplica
aquí**: rige para el código propio de `~/.claude`. En un repo del equipo manda su estándar.

**Sentido común con lo trivial.** Un constructor que solo inyecta dependencias, o un getter de una
línea, no necesitan tres párrafos: una frase basta, o ninguna. El script los lista porque no sabe
distinguir; distinguir es tu trabajo. Documentar lo obvio es tan dañino como no documentar lo
importante: enseña a saltarse los docblocks.

## 4. Entender el cambio antes de redactarlo

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

## 5. Escribir

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

## 6. Cerrar

- La documentación va **en el mismo MR que el código**. Es lo que pide el estándar y es la única
  forma de que no se quede atrás.
- Volver a correr **los dos scripts**: `check-docs.mjs` y `undocumented-functions.mjs`. Ninguna
  función nueva puede quedar sin documentar.
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
