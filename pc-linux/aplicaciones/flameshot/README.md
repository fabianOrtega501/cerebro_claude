# Flameshot

Deja flameshot asi: la tecla `Print` abre la seleccion sobre **todas las pantallas conectadas**,
`Enter` confirma, la captura queda en el portapapeles y se guarda una copia en PNG en
`~/Imágenes/Capturas de pantalla`.

Sirve con una pantalla o con varias, en sesion Wayland o X11. Esta probado en Ubuntu con GNOME;
en otras distribuciones cambia solo el comando para instalar paquetes.

## Archivos de esta carpeta

| Archivo | Va en | Para que |
|---|---|---|
| `flameshot-copy` | `~/.local/bin/flameshot-copy` | El script que corre la tecla `Print` |
| `flameshot.ini` | `~/.config/flameshot/flameshot.ini` | Las preferencias de flameshot |
| `flameshot.desktop` | `~/.config/autostart/flameshot.desktop` | Arrancar flameshot al iniciar sesion |

## Como funciona

1. `Print` no abre flameshot directamente: corre el script `flameshot-copy`.
2. El script abre la seleccion de flameshot en modo `xcb` y recibe la imagen por la salida
   estandar (`--raw`).
3. Si hubo captura, guarda una copia en PNG y la pone en el portapapeles: con `wl-copy` en
   Wayland y con `xclip` en X11.

**Por que el modo `xcb`.** En Wayland nativo una aplicacion no puede ubicar su ventana ni hacer
que ocupe varias pantallas: el escritorio la deja en una sola, y la seleccion solo aparece ahi.
Con `QT_QPA_PLATFORM=xcb` la ventana corre sobre XWayland y cubre todas. En X11 `xcb` es el modo
normal, asi que la misma linea sirve en las dos sesiones.

**Por que el script y no el portapapeles de flameshot.** Bajo Wayland flameshot no logra
escribir de forma confiable en el portapapeles. Con `--raw` la imagen sale por la salida estandar
y una herramienta del sistema la deja en el portapapeles.

Para saber en que sesion se esta:

```bash
echo $XDG_SESSION_TYPE    # wayland o x11
```

## Instalacion paso a paso

Los comandos se corren desde esta carpeta (`~/.claude/pc-linux/aplicaciones/flameshot`).

### 1. Paquetes

```bash
sudo apt update
sudo apt install flameshot wl-clipboard xclip xwayland
```

`wl-clipboard` se usa en Wayland y `xclip` en X11. Se instalan los dos para que el equipo sirva
en cualquier sesion. En Ubuntu con GNOME ya vienen `xdg-desktop-portal` y
`xdg-desktop-portal-gnome`, que flameshot necesita para capturar bajo Wayland.

Instalar con **apt**, no con snap ni flatpak. Las versiones empaquetadas en sandbox tienen
problemas con el portal de capturas y con `--raw`.

En otras distribuciones: `sudo dnf install flameshot wl-clipboard xclip xorg-x11-server-Xwayland`
(Fedora) o `sudo pacman -S flameshot wl-clipboard xclip xorg-xwayland` (Arch).

### 2. Script de captura

```bash
mkdir -p ~/.local/bin
cp flameshot-copy ~/.local/bin/flameshot-copy
chmod +x ~/.local/bin/flameshot-copy
```

La carpeta de destino de las capturas se cambia en la linea `DIR=` del script.

### 3. Preferencias de flameshot

```bash
mkdir -p ~/.config/flameshot
cp flameshot.ini ~/.config/flameshot/flameshot.ini
```

En el archivo, cambiar `savePath` por la ruta del usuario del equipo nuevo. Flameshot no
interpreta `~` ni `$HOME`: la ruta va completa, por ejemplo
`/home/<usuario>/Imágenes/Capturas de pantalla`.

Lo que importa del archivo:

- `TYPE_ACCEPT=Return`: `Enter` confirma la seleccion y se la entrega al script. **Sin esto el
  atajo no funciona**: si `Enter` queda asignado a copiar, la imagen no le llega al script.
- `copyOnDoubleClick=true`: un doble clic sobre la seleccion tambien la confirma.
- `showHelp=false` y `showStartupLaunchMessage=false`: sin textos de ayuda ni avisos al arrancar.
- `savePath` y `saveAsFileExtension` solo aplican cuando se guarda desde el propio flameshot
  (`Ctrl+S`, o la captura desde la bandeja). Con `Print` guarda el script, siempre en PNG.

### 4. Quitarle la tecla `Print` a la captura de GNOME

Si GNOME conserva `Print` para su propia herramienta, el atajo de flameshot no se dispara.

