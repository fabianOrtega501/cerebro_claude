/**
 * Puente al `browser.mjs` del motor transversal.
 *
 * El manejo de Chrome por CDP es idéntico en todos los proyectos, así que vive una sola vez en
 * `~/.claude/skills/update-manual/lib/`. Lo que sí es del AIO (Vuetify, Leaflet, el login) está
 * en `session.mjs`, aquí al lado.
 */

export * from "../../../../../skills/update-manual/lib/browser.mjs";
