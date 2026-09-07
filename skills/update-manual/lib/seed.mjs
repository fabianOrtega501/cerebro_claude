/**
 * Aplica el `seed.sql` de un flujo contra la base local del proyecto.
 *
 * Existe porque las capturas del manual **no pueden salir con los datos de trabajo del
 * desarrollador**: un plan llamado `sadf sadf s` o un descargue de 12 kg convierten una página
 * de documentación en algo que nadie se cree. Cada flujo guarda su SQL al lado y esto lo corre.
 *
 * Absorbido de la skill `update-web-manual` de aio-app (2026-09-07). Allí los datos de conexión
 * estaban fijos a las variables `AIO_*`; aquí salen del perfil del proyecto, para que sirva
 * igual en cualquiera.
 *
 * Uso:
 *   node lib/seed.mjs <ruta al seed.sql> [--dry-run]
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { setting } from './config.mjs'
import { loadProfile } from './profile.mjs'

/**
 * Datos de conexión de la base local, tomados del perfil del proyecto.
 *
 * @param {string} [fromDir] - Directorio desde el que resolver el proyecto.
 * @returns {Promise<{container: string, database: string, user: string}>}
 */
export async function dbConfig(fromDir = process.cwd()) {
  const { profile } = await loadProfile(fromDir)
  const db = profile.db ?? {}

  if (!db.containerSetting) {
    console.error(`El perfil de "${profile.key}" no declara \`db.containerSetting\`: sin eso no se sabe contra qué contenedor correr el seed.`)
    process.exit(1)
  }

  return {
    container: setting(db.containerSetting),
    database: db.name ?? profile.key,
    user: db.user ?? 'postgres',
  }
}

/**
 * Corre una o varias sentencias SQL y devuelve la salida de psql, ya recortada.
 *
 * El SQL va por stdin, así que puede llevar comillas y acentos sin escapar nada. Lanza con el
 * `stderr` de Postgres, que es donde está la causa real (una FK, una columna que no existe).
 *
 * @param {string} sql - Sentencias a ejecutar.
 * @param {object} [options]
 * @param {boolean} [options.tuplesOnly=false] - Sin cabeceras, para leer un valor suelto.
 * @param {string} [options.fromDir] - Directorio desde el que resolver el proyecto.
 * @returns {Promise<string>} Salida de psql.
 */
export async function runSql(sql, { tuplesOnly = false, fromDir = process.cwd() } = {}) {
  const { container, database, user } = await dbConfig(fromDir)

  // Se ejecuta dentro del contenedor: no hace falta cliente de psql en la máquina.
  const args = ['exec', '-i', container, 'psql', '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1']

  if (tuplesOnly) args.push('-t', '-A')

  try {
    return execFileSync('docker', args, { input: sql, encoding: 'utf8' }).trim()
  }
  catch (error) {
    const detail = (error.stderr || error.stdout || error.message).toString().trim()

    throw new Error(`psql falló contra el contenedor "${container}":\n${detail}`)
  }
}

/**
 * Aplica un archivo `.sql`. La ruta puede ser absoluta o relativa al directorio actual.
 *
 * El archivo debería ser **idempotente** —`update` repetibles e `insert` con `where not
 * exists`— para poder correrlo antes de cada tanda de capturas sin duplicar nada.
 *
 * @param {string} sqlPath - Ruta al archivo.
 * @returns {Promise<string>} Salida de psql.
 */
export async function applySeed(sqlPath) {
  const path = isAbsolute(sqlPath) ? sqlPath : join(process.cwd(), sqlPath)

  if (!existsSync(path)) throw new Error(`No existe el seed ${path}`)

  return runSql(readFileSync(path, 'utf8'))
}

// Uso como CLI.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  const target = args.find(argument => !argument.startsWith('--'))

  if (!target) {
    console.error('Uso: node lib/seed.mjs <ruta al seed.sql> [--dry-run]')
    process.exit(1)
  }

  const path = isAbsolute(target) ? target : join(process.cwd(), target)

  if (args.includes('--dry-run')) {
    console.log(readFileSync(path, 'utf8'))
    process.exit(0)
  }

  try {
    console.log(await applySeed(target))
    console.log(`\nSeed aplicado: ${target}`)
  }
  catch (error) {
    console.error(`\n${error.message}`)
    process.exit(1)
  }
}
