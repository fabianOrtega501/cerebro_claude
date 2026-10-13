---
name: vpn-dns-strongswan-wrapper
description: "La VPN fabrica instala su DNS con un wrapper propio de resolvconf; si con la VPN no hay nombres, revisar eso primero"
metadata:
  node_type: memory
  type: project
  originSessionId: 6b8dffd6-2da0-428f-953b-3d8c50125003
  modified: 2026-10-13T00:26:55.305Z
---

La VPN `fabrica` (strongSwan, túnel completo 0.0.0.0/0) no podía instalar su DNS: el plugin `resolve` usaba `lo.ipsec` y systemd-resolved rechaza DNS en loopback (`network1.service not found`). Desde el 2026-10-12, `/etc/strongswan.d/charon/resolve.conf` apunta `resolvconf.path` a `/usr/local/sbin/strongswan-resolvconf`, que pone 192.168.100.208 en la interfaz de salida y al bajar devuelve el DNS de NetworkManager. Respaldo del original en `resolve.conf.bak`.

**Why:** sin eso, con la VPN encendida el router de casa (192.168.80.1, que es el DNS) queda dentro del túnel y no hay resolución de nombres: parece que no hubiera internet aunque la empresa sí da salida.

**How to apply:** si con la VPN se pierde la navegación, revisar primero `resolvectl dns wlp0s20f3` (debe ser 192.168.100.208). Si una actualización de strongSwan pisa `resolve.conf`, volver a poner la línea `path`. Para probar, la sesión pierde internet con la VPN arriba: usar un script que suba la VPN, guarde resultados en un archivo y la baje solo. Nota: la VPN solo lleva IPv4; el IPv6 de casa sale directo.
