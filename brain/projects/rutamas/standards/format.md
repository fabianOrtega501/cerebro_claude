# Ruta+ — formato y lint

Qué herramientas de formato tiene `rutamas-movil`, qué estilo imponen y cómo verificar un desarrollo.
Se lee al cerrar un desarrollo (`finish-development`). Relevado el 2026-11-19 sobre `qa`.

## El lint está roto; Prettier sí funciona

`.eslintrc.cjs` extiende `plugin:prettier/recommended`, pero `eslint-plugin-prettier` y
`eslint-config-prettier` no están declarados ni instalados: `npm run lint` (`eslint .`, sin `--fix`)
falla antes de analizar un archivo. **No se instalan en un ticket.** Lo que sí verifica el estilo es
`prettier --check`, con el `.prettierrc` del repo.

## Herramientas

| Herramienta | Versión | Configuración |
|---|---|---|
| ESLint (eslintrc) | 8.57.1 | `.eslintrc.cjs`: `eslint:recommended`, `plugin:vue/vue3-recommended`, `plugin:@typescript-eslint/recommended` (6.21.0, transitivo), `plugin:prettier/recommended` |
| Prettier | 2.8.8, **transitivo** de `@capacitor/assets` | `.prettierrc`, `.prettierignore` |
| TypeScript / vue-tsc | 5.9.3 / 2.2.12 | `tsconfig.json` estricto; el chequeo de tipos va dentro de `npm run build` |
| `.editorconfig`, `.vscode/settings.json` | — | No existen |

Gestor: **npm**. Prettier y `@typescript-eslint` llegan como dependencias transitivas: un `npm ci` en
otra máquina puede cambiarlos o quitarlos.

## Estilo (`.prettierrc`)

| Aspecto | Valor |
|---|---|
| Comillas | Simples |
| Punto y coma | Nunca |
| Sangría | 2 espacios |
| Ancho de línea | 120, y Prettier lo corrige al formatear |
| Comas finales | Ninguna (`trailingComma: none`) |
| Llaves y espacios | Los de Prettier: llave en la misma línea, `{ a: 1 }` |
| Arrow functions | `x => x` (`arrowParens: avoid`) |
| Imports | Sin orden impuesto |
| Fin de línea | LF |

## Verificar solo lo de la rama

No hay `desa`: la base es `origin/prod`.

```bash
git diff --name-only --diff-filter=ACMR origin/prod...HEAD | grep -E '\.(ts|vue)$' \
  | xargs -r npx --no-install prettier --check
```

## Cómo se hace cumplir

No se hace cumplir: no hay hooks, ni formato al guardar, y el `.gitlab-ci.yml` solo corre
SonarQube en `qa` con `allow_failure`.

## Línea base

`npx --no-install prettier --check "src/**/*.{ts,vue}"`, el 2026-11-19: 19 de 102 archivos no
cumplen. ESLint no se pudo medir.
