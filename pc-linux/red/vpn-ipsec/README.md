# VPN de la empresa (IPsec con strongSwan)

Deja el computador conectandose a la VPN de la empresa desde una red externa (casa, datos del
celular): con la VPN encendida se llega a los servidores internos (GitLab, bases de desarrollo),
se sigue navegando en internet y los contenedores de Docker siguen respondiendo.

**En la red de la oficina la VPN no hace falta**: los servidores internos se alcanzan directo.

Esta probado en Ubuntu con GNOME y strongSwan 6. En otras distribuciones cambia solo el comando
para instalar paquetes.

## Archivos de esta carpeta

| Archivo | Va en | Para que |
|---|---|---|
| `ipsec.conf` | `/etc/ipsec.conf` | La conexion `fabrica`: servidor, autenticacion y cifrado |
| `ipsec.secrets.example` | `/etc/ipsec.secrets` | Formato de las credenciales. Las claves reales no estan aqui |
| `resolve.conf` | `/etc/strongswan.d/charon/resolve.conf` | Le dice a strongSwan que use el script de DNS de abajo |
| `strongswan-resolvconf` | `/usr/local/sbin/strongswan-resolvconf` | Pone el DNS de la empresa al conectar y devuelve el de la red al desconectar |
| `10-docker-bypass-vpn` | `/etc/NetworkManager/dispatcher.d/10-docker-bypass-vpn` | Deja las redes de Docker por fuera del tunel |

## Lo basico: que es cada pieza

- **VPN.** Un tunel cifrado entre este computador y el firewall de la empresa. Mientras esta
  encendida, el computador se comporta como si estuviera dentro de la red de la oficina.
- **IPsec.** El protocolo con el que se arma ese tunel. Se negocia en dos fases: la **fase 1
  (IKE)** comprueba quien es quien y acuerda las claves; la **fase 2 (ESP)** es el tunel por donde
  viaja el trafico.
- **strongSwan.** El programa que habla IPsec en Linux. Su servicio se llama `strongswan-starter`
  y su proceso, `charon`. Se maneja con el comando `ipsec`.
- **Autenticacion en dos pasos.** Primero una **clave compartida (PSK)**, igual para todo el grupo
  de usuarios; despues el **usuario y la contrasena personales (XAuth)**. Las dos las entrega TI.
- **IKEv1 en modo agresivo.** La version del protocolo que pide el firewall de la empresa. Es
  vieja, pero es la que el servidor acepta: no se cambia desde este lado.
- **IP virtual.** Al conectar, el firewall le asigna al computador una IP de la red de la VPN
  (`leftsourceip=%config`). Todo lo que sale por el tunel sale con esa IP.
- **Tunel completo.** `rightsubnet=0.0.0.0/0` manda **todo** el trafico IPv4 por la VPN, incluso
  el de internet. Por eso importa el DNS: el router de la casa queda del otro lado del tunel y ya
  no responde.
- **Tabla 220.** strongSwan pone sus rutas en una tabla de rutas aparte, la 220, que se consulta
  antes que la normal (`main`). Por eso todo lo que no se excluya a proposito termina en el tunel.

## Como funciona

1. `sudo ipsec up fabrica` arranca la negociacion con el firewall de la empresa: fase 1 con la PSK
   y XAuth, y fase 2 con el tunel.
2. El firewall entrega la IP virtual y el DNS interno de la empresa.
3. strongSwan instala la IP virtual en la interfaz de salida (wifi o cable) y una ruta por defecto
   en la tabla 220: desde ese momento el trafico IPv4 viaja cifrado.
4. Para el DNS, strongSwan llama a `strongswan-resolvconf`, que pone el DNS de la empresa en la
   interfaz de salida. Asi los nombres (los de internet y los internos) se resuelven por el tunel.
5. Al desconectar, el mismo script devuelve a la interfaz el DNS que tenia NetworkManager (el del
   router), y todo queda como antes de conectar.
6. Aparte, cada vez que NetworkManager levanta una red, el script `10-docker-bypass-vpn` agrega
   reglas que mandan las redes de Docker a la tabla normal, antes de que la tabla 220 las tome.

