#!/usr/bin/env node
/**
 * Verificador del contrato entre aio-app (frontend) y aio-backend (API).
 *
 * Compara, sin levantar nada, los dos acoplamientos que unen los repos:
 *
 *   1. Endpoint  — cada `$api('<recurso>/v0/<accion>')` de src/services/ debe
 *      corresponder a una ruta declarada en aio-backend/routes/api/.
 *   2. Permiso   — cada `subject` de CASL usado en el front (definePage y $can)
 *      debe existir como `permission:<subject>,` en alguna ruta del backend.
 *
 * Ninguno de los dos lo detecta el CI: `pnpm typecheck` y `phpstan` pasan igual
 * y el fallo aparece en runtime, como 404 o como 403 silencioso.
 *
 * Se hace por análisis estático a propósito: no necesita Sail, ni Docker, ni la
 * base de datos, y sigue funcionando cuando `artisan route:list` está roto
 * (basta una ruta que referencie un controlador sin importar para tumbarlo).
 *
 * Vive en el cerebro, en el stack del proyecto: las rutas de los dos repos salen
 * de `stack.json`, así que **corre desde donde sea** —incluido fuera de los repos—
 * y no depende de deducir en cuál está parado.
 *
 * Es específico del AIO: sabe de rutas de Laravel y de subjects de CASL. Otro
 * proyecto necesita su propio verificador, no adaptaciones de este.
 *
 * Uso:
 *   node lib/check-contract.mjs                      # todo el proyecto
 *   node lib/check-contract.mjs --resource dispatches  # solo un recurso
 *   node lib/check-contract.mjs --json                 # salida procesable
 *
 * @author  Equipo AIO
 * @since   2026-08
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Ubica los dos repos leyendo el `stack.json` que está junto a este script.
 *
 * Las rutas vienen de la configuración y no de deducirlas por el entorno: el
 * script vive en el cerebro, fuera de los repos, así que su propia ubicación no
 * dice nada de dónde están. Las variables de entorno siguen teniendo prioridad
 * para poder apuntar a un clon distinto sin editar la configuración.
 *
 * @returns {{ front: string, back: string }} Rutas absolutas de ambos repos.
 *   Pueden no existir: quien llame debe comprobarlo. **Si falta `stack.json` o no
 *   declara los dos roles, no devuelve: termina el proceso** indicando qué falta.
 */
function resolveRepos() {
  const stackFile = join(dirname(fileURLToPath(import.meta.url)), 'stack.json')

  let stack
  try {
    stack = JSON.parse(readFileSync(stackFile, 'utf8'))
  }
  catch {
    console.error(`No se pudo leer ${stackFile}.`)
    process.exit(1)
  }

  const byRole = role => stack.repos?.find(repo => repo.role === role)?.path

  const front = process.env.AIO_FRONT || byRole('front')
  const back = process.env.AIO_BACKEND || byRole('back')

  if (!front || !back) {
    console.error(`${stackFile} debe declarar un repo con role "front" y otro con role "back".`)
    process.exit(1)
  }

  return { front, back }
}

const { front: FRONT_DIR, back: BACK_DIR } = resolveRepos()

/**
 * Recorre un directorio recursivamente y devuelve los archivos que terminan en
 * alguna de las extensiones dadas.
 *
 * @param {string} dir - Directorio raíz. Si no existe, devuelve lista vacía en
 *   lugar de lanzar: permite invocar el verificador sin el backend clonado.
 * @param {string[]} extensions - Extensiones con punto, ej. ['.php'].
 * @returns {string[]} Rutas absolutas.
 */
function walk(dir, extensions) {
  let found = []

  let entries
  try {
    entries = readdirSync(dir)
  }
  catch {
    return found
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'vendor' || entry.startsWith('.'))
      continue

    const full = join(dir, entry)

    if (statSync(full).isDirectory())
      found = found.concat(walk(full, extensions))
    else if (extensions.some(ext => entry.endsWith(ext)))
      found.push(full)
  }

  return found
}

