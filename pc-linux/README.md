# Configuracion PC Linux

Como se instala y se configura el computador de trabajo: aplicaciones, escritorio, red. Sirve
para dejar un equipo nuevo igual que el actual, o para reparar algo que se dano.

**No tiene nada que ver con los desarrollos.** Aqui no hay skills, ni proyectos, ni reglas de
Claude: solo manuales del computador. Lo de los desarrollos vive en `brain/`.

## Como se organiza

Una carpeta por tema, dentro de una categoria. Cada carpeta trae su `README.md` con el paso a
paso y, al lado, **los archivos de configuracion listos para copiar**: asi se restaura copiando,
no transcribiendo desde el manual.

| Categoria | Que va |
|---|---|
| `aplicaciones/` | Programas que se instalan y se ajustan: capturas, editores, navegadores |
| `escritorio/` | GNOME: atajos globales, extensiones, apariencia, monitores |
| `red/` | VPN, DNS, carpetas compartidas |
| `sistema/` | Paquetes base, controladores, arranque, energia |

Una categoria se crea cuando llega su primer manual, no antes.

Los manuales son **genericos**: describen la configuracion para cualquier escenario (una o varias
pantallas, Wayland o X11), no la foto de un dia concreto. Lo que dependa del equipo se dice como
condicion ("si hay mas de un monitor..."), no como dato.

## Manuales

| Tema | Manual |
|---|---|
| Flameshot: capturas con la tecla `Print`, al portapapeles y a una carpeta | [aplicaciones/flameshot](aplicaciones/flameshot/README.md) |
| VPN de la empresa con strongSwan: tunel completo, DNS de la VPN y Docker por fuera | [red/vpn-ipsec](red/vpn-ipsec/README.md) |