**Por que el script de DNS.** strongSwan trae su propia forma de instalar el DNS: llama a
`resolvconf` sobre la interfaz `lo`. En Ubuntu, `resolvconf` es `systemd-resolved`, que no acepta
DNS en `lo`, y la conexion termina sin DNS de la empresa (`adding DNS server failed` en el log).
Con el router de la casa al otro lado del tunel, ningun nombre se resuelve: parece que no hubiera
internet, aunque si lo hay. Tampoco sirve solo cambiar la interfaz: al desconectar, strongSwan
borraria todos los DNS de la interfaz, incluido el del router. El script resuelve las dos cosas.

**Por que el script de Docker.** Las redes de los contenedores (`172.18.0.0/16` y vecinas) son
locales, pero la ruta de la tabla 220 tambien las cubre. Sin las reglas, con la VPN encendida los
contenedores dejan de responder desde el computador. La red `172.17.0.0/16` (`docker0`) queda a
proposito por fuera de la lista: en esa red esta una base de desarrollo de la empresa y tiene que
ir por el tunel. Si la red de alguna base o servidor interno cae dentro de las redes de la lista,
hay que sacarla de ahi.

## Instalacion paso a paso

Los comandos se corren desde esta carpeta (`~/.claude/pc-linux/red/vpn-ipsec`).

### 1. Datos que hay que pedirle a TI

- IP publica del firewall de la VPN (`<ip-gateway-vpn>`).
- Usuario de la VPN (`<usuario-vpn>`).
- Clave compartida del grupo (PSK).
- Contrasena personal (XAuth).

Ninguno de esos datos va en esta carpeta ni en ningun archivo versionado.

### 2. Paquetes

```bash
sudo apt update
sudo apt install strongswan strongswan-starter libcharon-extauth-plugins libcharon-extra-plugins
```

`strongswan-starter` trae el comando `ipsec` y lee `ipsec.conf`. `libcharon-extauth-plugins` trae
XAuth (`xauth-generic`): sin ese paquete, la autenticacion de usuario falla.

En otras distribuciones: `sudo dnf install strongswan` (Fedora) o `sudo pacman -S strongswan`
(Arch). En Arch, el modo `ipsec.conf` puede no venir activo y hay que usar `swanctl`.

### 3. La conexion

```bash
sudo cp ipsec.conf /etc/ipsec.conf
sudo nano /etc/ipsec.conf
```

Reemplazar `<ip-gateway-vpn>` y `<usuario-vpn>` (aparece dos veces). Lo que importa del archivo:

- `keyexchange=ikev1` y `aggressive=yes`: lo que exige el firewall de la empresa.
- `leftauth=psk` + `leftauth2=xauth`: los dos pasos de autenticacion.
- `leftsourceip=%config`: pedir la IP virtual al servidor.
- `rightsubnet=0.0.0.0/0`: tunel completo.
- `ike=` y `esp=`: los cifrados aceptados. El `!` al final obliga a usar solo esa lista. Si TI
  cambia el cifrado del firewall, la conexion falla con `no proposal chosen` y hay que ajustarlos.
- `forceencaps=yes`: encapsula el tunel en UDP 4500. Necesario detras del router de una casa
  (NAT); sin esto, en muchas redes la fase 2 no pasa.
- `dpdaction=restart` y `dpddelay=30s`: cada 30 segundos se comprueba que el tunel siga vivo, y si
  se cae se vuelve a levantar solo.
- `auto=add`: la conexion queda cargada pero **no** arranca al prender el computador. Se enciende a
  mano (paso 8).

### 4. Las credenciales

```bash
sudo cp ipsec.secrets.example /etc/ipsec.secrets
sudo nano /etc/ipsec.secrets
sudo chmod 600 /etc/ipsec.secrets
sudo chown root:root /etc/ipsec.secrets
```

Reemplazar el usuario, la PSK y la contrasena. Las comillas se dejan. Si la contrasena cambia,
se edita este archivo y se recarga con `sudo ipsec rereadsecrets`.

### 5. El DNS de la VPN

```bash
sudo install -m 755 -o root -g root strongswan-resolvconf /usr/local/sbin/strongswan-resolvconf
sudo cp /etc/strongswan.d/charon/resolve.conf /etc/strongswan.d/charon/resolve.conf.bak
sudo install -m 644 -o root -g root resolve.conf /etc/strongswan.d/charon/resolve.conf
```

El unico cambio frente al `resolve.conf` que trae el paquete es la linea
`path = /usr/local/sbin/strongswan-resolvconf`. strongSwan solo lee los `*.conf` de esa carpeta,
asi que el `.bak` no estorba.

**Al actualizar strongSwan**, `apt` puede preguntar si reemplaza `resolve.conf` por la version
nueva. Responder que **no** (conservar la actual). Si se reemplazo, repetir este paso.

