---
name: update-manual
description: Actualizar el manual de usuario de cualquier proyecto (AIO, Epsilon, …) cuando se hacen cambios de interfaz: genera las capturas de pantalla reales manejando Chrome headless por CDP, las copia al repo del manual y actualiza los .md. Úsala también para OFRECER la actualización del manual cada vez que termines un ajuste que cambie lo que el usuario ve (vistas, tablas, modales, popups, mensajes, textos, flujos). Es la versión del cerebro y sustituye a las copias `update-web-manual` que traen los repos.
---

# Manual de usuario — motor transversal

Los manuales viven en repos aparte (sitios Docusaurus). Los cambios de interfaz los dejan
desactualizados, y actualizarlos incluye **volver a tomar las capturas de pantalla**, no solo
editar texto.

Esta skill es **del cerebro** y sirve a todos los proyectos. Lo que cambia entre uno y otro está
en su **perfil**, no aquí.

> Los repos traen copias propias llamadas `update-web-manual`. **Usa esta.** Aquella es del
> equipo y se queda como está; esta es la que tiene el motor compartido, las credenciales fuera
> del repo y el conocimiento acumulado de cada proyecto en su perfil.

## 1. Cuándo ofrecerlo

Después de terminar un ajuste que cambie algo que el usuario ve —una vista, una tabla, un modal,
un popup, un mensaje, el orden de un flujo— **pregunta si quiere actualizar el manual** antes de
dar la tarea por cerrada. Una sola pregunta, directa, y si dice que no, se cierra el tema.

No lo ofrezcas para cambios que el usuario no percibe: refactors, servicios, consultas,
endpoints, tipos, interfaces.

## 2. Ubicar el proyecto — siempre el primer paso

```bash
node ~/.claude/skills/update-manual/lib/profile.mjs
```

Dice en qué repo estás, a qué proyecto del cerebro pertenece y si tiene flujo de manual. Si dice
que no está registrado, hay que agregarlo a `~/.claude/brain/projects.json`.

**Lee después el `NOTES.md` del perfil.** Ahí está todo lo específico del proyecto: qué variables
hace falta configurar, cómo verificar que hay datos, la estructura de su manual, los módulos con
flujo ya escrito y —lo más valioso— la lista de trampas de esa app, cada una pagada con una
corrida fallida.

## 3. Preparar la rama del manual — antes de escribir nada ahí

La documentación **no se escribe sobre lo que estuviera activo** en el repo del manual: nace de
`qa` fresco, igual que una rama de desarrollo, para que quede en su propio commit y su propio MR,
revisable aparte del código.

```bash
node ~/.claude/skills/update-manual/lib/prepare-branch.mjs --project <proyecto> --nombre <rama>
```

Pone `qa` al día por fast-forward (fetch + merge/adelanto de referencia, nunca merge de verdad ni
descarte) y crea `<rama>` a partir de ahí. Si `<rama>` ya existe localmente —re-ejecuciones dentro
del mismo ticket—, la activa en vez de fallar.

**`--nombre` por defecto es el nombre de la rama del desarrollo que motivó el cambio** (la que
tengas activa en el repo de código al ofrecer el manual). Solo pon uno distinto si esa rama ya se
usó antes para otra cosa en el repo del manual.

Si `qa` divergió o tiene commits que el remoto no tiene, el script se para y avisa: eso se resuelve
a mano, nunca sobre la marcha.

## 4. Arquitectura

```
~/.claude/skills/update-manual/          MOTOR TRANSVERSAL
├── SKILL.md                             este procedimiento
└── lib/
    ├── browser.mjs                      Chrome por CDP: lanzar, evaluar, esperar, click, capturar
    ├── config.mjs                       configuración: entorno -> secrets.env -> settings del repo
    ├── manual.mjs                       copia al manual con validaciones
    ├── profile.mjs                      localiza el perfil del proyecto actual
    └── seed.mjs                         aplica el seed.sql de un flujo en la base local

~/.claude/brain/projects/<proyecto>/manual/   PERFIL DEL PROYECTO
├── profile.mjs                          qué manual, qué carpeta de imágenes, cómo se llaman sus variables
├── NOTES.md                             conocimiento de esa app
├── copy-to-manual.mjs                   CLI de copia, con los mapeos del proyecto registrados
├── lib/
│   ├── session.mjs                      adaptador de la app: su login, su framework, sus mapas
│   ├── api.mjs                          su backend: verificar datos y token
│   └── browser.mjs / config.mjs / manual.mjs    puentes al motor
└── modules/<modulo>/                    un flujo por módulo, replicando la ruta que tiene en el proyecto
    ├── capture.mjs
    └── mappings.mjs                     captura -> ruta dentro del manual
```

La frontera que importa:

| Capa | Qué va | Qué **no** va |
| --- | --- | --- |
| `lib/browser.mjs` del motor | Automatización de cualquier web | Nada que sepa de Vuetify, Leaflet o de una app concreta |
| `lib/session.mjs` del perfil | Lo de esa app: su login, su framework de UI, sus mapas | Nada de un módulo concreto |
| `modules/<modulo>/` del perfil | El flujo y el mapeo de ese módulo | Nada reutilizable por otro módulo |

