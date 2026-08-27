#!/usr/bin/env node
/**
 * Recolector de evidencia para redactar un CONTROL DE CAMBIOS.
 *
 * Lee de git lo que realmente se hizo —commits, diff y trabajo sin commitear—
 * en uno o varios repositorios, lo clasifica por capa (backend, frontend, base
 * de datos, pruebas, configuracion, documentacion) y levanta las senales que
 * sirven para sustentar el nivel de riesgo e impacto.
 *
 * Aporta HECHOS, no juicios: no emite nivel de riesgo ni de impacto. Esa
 * decision es de quien redacta, con confirmacion del usuario. Por eso tampoco
 * es un "gate": el codigo de salida 1 significa "no pude recolectar nada",
 * nunca "encontre algo peligroso".
 *
 * Todo el acceso a git vive dentro de este proceso (`execFileSync`, sin shell,
 * siempre con `git -C <repo>`): asi el reporte es determinista, el cwd es
 * irrelevante y la ejecucion completa cabe en una sola aprobacion de permiso
 * en lugar de una por comando.
 *
 * Es generico a proposito: no conoce ningun proyecto ni stack en particular, y
 * funciona igual si el back y el front viven en repos separados o en el mismo
 * repositorio (monorepo). El control de cambios resultante es siempre uno.
 *
 * Uso:
 *   node collect-changes.mjs                          # rama actual vs su base + sin commitear
 *   node collect-changes.mjs --base origin/desa       # base explicita
 *   node collect-changes.mjs --repo /ruta/a --repo /ruta/b
 *   node collect-changes.mjs --commit 3f2a1b0          # un solo commit
 *   node collect-changes.mjs --since "3 days ago"      # por fecha
 *   node collect-changes.mjs --json                    # salida procesable
 *
 * @author  Skill gen-changes-controls
 * @since   2026-08
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, delimiter, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'

/** Topes de los listados. Ningun corte es silencioso: siempre se imprime `+N mas`. */
const LIMITS = {
  filesPerLayer: 8,
  alwaysFullLayers: ['base de datos', 'ambiguo'],
  alwaysFullCap: 20,
  commits: 15,
  modules: 20,
  evidence: 3,
  snippet: 120,
  dependencies: 25,
  endpoints: 5,
  scannedFiles: 150,
  untrackedBytes: 2 * 1024 * 1024,
}

/**
 * Nombres de rama que suelen ser base de integracion, en orden de prioridad.
 * Solo se usan para *proponer* candidatas: la elegida sale de medir cual es el
 * ancestro mas cercano, no de este orden.
 */
const BASE_CANDIDATE_NAMES = [
  'desa', 'develop', 'development', 'dev',
  'main', 'master',
  'qa', 'staging', 'stage', 'release',
  'prod', 'production',
]

/** Remotos preferidos: una ref remota casi nunca esta rancia; una local, con frecuencia si. */
const PREFERRED_REMOTES = ['origin', 'upstream']

/** Sufijos de variables de entorno que suelen apuntar a un repositorio del mismo trabajo. */
const REPO_ENV_SUFFIXES = ['_FRONT', '_FRONTEND', '_BACKEND', '_BACK', '_APP', '_REPO', '_WEB', '_API']

/** Hash del arbol vacio de git: permite diffear un commit raiz, que no tiene padre. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/**
 * Marcadores de stack. Multi-etiqueta a proposito: un repo Laravel puede tener
 * ademas `package.json` y compilar assets, y forzarlo a un solo stack haria que
 * la clasificacion de archivos se equivocara justo en los monorepos.
 */
const STACK_MARKERS = [
  { stack: 'php-laravel', when: root => hasFile(root, 'artisan') && hasFile(root, 'composer.json') },
  { stack: 'php', when: root => hasFile(root, 'composer.json') && !hasFile(root, 'artisan') },
  { stack: 'js-vue', when: (root, deps) => deps.some(d => d === 'vue' || d === 'nuxt') },
  { stack: 'js-react', when: (root, deps) => deps.some(d => d === 'react' || d === 'next') },
  { stack: 'js-angular', when: (root, deps) => deps.includes('@angular/core') },
  { stack: 'js-backend', when: (root, deps) => deps.some(d => ['@nestjs/core', 'express', 'fastify', 'koa'].includes(d)) },
  { stack: 'js-build', when: root => ['vite.config.js', 'vite.config.ts', 'webpack.config.js', 'rollup.config.js'].some(f => hasFile(root, f)) },
  { stack: 'python-django', when: root => hasFile(root, 'manage.py') },
  { stack: 'python', when: root => hasFile(root, 'pyproject.toml') || hasFile(root, 'requirements.txt') },
  { stack: 'java', when: root => hasFile(root, 'pom.xml') || hasFile(root, 'build.gradle') || hasFile(root, 'build.gradle.kts') },
  { stack: 'go', when: root => hasFile(root, 'go.mod') },
  { stack: 'ruby-rails', when: root => hasFile(root, 'Gemfile') && hasFile(root, 'config/routes.rb') },
  { stack: 'dotnet', when: root => readdirSafe(root).some(f => f.endsWith('.csproj') || f.endsWith('.sln')) },
]

/**
 * Rutas de contenido generado o de terceros. **No es una capa**: se cuenta
 * aparte y se excluye del volumen de esfuerzo, porque un solo lockfile puede
 * sumar decenas de miles de lineas y hacer que el cambio parezca gigante.
 */
const GENERATED_PATTERNS = [
  /(^|\/)(vendor|node_modules|dist|build|out|coverage|\.next|\.nuxt|\.output)\//i,
  /(^|\/)public\/(build|hot|mix-manifest\.json)/i,
  /(^|\/)storage\/framework\//i,
  /\.min\.(js|css)$/i,
  /(^|\/)(composer|package-lock|pnpm-lock|yarn|Cargo|poetry|Gemfile)\.lock$/i,
  /-lock\.json$/i,
  /(auto-imports|components|typed-router|shims-vue|env)\.d\.ts$/i,
]

/**
 * Reglas de capa, en array ORDENADO: la primera coincidencia gana.
 *
 * El orden es una decision, no un accidente: `tests/…Controller.php` es prueba
 * y no backend, y `database/migrations/*.php` es base de datos y no backend.
 * Cada regla puede restringirse a ciertos stacks con `stacks`.
 */
