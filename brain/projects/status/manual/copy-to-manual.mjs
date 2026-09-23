/**
 * Copia las capturas generadas al repositorio del manual, con el nombre y la carpeta que espera
 * cada documento.
 *
 * Por defecto **no sobrescribe** imagenes existentes: regenerar una captura historica cambia
 * documentacion que nadie pidio tocar. Para reemplazarlas hay que pedirlo con `--sobrescribir`.
 *
 * Uso: node copy-to-manual.mjs --origen <carpeta> --vista <vista> [--sobrescribir] [--manual <ruta>]
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { copyScreenshots, imagesRoot } from "./lib/manual.mjs";
import { PROFILE } from "./profile.mjs";
import { setting } from "./lib/config.mjs";

// Al agregar un modulo, importa su mappings.mjs y agregalo aqui. Es el unico punto que hay que
// tocar fuera de la carpeta del modulo.
import { MAPPINGS as certificacionVariables } from "./modules/certificacion-variables/mappings.mjs";
import { MAPPINGS as gestionTramites } from "./modules/gestion-tramites/mappings.mjs";

const MAPPINGS_BY_VIEW = { ...certificacionVariables, ...gestionTramites };

const args = process.argv.slice(2);
const arg = (nombre, pordefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : pordefecto;
};

/**
 * Raiz del repo del manual.
 *
 * Se resuelve desde `projects.json` en vez de pedir una variable: la ruta ya esta registrada
 * ahi, y en el repo de trabajo no deben vivir rutas absolutas.
 *
 * @param {string} [explicita] Ruta pasada con `--manual`
 * @returns {string}
 */
function raizDelManual(explicita) {
  const candidata = explicita ?? setting(PROFILE.manualRootSetting) ?? desdeProjects();

  if (!candidata || !existsSync(candidata)) {
    console.error(`No se encontro el repo del manual (${PROFILE.manualRepoName}). Pasalo con --manual <ruta>.`);
    process.exit(1);
  }

  return candidata;
}

/** Primer repo existente del proyecto `manuales` en `projects.json`. */
function desdeProjects() {
  const archivo = join(homedir(), ".claude", "brain", "projects.json");
  if (!existsSync(archivo)) return null;

  const { projects } = JSON.parse(readFileSync(archivo, "utf8"));

  return (projects.manuales?.repos ?? []).find((repo) => existsSync(join(repo, "website"))) ?? null;
}

const origen = arg("origen", "./capturas");
const vista = arg("vista", "variables-sd");
const sobrescribir = args.includes("--sobrescribir");
const manualRoot = raizDelManual(arg("manual"));

const mappings = MAPPINGS_BY_VIEW[vista];

if (!mappings) {
  console.error(`Vista desconocida: ${vista}. Opciones: ${Object.keys(MAPPINGS_BY_VIEW).join(", ")}`);
  process.exit(1);
}

copyScreenshots({ from: origen, mappings, imagesDir: imagesRoot(manualRoot), overwrite: sobrescribir });
