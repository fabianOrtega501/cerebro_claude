---
name: practica-por-partes
description: "Modo práctica por partes funcionales de a una, cada paso con lista de verificación y prueba esperada; docs/ la escribe Claude, Swagger y docblocks guiados"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3aa6fbf-6bb2-456a-984b-2fe9fe8169f1
  modified: 2026-11-23T13:38:30.252Z
---

En modo práctica el ticket se parte en partes funcionales (una funcionalidad o grupo de criterios de
la HU, de punta a punta con su prueba) y se trabaja de a una: encuadre, plan, solución de referencia,
ejecución y review por parte. La siguiente no se menciona hasta cerrar la actual.

La documentación técnica (`docs/`, sus índices, el `CLAUDE.md` del repo) la escribe Claude. Los
bloques `@OA` de Swagger y los docblocks los escribe Fabian, guiado.

**Why:** en el 11934 se mezclaron el listado y el refresco individual en un mismo encuadre y eso
confundió los criterios (2026-11-23). La documentación en `.md` no es lo que quiere practicar.

**How to apply:** al terminar la clase, mostrar la tabla de partes y abrir el encuadre solo de la
primera. Ya está en la skill `practice-ticket` (regla dura y Fase 4).

**Ritmo de cada paso** (pedido el 2026-11-23, tras cuatro vueltas de revisión del paso 1a del 11934):
cada paso llega con una lista de verificación cerrada de todo lo que debe tener el archivo, y con la
prueba (tinker o test) y su resultado exacto esperado, para que él se verifique antes de pedir revisión.
En la revisión corro yo la prueba y devuelvo solo lo pendiente, en tabla: línea, cómo está, cómo debe quedar.
