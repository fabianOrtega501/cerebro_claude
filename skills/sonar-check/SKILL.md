---
name: sonar-check
description: >-
  Revisa las alertas de SonarQube for IDE (bugs, vulnerabilidades, code smells, puntos críticos de
  seguridad) de los archivos de código que tocó una rama. Lee los diagnósticos del editor, clasifica cada
  regla con los analizadores de la extensión, corrige las alertas de las líneas que agregó o cambió la rama
  y reporta las heredadas sin tocarlas. La corren `develop-ticket` al cerrar y `peer-review` al revisar
  (en modo de solo reporte), y también se usa a mano. Palabras gatillo: sonar, sonarqube, sonarlint,
  code smell, alertas de calidad, vulnerabilidad.
argument-hint: "[archivo …]"
---

# Revisión de alertas de SonarQube

SonarQube for IDE analiza el código en VS Code y publica sus alertas como diagnósticos del editor. Esta
skill las lee, las clasifica y corrige las que son de la rama **antes** de que lleguen al análisis del
servidor en el pipeline.

La regla es: **se corrige lo nuevo y se reporta lo heredado**. Las alertas de las líneas que agregó o
cambió la rama se corrigen; las que ya estaban en el archivo solo se reportan, para no ensuciar el diff con
cambios que nadie pidió.

## Requisitos

- **VS Code con la extensión SonarQube for IDE** (`sonarsource.sonarlint-vscode`).
- **Claude Code conectado al editor**: sin esa conexión no existe la herramienta `getDiagnostics`. Según la
  versión se llama `mcp__ide__getDiagnostics` o `mcp__claude-vscode__getDiagnostics`. Si es diferida,
  búscala con ToolSearch por la palabra `getDiagnostics` (nunca por un nombre fijo) y cárgala con
  `select:<nombre que devuelva>`.
  - La sesión abierta desde la terminal integrada de VS Code se conecta sola; desde otra terminal, con
    `/ide`.
  - La conexión se puede caer a mitad de la sesión, y entonces `/ide` puede responder sin que la
    herramienta vuelva. En ese caso, el desarrollador cierra la sesión y la retoma con `claude --continue`
    desde la terminal integrada de la ventana de VS Code que tiene abierto el repo.

Si falta cualquiera de los dos, la skill no corre: dilo en una línea («SonarQube no se corrió: <motivo>»)
y explica cómo activarlo. Sonar queda **pendiente** y se recuerda antes del commit y del merge request.
**Nunca se da un archivo por limpio sin haberlo leído.**

## 1. Qué archivos revisar

En este orden:
1. Los que pase el desarrollador o la skill que la llama.
2. Si no hay ninguno, los de la rama contra su base (la rama base del proyecto, según su `CLAUDE.md` o
   sus ramas): `git diff --name-only $(git merge-base HEAD origin/<base>)` más los no seguidos de
   `git status --porcelain`.

Solo archivos de código: `php, js, cjs, mjs, jsx, ts, tsx, vue, css, scss, less, html, py, java`. Se
ignoran `.d.ts`, `vendor/`, `node_modules/` y `dist/`.

## 2. Leer las alertas

Una llamada a `getDiagnostics` por archivo, con `uri` del archivo. Sin `uri` la respuesta trae todo el
workspace y puede pasar de 1 MB. La `uri` es `file://` seguida de la ruta absoluta con barras `/`:
- Linux y macOS: `file:///home/ana/repo/src/App.vue`.
- Windows: `file:///C:/Users/ana/repo/src/App.vue`, con la letra de la unidad. Nunca la forma de Git Bash
  (`/c/Users/…`) ni barras invertidas.

- **Solo cuentan los diagnósticos de Sonar:** `source` igual a `sonarqube` o `sonarlint`, o `code` con la
  forma `<repositorio>:<regla>` (`php:S1192`, `typescript:S6859`, `Web:S7927`, `css:S4666`). Lo de
  Intelephense, TypeScript o ESLint no es de esta skill.
- **Un archivo sin `linesInFile` y sin diagnósticos no está analizado**, no está limpio. Sonar solo
  analiza los archivos abiertos, y los diagnósticos son de cada ventana de VS Code. Ábrelo en la ventana
  conectada, sin crear otra: `code <carpeta o .code-workspace de esa ventana> <archivo>`. Con
  `code <otra carpeta> <archivo>` VS Code abre una ventana nueva, con otro SonarQube (otra JVM de ~1 GB),
  y las alertas no llegan aquí.
