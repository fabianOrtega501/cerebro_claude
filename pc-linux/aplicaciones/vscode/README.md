# VS Code

Deja VS Code con la configuracion de usuario, los atajos y las extensiones del equipo de trabajo,
incluida SonarQube for IDE conectada al servidor del equipo.

Probado en Ubuntu con VS Code instalado por `.deb` o por el repositorio de Microsoft. Si se
instalo por snap o flatpak, la carpeta de usuario cambia de lugar.

## Archivos de esta carpeta

| Archivo | Va en | Para que |
|---|---|---|
| `settings.json` | `~/.config/Code/User/settings.json` | Configuracion de usuario: editor, git, Claude Code y SonarQube |
| `keybindings.json` | `~/.config/Code/User/keybindings.json` | Atajos propios |
| `extensions.txt` | — | Lista de extensiones para instalar de una vez |
| `sonarqube.md` | — | Manual de SonarQube for IDE en modo conectado |

## Instalacion paso a paso

Los comandos se corren desde esta carpeta (`~/.claude/pc-linux/aplicaciones/vscode`).

### 1. Extensiones

```bash
xargs -L1 code --install-extension < extensions.txt
```

Todas se instalan en su version mas reciente, salvo SonarQube for IDE, que va fija en `@5.10.0`
porque el servidor del equipo es 9.9. Despues hay que quitarle la actualizacion automatica a esa
extension: el paso 1 de [sonarqube.md](sonarqube.md).

Para comprobar lo instalado:

```bash
code --list-extensions --show-versions
```

### 2. Configuracion de usuario

Si el equipo ya tiene un `settings.json` propio, revisarlo antes de reemplazarlo: el `cp` lo
pisa.

```bash
cp settings.json ~/.config/Code/User/settings.json
```

Despues, en `sonarlint.pathToNodeExecutable`, cambiar `<usuario>` y `v24.x.x` por la ruta real de
Node: el paso 2 de [sonarqube.md](sonarqube.md).

Lo que importa del archivo:

- `files.autoSave: afterDelay`: guarda solo, sin `Ctrl+S`.
- `diffEditor.ignoreTrimWhitespace: false`: el diff muestra los cambios de espacios, que son los
  que despues aparecen en el MR.
- `workbench.browser.openLocalhostLinks: false`: los enlaces a `localhost` abren el navegador del
  sistema, no el de VS Code.
- `claudeCode.preferredLocation: panel`: Claude Code abre en el panel inferior.

### 3. Atajos

```bash
cp keybindings.json ~/.config/Code/User/keybindings.json
```

| Atajo | Que hace |
|---|---|
| `Ctrl+;` | Abre una terminal nueva |
| `Ctrl+Shift+Espacio` | Abre la ultima conversacion de Claude Code |
| `Alt+,` / `Alt+.` | Escribe `<` / `>`, en el editor y en la terminal |
| `Alt+Shift+.` | Escribe `->` en el editor |

Los de `<` y `>` son para teclados sin la tecla 102 (la que esta junto al `Shift` izquierdo en
los teclados en espanol). En un teclado que la tenga se pueden omitir.

### 4. SonarQube

Seguir [sonarqube.md](sonarqube.md): token, conexion y vinculo de cada repo.

## Verificacion

1. `code --list-extensions --show-versions | grep -i sonar` muestra `@5.10.0`.
2. `Ctrl+;` abre una terminal nueva.
3. La verificacion de [sonarqube.md](sonarqube.md) muestra la alerta `typescript:S1128`.

## Mantener esta carpeta al dia

Los archivos son una copia, no un enlace: si se cambia la configuracion en VS Code, hay que
volver a copiarla aqui.

```bash
cp ~/.config/Code/User/settings.json ~/.config/Code/User/keybindings.json .
code --list-extensions | sed 's/^sonarsource.sonarlint-vscode$/&@5.10.0/' > extensions.txt
```

Despues de copiar, devolver en `settings.json` la ruta de Node al marcador `<usuario>` y
`v24.x.x`.