**Un arreglo en el motor beneficia a todos los proyectos a la vez** — esa es la razón de que esté
separado. Pero si el cambio que necesitas es específico de un framework o de una app, **no va en
`browser.mjs`**: va en el `session.mjs` del perfil. Esa frontera es la que mantiene el driver
entendible.

Los puentes (`lib/browser.mjs`, `lib/config.mjs`, `lib/manual.mjs` del perfil) existen para que
los módulos importen `./browser.mjs` como siempre. El de `manual.mjs` además **inyecta el perfil**,
para que `copy-to-manual.mjs` no tenga que pasarlo en cada llamada.

### Agregar un módulo

1. Crear `modules/<modulo>/` en el perfil, siguiendo la ruta que tiene en el proyecto.
2. `capture.mjs` con el flujo, copiando uno existente como base y reutilizando los helpers del
   `session.mjs` sin cambios.
3. `mappings.mjs` con `export const MAPPINGS = { "<vista>": { "captura.png": "Ruta/En/Manual.png" } }`.
4. Registrar el `mappings.mjs` en `copy-to-manual.mjs`. Es el único archivo fuera del módulo que
   hay que tocar.

### Agregar un proyecto

Crear `~/.claude/brain/projects/<proyecto>/manual/` con su `profile.mjs`, su `session.mjs`, sus
puentes y su `NOTES.md`. **El motor no se toca.** Si al hacerlo descubres que sí hay que tocarlo,
probablemente estás metiendo algo específico donde no va.

## 5. Ejecución

```bash
cd ~/.claude/brain/projects/<proyecto>/manual

node modules/<modulo>/capture.mjs --salida <scratchpad>/capturas [opciones del módulo]
node copy-to-manual.mjs --origen <scratchpad>/capturas --vista <vista> [--sobrescribir]
```

Una corrida completa toma entre 2 y 4 minutos. `copy-to-manual.mjs --vista <cualquier cosa>` lista
las vistas disponibles.

**Comprueba por API que el módulo tiene datos antes de capturar.** Una corrida cuesta minutos;
consultar el endpoint del listado cuesta segundos. Una pantalla vacía no se documenta, y
descubrirlo al final significa haber gastado la corrida entera para nada.

### Los datos de la captura no pueden ser los de trabajo

Un plan llamado `sadf sadf s`, una placa `ABC123` o un descargue de 12 kg convierten una página
de manual en algo que nadie se cree. Cada flujo guarda su escenario presentable en un `seed.sql`
al lado de su `capture.mjs`, y `lib/seed.mjs` lo aplica antes de capturar:

```bash
node ~/.claude/skills/update-manual/lib/seed.mjs modules/<modulo>/seed.sql
node ~/.claude/skills/update-manual/lib/seed.mjs modules/<modulo>/seed.sql --dry-run
```

El SQL corre **dentro** del contenedor de Postgres, así que no hace falta cliente de psql en la
máquina. El contenedor, la base y el usuario salen de `db` en el perfil del proyecto, no del
código. **El `seed.sql` debe ser idempotente** —`update` repetibles e `insert` con
`where not exists`—, para poder aplicarlo antes de cada tanda sin duplicar nada.

**Node 22 o superior**: el driver usa el `WebSocket` nativo, que existe sin flags desde Node 22.
Con Node 20 o 21 hay que correr los scripts con `node --experimental-websocket`; si falta, el
script lo dice al arrancar.

**Antes de generar, mira con Read una captura ya publicada del mismo tipo.** Es la forma de
acertarle al encuadre: si el manual usa un recorte, una captura de ventana completa desentona
aunque el contenido sea correcto.

**Revisa siempre las imágenes con Read antes de copiarlas.** Las que salen mal no salen vacías:
salen con el mapa a medio dimensionar o con los formularios en skeletons.

`copy-to-manual.mjs` **no sobrescribe** imágenes que ya existan: hay que pedirlo con
`--sobrescribir`. Regenerar una captura histórica cambia documentación que nadie pidió tocar.

### Señalar qué mirar en la captura

`highlight` y `clearHighlights` dibujan un recuadro rojo sobre un elemento, con numeración
opcional:

```js
await highlight(cdp, ".map-measure-control button", { label: "1", padding: 8 });
await screenshot(cdp, `${outputDir}/medicion.png`, { selector: ".leaflet-container" });
await clearHighlights(cdp);   // siempre, antes de seguir con otra captura
```

| Opción | Para qué |
| --- | --- |
| `label` | Insignia numerada en la esquina. Úsala cuando el texto del manual enumere pasos o partes |
| `padding` | Separación entre el recuadro y el elemento (8 px va bien para botones) |
| `index` | Cuál de los elementos que cumplen el selector |
| `color` | Por defecto `#ff3b30` |

Si el elemento que documentas es pequeño o está rodeado de detalle, va señalado. Para una pantalla
completa que se explica sola, no hace falta.

## 6. Ortografía: siempre correcta, aunque el archivo no lo esté

Varios documentos de los manuales están escritos **sin tildes**. Es un defecto heredado, **no un
estilo que haya que imitar**.

