---
name: patron-separacion-aio
description: Referencia para separar Status — el par AIO (Laravel 10 + Vue 3/Vite) y su documento de contrato entre repos
metadata:
  type: reference
---

Molde a seguir para separar Status en dos repos. La pieza autoritativa es el documento de contrato,
**duplicado a proposito e identico en los dos repos**:

- `/datos/proyectos/AIO/aio-app/docs/contrato-backend.md` (y su copia en `aio-backend/docs/`) — tabla
  de puertos, forma de las respuestas, reglas de commits y de orden de despliegue.
- `/datos/proyectos/Epsilon/epsilon/docs/contrato-backend.md` — el mismo esquema, mas un verificador
  estatico en `.claude/skills/develop-fullstack-ticket/lib/check-contract.mjs`, que compara las URLs
  que llama el front contra las rutas que expone el backend. Es lo mejor del patron y lo mas facil
  de copiar.

El stack de AIO, medido el 2026-09-10: back Laravel 10 con Sanctum 3 por **token Bearer**
(`EnsureFrontendRequestsAreStateful` esta comentado, no hay cookies ni CSRF), `config/cors.php` con
`paths: ['api/*','sanctum/csrf-cookie']`, `allowed_origins: ['*']` y `supports_credentials: false`,
expiracion de token a 8 horas sin refresh. Front Vue 3.3 + Vuetify 3 + Vite 4 + TypeScript, servido
como estatico desde nginx o Apache en Docker con `try_files ... /index.html`. Puertos: back 8085,
front 5173. Envoltura unica de respuesta `{status, message, data, meta}` via
`app/Http/Responses/ApiResponse.php`, sin API Resources, con el `v0` en la ruta del recurso
(`/api/absenteeism-types/v0/get-all`) y verbos fijos `get-all`, `store`, `show/{id}`, `update/{id}`,
`delete/{id}`, `export-data`, `get-select-data`.

**Como usarlo:** leer el contrato completo antes de proponer la arquitectura de Status; copiar la
envoltura de respuesta, el esquema de rutas y el manejo de token, que ya son los de Status o casi.
Dos reglas de proceso que se heredan: **commits y MR separados por repo**, y **el backend se despliega
primero** cuando hay migracion o seeder de menu, porque si un lado llega a un ambiente sin el otro la
aplicacion se cae. Nada en el CI valida el contrato, de ahi el verificador.

**Trampas del patron de AIO que conviene no copiar:** la URL del API se hornea en el bundle en tiempo
de build (`import.meta.env`), asi que cambiar de ambiente exige recompilar y el `.env` del front se
genera en el job de CI; el front reconstruye la URL del backend recortando `/api` a mano
(`baseApiUrl.split('/api')[0]`, repetido en varias vistas); el token va en `sessionStorage` cifrado
con AES pero con la llave dentro del bundle, o sea cifrado cosmetico; y un permiso denegado responde
**HTTP 400, no 403**. Ver [[separacion-status-front-back]].
