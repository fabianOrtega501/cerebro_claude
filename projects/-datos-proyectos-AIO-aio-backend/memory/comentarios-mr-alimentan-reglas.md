---
name: comentarios-mr-alimentan-reglas
description: "Después de resolver los comentarios de un MR, cada comentario se convierte en regla de los desarrollos para que no se repita"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3aa6fbf-6bb2-456a-984b-2fe9fe8169f1
  modified: 2026-11-25T14:40:38.924Z
---

Después de resolver los comentarios de revisión de un MR (de Andrés, Steveen o quien sea), **siempre**
se alimentan las reglas de los desarrollos con cada comentario, en el mismo turno y sin esperar a que
se pida:

- Lo mecánico (un patrón que se puede reconocer en la línea): regla nueva en
  `brain/projects/aio/standards/rules.json` (o `brain/standards/common.json` si vale para todos los
  proyectos), probada con casos que deben negarse y casos que deben pasar.
- Lo que pide criterio: línea en «No se hace» de `brain/projects/aio/standards/reuse.md`.
- Un punto en la lista de [[revision-de-pares-propia]], citando el ticket y el revisor.

Después se pasan las reglas nuevas sobre todo el diff de la rama, para encontrar otros casos que el
revisor no marcó.

**Why:** Fabian lo pidió el 2026-11-25, con los comentarios de los MR 3004 y 2403 del ticket 11934: los
mismos comentarios no deben volver en otro MR.

**How to apply:** es el último paso de resolver comentarios de un MR, antes de proponer el commit. Las
reglas de `code-standards-guard` no actúan dentro de un worktree que no esté en `projects.json`: ahí se
revisa el diff a mano con las mismas reglas.
