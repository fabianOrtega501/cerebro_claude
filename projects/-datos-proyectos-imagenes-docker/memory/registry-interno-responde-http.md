---
name: registry-interno-responde-http
description: "El registry 192.168.100.34:5050 habla HTTP; sin insecure-registries en el demonio, docker pull falla."
metadata:
  type: project
---

El registry interno `192.168.100.34:5050` responde **HTTP**, no HTTPS, y el demonio
Docker de esta maquina no lo tiene en `insecure-registries`. Cualquier `docker pull`
de una imagen publicada ahi falla asi:

```
Error response from daemon: failed to resolve reference
"192.168.100.34:5050/devops/imagenes_docker:php83": failed to do request:
Head "https://...": http: server gave HTTP response to HTTPS client
```

**Why:** El sintoma parece un problema de red o de la VPN, y manda a diagnosticar el
lado equivocado. No lo es: el demonio intenta HTTPS contra un servidor que solo habla
HTTP. El pipeline no lo sufre porque su servicio `docker:dind` arranca con
`--insecure-registry=192.168.100.34:5050`, como se ve en el `.gitlab-ci.yml` de
[[imagenes-docker-agrupa-dos-cosas]].

**How to apply:** Para traer una imagen del registry a esta maquina hay que agregar el
host a `insecure-registries` en `/etc/docker/daemon.json` y reiniciar el demonio — lo
cual pide `sudo` y afecta a todo Docker, asi que se pregunta antes. Si lo que se
necesita es solo comparar contra una imagen publicada, sale mas barato construirla en
local desde el Dockerfile del repo.

Aparecio el 2026-09-16 al intentar comparar la suite de aio-backend contra la imagen
`:php83` ya publicada.