### 6. Docker por fuera del tunel (solo si se usa Docker)

```bash
sudo install -m 755 -o root -g root 10-docker-bypass-vpn /etc/NetworkManager/dispatcher.d/10-docker-bypass-vpn
```

NetworkManager corre los scripts de esa carpeta cada vez que levanta una red. Para aplicarlo sin
reconectar: `sudo /etc/NetworkManager/dispatcher.d/10-docker-bypass-vpn`.

### 7. Arrancar el servicio

```bash
sudo systemctl enable --now strongswan-starter
sudo systemctl restart strongswan-starter
```

El servicio queda arrancando con el sistema, pero el tunel no: solo se carga la conexion.

### 8. Uso diario

```bash
sudo ipsec up fabrica       # encender
sudo ipsec down fabrica     # apagar
sudo ipsec status           # ver si esta arriba
```

**No reconectar el wifi con la VPN encendida.** Al reconectar, NetworkManager borra la IP virtual
y las rutas, pero strongSwan sigue mostrando la conexion como establecida: el tunel queda roto
sin avisar. Si hay que cambiar de red, primero `ipsec down`, despues se cambia la red y al final
`ipsec up`.

## Verificacion

Con la VPN encendida:

1. `sudo ipsec status` muestra `ESTABLISHED` e `INSTALLED`.
2. `ip -4 addr show dev wlp0s20f3` (o la interfaz de cable) muestra una segunda IP, la virtual,
   terminada en `/32`.
3. `ip route show table 220` muestra una ruta `default ... src <ip-virtual>`.
4. `resolvectl dns` muestra el DNS de la empresa en la interfaz de salida.
5. `getent hosts google.com` responde al instante y el navegador abre paginas.
6. Un servidor interno responde, por ejemplo `ping` al GitLab interno.
7. `docker ps` y los contenedores responden igual que sin VPN.

Despues de `sudo ipsec down fabrica`:

8. `resolvectl dns` vuelve a mostrar el DNS del router y se sigue navegando.

**Ojo al probar con Claude Code u otra herramienta en linea:** si la VPN se rompe, la sesion se
queda sin internet en medio de la prueba. Es mejor un script que encienda la VPN, guarde los
resultados en un archivo y la apague solo al terminar.

## Si algo falla

| Sintoma | Causa probable | Que hacer |
|---|---|---|
| Con la VPN encendida no abre ninguna pagina, pero `ping 8.8.8.8` responde | El DNS de la empresa no se instalo. En el log: `adding DNS server failed` | Paso 5. Revisar que `resolve.conf` tenga la linea `path` |
| Al apagar la VPN no se resuelven nombres | El script de DNS no devolvio el DNS del router | `sudo nmcli device reapply <interfaz>`, o reconectar la red |
| `ipsec status` dice `ESTABLISHED` pero no se llega a nada interno y `ip route show table 220` sale vacio | Se reconecto la red con la VPN encendida y se perdio la IP virtual | `sudo ipsec down fabrica` y `sudo ipsec up fabrica` |
| `no proposal chosen` al conectar | TI cambio el cifrado del firewall | Pedir los cifrados a TI y ajustar `ike=` / `esp=` (paso 3) |
| La conexion se corta despues de pedir el usuario | Usuario o contrasena XAuth incorrectos, o falta `libcharon-extauth-plugins` | Revisar `/etc/ipsec.secrets` (paso 4) y los paquetes (paso 2) |
| Se conecta pero la fase 2 nunca termina | El router bloquea IPsec sin encapsular | Confirmar `forceencaps=yes` (paso 3) |
| Con la VPN encendida los contenedores no responden | Faltan las reglas de Docker | Paso 6. `ip rule` debe mostrar reglas con prioridad `200` |
| Algunas paginas salen sin pasar por la empresa | La VPN solo lleva IPv4; las paginas con IPv6 salen directo por la red de la casa | Es esperado. Si TI exige que todo pase por la VPN, se desactiva IPv6 en la red mientras se usa |

El mensaje `XAuth authentication of '<usuario>' (myself) failed` sale en todas las conexiones,
tambien en las que funcionan, y no indica falla mientras despues aparezca
`connection 'fabrica' established successfully`.

Para ver que paso en la ultima conexion:

```bash
journalctl -t charon --since "-10min" --no-pager | grep -vE "keep alive|DPD"
```
