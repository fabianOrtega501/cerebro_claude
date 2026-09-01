---
name: conflictos-los-resuelve-el-usuario
description: Los conflictos del merge con la rama origen los resuelve el usuario; hay que parar y esperar su orden para seguir
metadata:
  node_type: memory
  type: feedback
---

> Copia identica en los `memory/` de **aio-app** y **aio-backend**, para que un ticket fullstack la
> vea desde cualquiera de los dos. Si cambias una, cambia la otra.

Cuando el merge con la rama base (`desa`) deja conflictos: **bajar los cambios, lanzar el merge y
parar ahi**. Los conflictos los resuelve el usuario, no yo. Y **no se sigue con el commit hasta que
el lo ordene**, aunque la resolucion parezca obvia. Indicado el 2026-09-01, tras el ticket 10810.

**Why:** el es quien sabe cual de los dos lados debe quedar. Resolver por cuenta propia puede
borrar trabajo de otro sin que se note, y un merge commiteado ya esta dentro del historial de la
rama. Ademas es una de las reglas duras de `finish-development`.

**How to apply:** dejar el merge a medias (no `--abort`, no `git add`), y reportar: los archivos en
conflicto con su numero de linea, que aporta cada lado, quien consume cada cambio —para que se vea
el impacto de descartar uno— y cuantos archivos se fusionaron solos. Cuando el avise, verificar la
resolucion (que no queden marcadores, que el archivo siga siendo valido, que sobreviva lo del
ticket), cerrar con `git commit --no-edit` y **repetir la verificacion completa**: el merge trajo
codigo ajeno. Ver [[lint-del-aio-reformatea-todo]] para como verificar sin reformatear el repo.
