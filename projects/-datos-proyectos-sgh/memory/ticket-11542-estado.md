---
name: ticket-11542-estado
description: "Estado del ticket SGH 11542 (unidad de negocio en planta de presupuesto) al pausar el 2026-11-05; leer al retomar con \"iniciemos\""
metadata:
  node_type: memory
  type: project
  originSessionId: b1e0b818-c4fe-48d0-a798-d466ddc99998
  modified: 2026-11-09T17:33:18.808Z
---

Ticket SGH 11542, pausado el 2026-11-05 al final del día. Fabian pidió no ejecutar nada hasta que diga "iniciemos".

**Hecho:**
- Rama `feature/11542-fabian-originDesa-ColumnaUnidadNegocio` creada desde `desa` (al día), árbol limpio, sin commits.
- Sesión nombrada "11542 SGH ColumnaUnidadNegocio". Modo **práctica** (lo escribe Fabian; yo guío con `practice-ticket`). Tipo feature. SGH es de un solo repo.
- HU bajada (doc 60546 del GLPI 57940): `~/.claude/cache/tickets/11542/hu.md`. Explicación en `explicacion.md` y `explicacion.html` de la misma carpeta. Fabian confirmó que la entendió.
- Asumido: ajuste sobre algo existente. Referencias de la HU: módulo Vacunas y `ContratoController::buscaCentroOperacion`.

**Respuestas de Fabian a las ambigüedades:**
1. La HU manda siempre sobre Mantis.
2. Si la empresa no tiene U.N. y llega un código: **se ignora el código** (se guarda vacío). No se rechaza.
3. Códigos válidos solo de **001 a 999** (tres dígitos, texto). Esto reemplaza el `max:3` de la HU.
4. Pidió un **analizador de JSON antes de guardar** el parámetro. Aprobado (ver abajo).
5. Sí: con `ACTUALIZAR` y la plantilla vieja, sin la columna, las plantas de una empresa configurada se rechazan.
6. Proteger los parámetros de lista del salto de línea en el textarea. Aprobado (ver abajo).

**Puntos 4 y 6: aprobados por Fabian el 2026-11-09.** Se resuelven con una regla en la validación de `ParametroGeneral`:
- Si el valor empieza con `[` o `{`, debe ser un JSON válido; si no lo es, no se guarda y se muestra el error.
- En `PPTO_UNIDADES_NEGOCIO` se revisa además la estructura (cada entrada con `empresa` y `unidades`) y que los códigos estén entre 001 y 999.
- Si el valor no es JSON, no se admiten saltos de línea.

Va más allá de lo que pide la HU: hay que anotarlo en el control de cambios y en el MR.

**Siguiente paso, en este orden:**
1. (Hecho 2026-11-09: `brain/projects/sgh/` con stack.json, 3 mapas en exploration/ y standards/reuse.md. Commit bff2655 en el cerebro, sin push.)
2. (Hecho: puntos 4 y 6 aprobados el 2026-11-09.)
3. (Hecho 2026-11-09: Mantis solo cambió de estado a desarrollo; la HU es la misma. Ojo: `tickets.py fetch` borra la carpeta del ticket y se llevó explicacion.*; se recuperó el .md, el .html no.)
4. (Hecho 2026-11-09: marca de práctica abierta; clase en brain/learning/slides/sgh-11542-unidad-negocio.html; plan en brain/learning/plans/2026-11-09-sgh-11542-plan.md; solución de referencia (no mostrar) en ...-solucion.md.)
5. (Hecho 2026-11-09: SGH corre en local en http://localhost:8091, contenedor sgh-app; detalle en brain/projects/sgh/stack/NOTES.md. Fabian ya entra con su usuario.)
6. Siguiente: Fabian ejecuta la Etapa 1 del plan; yo reviso paso a paso sin editar archivos del ticket.
