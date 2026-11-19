# AMI — formato y lint

Qué herramientas de formato tiene `app-movil`, qué estilo imponen y cómo verificar un desarrollo.
Se lee al cerrar un desarrollo (`finish-development`). Relevado el 2026-11-19 sobre `desa`. El
backend es `aio-backend`: su formato está en `projects/aio/standards/format.md`.

## Herramientas

| Herramienta | Versión | Configuración |
|---|---|---|
| ESLint (eslintrc) | 8.57.1 | `.eslintrc.cjs`: `plugin:vue/vue3-essential`, `eslint:recommended`, `@vue/typescript/recommended` (`@typescript-eslint` 6.21.0); `.eslintignore` |
| TypeScript / vue-tsc | 5.9.3 / 2.2.12 | `tsconfig.json` estricto; el chequeo de tipos va dentro de `npm run build` |
| Prettier, `.editorconfig`, Stylelint | — | No existen |

Gestor: **npm** (`package-lock.json`). El script `lint` es `eslint .`, **sin `--fix`**: verifica, no corrige.

## Estilo: no lo impone nada

Las reglas activas son de calidad, no de formato: no hay `quotes`, `semi`, `indent`, `max-len`,
`comma-dangle`, `brace-style` ni orden de imports. Solo rigen `no-extra-semi` y
`no-mixed-spaces-and-tabs`. **Se imita el archivo que se toca.** No hay `.vscode/settings.json`, así
que el editor tampoco formatea al guardar.

## Verificar solo lo de la rama

```bash
git diff --name-only --diff-filter=ACMR origin/desa...HEAD -- '*.ts' '*.vue' \
  | xargs -r npx --no-install eslint --no-fix
```

## Cómo se hace cumplir

No se hace cumplir: no hay hooks de git y el `.gitlab-ci.yml` no corre lint.

## Línea base

`npx --no-install eslint .` el 2026-11-19: 916 archivos, 7 con problemas, **10 errores y 0 avisos**
(`@typescript-eslint/no-unused-vars` 3, `no-mixed-spaces-and-tabs` 3, `prefer-const` 2, y un archivo
que no se pudo parsear). Un error nuevo en la rama casi seguro es propio.
