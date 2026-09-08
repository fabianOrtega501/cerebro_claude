/**
 * Puente al `browser.mjs` del motor transversal.
 *
 * El manejo de Chrome por CDP es identico en todos los proyectos y vive una sola vez en
 * `~/.claude/skills/update-manual/lib/`. Lo propio de Status (Vuesax, el captcha, el login en
 * dos pasos) esta en `session.mjs`, aqui al lado.
 */

export * from "../../../../../skills/update-manual/lib/browser.mjs";