/**
 * Normaliza una URL para poder comparar los dos repos, que escriben los
 * parámetros distinto: el front interpola (`${id}`) y el back usa placeholders
 * de Laravel (`{id}`). Ambos quedan como `{}`.
 *
 * También descarta el query string, que el back no declara en la ruta.
 *
 * @param {string} url - URL cruda tomada del código fuente.
 * @returns {string} URL con barra inicial, sin query y con los parámetros
 *   colapsados a `{}`. Comparable entre repos.
 */
function normalizeUrl(url) {
  return `/${url}`
    .replace(/\/+/g, '/')
    .split('?')[0]
    .replace(/\$\{[^}]*\}/g, '{}')
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\/$/, '')
}

/**
 * Extrae del backend las rutas declaradas y los permisos que exigen.
 *
 * Los grupos de prefijo **se anidan**, y hacerlo por cercanía no basta: un
 * `Route::prefix('/v0')->group(...)` intermedio ya cerrado se le atribuiría por
 * error a las rutas que vienen después. Aquí se lleva una pila de prefijos por
 * profundidad de llave, así que el prefijo de una ruta es la concatenación de
 * los grupos realmente abiertos sobre ella.
 *
 * El escaneo trata los literales de cadena como un token propio, de modo que
 * las llaves de los parámetros (`'/v0/show/{id}'`) nunca se confunden con las
 * llaves de bloque de PHP.
 *
 * @param {string} backDir - Raíz del repo aio-backend. Se recorre `routes/`
 *   entero, no solo `routes/api/`: rutas como `/login` viven en `routes/api.php`.
 * @returns {{ endpoints: Map<string, string>, permissions: Set<string>, fileCount: number }}
 *   `endpoints` mapea URL normalizada → archivo de ruta donde se declaró.
 *   `permissions` son los subjects vistos en los middleware `permission:`.
 *   Las URL no llevan el prefijo `/api` porque el front tampoco lo escribe: ya
 *   está en el `baseURL` de `$api`.
 */
function collectBackendContract(backDir) {
  const files = walk(join(backDir, 'routes'), ['.php'])

  const endpoints = new Map()
  const permissions = new Set()

  // El orden de la alternancia importa: las cadenas se consumen como token
  // antes que las llaves sueltas, y por eso `{id}` no altera la profundidad.
  const tokenRe = /Route::prefix\(\s*['"]([^'"]*)['"]\s*\)|Route::(?:get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]|'[^']*'|"[^"]*"|\{|\}/g

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const shortFile = relative(backDir, file)

    for (const match of source.matchAll(/permission:(\/[a-z0-9\-/]+)/gi))
      permissions.add(match[1].replace(/\/$/, ''))

    /** Prefijos abiertos, con la profundidad de llave en la que abrieron. */
    const stack = []
    let depth = 0
    let pendingPrefix = null

    for (const match of source.matchAll(tokenRe)) {
      const [token, prefixValue, routePath] = match

      if (prefixValue !== undefined) {
        pendingPrefix = prefixValue
      }
      else if (routePath !== undefined) {
        const prefix = stack.map(entry => entry.value).join('')

        endpoints.set(normalizeUrl(`${prefix}/${routePath}`), shortFile)
      }
      else if (token === '{') {
        depth++
        if (pendingPrefix !== null) {
          stack.push({ depth, value: pendingPrefix })
          pendingPrefix = null
        }
      }
      else if (token === '}') {
        if (stack.length && stack[stack.length - 1].depth === depth)
          stack.pop()

        depth--
      }
    }
  }

  return { endpoints, permissions, fileCount: files.length }
}

/**
 * Extrae del frontend lo que espera del backend.
 *
 * Las llamadas dinámicas cuyo primer argumento empieza por interpolación
 * (`$api(`${base}/v0/x`)`) se devuelven aparte en `dynamic`: no son
 * verificables estáticamente y reportarlas como fallo sería ruido.
 *
 * @param {string} frontDir - Raíz del repo aio-app.
 * @returns {{ calls: object[], subjects: object[], dynamic: object[] }}
 *   Cada elemento lleva `{ url|subject, file, line }` para poder abrirlo.
 */