Todo texto nuevo se escribe con ortografía correcta: tildes, `ñ`, signos de apertura (`¿` `¡`).
"Respetar el estilo del archivo" aplica al tono, a los títulos y al uso de emojis — **nunca a la
ortografía**.

Si el documento que estás tocando tiene el defecto, corrige lo que escribes y **ofrécele al
usuario normalizar el resto del archivo**; no lo hagas por tu cuenta, porque ensucia el diff del
cambio que sí te pidieron.

### Esperar un diálogo: no sirve esperar `.v-dialog`

`waitForSelector` comprueba `offsetParent !== null`, y un diálogo es `position: fixed`, así que su
`offsetParent` **siempre** es `null`: la espera se agota aunque el modal esté abierto y visible.
Hay que esperar **algo de adentro** —su título, un campo, el botón de guardar—. Vale para cualquier
framework que monte los modales con posición fija, Vuetify incluido.

## 7. Cuando algo falla

### Primero: navegadores huérfanos

Si un flujo falla con un **timeout esperando un selector del login** (`input[type="email"]`), casi
seguro no es la app: hay un navegador de una corrida anterior todavía escuchando en el 9222, y el
flujo se conectó a él en vez de lanzar uno nuevo. Está mirando la pestaña de otra corrida.

```bash
node ~/.claude/skills/update-manual/lib/close-orphans.mjs
```

Ocurre porque **con Chrome/Brave instalado por snap no se pueden matar por señal**: el
confinamiento devuelve `EACCES`. Un flujo que cierre con `chrome.process.kill()` deja el navegador
vivo cada vez, y los va acumulando hasta que ninguna corrida vuelve a funcionar.

El motor ya se defiende solo en tres frentes, así que esto debería ser raro:

| Situación | Qué hace el motor |
| --- | --- |
| El puerto ya está ocupado al arrancar | `launchChrome` avisa, cierra al huérfano y lanza el suyo |
| El script revienta con un error no capturado | Cierra los navegadores que había lanzado y sale con 1 |
| Ctrl+C a mitad de corrida | Igual, y sale con 130 |

Esa red **no sustituye** al `closeBrowser` en el `finally` de cada flujo: es lo que salva los
casos que el `finally` no cubre.

### El cierre correcto

Los flujos guardan `_fallo.png` en la carpeta de salida y escriben un diagnóstico con el estado de
lo que suele ser la causa. **Mirar esa captura antes de suponer nada**: la mayoría de las corridas
fallidas se resuelven viendo la imagen, no leyendo el error.

**Cierra el navegador con `closeBrowser(cdp, chrome)`, nunca con `chrome.process.kill()`.** El
fallo ocurre en el `finally`, así que **pisa el error de verdad** y deja el mensaje inútil
`Falló: kill EACCES` — además del navegador huérfano. `closeBrowser` también cierra el `cdp`, así
que no hace falta un `cdp.close()` antes.

Al escribir un flujo nuevo, **cópiale el cierre a uno que ya lo haga bien** en vez de improvisarlo.

### Un click que no hace nada

**Antes de dar un click por bueno, comprueba con `elementFromPoint` que en esas coordenadas está
el elemento que crees.** Un velo de diálogo, un tooltip que quedó abierto o una barra fija se
llevan el evento sin error ninguno, y el síntoma aparece pasos después y en otro sitio. Vale
también para elementos duplicados: si el DOM tiene dos variantes del mismo botón —una de
escritorio y una de móvil— la oculta mide 0×0 y su centro cae sobre cualquier otra cosa.

Al escribir un flujo nuevo, conviene la misma pauta: verificar cada paso en el momento en vez de
dejar que el error salte tres pasos después, lejos de su causa.

## 8. Al terminar

- **No dejar nada fuera del cerebro**: ni scripts en el repo, ni entradas en `package.json`. Si te
  hizo falta una utilidad, **agrégala** (al motor si sirve a todos los proyectos, al perfil si no);
  no la dejes como un comando suelto en el chat, porque se pierde.
- Las capturas intermedias van al scratchpad de la sesión, no a ningún repo.
- Verificar con `git status` que el repo de trabajo solo tiene los cambios que se pidieron. Revisa
  el `NOTES.md` del perfil: algunos proyectos ensucian archivos generados al levantar el dev server.
- **Si aprendiste algo nuevo de la app, escríbelo en el `NOTES.md` del perfil** antes de cerrar. Ese
  archivo es el que evita repetir corridas fallidas.
- Si tocaste el motor, **commitea el cerebro**: `git -C ~/.claude add -A && git -C ~/.claude commit`
  y `git -C ~/.claude push backup main`.
- Reportar qué capturas se regeneraron, qué documentos se editaron y qué imágenes previas se
  dejaron intactas.
- El commit del manual queda en la rama que creó el paso 3, no en la que estuviera antes. **Después
  de commitear, hacer el push** en el repo del manual:

  ```bash
  git push -u origin <rama>     # primera vez que se sube esta rama
  git push                      # si ya tenía upstream
  ```

  Abrir el MR hacia `qa` queda fuera de esta skill: esta sube la rama, no la mezcla.
