# SonarQube en VS Code: configuración paso a paso

Guía para que SonarQube for IDE (la extensión antes llamada SonarLint) muestre en VS Code las mismas
alertas que el análisis de SonarQube del pipeline. Está probada en Ubuntu con nvm.

## Antes de empezar

- El servidor del equipo es **SonarQube 9.9.8**, en `http://192.168.100.5:9092`. Las versiones 6.x de
  la extensión solo se conectan a SonarQube 2025.1 o superior y rechazan el nuestro. Por eso se instala
  la **5.10.0** y se deja fija.
- Un usuario de SonarQube con acceso a los proyectos.
- Node instalado con nvm. Sirve la versión de Node con la que se trabaja en los repos (en este equipo,
  la 24).

## 1. Instalar la extensión en la versión 5.10.0

Si ya está instalada una 6.x, se desinstala primero:

```bash
code --uninstall-extension SonarSource.sonarlint-vscode
code --install-extension SonarSource.sonarlint-vscode@5.10.0
```

Después, en VS Code:

1. Abre Extensiones (`Ctrl+Shift+X`) y busca **SonarQube for IDE**.
2. En el engranaje de la extensión, desmarca **Auto Update** (Actualizar automáticamente).
3. Si VS Code ofrece actualizarla, **no aceptes**: con la 6.x la conexión deja de funcionar.

Para comprobar la versión:

```bash
code --list-extensions --show-versions | grep -i sonar
```

Debe mostrar `sonarsource.sonarlint-vscode@5.10.0`.

## 2. Indicarle a Sonar dónde está Node

Sin Node, Sonar no analiza JavaScript, TypeScript, Vue ni CSS. Si VS Code se abre desde el menú de
Ubuntu y no desde la terminal, no ve el Node de nvm, así que hay que darle la ruta.

1. En una terminal:
   ```bash
   nvm use 24
   which node
   ```
   El resultado es algo como `/home/<usuario>/.nvm/versions/node/v24.x.x/bin/node`.
2. En VS Code: `Ctrl+Shift+P` → **Preferences: Open User Settings (JSON)**.
3. Agrega estas dos líneas, con tu ruta (ya vienen en el `settings.json` de esta carpeta, con un
   marcador en la ruta):
   ```json
   "sonarlint.pathToNodeExecutable": "/home/<usuario>/.nvm/versions/node/v24.x.x/bin/node",
   "sonarlint.focusOnNewCode": true
   ```
   La segunda línea destaca las alertas del código nuevo y **puede ocultar las del código que ya
   existía**. Si se quiere ver todo lo de un archivo, se pone en `false`.

Si después se actualiza Node con nvm, la ruta cambia y hay que corregirla aquí.

## 3. Crear el token en SonarQube

1. Entra a `http://192.168.100.5:9092` con tu usuario.
2. Ve a **My Account → Security → Generate Tokens**.
3. Ponle un nombre (por ejemplo, `vscode`) y genéralo.
4. **Cópialo en ese momento:** SonarQube lo muestra una sola vez. No lo guardes en archivos del
   proyecto ni lo compartas por chat.

## 4. Crear la conexión en VS Code

1. Abre el panel de **SonarQube for IDE** en la barra lateral → **Connected Mode** → **Add SonarQube
   Connection**.
2. En *Server URL* pon `http://192.168.100.5:9092` y pega el token.
3. En el nombre de la conexión pon **`http-192-168-100-5-9092`**. Es el `connectionId` que ya traen
   versionado aio-app y status: con ese nombre, esos repos quedan vinculados sin tocar ningún archivo.

La URL y el nombre quedan en tu configuración de usuario. El token lo guarda VS Code aparte, de forma
segura; no queda en ningún `settings.json`.

## 5. Vincular cada repo a su proyecto de SonarQube

Cada repo tiene un `sonar-project.properties` con su `sonar.projectKey`. El vínculo se guarda en el
`.vscode/settings.json` del repo:

```json
"sonarlint.connectedMode.project": {
  "connectionId": "http-192-168-100-5-9092",
  "projectKey": "aio_app"
}
```

| Repo | projectKey | `.vscode/settings.json` versionado |
|---|---|---|
| aio-app | `aio_app` | Sí, ya con el vínculo |
| aio-backend | `aio_backend` | No |
| status | `devops_status_AYDYFtE7FxXTAZEV50c2` | Sí, ya con el vínculo |
| epsilon | `epsilon_front` | No |
| epsilon-backend | `epsilon_back` | No |
| sipa | `devops_sipa_AYDYcm7XFxXTAZEV50dn` | No |
| app-movil | `ami` | No |
| rutamas-movil | `rutamas_mobile` | No |
| status-api | — (no tiene `sonar-project.properties`) | — |

