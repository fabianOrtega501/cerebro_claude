# AMI — notas del stack

**AMI** (Aplicacion Movil Integral) es la app de campo del ecosistema AIO: Ionic Vue 3 +
Capacitor 8, para Android, que tambien corre en navegador para desarrollo. Su backend **es el
mismo `aio-backend`**.

El `CLAUDE.md` de `app-movil` esta completo y es la fuente: leelo antes de tocar codigo. Aqui
solo va lo que cambia el procedimiento de un ticket.

## Lo que define todo: offline-first

El operario baja datos, trabaja horas sin senal y despues sincroniza. Cada modulo repite el
mismo trio: **Importar -> Trabajar -> Enviar**.

- Lo que el operario captura se guarda **primero en SQLite local**, con su bandera `sync`.
  Nunca escribir directo contra la API desde un flujo de captura.
- **El envio es por lotes y un lote puede fallar solo.** Hay tres desenlaces reales: todo
  enviado, envio parcial y envio fallido. La interfaz los distingue; al tocar el envio hay que
  mantener los tres.
- Tabla nueva importable -> migracion en `src/database/migrations/` **y** registro en
  `tableIntegrated()`, o la pantalla siempre dira que no hay datos.
- **No editar una migracion ya publicada.** Su `key` ya esta en los dispositivos en campo: el
  cambio no se aplica nunca. Se agrega otra.

## El backend es compartido — la trampa de este proyecto

`aio-backend` lo consumen **aio-app, app-movil y quien venga**. Un cambio en un endpoint o en la
forma de una respuesta puede romper a los otros dos sin que nadie se entere hasta produccion.

Antes de tocar el backend por un ticket de AMI:

1. Buscar **todos** los consumidores de ese endpoint, no solo el movil.
2. Si cambia la forma de una respuesta que ya existe, decirlo y tratarlo como cambio de contrato.
3. La rama del backend la ven los dos proyectos: `create-branch` avisa cuando el repo es
   compartido.

## Sin CASL

A diferencia de `aio-app`, aqui **no hay evaluacion de permisos en el router**: el guard solo
comprueba que exista la cookie `authUser`. Lo que el usuario puede hacer se refleja en los menus
que trae del backend. No busques `definePage` ni `$can`.

Aun asi, **el permiso en el backend sigue haciendo falta**: sin la fila, el endpoint no responde.

## La API no es la del `.env`

Se resuelve con `getApiUrl()` desde `Preferences` y **cambia por empresa** (tabla local
`company_endpoints`). `VITE_API_URL` es solo el valor por defecto cuando no hay nada guardado.

## Dev server

El 5173 suele estar ocupado por `aio-app`:

```bash
npm run dev -- --port 5180 --strictPort
curl -s http://localhost:5180/ | grep -o "<title>[^<]*</title>"   # debe decir "Ionic App"
```

## Cierre

- Prefijo de ticket igual que el resto del ecosistema.
- Si cambio lo que el operario ve, **ofrecer `update-manual`**: el perfil de AMI ya esta en el
  cerebro y escribe en `manua-web` bajo `img/AppMovil`.
- La documentacion tecnica de reglas de negocio va al `docs/` de **aio-backend**, con
  `update-tech-docs --project aio`. AMI no tiene `docs/` propio.

## La copia del repo

`app-movil/.claude/skills/update-mobile-manual/` es del equipo y se queda como esta. La version
del cerebro (`update-manual` + perfil `ami`) es la que usamos: comparte el motor con AIO en vez
de mantener dos drivers divergentes.
