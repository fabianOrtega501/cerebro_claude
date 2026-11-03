---
name: rutas-de-menu-completas
description: "Al indicar dónde está algo en el AIO, dar la ruta completa del menú verificada contra la tabla menus, no deducida"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 5bfb5596-9e73-4121-b46b-49e4b7314afe
  modified: 2026-10-29T19:17:33.838Z
---

Al indicar dónde está una pantalla del AIO, dar la ruta completa del menú: Aplicación › Módulo › Opción › pestaña (ej. «Configuración › Maestros › Reportes»), verificada contra la base, no deducida de la URL.

**Why:** en el ticket 11632 di «Configuración › Reportes» y faltaba «Maestros»; Fabian lo corrigió el 2026-10-29.

**How to apply:** el menú no vive en el front sino en `menus` → `modules` → `applications`; consultar esas tablas (los nombres son llaves i18n) y traducirlos con `src/plugins/i18n/locales/es.json` de aio-app antes de escribir la ruta.