- **Un archivo por llamada a `code`:** con varios en el mismo comando, a veces solo se analiza el primero.
- **Después de un Edit o Write las alertas llegan solas** en `<ide_diagnostics>`, pero pueden ser de un
  estado intermedio (por ejemplo, un import sin usar entre dos ediciones). Antes de corregir, vuelve a
  leer los diagnósticos del archivo terminado.
- **Alertas viejas:** si `linesInFile` no coincide con las líneas del archivo en disco (± 1 por el salto
  final), el análisis es de una versión anterior. No se corrige nada con esas alertas: se vuelve a abrir
  el archivo y se leen otra vez; si siguen viejas, se reporta como «sin analizar».

## 3. Clasificar

```bash
node ~/.claude/skills/sonar-check/lib/rules.mjs php:S1192 typescript:S6859 Web:S7927
```

Devuelve por regla el **tipo** (Bug, Vulnerabilidad, Punto crítico de seguridad, Code smell), la severidad
por defecto (Blocker, Critical, Major, Minor, Info) y el título. Lee los JSON de los analizadores de la
extensión instalada, así que no necesita servidor ni token.

```bash
node ~/.claude/skills/sonar-check/lib/changed-lines.mjs --base origin/<base> <archivo> [<archivo> …]
```

Devuelve las líneas que la rama agregó o cambió contra su punto de salida de la base, incluido lo no
commiteado (`"ranges": "all"` si el archivo no está en git). La base es siempre la rama base del
proyecto, o la rama destino del merge request en una revisión de pares.

Ojo con los números de línea: los diagnósticos vienen **desde 0** (`range.start.line`) y los rangos de
git **desde 1**. Una alerta es **nueva** si `start.line + 1` cae dentro de un rango; si no, es **heredada**.

## 4. Corregir lo nuevo

En una revisión de pares este paso no se hace: las alertas nuevas van al informe para el compañero, y las
heredadas solo si su cambio las empeoró.

- La corrección sigue las convenciones del repo (su `CLAUDE.md` y los módulos vecinos).
- **No se silencia una alerta.** Nada de `// NOSONAR`, `@SuppressWarnings` ni desactivar la regla en la
  configuración: eso esconde el problema.
- Si la alerta es un **falso positivo**, o corregirla obliga a tocar algo compartido por otros módulos, no
  se corrige: se reporta con el motivo y decide el desarrollador.
- Las **vulnerabilidades** y los **puntos críticos de seguridad** se muestran siempre, aunque sean
  heredados, y antes que todo lo demás.
- Después de corregir, vuelve a leer los diagnósticos del archivo: una corrección puede destapar otra
  alerta. Repite hasta que no quede ninguna nueva.

## 5. Reportar

Un bloque corto, ordenado por tipo y severidad:

```
SonarQube — <n> archivos revisados
Corregidas (nuevas): <n>
  - <archivo>:<línea> <regla> <tipo>/<severidad> — <qué se hizo>
Heredadas (sin tocar): <n>
  - <archivo>:<línea> <regla> <tipo>/<severidad> — <título>
Sin analizar: <archivos, si hubo>
```

Si no hay alertas, basta una línea: «SonarQube: sin alertas en los archivos tocados». Si las heredadas
de un archivo ya se reportaron en la sesión, se mencionan solo por la cantidad.

## Modo conectado

El servidor del equipo es **SonarQube 9.9 LTS**. SonarQube for IDE 6.0 en adelante exige 2025.1, así que
la extensión se fija en la **5.10.0**, la última compatible. Con la 6.x el modo conectado deja de
funcionar (el log de la extensión dice «Your SonarQube Server instance has version 9.9…»).

- Cada desarrollador crea la conexión desde la vista de SonarQube de la extensión, con la URL del
  servidor y su propio token. El token queda en el almacén seguro de VS Code: nunca en el chat, en un
  `settings.json` ni en el repo.
- Cada repo se vincula con su `sonar.projectKey` (el de su `sonar-project.properties`) desde la misma
  vista. Si el repo versiona `.vscode/settings.json`, el vínculo no se commitea.
- Conectado, la extensión usa el perfil de calidad del servidor. Sin conexión usa «Sonar way», el perfil
  por defecto, y sirve igual para la revisión.
- Para JS, TS, Vue y CSS la extensión necesita Node `^20.12` o `≥ 22.11`. Si el log dice «Node.js could
  not be automatically detected» (pasa cuando VS Code no se abre desde una terminal y Node viene de nvm),
  configura `sonarlint.pathToNodeExecutable` en la configuración de usuario de VS Code.

## Límites

- Solo lectura sobre el servidor: no se corre `sonar-scanner`, porque publicaría un análisis.
- No cambia la configuración de Sonar de los repos ni sus reglas.
- No commitea: las correcciones quedan en el árbol de trabajo con el resto del desarrollo.