function collectFrontendUsage(frontDir) {
  const srcDir = join(frontDir, 'src')
  const calls = []
  const subjects = []
  const dynamic = []

  const seenSubjects = new Set()

  for (const file of walk(srcDir, ['.ts', '.vue'])) {
    const source = readFileSync(file, 'utf8')
    const shortFile = relative(frontDir, file)

    /** Número de línea 1-indexado de un offset dentro del archivo. */
    const lineOf = index => source.slice(0, index).split('\n').length

    for (const match of source.matchAll(/\$api\(\s*(['"`])([^'"`]*?)\1/g)) {
      const raw = match[2]
      const entry = { url: raw, file: shortFile, line: lineOf(match.index) }

      // Una interpolación sin cerrar significa que el literal traía dentro otra
      // cadena (una ternaria, p. ej.) y quedó truncado en la captura; una URL
      // que termina en `/` es una concatenación con una variable. En ninguno de
      // los dos casos se conoce la URL final: reportarlos sería ruido.
      const openInterpolations = (raw.match(/\$\{/g) || []).length
      const closedInterpolations = (raw.match(/\}/g) || []).length
      const isTruncated = openInterpolations > closedInterpolations
      const isConcatenated = raw.endsWith('/')

      if (raw === '' || raw.startsWith('${') || isTruncated || isConcatenated)
        dynamic.push(entry)
      else
        calls.push(entry)
    }

    const subjectPatterns = [
      /subject:\s*(['"])(\/[^'"]+)\1/g,
      /\$can\(\s*['"][a-z]+['"]\s*,\s*(['"])(\/[^'"]+)\1/gi,
    ]

    for (const pattern of subjectPatterns) {
      for (const match of source.matchAll(pattern)) {
        const subject = match[2].replace(/\/$/, '')
        const key = `${subject}::${shortFile}`

        if (seenSubjects.has(key))
          continue

        seenSubjects.add(key)
        subjects.push({ subject, file: shortFile, line: lineOf(match.index) })
      }
    }
  }

  return { calls, subjects, dynamic }
}

/**
 * Lee los subjects autorizados desde la tabla `menus` de la base local.
 *
 * Es la fuente autoritativa de los permisos, y no las rutas: el proyecto usa
 * **rutas-bandera** (`$can('read', '/tires/annular-work-order')`) que autorizan
 * una acción sensible sin tener endpoint propio. Existen como fila en `menus`
 * y no aparecen en ningún middleware, así que validarlas contra las rutas las
 * marcaría como faltantes cuando están perfectamente bien.
 *
 * @param {string} backDir - Raíz de aio-backend, de donde se leen las
 *   credenciales locales en `.env`.
 * @returns {Set<string>|null} Subjects activos, o `null` si la base no está
 *   disponible. **`null` no significa "no hay ninguno"**: quien llame debe
 *   distinguirlo y degradar la verificación en lugar de reportar todo como
 *   faltante.
 */
function collectMenuSubjects(backDir) {
  let env
  try {
    env = readFileSync(join(backDir, '.env'), 'utf8')
  }
  catch {
    return null
  }

  /** Lee una clave del .env del backend. */
  const readEnv = key => (env.match(new RegExp(`^${key}=(.*)$`, 'm')) || [])[1]?.trim()

  const container = process.env.AIO_DB_CONTAINER || 'postgres_postgis_17'
  const database = readEnv('DB_DATABASE')
  const username = readEnv('DB_USERNAME')

  if (!database || !username)
    return null

  try {
    const output = execFileSync('docker', [
      'exec', container,
      'psql', '-U', username, '-d', database,
      '-tAc', 'select url from menus where url is not null and active = true;',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 })

    const subjects = new Set(
      output.split('\n').map(line => line.trim().replace(/\/$/, '')).filter(Boolean),
    )

    return subjects.size ? subjects : null
  }
  catch {
    return null
  }
}

/**
 * Punto de entrada. Imprime el reporte y fija el código de salida.
 *
 * @returns {number} 0 si el contrato cuadra, 1 si hay endpoints o permisos
 *   huérfanos. Pensado para encadenarlo con `&&` en la fase de verificación.
 */
function main() {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const resourceIndex = args.indexOf('--resource')
  const resource = resourceIndex !== -1 ? args[resourceIndex + 1] : null

  const backend = collectBackendContract(BACK_DIR)

  if (backend.fileCount === 0) {
    console.error(`✗ No se encontraron rutas en ${BACK_DIR}/routes`)
    console.error('  Revisa AIO_BACKEND en .claude/settings.local.json.')

    return 1
  }

  if (!existsSync(join(FRONT_DIR, 'src'))) {
    console.error(`✗ No se encontró el frontend en ${FRONT_DIR}`)
    console.error('  Revisa AIO_FRONT en .claude/settings.local.json.')

    return 1
  }

  const frontend = collectFrontendUsage(FRONT_DIR)

  /** Filtra por recurso cuando se pasó --resource. */
  const matchesResource = value => !resource || value.includes(resource)

  const missingEndpoints = frontend.calls
    .filter(call => matchesResource(call.url))
    .filter(call => !backend.endpoints.has(normalizeUrl(call.url)))

  const menuSubjects = collectMenuSubjects(BACK_DIR)
  const knownSubjects = menuSubjects ?? backend.permissions

  const missingPermissions = frontend.subjects
    .filter(entry => matchesResource(entry.subject))
    .filter(entry => !knownSubjects.has(entry.subject))

  // Permisos que el backend exige en sus rutas pero que no existen como menú:
  // el endpoint queda inaccesible para todos, incluido un administrador.
  const unreachableRoutes = menuSubjects
    ? [...backend.permissions].filter(p => matchesResource(p) && !menuSubjects.has(p)).sort()
    : []

  if (asJson) {
    console.log(JSON.stringify({ missingEndpoints, missingPermissions, unreachableRoutes, dynamic: frontend.dynamic }, null, 2))

    return missingEndpoints.length || missingPermissions.length ? 1 : 0
  }

  const permissionSource = menuSubjects
    ? `tabla menus (${menuSubjects.size} activos)`
    : `middleware de las rutas (${backend.permissions.size}) — base no disponible, las rutas-bandera saldrán como falsos positivos`

  console.log(`Backend: ${backend.endpoints.size} endpoints (${backend.fileCount} archivos de ruta)`)
  console.log(`Permisos: ${permissionSource}`)
  console.log(`Frontend: ${frontend.calls.length} llamadas, ${frontend.subjects.length} subjects${resource ? ` — filtrado por "${resource}"` : ''}`)
  console.log('')

  if (missingEndpoints.length) {
    console.log(`✗ ${missingEndpoints.length} llamada(s) del front sin ruta en el backend — dan 404:`)
    for (const call of missingEndpoints)
      console.log(`    ${call.url}\n      ${call.file}:${call.line}`)
    console.log('')
  }

  if (missingPermissions.length) {
    console.log(`✗ ${missingPermissions.length} subject(s) de CASL sin permiso en el backend — 403 o pantalla vacía:`)
    for (const entry of missingPermissions)
      console.log(`    ${entry.subject}\n      ${entry.file}:${entry.line}`)
    console.log('')
  }

  if (!missingEndpoints.length && !missingPermissions.length)
    console.log('✓ El contrato cuadra: toda llamada tiene ruta y todo subject tiene permiso.')

  if (unreachableRoutes.length) {
    console.log(`⚠ ${unreachableRoutes.length} permiso(s) exigido(s) por una ruta del backend sin fila en \`menus\` — el endpoint no lo alcanza nadie:`)
    for (const permission of unreachableRoutes)
      console.log(`    ${permission}`)
    console.log('  Puede ser un menú sin sembrar en TU base local y no un fallo real: contrástalo antes de actuar.')
    console.log('')
  }

  if (frontend.dynamic.length)
    console.log(`ℹ ${frontend.dynamic.length} llamada(s) con URL construida en runtime: no verificables aquí, revísalas a mano.`)

  return missingEndpoints.length || missingPermissions.length ? 1 : 0
}

process.exit(main())
