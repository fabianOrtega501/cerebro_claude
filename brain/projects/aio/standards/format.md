# AIO — formato y lint

Qué herramientas de formato tiene cada repo, qué estilo imponen y **cómo verificar un desarrollo sin
reformatear lo ajeno**. Se lee al cerrar un desarrollo (`finish-development`) y antes de correr
cualquier formateador. Rutas relativas a cada repo. Relevado el 2026-11-19 sobre `desa`.

Memorias del equipo que esto complementa, sin repetirlas: `aio-app/.claude/memory/lint-del-aio-reformatea-todo.md`
y `aio-backend/.claude/memory/pint-solo-archivos-del-ticket.md`.

## No se corre

- `pnpm lint` en aio-app: es `eslint . --fix`; reformatea todo el repo (401 archivos).
- `pint` sin `--test`, o sobre una carpeta: reformatea archivos que nadie tocó.
- `pnpm typecheck` como criterio: falla de base. Lo que demuestra que compila es `pnpm build`.

## Verificar solo lo de la rama

Front (`aio-app`). `--rulesdir` es obligatorio: sin él, las dos reglas internas fallan con
*Definition for rule not found*.

```bash
git diff --name-only --diff-filter=ACMR origin/desa...HEAD -- '*.ts' '*.js' '*.vue' \
  | grep -v '\.d\.ts$' | xargs -r pnpm exec eslint --no-fix --rulesdir eslint-internal-rules/
```

Back (`aio-backend`). En esta máquina el `php` del host no tiene la extensión `xml` y pint no
arranca: va por Sail, con el contenedor arriba.

```bash
git diff --name-only --diff-filter=ACMR origin/desa...HEAD -- '*.php' \
  | xargs -r ./vendor/bin/sail php vendor/bin/pint --test
```

En los dos repos el código existente **no cumple** su propio estilo: un fallo no significa que la
rama lo trajo. Se compara contra la versión de la base del mismo archivo
(`git show origin/desa:<archivo>`). Pint solo se aplica (sin `--test`) a los archivos **nuevos**; en
los modificados se respeta el formato que ya tenían.

## Herramientas

| Repo | Herramienta | Versión | Configuración |
|---|---|---|---|
| aio-app | ESLint (formato eslintrc, no flat) | 8.53.0 | `.eslintrc.cjs` sobre `@antfu/eslint-config-vue` 0.43.1, más `plugin:vue/vue3-recommended`, `import`, `promise`, `sonarjs`, `@typescript-eslint/recommended` 6.10.0 y `case-police`; reglas propias en `eslint-internal-rules/` |
| aio-app | TypeScript / vue-tsc | 5.2.2 / 1.8.22 | Sin reglas con tipos: no hay `parserOptions.project` |
| aio-app | Stylelint (SCSS y `<style>` de Vue) | 15.11.0 | `.stylelintrc.json`: `standard-scss`, `idiomatic-order`, propiedades lógicas, 120 columnas |
| aio-app | Prettier, Biome, dprint | — | No existen. El formato lo pone ESLint |
| aio-backend | Pint | 1.29.1 | Sin `pint.json`: preset `laravel` por defecto |
| aio-backend | PHPStan | 1.12.33 | Sin `phpstan.neon`: `phpstan analyse app` con el nivel por defecto |
| los dos | `.editorconfig` | — | aio-app: 2 espacios en `ts`, `vue` y `scss`. aio-backend: 4 espacios, `yml` a 2 |

## Estilo (aio-app, TS y Vue)

| Aspecto | Regla |
|---|---|
| Comillas | Simples. Claves de objeto: `consistent-as-needed` |
| Punto y coma | Nunca, ni en interfaces ni en tipos |
| Sangría | 2 espacios, `case` a 1 nivel |
| Ancho de línea | Sin límite (`max-len: off`). Solo Stylelint avisa a 120 en estilos |
| Comas finales | `always-multiline` |
| Llaves | `stroustrup` (`else` en la línea siguiente a la `}`). `curly: multi-or-nest, consistent`: sin llaves para una línea simple, y el cuerpo va en la línea siguiente al `if` |
| Imports | `import/order` por defecto, `import type` obligatorio para tipos, línea en blanco tras el último import, sin extensión `.ts` |
| Espacios | `{ a: 1 }`, `[1, 2]`, `${x}`, `x => x` (paréntesis solo si hacen falta) |
| Líneas en blanco | Antes de `return`, antes de cada comentario, alrededor de un `const` de varias líneas; máximo una seguida |
| Vue | Componentes en PascalCase, eventos en camelCase, `html-indent` y `max-attributes-per-line` solo avisan |

Casi todas las reglas de estilo están **duplicadas**: la base (`semi`, `indent`) que pone `.eslintrc.cjs`
y la de `@typescript-eslint` o `@stylistic/ts` que trae `@antfu`. Cada falla sale dos veces en el
conteo.

## Cómo se hace cumplir

Solo el editor: `.vscode/settings.json` formatea al guardar con ESLint (`source.fixAll.eslint`,
`source.fixAll.stylelint`, `source.organizeImports`). No hay hooks de git ni lint-staged, y ningún
`.gitlab-ci.yml` corre lint, pint ni phpstan; el back solo corre las pruebas y SonarQube, que no
bloquea.

## Línea base

`pnpm exec eslint --no-fix --rulesdir eslint-internal-rules/ --ext .ts,.js,.cjs,.vue,.tsx,.jsx src --format json`,
el 2026-11-19: 1777 archivos, 401 con problemas, **4193 errores y 933 avisos** (unos 3400 corregibles).
Las que más fallan: `semi` y `@typescript-eslint/semi` (694 cada una), `no-trailing-spaces` (339),
`vue/html-indent` (228), `vue/max-attributes-per-line` (224), `indent` (207) e `import/order` (183).
Pint y PHPStan no se midieron sobre el repo entero.
