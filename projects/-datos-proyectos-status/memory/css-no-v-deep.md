---
name: css-no-v-deep
description: Regla de estilos del front de Status — nunca ::v-deep ni >>>, siempre :deep()
metadata:
  type: feedback
---

En los `<style scoped>` de los `.vue` de Status no se usa `::v-deep` ni `>>>`; siempre `:deep(selector)`.

**Why:** Fabian lo pidió el 2026-09-03 tras limpiar 53 usos en 6 componentes. Vue 2.7 marca las dos
sintaxis viejas como obsoletas y cada una imprime un aviso de `@vue/compiler-sfc` en cada compilación,
lo que ensuciaba la consola del watch. `:deep()` es además la sintaxis de Vue 3.

**How to apply:** al escribir o revisar estilos, usar `:deep()`; si aparece `::v-deep` en código que se
toca, convertirlo. La regla también está en el `CLAUDE.md` del repo para el equipo. Ver
[[build-assets-laravel-mix]] para el resto de la configuración del front.
