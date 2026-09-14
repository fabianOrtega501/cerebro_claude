---
name: locales-muertos-del-aio
description: En aio-app solo es.json y en.json estan vivos; fr.json y ar.json son restos de la plantilla del tema, no traducciones atrasadas
metadata:
  type: project
---

`src/plugins/i18n/locales/` tiene cuatro archivos, pero solo **dos son reales**. Medido el
2026-09-11:

| Archivo | Claves | Claves que comparte con `es.json` |
|---|---|---|
| `es.json` | 2.473 | — |
| `en.json` | 2.418 | va 76 claves atras |
| `fr.json` | 166 | **ninguna** |
| `ar.json` | 165 | **ninguna** |

**Why:** que `fr` y `ar` no compartan **ni una sola** clave con `es` es la prueba de que no son
traducciones atrasadas sino restos de la plantilla del tema con la que se armo el front. Tratarlos
como deuda lleva a "completarlos", que es trabajo inventado sobre codigo muerto; y un chequeo de
paridad ingenuo gritaria 2.473 faltantes en frances en cada edicion de un locale.

**How to apply:** una clave nueva va **solo a `es.json` y `en.json`**. No tocar `fr` ni `ar`. El
hook `i18n-keys-guard` del cerebro ya los ignora: descarta como muerto a todo hermano que comparta
menos del 10% de sus claves con el archivo que se esta editando. Si alguna vez se decide borrarlos,
es una conversacion con el equipo, no una limpieza propia. Ver [[lint-del-aio-reformatea-todo]].
