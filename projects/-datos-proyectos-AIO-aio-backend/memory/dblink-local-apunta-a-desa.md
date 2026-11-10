---
name: dblink-local-apunta-a-desa
description: "En la base local, database_connections puede tener filas hacia desa; el ETL de SGH corrido en local lee de desa sin avisar, y la contraseña se cifra con el database_name de la fila"
metadata:
  node_type: memory
  type: project
  originSessionId: 62003a87-ff44-42d0-abd7-a14c018df20b
  modified: 2026-11-10T17:37:07.033Z
---

`fnu_connect_dblink` toma la fila **activa de mayor `id`** con ese `connection_name`. En la base local
llegó a haber filas `corporativo` y `sgh` hacia `172.17.10.14` (desa) por encima de las locales, así que
correr `prc_users_idle` o `prc_staff_insert` en local leía desa sin ningún aviso.

Al crear o corregir una fila, la contraseña se cifra con el **mismo `database_name` de la fila**:
`fnu_encrypt_data('<clave>', '<database_name>', 1)`. Si no coinciden, falla con «Wrong key or corrupt
data». Dentro del contenedor `postgres_postgis_17` la base local es `127.0.0.1:5432`; desde el host, el
puerto es el `5433`, y la réplica de SGH está en la base `sgh`, no en `postgres` ni en `sgh_local`.

**Why:** el 2026-11-10 (ticket 11858) una fila nueva tenía el host, la base y la clave de cifrado
equivocados, y no había ninguna `corporativo` activa: el `CALL` habría fallado completo en el paso 1.

**How to apply:** antes de correr el ETL de SGH en local, revisar
`SELECT id, connection_name, host, port, database_name, active FROM database_connections ORDER BY id`
y probar cada conexión con `fnu_connect_dblink` y un `SELECT count(*)` remoto.
