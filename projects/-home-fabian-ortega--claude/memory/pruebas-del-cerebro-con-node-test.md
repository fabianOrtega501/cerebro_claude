---
name: pruebas-del-cerebro-con-node-test
description: Como correr las pruebas del cerebro (node:test con mock.module en Node 24) y las trampas de los mocks
metadata:
  node_type: memory
  type: reference
  originSessionId: 7004e2f6-dcd0-4323-9143-6c48b1471b43
  modified: 2026-10-19T15:40:50.921Z
---

Las pruebas del cerebro (`brain/lib/**/*.test.mjs`) usan `node:test` y `mock.module`, que en Node 24
sigue siendo experimental: sin `--experimental-test-module-mocks` fallan todas. No hay `package.json`.

Regresion completa, sin los diagnosticos reales:
`node --test --experimental-test-module-mocks --test-skip-pattern="^(measures valid load|warns on failed read)$" brain/lib/machine-check.test.mjs brain/lib/machine/*.test.mjs`

- Las dos pruebas excluidas corren el `run()` real de `performance.mjs` (vmstat, docker stats, unos 15 s).
  Son solo lectura, pero son diagnostico real: se corren aparte y con permiso.
- Mock con `exports`, no `namedExports` (obsoleto, da DeprecationWarning).
- Para `node:fs`, simular solo las funciones que el modulo importa: `{ ...fs, … }` revienta con
  `Cannot redefine property: constants`.
- Ninguna prueba debe llamar a `save()` de `history.mjs` sin simular el sistema de archivos: escribe
  en el historial real (`brain/machine/history/`).
- `machine-check.mjs` corre al importarse: se prueba importando `?run=N` con `process.exit` simulado
  para que lance, o el codigo sigue de largo.
