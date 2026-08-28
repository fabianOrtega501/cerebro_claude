/**
 * Puente al driver del motor transversal.
 *
 * Antes AMI tenia su propia copia de este archivo, "un gemelo, no un espejo" del de aio-app:
 * 93 lineas divergentes que habia que arreglar dos veces. El motor exporta las 12 funciones que
 * AMI usa; lo especifico de Ionic esta en `session.mjs`, aqui al lado.
 */

export * from "../../../../../skills/update-manual/lib/browser.mjs";
