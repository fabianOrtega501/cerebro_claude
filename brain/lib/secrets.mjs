/**
 * Lectura de credenciales desde `~/.claude/secrets.env`.
 *
 * Las credenciales no viven en ningun repo de trabajo, ni siquiera en archivos ignorados por
 * git. Un `.gitignore` mal editado o un `git add -f` distraido bastan para exponerlas, y un
 * `git clean -xfd` para perderlas. Fuera del repo no dependen de eso.
 *
 * El archivo es de solo lectura para el dueno (600) y esta fuera de la lista blanca del
 * `.gitignore` del cerebro, asi que git no lo ve ni por accidente.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SECRETS_FILE = join(homedir(), ".claude", "secrets.env");

/**
 * Parsea el archivo de secretos. Se cachea: se lee una vez por proceso.
 *
 * Tolera lineas en blanco, comentarios con `#` y valores que contengan `=`. **No** quita
 * comillas: una contrasena puede empezar o terminar con una legitimamente.
 */
let cache = null;

function load() {
  if (cache)
    return cache;

  cache = {};

  if (!existsSync(SECRETS_FILE))
    return cache;

  for (const line of readFileSync(SECRETS_FILE, "utf8").split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#"))
      continue;

    const at = trimmed.indexOf("=");

    if (at > 0)
      cache[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }

  return cache;
}

/**
 * Valor de un secreto.
 *
 * @returns El valor, o `undefined` si no esta definido o el archivo no existe. Un valor
 *   presente pero vacio cuenta como no definido, para que una plantilla a medio llenar
 *   falle con el mensaje de "falta configurar" y no con uno de login incorrecto.
 */
export function secret(name) {
  return load()[name] || undefined;
}

/** Ruta del archivo, para poder decirle al usuario donde arreglar lo que falte. */
export const SECRETS_PATH = SECRETS_FILE;