const LAYER_RULES = [
  // Pruebas
  { layer: 'pruebas', pattern: /(^|\/)(tests?|spec|__tests__|e2e|cypress|playwright)\// },
  { layer: 'pruebas', pattern: /\.(test|spec)\.[jt]sx?$/ },
  { layer: 'pruebas', pattern: /Test\.php$|Tests?\.java$|_test\.go$|_spec\.rb$/ },
  { layer: 'pruebas', pattern: /(^|\/)(test_[^/]+|[^/]+_test)\.py$|(^|\/)conftest\.py$/ },
  { layer: 'pruebas', pattern: /(^|\/)src\/test\// },
  { layer: 'pruebas', pattern: /(phpunit\.xml|pest\.php|(vitest|jest|karma)\.config)/ },

  // Base de datos
  { layer: 'base de datos', pattern: /(^|\/)database\/(migrations|seeders|seeds|factories)\// },
  { layer: 'base de datos', pattern: /(^|\/)migrations?\/|(^|\/)db\/(migrate|migrations|seeds)\// },
  { layer: 'base de datos', pattern: /(^|\/)alembic\/versions\/|(^|\/)prisma\// },
  { layer: 'base de datos', pattern: /\.sql$|(^|\/)(schema\.rb|structure\.sql)$/ },
  { layer: 'base de datos', pattern: /(liquibase|flyway)/i },
  { layer: 'base de datos', pattern: /(^|\/)database\// },

  // Documentacion
  { layer: 'documentacion', pattern: /\.(md|mdx|rst|adoc)$/i },
  { layer: 'documentacion', pattern: /(^|\/)docs?\// },

  // Configuracion e infraestructura
  { layer: 'config/infra', pattern: /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*|docker-stack[^/]*)$/i },
  { layer: 'config/infra', pattern: /(^|\/)docker\/|(^|\/)\.github\/workflows\/|(^|\/)\.circleci\// },
  { layer: 'config/infra', pattern: /\.gitlab-ci\.yml$|Jenkinsfile|(azure-pipelines|bitbucket-pipelines)\.yml$/i },
  { layer: 'config/infra', pattern: /(^|\/)(k8s|helm|charts|terraform)\/|\.(tf|tfvars)$/ },
  { layer: 'config/infra', pattern: /(^|\/)\.env/ },
  { layer: 'config/infra', pattern: /(^|\/)(composer|package)\.json$/ },
  { layer: 'config/infra', pattern: /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|Pipfile|pom\.xml|build\.gradle[^/]*|go\.(mod|sum)|Gemfile|Cargo\.toml)$/ },
  { layer: 'config/infra', pattern: /(^|\/)config\// },
  { layer: 'config/infra', pattern: /\.(ya?ml|ini|toml|conf|cfg|properties)$/ },
  { layer: 'config/infra', pattern: /(^|\/)[^/]*\.config\.[jt]s$|(^|\/)tsconfig[^/]*\.json$/ },
  { layer: 'config/infra', pattern: /(phpstan\.neon|pint\.json|\.eslintrc|eslint\.config|sonar-project\.properties|\.editorconfig)/ },
  { layer: 'config/infra', pattern: /(^|\/)\.claude\// },

  // Frontend
  { layer: 'frontend', pattern: /\.(vue|svelte|jsx|tsx|s[ac]ss|css|less|styl|html?)$/i },
  { layer: 'frontend', pattern: /(^|\/)resources\/(js|ts|css|sass|scss|views)\// },
  { layer: 'frontend', pattern: /(^|\/)src\/(views|pages|components|composables|stores|layouts|assets|styles|hooks|router|plugins|navigation)\// },
  { layer: 'frontend', pattern: /(^|\/)(frontend|front|client|web|ui)\// },
  { layer: 'frontend', pattern: /(^|\/)app\/(components|javascript|assets|views)\// },
  { layer: 'frontend', pattern: /(^|\/)templates\// },
  { layer: 'frontend', pattern: /(^|\/)(apps|packages|libs)\/[^/]*(web|front|client|ui|app)[^/]*\// },

  // Backend
  { layer: 'backend', pattern: /\.(php|py|rb|go|java|kt|cs|rs|scala|ex|exs)$/i },
  { layer: 'backend', pattern: /(^|\/)(app|api|server|backend|back)\// },
  { layer: 'backend', pattern: /(^|\/)src\/main\// },
  { layer: 'backend', pattern: /(^|\/)src\/(controllers?|modules|services|entities|dto|guards|interceptors|repositories|domain|usecases|handlers|jobs|middleware)\// },
  { layer: 'backend', pattern: /(^|\/)routes?\/|(^|\/)(graphql|resolvers?)\// },
  { layer: 'backend', pattern: /(^|\/)(apps|packages|libs)\/[^/]*(api|server|back|service)[^/]*\// },
]

/** Rutas de traduccion. Transversales: caen en su capa, pero siempre levantan senal. */
const I18N_PATTERN = /(^|\/)(lang|locales?|i18n|translations)\//i

/**
 * Patrones de declaracion de rutas HTTP por stack. Se aplican a las lineas
 * anadidas y eliminadas del diff: una ruta nueva es superficie publica nueva,
 * una eliminada es una ruptura de contrato con quien la consuma.
 */
const ROUTE_PATTERNS = [
  { stack: 'Laravel', pattern: /Route::(?:get|post|put|patch|delete|any|match|apiResource|resource)\(\s*['"]([^'"]+)/g },
  { stack: 'Express/Nest', pattern: /(?:app|router)\.(?:get|post|put|patch|delete)\(\s*['"`]([^'"`]+)/g },
  { stack: 'Nest', pattern: /@(?:Get|Post|Put|Patch|Delete)\(\s*['"]([^'"]*)/g },
  { stack: 'Django', pattern: /(?:re_)?path\(\s*r?['"]([^'"]*)/g },
  { stack: 'Flask/FastAPI', pattern: /@(?:app|router)\.(?:get|post|put|patch|delete|route)\(\s*['"]([^'"]+)/g },
  { stack: 'Spring', pattern: /@(?:Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(?:value\s*=\s*)?['"]([^'"]+)/g },
  { stack: 'Go', pattern: /(?:mux|r|router|http)\.(?:HandleFunc|Handle|Get|Post|Put|Patch|Delete)\(\s*"([^"]+)/g },
  { stack: 'Rails', pattern: /^\s*(?:get|post|put|patch|delete|resources?)\s+['":]([^'",]+)/gm },
]

/**
 * Senales de contenido. Cada una explica su valor para clasificar riesgo o
 * impacto en el reporte, para que no parezcan numeros sueltos.
 *
 * `side`: 'added' mira las lineas nuevas, 'removed' las eliminadas.
 * `level`: 'alerta' pide decision humana, 'atencion' pesa en la clasificacion,
 * 'info' es contexto.
 */
const SIGNAL_RULES = [
  {
    id: 'esquema_destructivo',
    level: 'alerta',
    side: 'added',
    why: 'posible perdida de datos y rollback costoso',
    pattern: /\b(DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)|TRUNCATE\s+TABLE?)\b|->(dropColumn|dropIfExists|dropForeign|renameColumn)\(|->change\(\)|\b(remove_column|drop_table|change_column)\b|\b(RemoveField|DeleteModel|AlterField)\(|op\.(drop_|alter_)|drop(Column|Table)\(/,
  },
  {
    id: 'permisos',
    level: 'atencion',
    side: 'added',
    why: 'cambia quien puede ver o hacer algo; un permiso faltante deja la funcion inaccesible',
    pattern: /permission:|Gate::|->authorize\(|@?can\(['"]|hasRole\(|hasPermission\(|@PreAuthorize|permission_required|IsAuthenticated|subject:\s*['"]/,
  },
  {
    id: 'variables_entorno',
    level: 'atencion',
    side: 'added',
    why: 'si no se define en el entorno de destino, la funcionalidad falla en silencio',
    pattern: /^\s*[A-Z][A-Z0-9_]{2,}\s*=|env\(['"]|process\.env\.|os\.getenv\(|System\.getenv\(/,
  },
  {
    id: 'integraciones_externas',
    level: 'atencion',
    side: 'added',
    why: 'dependencia de un tercero: su caida afecta la funcionalidad',
    pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}|Http::(get|post|put|delete)|requests\.(get|post)|RestTemplate|SoapClient|webhook/i,
  },
  {
    id: 'seguridad_datos',
    level: 'atencion',
    side: 'added',
    why: 'toca autenticacion, cifrado o datos sensibles: candidato a revision adicional',
    pattern: /\b(password|secret|api_?key|private_key|encrypt|decrypt|jwt|bearer|csrf|cors)\b/i,
  },
  {
    id: 'colas_jobs_cron',
    level: 'atencion',
    side: 'added',
    why: 'comportamiento en segundo plano: no se ve en pantalla ni en una prueba manual',
    pattern: /Schedule::|@Scheduled|celery\.task|dispatch\(new |->onQueue\(|cron|Queue::|ShouldQueue/,
  },
  {
    id: 'llamadas_api_front',
    level: 'info',
    side: 'added',
    why: 'evidencia de que front y back son el mismo cambio, no dos cambios distintos',
    pattern: /\$api\(|axios\.(get|post|put|patch|delete)\(|fetch\(\s*['"`]|useFetch\(|HttpClient/,
  },
  {
    id: 'ruta_pantalla_nueva',
    level: 'info',
    side: 'added',
    why: 'pantalla o vista nueva: cambio visible al usuario, con posible necesidad de acompanamiento',
    pattern: /definePage\(|path:\s*['"]\/|createBrowserRouter|<Route\s+path=|@Route\(/,
  },
]

/** Manifiestos de dependencias, por gestor. */
const DEPENDENCY_MANIFESTS = [
  { manager: 'composer', pattern: /(^|\/)composer\.json$/, lock: /(^|\/)composer\.lock$/ },
  { manager: 'npm/pnpm/yarn', pattern: /(^|\/)package\.json$/, lock: /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/ },
  { manager: 'pip', pattern: /(^|\/)(requirements[^/]*\.txt|pyproject\.toml)$/, lock: /(^|\/)(poetry\.lock|Pipfile\.lock)$/ },
  { manager: 'maven/gradle', pattern: /(^|\/)(pom\.xml|build\.gradle[^/]*)$/, lock: null },
  { manager: 'go', pattern: /(^|\/)go\.mod$/, lock: /(^|\/)go\.sum$/ },
  { manager: 'bundler', pattern: /(^|\/)Gemfile$/, lock: /(^|\/)Gemfile\.lock$/ },
]

/** Extractores de nombre de modulo, por convencion de stack. */
const MODULE_PATTERNS = [
  /(?:^|\/)app\/Http\/Controllers\/Modules\/([^/]+\/[^/]+)\//,
  /(?:^|\/)app\/(?:Services|Models|Repositories)\/(?:Eloquent\/)?Modules\/([^/]+\/[^/]+)\//,
  /(?:^|\/)src\/(?:views\/pages|pages|views)\/([^/]+\/[^/]+)\//,
  /(?:^|\/)src\/modules\/([^/]+)\//,
  /(?:^|\/)(?:apps|packages|libs)\/([^/]+)\//,
  /(?:^|\/)src\/main\/java\/(?:[^/]+\/){2,}([^/]+)\/[^/]+\.java$/,
]

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de git y de sistema de archivos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ejecuta git en un repositorio. Solo lectura, sin shell.
 *
 * @param {string} repo - Raiz del repositorio (`git -C`).
 * @param {string[]} args - Argumentos de git.
 * @returns {string|null} stdout recortado, o `null` si el comando fallo. Se
 *   devuelve `null` en lugar de lanzar porque casi todas las llamadas son
 *   exploratorias (¿existe esta ref?, ¿hay commits?) y el fallo es informacion.
 */
function git(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30000,
      maxBuffer: 128 * 1024 * 1024,
    }).trim()
  }
  catch {
    return null
  }
}

/** @returns {string|null} Raiz canonica del work tree que contiene `dir`. */
function repoRoot(dir) {
  if (!dir || !existsSync(dir))
    return null

  const root = git(dir, ['rev-parse', '--show-toplevel'])

  return root || null
}

/** @returns {boolean} Si existe el archivo relativo a la raiz del repo. */
function hasFile(root, relativePath) {
  return existsSync(join(root, relativePath))
}

/** @returns {string[]} Contenido del directorio, o vacio si no se puede leer. */
function readdirSafe(dir) {
  try {
    return readdirSync(dir)
  }
  catch {
    return []
  }
}

/** @returns {object|null} JSON parseado, o `null` si no existe o esta corrupto. */
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  }
  catch {
    return null
  }
}

/** @returns {boolean} Si la ref existe en el repo. */
function refExists(repo, ref) {
  return git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null
}

// ─────────────────────────────────────────────────────────────────────────────
// Descubrimiento de repositorios
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee `additionalDirectories` de la configuracion de Claude Code del repo.
 *
 * Es la fuente mas fiable de "el otro repo de este trabajo": si esta ahi, es
 * porque la sesion necesita escribirlo.
 *
 * @param {string} selfRepo - Repo desde el que se invoco.
 * @returns {string[]} Rutas declaradas, sin filtrar todavia por ser repos git.
 */
function readAdditionalDirectories(selfRepo) {
  const candidates = [
    join(selfRepo, '.claude', 'settings.local.json'),
    join(selfRepo, '.claude', 'settings.json'),
    join(homedir(), '.claude', 'settings.json'),
  ]

  const dirs = []

  for (const file of candidates) {
    const settings = readJson(file)
    const declared = settings?.permissions?.additionalDirectories

    if (Array.isArray(declared))
      dirs.push(...declared)
  }

  return dirs
}

/**
 * Repos declarados en variables de entorno.
 *
 * Se buscan por sufijo (`_FRONT`, `_BACKEND`, …) en lugar de por nombres
 * concretos, para no atar el script a ningun proyecto: asi captura cosas como
 * `AIO_FRONT` o `MIAPP_BACKEND` sin conocerlas de antemano.
 *
 * @returns {{path: string, via: string}[]}
 */
function reposFromEnv() {
  const found = []

  if (process.env.CHANGES_REPOS) {
    for (const path of process.env.CHANGES_REPOS.split(delimiter).filter(Boolean))
      found.push({ path, via: 'env:CHANGES_REPOS' })
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !isAbsolute(value))
      continue

    if (REPO_ENV_SUFFIXES.some(suffix => key.endsWith(suffix)))
      found.push({ path: value, via: `env:${key}` })
  }

  return found
}

/**
 * Busca repos hermanos que probablemente sean parte del mismo trabajo.
 *
 * Se exige que **compartan un token de nombre** con el repo actual
 * (`mi-proyecto-backend` → token `mi` / `proyecto` → `mi-proyecto-app`). Sin
 * ese filtro, analizar todo lo que hay al lado meteria proyectos ajenos en el
 * control de cambios, que es un error peor que no encontrarlos.
 *
 * @param {string} selfRepo - Repo actual.
 * @returns {{path: string, via: string}[]} Marcados como heuristicos: quien
 *   consuma esto debe confirmarlos con el usuario.
 */
function findSiblingRepos(selfRepo) {
  const name = basename(selfRepo)
  const tokens = name.split(/[-_.]/).filter(token => token.length >= 3)

  if (!tokens.length)
    return []

  const found = []

  for (const level of ['..', '../..']) {
    const parent = resolve(selfRepo, level)

    for (const entry of readdirSafe(parent)) {
      const path = join(parent, entry)

      if (path === selfRepo || entry.startsWith('.'))
        continue

      try {
        if (!statSync(path).isDirectory())
          continue
      }
      catch {
        continue
      }

      if (!existsSync(join(path, '.git')))
        continue

      const entryTokens = entry.split(/[-_.]/)

      if (tokens.some(token => entryTokens.includes(token)))
        found.push({ path, via: 'hermano (heuristico)' })
    }
  }

  return found
}

/**
 * Aplica la precedencia completa de descubrimiento y deduplica.
 *
 * Precedencia: `--repo` explicito (desactiva todo lo demas) → variables de
 * entorno → `additionalDirectories` → hermanos heuristicos. El repo actual
 * siempre entra, salvo que se haya pasado `--repo`.
 *
 * @param {object} cli - Opciones de linea de comandos.
 * @returns {{repos: {path: string, name: string, discoveredBy: string}[], selfRepo: string|null}}
 */
function discoverRepos(cli) {
  const selfRepo = repoRoot(process.cwd())
  const seen = new Map()

  /** Agrega un repo si es un work tree de git y no estaba ya. */
  const add = (path, discoveredBy) => {
    const root = repoRoot(path)

    if (!root || seen.has(root))
      return

    seen.set(root, { path: root, name: basename(root), discoveredBy })
  }

  if (cli.repos.length) {
    for (const path of cli.repos)
      add(resolve(path), '--repo')

    return { repos: [...seen.values()], selfRepo }
  }

  if (selfRepo)
    add(selfRepo, 'repo actual')

  for (const { path, via } of reposFromEnv())
    add(path, via)

  for (const path of readAdditionalDirectories(selfRepo || process.cwd()))
    add(path, 'additionalDirectories')

  // Los hermanos son el ultimo recurso: solo si no aparecio un segundo repo por
  // una via explicita, que es mas fiable que adivinar por el nombre.
  if (seen.size < 2 && selfRepo) {
    for (const { path, via } of findSiblingRepos(selfRepo))
      add(path, via)
  }

  return { repos: [...seen.values()], selfRepo }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolucion del alcance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reune las refs candidatas a ser la rama base, sin medirlas todavia.
 *
 * Prefiere la ref remota sobre la local con el mismo nombre porque las locales
 * se quedan rancias: una rama `prod` local sin actualizar puede estar cientos
 * de commits detras de `origin/prod` e inflar el rango con trabajo ajeno.
 *
 * @param {string} repo - Raiz del repositorio.
 * @param {string|null} currentBranch - Rama actual, para no compararla consigo misma.
 * @returns {string[]} Refs existentes, en orden de prioridad de nombre.
 */
function baseCandidateRefs(repo, currentBranch) {
  const names = []

  const originHead = git(repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])

  if (originHead)
    names.push(originHead.replace(/^origin\//, ''))

  if (process.env.CHANGES_BASE_REF)
    names.push(process.env.CHANGES_BASE_REF)

  names.push(...BASE_CANDIDATE_NAMES)

  const refs = []

  for (const name of names) {
    if (name === currentBranch)
      continue

    const options = [
      ...PREFERRED_REMOTES.map(remote => `${remote}/${name}`),
      name,
    ]

    const existing = options.find(ref => refExists(repo, ref))

    if (existing && !refs.includes(existing))
      refs.push(existing)
  }

  return refs
}

/**
 * Mide cada candidata: donde se separa del trabajo actual y cuanto abarca.
 *
 * @param {string} repo - Raiz del repositorio.
 * @param {string[]} refs - Candidatas.
 * @returns {{ref: string, sha: string, commits: number, files: number}[]}
 *   Ordenadas por cercania (menos commits primero); las candidatas sin
 *   ancestro comun se descartan.
 */
function evaluateBaseCandidates(repo, refs) {
  const evaluated = []

  refs.forEach((ref, priority) => {
    const mergeBase = git(repo, ['merge-base', 'HEAD', ref])

    if (!mergeBase)
      return

    const commits = Number(git(repo, ['rev-list', '--count', `${mergeBase}..HEAD`]) || 0)
    const files = (git(repo, ['diff', '--name-only', mergeBase, 'HEAD']) || '')
      .split('\n').filter(Boolean).length

    evaluated.push({ ref, sha: mergeBase, commits, files, priority })
  })

  return evaluated.sort((a, b) => a.commits - b.commits || a.priority - b.priority)
}

/**
 * Elige la base y declara cuanta confianza merece.
 *
 * La elegida es el **ancestro mas cercano** con al menos un commit por delante:
 * es, casi siempre, la rama de la que se corto el trabajo. Las candidatas con 0
 * commits significan que la base ya contiene todo lo hecho, asi que no sirven
 * para delimitar un control de cambios.
 *
 * @param {string} repo - Raiz del repositorio.
 * @param {string|null} currentBranch - Rama actual.
 * @returns {{ref: string|null, sha: string|null, confidence: string, candidates: object[], warnings: object[]}}
 */
function pickBase(repo, currentBranch) {
  const candidates = evaluateBaseCandidates(repo, baseCandidateRefs(repo, currentBranch))
  const warnings = []
  const usable = candidates.filter(candidate => candidate.commits > 0)

  if (!usable.length) {
    warnings.push({
      level: 'warn',
      id: 'sin-base',
      message: candidates.length
        ? `Todas las ramas base candidatas ya contienen el trabajo de esta rama (${candidates.map(c => c.ref).join(', ')}).`
        : 'No se encontro ninguna rama base candidata.',
      hint: 'Acota el alcance con --base <ref>, --range <a>..<b>, --commit <sha> o --since <fecha>.',
    })

    return { ref: null, sha: null, confidence: 'baja', candidates, warnings }
  }

  const chosen = usable[0]
  const runnerUp = usable[1]

  let confidence = 'alta'

  if (runnerUp && runnerUp.commits < chosen.commits * 3)
    confidence = 'media'

  if (chosen.commits > 30 || chosen.files > 120)
    confidence = 'baja'

  if (confidence !== 'alta') {
    warnings.push({
      level: 'warn',
      id: 'base-ambigua',
      message: `Base autodetectada con confianza ${confidence}: se uso ${chosen.ref} (${chosen.commits} commits, ${chosen.files} archivos). Candidatas: ${candidates.map(c => `${c.ref} → ${c.commits}/${c.files}`).join(' · ')}.`,
      hint: 'Si la base correcta es otra: --base <ref>.',
    })
  }

  return { ref: chosen.ref, sha: chosen.sha, confidence, candidates, warnings }
}

/**
 * Resuelve el rango de commits que representa el desarrollo.
 *
 * Precedencia: `--commit` → `--range` → `--since` → `--base` → autodeteccion.
 * **Nunca cae a `HEAD~1..HEAD`**: si no puede delimitar el trabajo lo declara y
 * devuelve `null`, porque un rango inventado produce un control de cambios que
 * describe trabajo de otra persona.
 *
 * @param {string} repo - Raiz del repositorio.
 * @param {object} cli - Opciones.
 * @param {string} name - Nombre corto del repo, para las opciones por repo.
 * @returns {object|null} Alcance resuelto, o `null` si es irresoluble.
 */
function resolveScope(repo, cli, name) {
  const warnings = []
  const currentBranch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const hasCommits = refExists(repo, 'HEAD')

  if (!hasCommits) {
    warnings.push({ level: 'info', id: 'sin-commits', message: 'El repositorio no tiene commits: solo se puede leer el trabajo sin commitear.' })

    return { repo, currentBranch, from: null, to: null, source: 'sin-commits', base: null, commits: 0, merges: 0, authors: [], warnings }
  }

  if (currentBranch === 'HEAD')
    warnings.push({ level: 'warn', id: 'head-desprendido', message: 'HEAD esta desprendido: no hay rama de la que deducir la base.' })

  if (!git(repo, ['remote']))
    warnings.push({ level: 'warn', id: 'sin-remotos', message: 'El repositorio no tiene remotos: las refs locales pueden estar rancias y la base autodetectada ser incorrecta.' })

  if (existsSync(join(repo, '.git', 'shallow')))
    warnings.push({ level: 'warn', id: 'clon-superficial', message: 'Clon superficial (shallow): el ancestro comun puede calcularse mal.' })

  const perRepo = option => cli[option].find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
    ?? cli[option].find(value => !value.includes('='))

  let from = null
  let to = 'HEAD'
  let source = null
  let base = null

  const commit = perRepo('commits')
  const range = perRepo('ranges')
  const since = perRepo('sinces')
  const explicitBase = perRepo('bases')

  if (commit) {
    const sha = git(repo, ['rev-parse', '--verify', `${commit}^{commit}`])

    if (!sha) {
      warnings.push({ level: 'warn', id: 'commit-inexistente', message: `El commit ${commit} no existe en este repositorio.` })

      return null
    }

    // Un commit raiz no tiene padre: se diffea contra el arbol vacio.
    from = git(repo, ['rev-parse', '--verify', `${sha}^`]) || EMPTY_TREE
    to = sha
    source = 'commit'
  }
  else if (range) {
    const [left, right = 'HEAD'] = range.split('..').filter(Boolean)

    from = git(repo, ['rev-parse', '--verify', `${left}^{commit}`])
    to = git(repo, ['rev-parse', '--verify', `${right}^{commit}`]) || 'HEAD'

    if (!from) {
      warnings.push({ level: 'warn', id: 'rango-invalido', message: `No se pudo resolver el rango ${range}.` })

      return null
    }

    source = 'rango explicito'
  }
  else if (since) {
    const oldest = (git(repo, ['log', '--since', since, '--reverse', '--format=%H']) || '').split('\n').filter(Boolean)[0]

    if (!oldest) {
      warnings.push({ level: 'warn', id: 'since-vacio', message: `No hay commits desde "${since}".` })

      return null
    }

    from = git(repo, ['rev-parse', '--verify', `${oldest}^`]) || EMPTY_TREE
    source = `desde ${since}`
  }
  else if (explicitBase) {
    if (!refExists(repo, explicitBase)) {
      warnings.push({ level: 'warn', id: 'base-inexistente', message: `La base ${explicitBase} no existe en este repositorio.`, hint: 'Revisa el nombre, o usa --range.' })

      return null
    }

    from = git(repo, ['merge-base', 'HEAD', explicitBase])
    base = { ref: explicitBase, confidence: 'manual', candidates: [] }
    source = 'base manual'
  }
  else {
    const picked = pickBase(repo, currentBranch)

    warnings.push(...picked.warnings)

    if (BASE_CANDIDATE_NAMES.includes(currentBranch)) {
      warnings.push({
        level: 'warn',
        id: 'rama-base',
        message: `Estas parado en ${currentBranch}, que es una rama de integracion: el rango no se puede deducir de forma fiable.`,
        hint: 'Usa --since, --commit o --range para acotar el trabajo.',
      })
    }

    if (!picked.sha)
      return { repo, currentBranch, from: null, to: null, source: 'irresoluble', base: picked, commits: 0, merges: 0, authors: [], warnings }

    from = picked.sha
    base = picked
    source = 'autodetectada'
  }

  const allCommits = Number(git(repo, ['rev-list', '--count', `${from}..${to}`]) || 0)
  const firstParent = Number(git(repo, ['rev-list', '--count', '--first-parent', `${from}..${to}`]) || 0)
  const merges = Math.max(0, allCommits - Number(git(repo, ['rev-list', '--count', '--no-merges', `${from}..${to}`]) || 0))

  if (merges > 0) {
    warnings.push({
      level: 'info',
      id: 'merges-en-rango',
      message: `${merges} merge(s) en el rango: parte del diff puede venir de otra rama y no de este desarrollo.`,
    })
  }

  if (allCommits > firstParent + merges) {
    warnings.push({
      level: 'info',
      id: 'commits-de-otras-ramas',
      message: 'El rango incluye commits traidos por merges desde otras ramas.',
    })
  }

  const authors = [...new Set((git(repo, ['log', '--no-merges', '--format=%an', `${from}..${to}`]) || '').split('\n').filter(Boolean))]

  return { repo, currentBranch, from, to, source, base, commits: allCommits - merges, merges, authors, warnings }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clasificacion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta los stacks de un repositorio. Multi-etiqueta: un repo no "es" un
 * stack, puede tener varios (Laravel que ademas compila assets con Vite).
 *
 * @param {string} repo - Raiz del repositorio.
 * @returns {string[]} Etiquetas de stack.
 */
function detectStacks(repo) {
  const manifest = readJson(join(repo, 'package.json'))
  const deps = manifest
    ? [...Object.keys(manifest.dependencies || {}), ...Object.keys(manifest.devDependencies || {})]
    : []

  return STACK_MARKERS.filter(marker => marker.when(repo, deps)).map(marker => marker.stack)
}

/**
 * Clasifica un archivo en una capa.
 *
 * Lo que no encaja en ninguna regla **no se fuerza**: cae en `ambiguo` con la
 * razon en texto, porque asignarle una capa por conveniencia es lo que hace
 * que el control de cambios describa algo que no ocurrio.
 *
 * @param {string} path - Ruta relativa del archivo.
 * @param {string[]} stacks - Stacks del repo, para desambiguar extensiones.
 * @returns {{layer: string, generated: boolean, reason?: string}}
 */
function classifyPath(path, stacks) {
  if (GENERATED_PATTERNS.some(pattern => pattern.test(path)))
    return { layer: 'generado', generated: true }

  for (const rule of LAYER_RULES) {
    if (rule.stacks && !rule.stacks.some(stack => stacks.includes(stack)))
      continue

    if (rule.pattern.test(path))
      return { layer: rule.layer, generated: false }
  }

  const hasJsFront = stacks.some(stack => ['js-vue', 'js-react', 'js-angular'].includes(stack))
  const hasJsBack = stacks.includes('js-backend')

  if (/\.(m?[jt]s|cjs)$/.test(path)) {
    return {
      layer: 'ambiguo',
      generated: false,
      reason: hasJsFront && hasJsBack
        ? 'extension JS/TS sin ruta indicativa; el repo tiene front y back en JavaScript'
        : 'extension JS/TS sin ruta indicativa',
    }
  }

  if (/\.json$/.test(path))
    return { layer: 'ambiguo', generated: false, reason: 'archivo .json sin regla: puede ser datos, configuracion o fixture' }

  return { layer: 'otros', generated: false }
}

/** @returns {string|null} Nombre de modulo deducido de la ruta, si alguna convencion aplica. */
function extractModule(path) {
  for (const pattern of MODULE_PATTERNS) {
    const match = path.match(pattern)

    if (match)
      return match[1]
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Recoleccion de archivos y de lineas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza la ruta que git escribe para un rename en `--numstat`
 * (`lib/{a.js => b.js}` o `a.js => b.js`) a la ruta de destino.
 *
 * @param {string} raw - Ruta cruda del numstat.
 * @returns {string} Ruta final del archivo.
 */
function resolveRenamePath(raw) {
  if (!raw.includes('=>'))
    return raw

  const braced = raw.match(/^(.*)\{(.*) => (.*)\}(.*)$/)

  if (braced)
    return `${braced[1]}${braced[3]}${braced[4]}`.replace(/\/{2,}/g, '/')

  return raw.split(' => ').pop().trim()
}

/**
 * Lee los archivos tocados en un conjunto de diffs y los normaliza.
 *
 * Combina `--name-status -M` (estado y similitud del rename) con `--numstat`
 * (lineas, y `-` para binarios), y anade el trabajo sin commitear como origenes
 * separados: fundirlos ocultaria que algo todavia no esta en git.
 *
 * @param {string} repo - Raiz del repositorio.
 * @param {object} scope - Alcance resuelto.
 * @param {object} cli - Opciones.
 * @returns {{files: object[], warnings: object[]}}
 */
function collectFiles(repo, scope, cli) {
  const files = []
  const warnings = []

  /** Lee un par name-status/numstat y agrega sus archivos con el origen dado. */
  const readDiff = (args, origin) => {
    const status = new Map()

    for (const line of (git(repo, ['diff', '--name-status', '-M', ...args]) || '').split('\n').filter(Boolean)) {
      const parts = line.split('\t')
      const code = parts[0]
      const path = parts[parts.length - 1]

      status.set(path, { status: code[0], similarity: code.slice(1) || null, from: parts.length > 2 ? parts[1] : null })
    }

    for (const line of (git(repo, ['diff', '--numstat', '-M', ...args]) || '').split('\n').filter(Boolean)) {
      const [insertions, deletions, ...rest] = line.split('\t')
      const path = resolveRenamePath(rest.join('\t'))
      const meta = status.get(path) || {}
      const binary = insertions === '-' && deletions === '-'

      files.push({
        path,
        origin,
        status: meta.status || 'M',
        similarity: meta.similarity || null,
        renamedFrom: meta.from || null,
        insertions: binary ? 0 : Number(insertions),
        deletions: binary ? 0 : Number(deletions),
        binary,
      })
    }

    // Cambios que solo alteran permisos no aparecen en numstat: se rescatan del
    // name-status para que no desaparezcan del reporte.
    for (const [path, meta] of status) {
      if (!files.some(file => file.path === path && file.origin === origin))
        files.push({ path, origin, status: meta.status, similarity: meta.similarity, renamedFrom: meta.from, insertions: 0, deletions: 0, binary: false, modeOnly: true })
    }
  }

  if (scope.from)
    readDiff([scope.from, scope.to], 'commit')

  if (!cli.noUncommitted) {
    readDiff(['--cached'], 'staged')
    readDiff([], 'sin commitear')

    for (const path of (git(repo, ['ls-files', '--others', '--exclude-standard']) || '').split('\n').filter(Boolean)) {
      let insertions = 0
      let binary = false

      try {
        const stats = statSync(join(repo, path))

        if (stats.size > LIMITS.untrackedBytes) {
          binary = true
        }
        else {
          const content = readFileSync(join(repo, path))

          binary = content.includes(0)
          insertions = binary ? 0 : content.toString('utf8').split('\n').length
        }
      }
      catch {
        continue
      }

      files.push({ path, origin: 'sin seguimiento', status: 'A', similarity: null, renamedFrom: null, insertions, deletions: 0, binary })
    }
  }

  const submodules = files.filter(file => existsSync(join(repo, file.path, '.git')))

  if (submodules.length)
    warnings.push({ level: 'info', id: 'submodulos', message: `${submodules.length} submodulo(s) en el diff: su contenido no se analiza.` })

  for (const file of submodules)
    file.submodule = true

  return { files, warnings }
}

/**
 * Lee las lineas anadidas y eliminadas de los archivos que vale la pena
 * inspeccionar por contenido.
 *
 * Se acota a proposito: escanear tambien documentacion, pruebas y contenido
 * generado costaria tiempo y no aportaria ninguna senal.
 *
 * @param {string} repo - Raiz del repositorio.
 * @param {object} scope - Alcance resuelto.
 * @param {object[]} files - Archivos ya clasificados.
 * @returns {{lines: Map<string, {added: object[], removed: object[]}>, truncated: number}}
 */
function readDiffLines(repo, scope, files) {
  const scannable = files.filter(file => !file.binary && !file.submodule
    && ['backend', 'frontend', 'base de datos', 'config/infra', 'ambiguo', 'otros'].includes(file.layer))

  const selected = scannable.slice(0, LIMITS.scannedFiles)
  const lines = new Map()

  /** Parsea un diff unificado sin contexto y guarda las lineas por archivo. */
  const parse = output => {
    let current = null
    let newLine = 0
    let oldLine = 0

    for (const line of (output || '').split('\n')) {
      if (line.startsWith('+++ b/')) {
        current = line.slice(6)

        if (!lines.has(current))
          lines.set(current, { added: [], removed: [] })

        continue
      }

      const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)

      if (hunk) {
        oldLine = Number(hunk[1])
        newLine = Number(hunk[2])

        continue
      }

      if (!current)
        continue

      if (line.startsWith('+') && !line.startsWith('+++'))
        lines.get(current).added.push({ line: newLine++, text: line.slice(1) })
      else if (line.startsWith('-') && !line.startsWith('---'))
        lines.get(current).removed.push({ line: oldLine++, text: line.slice(1) })
    }
  }

  /** git falla si se le pasan demasiadas rutas: se trocea. */
  const chunks = []

  for (let index = 0; index < selected.length; index += 60)
    chunks.push(selected.slice(index, index + 60))

  for (const chunk of chunks) {
    const paths = chunk.map(file => file.path)
    const committed = chunk.filter(file => file.origin === 'commit')
    const staged = chunk.filter(file => file.origin === 'staged')
    const working = chunk.filter(file => file.origin === 'sin commitear')

    if (scope.from && committed.length)
      parse(git(repo, ['diff', '-U0', '-M', scope.from, scope.to, '--', ...committed.map(file => file.path)]))

    if (staged.length)
      parse(git(repo, ['diff', '-U0', '-M', '--cached', '--', ...staged.map(file => file.path)]))

    if (working.length)
      parse(git(repo, ['diff', '-U0', '-M', '--', ...working.map(file => file.path)]))

    void paths
  }

  // Los archivos sin seguimiento no estan en ningun diff: se leen enteros.
  for (const file of selected.filter(file => file.origin === 'sin seguimiento')) {
    try {
      const content = readFileSync(join(repo, file.path), 'utf8')

      lines.set(file.path, {
        added: content.split('\n').map((text, index) => ({ line: index + 1, text })),
        removed: [],
      })
    }
    catch {
      continue
    }
  }

  return { lines, truncated: Math.max(0, scannable.length - selected.length) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Senales
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recorta un fragmento de codigo para citarlo en el reporte.
 *
 * @param {string} text - Linea cruda.
 * @returns {string} Linea sin indentacion y acotada.
 */
function snippet(text) {
  const clean = text.trim()

  return clean.length > LIMITS.snippet ? `${clean.slice(0, LIMITS.snippet)}…` : clean
}

/**
 * Aplica las reglas de senal de contenido y las de rutas HTTP.
 *
 * @param {object[]} files - Archivos clasificados.
 * @param {Map} diffLines - Lineas por archivo.
 * @returns {object[]} Senales con nivel, contador y evidencias.
 */
function detectContentSignals(files, diffLines) {
  const signals = new Map()

  /** Registra una ocurrencia de senal con su evidencia. */
  const push = (id, level, why, file, line, text) => {
    if (!signals.has(id))
      signals.set(id, { id, level, why, count: 0, evidence: [] })

    const signal = signals.get(id)

    signal.count++

    if (signal.evidence.length < LIMITS.evidence)
      signal.evidence.push({ file, line, snippet: snippet(text) })
  }

  for (const file of files) {
    const changes = diffLines.get(file.path)

    if (!changes)
      continue

    for (const rule of SIGNAL_RULES) {
      const pool = rule.side === 'removed' ? changes.removed : changes.added

      for (const { line, text } of pool) {
        if (rule.pattern.test(text)) {
          // Las variables de entorno solo cuentan en archivos .env o en codigo
          // que las lee: la regex sola daria falsos positivos con constantes.
          if (rule.id === 'variables_entorno' && /^\s*[A-Z][A-Z0-9_]{2,}\s*=/.test(text) && !/\.env/.test(file.path))
            continue

          push(rule.id, rule.level, rule.why, file.path, line, text)
        }
      }
    }

    for (const { stack, pattern } of ROUTE_PATTERNS) {
      for (const side of ['added', 'removed']) {
        for (const { line, text } of changes[side]) {
          pattern.lastIndex = 0

          const match = pattern.exec(text)

          if (match) {
            push(
              side === 'added' ? 'endpoint_nuevo' : 'endpoint_eliminado',
              side === 'added' ? 'atencion' : 'alerta',
              side === 'added'
                ? 'superficie publica nueva: afecta a quien consuma la API'
                : 'ruta eliminada o modificada: rompe a quien la consuma',
              file.path,
              line,
              `${stack}: ${match[1]}`,
            )
          }
        }
      }
    }
  }

  return [...signals.values()]
}

/**
 * Detecta cambios de dependencias comparando las lineas del manifiesto.
 *
 * Distingue anadidas, actualizadas y eliminadas, y avisa cuando el manifiesto
 * cambio sin su lockfile (o al reves): el primero es un despliegue que fallara,
 * el segundo un cambio transitivo que nadie pidio.
 *
 * @param {object[]} files - Archivos clasificados.
 * @param {Map} diffLines - Lineas por archivo.
 * @returns {object[]} Senales de dependencias.
 */
function detectDependencySignals(files, diffLines) {
  const signals = []

  for (const manifest of DEPENDENCY_MANIFESTS) {
    const changedManifests = files.filter(file => manifest.pattern.test(file.path))
    const changedLocks = manifest.lock ? files.filter(file => manifest.lock.test(file.path)) : []

    if (!changedManifests.length && !changedLocks.length)
      continue

    const added = new Map()
    const removed = new Map()

    for (const file of changedManifests) {
      const changes = diffLines.get(file.path)

      if (!changes)
        continue

      /** Extrae `nombre` → `version` de una linea de manifiesto. */
      const parse = ({ text }) => {
        const json = text.match(/"([^"]+)"\s*:\s*"([^"]+)"/)

        if (json)
          return [json[1], json[2]]

        const plain = text.match(/^\s*([A-Za-z0-9._@/-]+)\s*(?:[=~><^]+|\s)\s*([\d.*][^\s;#]*)/)

        return plain ? [plain[1], plain[2]] : null
      }

      for (const line of changes.added) {
        const entry = parse(line)

        if (entry)
          added.set(entry[0], entry[1])
      }

      for (const line of changes.removed) {
        const entry = parse(line)

        if (entry)
          removed.set(entry[0], entry[1])
      }
    }

    const newDeps = [...added.keys()].filter(name => !removed.has(name))
    const goneDeps = [...removed.keys()].filter(name => !added.has(name))
    const bumped = [...added.keys()].filter(name => removed.has(name) && removed.get(name) !== added.get(name))

    const details = []

    if (newDeps.length)
      details.push(`anadidas: ${newDeps.slice(0, LIMITS.dependencies).join(', ')}`)

    if (bumped.length)
      details.push(`actualizadas: ${bumped.slice(0, LIMITS.dependencies).map(name => `${name} ${removed.get(name)}→${added.get(name)}`).join(', ')}`)

    if (goneDeps.length)
      details.push(`eliminadas: ${goneDeps.slice(0, LIMITS.dependencies).join(', ')}`)

    if (changedManifests.length && manifest.lock && !changedLocks.length)
      details.push('el manifiesto cambio sin su lockfile: el despliegue puede instalar versiones distintas')

    if (!changedManifests.length && changedLocks.length)
      details.push('cambio solo el lockfile: son dependencias transitivas')

    if (details.length) {
      signals.push({
        id: 'dependencias',
        level: 'atencion',
        why: 'codigo de terceros nuevo y un paso de instalacion en el despliegue',
        count: newDeps.length + bumped.length + goneDeps.length,
        detail: `${manifest.manager} — ${details.join(' · ')}`,
        evidence: [],
      })
    }
  }

  return signals
}

/**
 * Senales que se deducen de la forma del cambio, no de su contenido.
 *
 * @param {object[]} files - Archivos clasificados.
 * @param {object} layers - Estadisticas por capa.
 * @returns {object[]} Senales estructurales.
 */
function detectStructuralSignals(files, layers) {
  const signals = []
  const real = files.filter(file => !file.generated)

  const newMigrations = files.filter(file => file.layer === 'base de datos' && file.status === 'A')

  if (newMigrations.length) {
    signals.push({
      id: 'migracion_nueva',
      level: 'atencion',
      why: 'cambia el esquema de datos: exige orden de despliegue y no siempre es reversible',
      count: newMigrations.length,
      evidence: newMigrations.slice(0, LIMITS.evidence).map(file => ({ file: file.path, line: null, snippet: 'archivo nuevo' })),
    })
  }

  const deleted = real.filter(file => file.status === 'D')

  if (deleted.length) {
    signals.push({
      id: 'archivos_eliminados',
      level: 'atencion',
      why: 'rompe a quien los consuma, incluso desde fuera de este repositorio',
      count: deleted.length,
      evidence: deleted.slice(0, LIMITS.evidence).map(file => ({ file: file.path, line: null, snippet: 'eliminado' })),
    })
  }

  const renamed = real.filter(file => file.status === 'R')

  if (renamed.length) {
    signals.push({
      id: 'renombrados',
      level: 'info',
      why: 'un rename al 100% es cosmetico; con similitud baja es una reescritura disfrazada',
      count: renamed.length,
      evidence: renamed.slice(0, LIMITS.evidence).map(file => ({ file: file.path, line: null, snippet: `desde ${file.renamedFrom || '?'} (similitud ${file.similarity || '?'}%)` })),
    })
  }

  const infra = real.filter(file => file.layer === 'config/infra'
    && /(Dockerfile|docker-compose|docker-stack|\.gitlab-ci|\.github\/workflows|Jenkinsfile|k8s|helm|terraform)/i.test(file.path))

  if (infra.length) {
    signals.push({
      id: 'infra_ci',
      level: 'atencion',
      why: 'exige accion de operaciones y despliegue coordinado',
      count: infra.length,
      evidence: infra.slice(0, LIMITS.evidence).map(file => ({ file: file.path, line: null, snippet: 'infraestructura o CI' })),
    })
  }

  const i18n = real.filter(file => I18N_PATTERN.test(file.path))

  if (i18n.length) {
    signals.push({
      id: 'i18n',
      level: 'info',
      why: 'texto visible al usuario final: una traduccion faltante es un defecto visible',
      count: i18n.length,
      evidence: i18n.slice(0, LIMITS.evidence).map(file => ({ file: file.path, line: null, snippet: 'traducciones' })),
    })
  }

  const codeFiles = real.filter(file => ['backend', 'frontend'].includes(file.layer)).length
  const testFiles = layers.pruebas?.files || 0

  if (testFiles > 0) {
    signals.push({
      id: 'pruebas_tocadas',
      level: 'info',
      why: 'es el unico indicio objetivo para bajar el riesgo residual',
      count: testFiles,
      evidence: [],
    })
  }
  else if (codeFiles > 3) {
    signals.push({
      id: 'sin_archivos_de_prueba',
      level: 'atencion',
      why: 'no hay archivos de prueba en el rango; pudo probarse a mano, pero eso hay que confirmarlo',
      count: codeFiles,
      evidence: [],
    })
  }

  const binary = files.filter(file => file.binary)

  if (binary.length) {
    signals.push({
      id: 'binarios',
      level: 'info',
      why: 'su contenido no se puede analizar: no cuentan como cero lineas',
      count: binary.length,
      evidence: binary.slice(0, LIMITS.evidence).map(file => ({ file: file.path, line: null, snippet: 'binario' })),
    })
  }

  const modeOnly = files.filter(file => file.modeOnly)

  if (modeOnly.length) {
    signals.push({
      id: 'solo_permisos_archivo',
      level: 'info',
      why: 'cambio real con cero lineas: sin reportarlo desapareceria del control de cambios',
      count: modeOnly.length,
      evidence: modeOnly.slice(0, LIMITS.evidence).map(file => ({ file: file.path, line: null, snippet: 'solo permisos o modo' })),
    })
  }

  return signals
}

// ─────────────────────────────────────────────────────────────────────────────
// Analisis por repositorio y agregado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agrupa los archivos por capa y calcula sus contadores.
 *
 * @param {object[]} files - Archivos clasificados.
 * @returns {Record<string, object>} Estadisticas por capa.
 */
function summarizeLayers(files) {
  const layers = {}

  for (const file of files) {
    const key = file.layer

    layers[key] ??= { files: 0, insertions: 0, deletions: 0, added: 0, modified: 0, deleted: 0, renamed: 0, samples: [] }

    const layer = layers[key]

    layer.files++
    layer.insertions += file.insertions
    layer.deletions += file.deletions

    if (file.status === 'A')
      layer.added++
    else if (file.status === 'D')
      layer.deleted++
    else if (file.status === 'R')
      layer.renamed++
    else
      layer.modified++

    layer.samples.push(file)
  }

  return layers
}

/**
 * Etiqueta el tamano del cambio. Es un proxy de complejidad, y los umbrales se
 * declaran en el reporte para que no parezcan un juicio.
 *
 * @param {number} files - Archivos reales (sin generados).
 * @param {number} lines - Lineas insertadas mas eliminadas.
 * @returns {string} `pequeno`, `medio` o `grande`.
 */
function sizeLabel(files, lines) {
  if (files < 10 && lines < 300)
    return 'pequeno'

  if (files < 40 && lines < 1500)
    return 'medio'

  return 'grande'
}

/**
 * Analiza un repositorio completo.
 *
 * @param {object} info - `{path, name, discoveredBy}`.
 * @param {object} cli - Opciones.
 * @returns {object} Reporte del repositorio.
 */
function analyzeRepo(info, cli) {
  const stacks = detectStacks(info.path)
  const scope = resolveScope(info.path, cli, info.name)

  if (!scope) {
    return {
      ...info,
      stacks,
      scope: null,
      warnings: [{ level: 'warn', id: 'alcance-irresoluble', message: `No se pudo delimitar el alcance en ${info.name}.` }],
      files: [], layers: {}, signals: [], commits: [], totals: null, modules: [], ambiguous: [],
    }
  }

  const warnings = [...scope.warnings]
  const collected = collectFiles(info.path, scope, cli)

  warnings.push(...collected.warnings)

  for (const file of collected.files) {
    const classification = classifyPath(file.path, stacks)

    file.layer = classification.layer
    file.generated = classification.generated
    file.reason = classification.reason
    file.module = extractModule(file.path)
  }

  const { lines: diffLines, truncated } = readDiffLines(info.path, scope, collected.files)

  if (truncated)
    warnings.push({ level: 'info', id: 'escaneo-truncado', message: `Solo se inspecciono el contenido de ${LIMITS.scannedFiles} archivos: ${truncated} quedaron sin escanear para las senales.` })

  const layers = summarizeLayers(collected.files)
  const real = collected.files.filter(file => !file.generated)
  const generated = collected.files.filter(file => file.generated)

  const totals = {
    files: new Set(real.map(file => file.path)).size,
    insertions: real.reduce((sum, file) => sum + file.insertions, 0),
    deletions: real.reduce((sum, file) => sum + file.deletions, 0),
    generatedFiles: generated.length,
    generatedLines: generated.reduce((sum, file) => sum + file.insertions + file.deletions, 0),
    binary: collected.files.filter(file => file.binary).length,
  }

  totals.size = sizeLabel(totals.files, totals.insertions + totals.deletions)

  const signals = [
    ...detectStructuralSignals(collected.files, layers),
    ...detectContentSignals(collected.files, diffLines),
    ...detectDependencySignals(collected.files, diffLines),
  ]

  const commits = scope.from
    ? (git(info.path, ['log', '--no-merges', '--format=%h\t%ad\t%an\t%s', '--date=short', `${scope.from}..${scope.to}`]) || '')
      .split('\n').filter(Boolean)
      .map(line => {
        const [sha, date, author, ...subject] = line.split('\t')

        return { sha, date, author, subject: subject.join('\t') }
      })
    : []

  const tickets = [...new Set([
    ...commits.flatMap(commit => [
      ...(commit.subject.match(/\b\d{4,7}\b/g) || []),
      ...(commit.subject.match(/\b[A-Z]{2,}-\d+\b/g) || []),
    ]),
    ...((scope.currentBranch || '').match(/\b\d{4,7}\b|\b[A-Z]{2,}-\d+\b/g) || []),
  ])]

  const modules = [...new Set(real.map(file => file.module).filter(Boolean))]

  if (totals.files > 120 || modules.length > 8 || scope.commits > 30) {
    warnings.push({
      level: 'warn',
      id: 'rango-grande',
      message: `El rango de ${info.name} es grande (${totals.files} archivos, ${modules.length} modulos, ${scope.commits} commits): puede contener mas de un desarrollo.`,
      hint: 'Considera acotarlo con --base, --range o --commit.',
    })
  }

  return {
    ...info,
    stacks,
    scope,
    warnings,
    files: collected.files,
    layers,
    totals,
    signals,
    commits,
    tickets,
    modules,
    ambiguous: collected.files.filter(file => file.layer === 'ambiguo').map(file => ({ path: file.path, reason: file.reason })),
    uncommitted: {
      staged: collected.files.filter(file => file.origin === 'staged').length,
      worktree: collected.files.filter(file => file.origin === 'sin commitear').length,
      untracked: collected.files.filter(file => file.origin === 'sin seguimiento').length,
    },
  }
}

/**
 * Suma los reportes de todos los repositorios y deduce la topologia.
 *
 * Existe precisamente porque el control de cambios es UNO: quien redacta narra
 * desde aqui y baja al detalle por repo solo cuando hace falta.
 *
 * @param {object[]} reports - Reportes por repositorio.
 * @returns {object} Agregado.
 */
function aggregate(reports) {
  const withChanges = reports.filter(report => report.totals?.files > 0)
  const layers = {}
  const signals = new Map()
  const modules = new Set()

  let insertions = 0
  let deletions = 0
  let files = 0

  for (const report of withChanges) {
    files += report.totals.files
    insertions += report.totals.insertions
    deletions += report.totals.deletions

    for (const [name, stats] of Object.entries(report.layers)) {
      layers[name] ??= { files: 0, insertions: 0, deletions: 0, added: 0, modified: 0, deleted: 0, renamed: 0 }

      for (const key of ['files', 'insertions', 'deletions', 'added', 'modified', 'deleted', 'renamed'])
        layers[name][key] += stats[key]
    }

    for (const signal of report.signals) {
      if (!signals.has(signal.id))
        signals.set(signal.id, { ...signal, repos: [report.name] })
      else {
        const merged = signals.get(signal.id)

        merged.count += signal.count
        merged.repos.push(report.name)
      }
    }

    for (const module of report.modules)
      modules.add(module)
  }

  const hasBoth = report => (report.layers.backend?.files || 0) > 0 && (report.layers.frontend?.files || 0) > 0
  const layerNames = Object.keys(layers).filter(name => !['generado', 'documentacion'].includes(name))

  let topology = 'una sola capa'

  if (withChanges.length > 1)
    topology = `multi-repo (${withChanges.length} repos con cambios)`
  else if (withChanges.some(hasBoth))
    topology = 'monorepo (back y front en el mismo repositorio)'
  else if (layerNames.length > 1)
    topology = 'un repositorio, varias capas'

  return {
    topology,
    files,
    insertions,
    deletions,
    layers,
    signals: [...signals.values()],
    modules: [...modules],
    size: sizeLabel(files, insertions + deletions),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Salida
// ─────────────────────────────────────────────────────────────────────────────

/** Recorta una lista dejando constancia de lo omitido. */
function truncate(items, limit, cli) {
  if (cli.full || items.length <= limit)
    return { items, more: 0 }

  return { items: items.slice(0, limit), more: items.length - limit }
}

/** Orden de presentacion de las capas: de lo que mas pesa en el negocio a lo que menos. */
const LAYER_ORDER = ['backend', 'frontend', 'base de datos', 'pruebas', 'config/infra', 'documentacion', 'ambiguo', 'otros', 'generado']

/**
 * Imprime el reporte de texto.
 *
 * Los avisos van arriba a proposito: si el rango esta mal delimitado, todo lo
 * que sigue describe otro trabajo y quien lee debe saberlo antes de leerlo.
 *
 * @param {object} result - Resultado completo.
 * @param {object} cli - Opciones.
 */
function renderText(result, cli) {
  const out = []
  const { reports, summary } = result

  out.push('CONTROL DE CAMBIOS — evidencia recolectada')
  out.push(`collect-changes · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`)
  out.push('')

  out.push('== ALCANCE ==')
  out.push(`Topologia: ${summary.topology}`)

  reports.forEach((report, index) => {
    out.push(`[${index + 1}] ${report.name}  ${report.path}  (${report.discoveredBy})  [${report.stacks.join(', ') || 'stack no identificado'}]`)

    if (!report.scope) {
      out.push('    Alcance: no se pudo delimitar')

      return
    }

    out.push(`    Rama:  ${report.scope.currentBranch || 'HEAD desprendido'}`)

    if (report.scope.base?.ref)
      out.push(`    Base:  ${report.scope.base.ref} @${(report.scope.from || '').slice(0, 8)}  (${report.scope.source}, confianza ${report.scope.base.confidence})`)
    else if (report.scope.from)
      out.push(`    Base:  ${(report.scope.from || '').slice(0, 8)}  (${report.scope.source})`)
    else
      out.push(`    Base:  sin base (${report.scope.source})`)

    if (report.scope.from) {
      out.push(`    Rango: ${(report.scope.from || '').slice(0, 8)}..${report.scope.to === 'HEAD' ? 'HEAD' : (report.scope.to || '').slice(0, 8)} — ${report.scope.commits} commits`
        + `${report.scope.merges ? ` (${report.scope.merges} merges)` : ''}`
        + `${report.scope.authors.length ? `, ${report.scope.authors.length} autor(es)` : ''}`)
    }

    const pending = report.uncommitted

    out.push(`    Sin commitear: ${pending.staged + pending.worktree + pending.untracked} (${pending.staged} staged, ${pending.worktree} en el arbol, ${pending.untracked} sin seguimiento)`)

    if (!report.totals?.files)
      out.push('    Sin cambios en este alcance')
  })

  out.push('')

  const warnings = reports.flatMap(report => report.warnings.map(warning => ({ ...warning, repo: report.name })))

  if (warnings.length) {
    out.push('== AVISOS ==')

    for (const warning of warnings) {
      out.push(`${warning.level === 'warn' ? '⚠' : 'ℹ'} [${warning.repo}] ${warning.message}${warning.hint ? ` ${warning.hint}` : ''}`)
    }

    out.push('')
  }

  out.push('== VOLUMEN (agregado) ==')
  out.push(`${summary.files} archivos · +${summary.insertions} / -${summary.deletions} lineas · tamano: ${summary.size}`)
  out.push('  (umbrales: pequeno <10 archivos y <300 lineas · medio <40 y <1500 · grande por encima)')

  const generatedFiles = reports.reduce((sum, report) => sum + (report.totals?.generatedFiles || 0), 0)

  if (generatedFiles) {
    const generatedLines = reports.reduce((sum, report) => sum + (report.totals?.generatedLines || 0), 0)

    out.push(`Generados o de terceros, excluidos del volumen: ${generatedFiles} archivos (~${generatedLines} lineas)`)
  }

  const biggest = reports.flatMap(report => report.files.filter(file => !file.generated))
    .sort((a, b) => (b.insertions + b.deletions) - (a.insertions + a.deletions))[0]

  if (biggest)
    out.push(`Mayor cambio: ${biggest.path} (+${biggest.insertions}/-${biggest.deletions})`)

  out.push('')

  out.push('== POR CAPA (agregado) ==')

  for (const name of LAYER_ORDER) {
    const layer = summary.layers[name]

    if (!layer)
      continue

    out.push(`${name.padEnd(16)} ${String(layer.files).padStart(3)} archivos  +${layer.insertions}/-${layer.deletions}  [A${layer.added} M${layer.modified} D${layer.deleted} R${layer.renamed}]`)
  }

  if (!summary.layers.pruebas)
    out.push('pruebas            0 archivos  → sin archivos de prueba en este alcance')

  out.push('')

  out.push(`== ARCHIVOS (max ${cli.full ? 'sin limite' : cli.maxFiles} por capa) ==`)

  for (const name of LAYER_ORDER) {
    const filesInLayer = reports.flatMap(report => report.files
      .filter(file => file.layer === name)
      .map(file => ({ ...file, repo: report.name })))

    if (!filesInLayer.length)
      continue

    if (name === 'generado') {
      out.push(`generado · ${filesInLayer.length} archivos (no se listan)`)

      continue
    }

    const limit = LIMITS.alwaysFullLayers.includes(name) ? LIMITS.alwaysFullCap : cli.maxFiles
    const { items, more } = truncate(filesInLayer, limit, cli)

    out.push(`${name}`)

    for (const file of items) {
      out.push(`  ${file.status} ${reports.length > 1 ? `${file.repo}: ` : ''}${file.path}  +${file.insertions}/-${file.deletions}`
        + `${file.origin !== 'commit' ? `  (${file.origin})` : ''}`
        + `${file.reason ? `\n      ${file.reason}` : ''}`)
    }

    if (more)
      out.push(`  … +${more} mas`)
  }

  out.push('')

  if (summary.modules.length) {
    const { items, more } = truncate(summary.modules, LIMITS.modules, cli)

    out.push(`== MODULOS TOCADOS (${summary.modules.length}) ==`)
    out.push(`${items.join(' · ')}${more ? ` · +${more} mas` : ''}`)
    out.push('')
  }

  out.push('== SENALES ==')

  const order = { alerta: 0, atencion: 1, info: 2 }
  const sorted = [...summary.signals].sort((a, b) => order[a.level] - order[b.level])

  if (!sorted.length)
    out.push('Ninguna senal relevante detectada.')

  for (const signal of sorted) {
    out.push(`${signal.level.padEnd(8)} ${signal.id} (${signal.count})${signal.detail ? ` — ${signal.detail}` : ''}`)
    out.push(`         por que: ${signal.why}`)

    for (const evidence of signal.evidence)
      out.push(`         ${evidence.file}${evidence.line ? `:${evidence.line}` : ''} — ${evidence.snippet}`)
  }

  out.push('')

  const commits = reports.flatMap(report => report.commits.map(commit => ({ ...commit, repo: report.name })))
  const tickets = [...new Set(reports.flatMap(report => report.tickets || []))]

  out.push(`== COMMITS (${commits.length}, sin merges) ==`)

  if (tickets.length)
    out.push(`Posibles tickets detectados: ${tickets.join(', ')}`)

  const shownCommits = truncate(commits, LIMITS.commits, cli)

  for (const commit of shownCommits.items)
    out.push(`${commit.sha} ${commit.date} ${reports.length > 1 ? `[${commit.repo}] ` : ''}${commit.subject}`)

  if (shownCommits.more)
    out.push(`… +${shownCommits.more} mas`)

  out.push('')

  out.push('== LO QUE ESTE REPORTE NO SABE ==')
  out.push('- Por que se hizo: la necesidad funcional o de negocio que lo origino.')
  out.push('- Si el cambio se probo a mano o en un entorno real, y con que resultado.')
  out.push('- A que usuarios, clientes o areas afecta.')
  out.push(`- Si quedo algun repositorio fuera del analisis (analizados: ${reports.length}).`)

  if (reports.some(report => report.ambiguous.length))
    out.push('- Que son los archivos marcados como ambiguos.')

  out.push('Confirma esto con el usuario ANTES de clasificar riesgo e impacto.')

  console.log(out.join('\n'))
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsea los argumentos de linea de comandos.
 *
 * Las opciones de alcance son listas porque aceptan la forma `<repo>=<valor>`:
 * en un trabajo de dos repositorios cada uno puede tener su propia base.
 *
 * @param {string[]} argv - `process.argv.slice(2)`.
 * @returns {object} Opciones normalizadas.
 */
function parseArgs(argv) {
  const cli = {
    repos: [], bases: [], ranges: [], commits: [], sinces: [],
    noUncommitted: false, maxFiles: LIMITS.filesPerLayer, full: false, json: false, help: false,
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = () => argv[++index]

    switch (arg) {
      case '--repo': cli.repos.push(next()); break
      case '--base': cli.bases.push(next()); break
      case '--range': cli.ranges.push(next()); break
      case '--commit': cli.commits.push(next()); break
      case '--since': cli.sinces.push(next()); break
      case '--no-uncommitted': cli.noUncommitted = true; break
      case '--max-files': cli.maxFiles = Number(next()) || LIMITS.filesPerLayer; break
      case '--full': cli.full = true; break
      case '--json': cli.json = true; break
      case '--help': case '-h': cli.help = true; break
      default: break
    }
  }

  return cli
}

/** Texto de ayuda. */
function printHelp() {
  console.log(`Recolecta la evidencia de un desarrollo desde git, para redactar un control de cambios.

Uso: node collect-changes.mjs [opciones]

  --repo <ruta>        Repositorio a analizar. Repetible. Desactiva el descubrimiento automatico
  --base <ref>         Rama base. Acepta <repo>=<ref> para dar una base distinta por repositorio
  --range <a>..<b>     Rango explicito de commits. Gana sobre --base
  --commit <sha>       Un solo commit. Gana sobre --range
  --since <fecha>      Trabajo desde una fecha ("3 days ago", "2026-08-01")
  --no-uncommitted     Excluir el trabajo sin commitear
  --max-files <n>      Archivos listados por capa (por defecto ${LIMITS.filesPerLayer})
  --full               Sin recortes en los listados
  --json               Salida procesable
  --help               Esta ayuda

Variables de entorno: CHANGES_REPOS (rutas separadas por '${delimiter}'), CHANGES_BASE_REF.`)
}

/**
 * Punto de entrada.
 *
 * @returns {number} 0 si produjo un reporte, aunque traiga avisos o senales de
 *   alerta; 1 solo si no hay nada que reportar. Nunca 1 por "encontre algo
 *   riesgoso": esa decision es del humano que redacta.
 */
function main() {
  const cli = parseArgs(process.argv.slice(2))

  if (cli.help) {
    printHelp()

    return 0
  }

  const { repos } = discoverRepos(cli)

  if (!repos.length) {
    console.error('✗ No se encontro ningun repositorio git.')
    console.error('  Ejecuta el comando dentro de un repositorio, o pasa --repo <ruta>.')

    return 1
  }

  const reports = repos.map(info => analyzeRepo(info, cli))
  const summary = aggregate(reports)
  const result = { version: 1, generatedAt: new Date().toISOString(), reports, summary }

  const hasContent = reports.some(report => report.totals?.files > 0 || report.commits.length > 0)

  if (!hasContent) {
    console.error('✗ No hay cambios que reportar en el alcance resuelto.')

    for (const report of reports) {
      for (const warning of report.warnings)
        console.error(`  ⚠ [${report.name}] ${warning.message}${warning.hint ? ` ${warning.hint}` : ''}`)
    }

    console.error('  Acota el alcance con --base <ref>, --range <a>..<b>, --commit <sha> o --since <fecha>.')

    return 1
  }

  if (cli.json) {
    console.log(JSON.stringify({
      ...result,
      reports: reports.map(report => ({
        name: report.name,
        path: report.path,
        discoveredBy: report.discoveredBy,
        stacks: report.stacks,
        branch: report.scope?.currentBranch || null,
        base: report.scope?.base
          ? { ref: report.scope.base.ref, sha: report.scope.from, source: report.scope.source, confidence: report.scope.base.confidence, candidates: report.scope.base.candidates }
          : null,
        range: report.scope?.from ? { from: report.scope.from, to: report.scope.to, commits: report.scope.commits, merges: report.scope.merges, authors: report.scope.authors } : null,
        uncommitted: report.uncommitted,
        totals: report.totals,
        layers: Object.fromEntries(Object.entries(report.layers).map(([name, stats]) => [
          name,
          { ...stats, samples: stats.samples.slice(0, cli.full ? stats.samples.length : cli.maxFiles).map(file => file.path) },
        ])),
        ambiguous: report.ambiguous,
        modules: report.modules,
        signals: report.signals,
        commits: report.commits,
        tickets: report.tickets,
        warnings: report.warnings,
      })),
      unknowns: ['motivo de negocio', 'pruebas manuales y su resultado', 'usuarios afectados', 'repositorios no incluidos'],
    }, null, 2))

    return 0
  }

  renderText(result, cli)

  return 0
}

process.exit(main())
