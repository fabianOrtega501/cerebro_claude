---
name: ticket-11542-estado
description: "Estado del ticket SGH 11542 (unidad de negocio en planta de presupuesto): cerrado el 2026-11-12, solo faltan los MR"
metadata:
  node_type: memory
  type: project
  originSessionId: b1e0b818-c4fe-48d0-a798-d466ddc99998
  modified: 2026-11-12T12:38:44.182Z
---

Ticket SGH 11542 **cerrado el 2026-11-12**. Empezó en modo práctica y pasó a modo entrega por tiempo; la práctica quedó registrada en el cerebro.

**Hecho:**
- `sgh`: commit `fd783a4c 11542: SGH: Unidad de negocio en planta` en `feature/11542-fabian-originDesa-ColumnaUnidadNegocio`, subido.
- `manua-web`: commit `e3424e47 0011542: Manual SGH: Unidad de negocio en plantas` en la rama del mismo nombre, salida de `qa`, subido.
- Control de cambios (riesgo bajo, impacto medio) y set de pruebas de 16 casos entregados y aprobados.

**Pendiente (lo hace Fabian):**
- Abrir el MR de `sgh` hacia `desa`, con estas notas: la validación de parámetros es global (JSON válido y sin saltos de línea), los códigos van de 001 a 999, cambió la plantilla de Excel, el despliegue requiere `composer dump-autoload` y `migrate`, el `down()` de la migración de `PAGE_VALOR` falla si hay valores de más de 300 caracteres, el problema de `FECHA_AUTORIZACION` con celdas vacías ya existía, y se incluyen `CLAUDE.md` y `.claude/`.
- Abrir el MR de `manua-web` hacia `qa`.

**How to apply:** si se retoma el ticket, solo quedan los MR o las devoluciones de QA. Borrar esta memoria cuando los dos MR se mezclen.
