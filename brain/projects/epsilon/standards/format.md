# Epsilon — formato y lint

Qué herramientas de formato tienen `epsilon` y `epsilon-backend`, y cómo verificar un desarrollo.
Se lee al cerrar un desarrollo (`finish-development`). Relevado el 2026-11-19 sobre `desa`.

## No se corre

- `npm run lint` en `epsilon`: es `vue-cli-service lint`, que **corrige por defecto** (aplica `--fix`).

## Herramientas

| Repo | Herramienta | Versión | Configuración |
|---|---|---|---|
| epsilon (Vue 3 con vue-cli 4) | ESLint | 6.8.0 | `.eslintrc.js`: `plugin:vue/vue3-essential` (eslint-plugin-vue 7.20.0) y `eslint:recommended`, parser `babel-eslint` |
| epsilon | Prettier, `.editorconfig`, `.eslintignore`, `.vscode/` | — | No existen |
| epsilon-backend (Node/Express, no PHP) | — | — | **Ninguna**: sin ESLint, Prettier ni `.editorconfig` |

En `epsilon/.git/hooks` hay hooks de yorkie que vue-cli instaló, pero `package.json` no declara
`gitHooks`: no hacen nada.

## Estilo: no lo impone nada

El `.eslintrc.js` solo trae reglas de calidad (`no-unused-vars`, `no-undef`); ninguna de formato. El
código es mixto en los dos repos: sangría con tabs, con 2 y con 4 espacios; comillas simples y
dobles; punto y coma mitad y mitad. **Se imita el archivo que se toca**, sin reformatearlo.

## Verificar solo lo de la rama

Front. El `grep` de extensiones hace falta: ESLint 6 se queja si recibe otro tipo de archivo.

```bash
git diff --name-only --diff-filter=ACMR origin/desa...HEAD | grep -E '\.(js|vue)$' \
  | xargs -r npx eslint --no-fix --max-warnings 0
```

Backend: no hay herramienta. Como mínimo, la sintaxis:
`git diff --name-only --diff-filter=ACMR origin/desa...HEAD -- '*.js' | xargs -r -n1 node --check`
(sin probar).

## Cómo se hace cumplir

No se hace cumplir: los `.gitlab-ci.yml` solo despliegan y corren SonarQube.

## Línea base

`npx eslint --no-fix --ext .js,.vue src` en `epsilon`, el 2026-11-19: 223 archivos, **0 errores y 0
avisos**. Cualquier falla en la rama es propia.
