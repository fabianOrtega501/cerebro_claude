---
name: congelamiento-de-desa
description: Desde el día 8 del sprint no se sube nada a desa ni se abren MR hacia desa hasta que se levante el congelamiento; la fecha de reapertura varía
metadata:
  node_type: memory
  type: project
  originSessionId: ea983945-c333-45e2-a15f-51d286532c1e
  modified: 2026-11-11T19:58:30.468Z
---

Desde el **día 8 del sprint** no se sube nada a desa ni se abren MR hacia desa, hasta que el equipo
levante el congelamiento. El inicio siempre es el día 8; la reapertura **no es fija** (suele ser el
día 2 o 3 del siguiente sprint, pero varía): no se asume, se pregunta.

**Why:** en el ticket 11549 se abrieron MR a desa dentro del congelamiento; al cerrarlos, GitLab borró
las ramas origen y el trabajo quedó solo en las ramas locales de los cuatro repos.

**How to apply:** dentro del congelamiento se puede commitear y mezclar la base en local, pero no se
hace push de una rama nueva ni se propone abrir el MR a desa. Si el cierre de un desarrollo cae en
esas fechas, se deja la rama local y se avisa. Ante la duda sobre si sigue vigente, preguntarle a Fabian.