La tabla es la foto del 2026-10-21; ante la duda, manda el `sonar-project.properties` del repo.

### Repos que ya traen el vínculo (aio-app, status)

Con la conexión llamada `http-192-168-100-5-9092` no hay nada que hacer: al abrir el repo, Sonar ya
sabe a qué proyecto pertenece.

**Si prefieres otro nombre de conexión**, el vínculo obliga a cambiar el `connectionId` del archivo, y
ese cambio aparece como modificado en git y se puede colar en un commit. Para evitarlo, vincula desde el
panel (**Bind to SonarQube project**) y dile a git que ignore tu cambio local:

```bash
git update-index --skip-worktree .vscode/settings.json
```

Si después un `pull` falla porque ese archivo cambió en el remoto, quita la marca, devuelve el archivo a
su versión del repo, haz el pull y vuelve a vincular:

```bash
git update-index --no-skip-worktree .vscode/settings.json
git checkout -- .vscode/settings.json
git pull
```

En estos repos **no sirve** `.git/info/exclude`: solo ignora archivos que git todavía no sigue.

### Repos sin el archivo versionado

Vincula desde el panel (**Bind to SonarQube project**). Se crea un `.vscode/settings.json` nuevo; para
que no aparezca en git, agrégalo a `.git/info/exclude` del repo. Es un ignorado local que no se comparte
con nadie:

```bash
echo ".vscode/settings.json" >> .git/info/exclude
```

Antes de hacerlo, confirma con `git ls-files .vscode` que el archivo de verdad no está versionado: si
aparece, el repo pasó al caso anterior.

## 6. Verificar que funciona

1. Recarga VS Code: `Ctrl+Shift+P` → **Developer: Reload Window**.
2. Crea un archivo `.ts` cualquiera con un import sin usar:
   ```ts
   import { ref } from 'vue'

   export const x = 1
   ```
3. Abre **Problemas** (`Ctrl+Shift+M`). Debe aparecer *"Remove this unused import of 'ref'"*, con origen
   `sonarqube` y código `typescript:S1128`. Si sale, Sonar está analizando bien. Borra el archivo.
4. Si no aparece, revisa **Output → SonarQube for IDE**: ahí se ve si falló la conexión, el token o la
   ruta de Node.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La conexión se rechaza por versión del servidor | La extensión se actualizó a 6.x | Paso 1, y desmarcar Auto Update |
| No hay alertas en `.ts`, `.vue`, `.js` ni `.css`, pero sí en PHP | Sonar no encuentra Node | Paso 2; revisar que la ruta exista con `ls` |
| Dejó de analizar JS después de actualizar Node | La ruta del paso 2 apunta a la versión vieja | Corregir la ruta |
| `.vscode/settings.json` aparece modificado en git | Se vinculó con otro nombre de conexión | Paso 5, repos que ya traen el vínculo |
| Un `pull` falla por `.vscode/settings.json` | El archivo tiene `skip-worktree` y cambió en el remoto | Los tres comandos del paso 5 |
| Error de autenticación en Output | Token vencido o revocado | Generar otro (paso 3) y editar la conexión |
| Un archivo no muestra alertas | Está cerrado, o `focusOnNewCode` oculta las del código viejo | Abrirlo y esperar; o `focusOnNewCode: false` |

## Para tener en cuenta

- **Sonar solo analiza los archivos abiertos.** Que un archivo cerrado no tenga alertas no quiere decir
  que esté limpio: ábrelo y espera unos segundos.
- **Las alertas son de cada ventana.** Un archivo abierto en otra ventana de VS Code se analiza en esa
  ventana.
- **Solo cuentan las alertas con origen `sonarqube`.** En aio-app, los errores *«Definition for rule …
  not found»* son de ESLint en el editor (le faltan unas reglas internas del repo) y se pueden ignorar.
  Los avisos de Intelephense en PHP (*«Undefined method»*, *«no type information»*) tampoco son de Sonar.
- **No actualices la extensión** mientras el servidor siga en la 9.9. Cuando se actualice el servidor, se
  puede pasar a la versión actual: hay que cambiar el `@5.10.0` de `extensions.txt` y este manual.
- **Si cambia la IP o el puerto del servidor**, cambia también el `connectionId` que conviene usar. Hay
  que revisar el que traen aio-app y status y actualizar este manual.
