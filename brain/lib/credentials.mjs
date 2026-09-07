/**
 * Credenciales del usuario de pruebas de cada proyecto, leidas de `~/.claude/secrets.env`.
 *
 * Existe para que ningun flujo tenga que saber como se llama la variable de su proyecto: el
 * prefijo sale de la clave en `projects.json`, asi que agregar un proyecto no obliga a tocar
 * codigo. Probar con el usuario de otro proyecto, en sistemas multiempresa, es mirar datos de
 * otro cliente.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { secret, SECRETS_PATH } from "./secrets.mjs";

const BRAIN_ROOT = join(homedir(), ".claude");
const PROJECTS_FILE = join(BRAIN_ROOT, "brain", "projects.json");

/**
 * Clave del proyecto al que pertenece un directorio, segun `projects.json`.
 *
 * @param {string} [dir] Directorio a ubicar; por defecto el actual
 * @returns {string|null} La clave, o `null` si el directorio no esta en ningun repo registrado
 */
export function projectOf(dir = process.cwd()) {
  if (!existsSync(PROJECTS_FILE)) return null;

  const target = resolve(dir);
  const { projects } = JSON.parse(readFileSync(PROJECTS_FILE, "utf8"));

  for (const [key, { repos = [] }] of Object.entries(projects)) {
    if (repos.some((repo) => target === resolve(repo) || target.startsWith(resolve(repo) + "/")))
      return key;
  }

  return null;
}

/**
 * Usuario y contrasena de pruebas de un proyecto.
 *
 * @param {string} [project] Clave del proyecto; si se omite, se deduce del directorio actual
 * @param {object} [options]
 * @param {boolean} [options.required=true] Si `true`, termina el proceso cuando falten
 * @returns {{project: string, email: string|undefined, password: string|undefined}}
 */
export function credentialsFor(project = null, { required = true } = {}) {
  const key = project ?? projectOf();

  if (!key) {
    console.error(
      "No se pudo determinar el proyecto desde " + process.cwd() + ".\n" +
      "Pasa la clave explicitamente: credentialsFor(\"status\").",
    );
    if (required) process.exit(1);
    return { project: null, email: undefined, password: undefined };
  }

  const prefix = key.toUpperCase();
  const email = secret(`${prefix}_TEST_EMAIL`);
  const password = secret(`${prefix}_TEST_PASSWORD`);

  if (required && (!email || !password)) {
    console.error(
      `Faltan las credenciales de pruebas de "${key}".\n` +
      `Agrega estas lineas en ${SECRETS_PATH}:\n` +
      `  ${prefix}_TEST_EMAIL=...\n  ${prefix}_TEST_PASSWORD=...`,
    );
    process.exit(1);
  }

  return { project: key, email, password };
}
