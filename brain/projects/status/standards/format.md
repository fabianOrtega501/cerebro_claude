# Status — formato y lint

Qué herramientas de formato tienen `status`, `status-api` y `status-frontend`, y cómo verificar un
desarrollo sin reformatear lo ajeno. Se lee al cerrar un desarrollo (`finish-development`). Relevado
el 2026-11-19.

## No se corre

- `npm run lint` en `status-frontend`: es `vue-cli-service lint`, que **corrige por defecto**.
- `pint` sin `--test` en `status-api`, o sobre una carpeta.
- No se instala nada para arreglar el lint en un ticket.

## Herramientas

| Repo | Herramienta | Versión | Configuración |
|---|---|---|---|
| status (monolito, JS en `resources/js/src`) | ESLint, **roto** | 4.19.1, transitivo | `.eslintrc.js`: `plugin:vue/essential`, `eslint:recommended` y `prettier`, pero `eslint-config-prettier` no está instalado: falla al arrancar. Sin script de lint |
| status | PHPStan | declarado `^1.10`, `vendor/` vacío | Sin `phpstan.neon` |
| status-api | Pint | 1.32.1 | Sin `pint.json`: preset `laravel` |
| status-frontend | ESLint | 4.19.1 | `.eslintrc.js`: igual al del monolito sin `prettier`; `vue.config.js` con `lintOnSave: false` |
| los tres | `.editorconfig` | — | status y status-api: 4 espacios. status-frontend: 2 |

Prettier 2.8.8 está en `node_modules` del monolito y del front, pero nada lo configura ni lo llama.

## Estilo (ESLint de los fronts)

| Aspecto | status (monolito) | status-frontend |
|---|---|---|
| Comillas | Simples | Simples |
| Punto y coma | Nunca | Siempre (solo aviso) |
| Sangría | 2 espacios. **Choca** con el `.editorconfig`, que dice 4 | 2 espacios |
| Ancho de línea | Sin límite | Sin límite |
| Comas finales | Nunca | Nunca |
| Llaves | `1tbs` (`else` en la misma línea de la `}`) | `1tbs` |
| Imports | Sin orden | Sin orden |
| Otros | `function ()` con espacio, `eqeqeq`, `prefer-template`, `vue/html-quotes: double` | Igual |

El código existente no lo cumple (88 % de los archivos del monolito y 94 % del front tienen
problemas): en los archivos modificados se respeta lo que ya traen. PHP en `status-api`: 4 espacios,
preset `laravel` de pint.

## Verificar solo lo de la rama

status-frontend:

```bash
git diff --name-only --diff-filter=ACMR origin/desa...HEAD | grep -E '\.(js|vue)$' \
  | xargs -r node_modules/.bin/eslint
```

status (monolito): con una copia de `.eslintrc.js` sin `prettier` en el `extends`, guardada fuera del
repo:

```bash
git diff --name-only --diff-filter=ACMR origin/desa...HEAD | grep -E '\.(js|vue)$' \
  | xargs -r node_modules/.bin/eslint --no-eslintrc -c <copia>.js
```

status-api: el `php` del host no tiene la extensión `xml` y pint no arranca. Va por Sail (sin
probar):

```bash
git diff --name-only --diff-filter=ACMR origin/desa...HEAD -- '*.php' \
  | xargs -r ./vendor/bin/sail bin pint --test
```

ESLint 4 con `babel-eslint` se cae con `Error: unreachable` en 9 archivos del monolito y 8 del front:
si la rama toca uno, ese archivo queda sin lint.

## Cómo se hace cumplir

No se hace cumplir: ningún `.gitlab-ci.yml` corre lint ni pint, y los hooks de yorkie de
`status-frontend` no hacen nada (`package.json` no declara `gitHooks`). El monolito pasa por
SonarQube con quality gate.

## Línea base

El 2026-11-19, archivo por archivo, sin corregir: monolito (con la copia sin `prettier`) 347
archivos, **69 150 errores**; status-frontend 463 archivos, **49 782 errores y 827 avisos**. Las que
más fallan en los dos: `indent`, `semi` o `quotes`, `space-before-function-paren` y `comma-dangle`.
Pint de `status-api` no se midió.