```bash
gsettings set org.gnome.shell.keybindings show-screenshot-ui "[]"
```

`Shift+Print` (pantalla completa) y `Alt+Print` (ventana) siguen siendo de GNOME y no estorban.

### 5. Atajo `Print` hacia el script

Por interfaz: **Configuracion → Teclado → Ver y personalizar atajos → Atajos personalizados →
Agregar**, con nombre `Flameshot`, comando `/home/<usuario>/.local/bin/flameshot-copy` y la tecla
`Print`. El comando va con la ruta completa: el atajo no interpreta `~`.

Por terminal, si no hay otros atajos personalizados:

```bash
BASE=org.gnome.settings-daemon.plugins.media-keys
RUTA=/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/
gsettings set $BASE custom-keybindings "['$RUTA']"
gsettings set $BASE.custom-keybinding:$RUTA name 'Flameshot'
gsettings set $BASE.custom-keybinding:$RUTA command "$HOME/.local/bin/flameshot-copy"
gsettings set $BASE.custom-keybinding:$RUTA binding 'Print'
```

Si ya hay atajos personalizados, el tercer comando los borra. En ese caso, mejor hacerlo por la
interfaz, o revisar primero la lista con
`gsettings get org.gnome.settings-daemon.plugins.media-keys custom-keybindings` y usar un
`customN` que no exista.

### 6. Arranque al iniciar sesion

```bash
mkdir -p ~/.config/autostart
cp flameshot.desktop ~/.config/autostart/flameshot.desktop
```

Deja flameshot en la bandeja desde el inicio. Con eso la primera captura abre mas rapido y queda
el menu para capturar con el mouse.

### 7. Permiso del portal de capturas (solo Wayland)

La primera captura puede mostrar un dialogo pidiendo permiso para tomar capturas: aceptarlo. Para
revisar que quedo concedido:

```bash
flatpak permissions screenshot
```

Debe aparecer una fila que termina en `yes`. El comando viene con el paquete `flatpak`; si no
esta instalado, basta con que el dialogo se haya aceptado.

### 8. Aplicar sin cerrar sesion

```bash
pkill -x flameshot
flameshot &
```

## Verificacion

1. Oprimir `Print`: la pantalla se oscurece **en todas las pantallas conectadas**.
2. Seleccionar un area, en cualquier pantalla, y oprimir `Enter`.
3. Pegar en cualquier aplicacion: debe salir la captura.
4. En `~/Imágenes/Capturas de pantalla` debe aparecer un PNG con la fecha y la hora.
5. Oprimir `Print` y luego `Esc`: no se guarda nada y el portapapeles no cambia.

Al conectar o desconectar un monitor no hay que hacer nada: la seleccion toma las pantallas que
esten conectadas en el momento de oprimir `Print`.

Prueba sin el atajo, desde una terminal:

```bash
QT_QPA_PLATFORM=xcb flameshot gui --raw > /tmp/prueba.png && ls -la /tmp/prueba.png
```

## Si algo falla

| Sintoma | Causa probable | Que hacer |
|---|---|---|
| Con varias pantallas, la seleccion solo aparece en una | El script corre con `QT_QPA_PLATFORM=wayland`, o falta `xwayland` | Usar el script de esta carpeta e instalar `xwayland` |
| `Print` abre la herramienta de GNOME | `show-screenshot-ui` todavia tiene `Print` | Paso 4 |
| `Print` no hace nada | El script no es ejecutable, o la ruta del atajo esta mal o usa `~` | `chmod +x` y revisar el comando del paso 5 |
| Se guarda la captura, pero no queda en el portapapeles | Falta `wl-clipboard` (Wayland) o `xclip` (X11) | Paso 1 |
| `Enter` no confirma la seleccion | `TYPE_ACCEPT` vacio o `Enter` asignado a copiar en el `.ini` | Paso 3 |
| La imagen sale corrida o con la escala mal | Escalado fraccional (125 %, 150 %), sobre todo con pantallas de distinta escala | Probar con todas las pantallas a 100 % o 200 % |
| Pantalla negra o captura vacia | No se concedio el permiso del portal | Paso 7 |
| `Ctrl+S` guarda en otra carpeta o falla | `savePath` con la ruta de otro usuario | Paso 3 |

Para ver que paso en cada captura:

```bash
journalctl --user -b | grep -i flameshot | tail -30
```

Las lineas `QPainter::... Painter not active` y `QLayout: Attempting to add QLayout` salen
siempre y no indican falla. `Screenshot aborted` significa que la seleccion se cancelo.
