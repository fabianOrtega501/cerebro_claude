# SIPA — formato y lint

Qué herramientas de formato tiene `sipa`, qué estilo imponen y cómo verificar un desarrollo. Se lee
al cerrar un desarrollo (`finish-development`). Relevado el 2026-11-19 sobre `desa`.

## No se corre

- `npm run lint`: es `vue-cli-service lint`, que **corrige por defecto**. Con más de 18 000 problemas
  corregibles, reescribiría medio repo.

## El lint está roto

`.eslintrc.js` extiende `"prettier"` (eslint-config-prettier), que no está declarado ni instalado.
Todo `eslint` del repo falla con *ESLint couldn't find the config "prettier" to extend from*. **No se
instala en un ticket**; para verificar se usa una copia de la configuración sin esa línea, fuera del
repo (abajo).

## Herramientas

| Herramienta | Versión | Configuración |
|---|---|---|
| ESLint | 6.8.0 | `.eslintrc.js`: `plugin:vue/recommended` (eslint-plugin-vue 6.2.2), `@vue/airbnb` (airbnb-base 14.2.1) y `"prettier"`; parser `babel-eslint` |
| Prettier | — | Solo `.prettierignore`; ni configuración ni dependencia declarada. Nada lo invoca |
| `.editorconfig`, `.eslintignore`, `.vscode/`, `CLAUDE.md` | — | No existen |

`node_modules` está instalado con pnpm, aunque el lockfile es `package-lock.json`. Los hooks de yorkie
de `.git/hooks` no hacen nada: `package.json` no declara `gitHooks`.

## Estilo

Medido con la configuración sin `"prettier"`, así que es airbnb más las reglas propias:

| Aspecto | Regla |
|---|---|
| Comillas | Simples |
| Punto y coma | Nunca |
| Sangría | 2 espacios, sin tabs (`no-tabs`) |
| Ancho de línea | Sin límite (`max-len: off`) |
| Comas finales | `always-multiline` |
| Llaves | `1tbs` (`else` en la misma línea de la `}`), `curly: multi-line` |
| Imports | `import/first`, `import/order` de airbnb, sin extensión `.js` |
| Espacios | `{ a: 1 }`, `x => x` |

El código existente no lo cumple: está lleno de tabs y estilo mezclado. En los archivos que se
modifican se respeta lo que ya traen; el código nuevo sigue la tabla.

## Verificar solo lo de la rama

Con una copia de `.eslintrc.js` sin `"prettier"` en el `extends`, guardada fuera del repo
(por ejemplo en el scratchpad de la sesión):

```bash
git diff --name-only --diff-filter=ACMR origin/desa...HEAD -- '*.js' '*.vue' \
  | xargs -r npx eslint --no-fix --no-eslintrc -c <copia>.js --resolve-plugins-relative-to .
```

## Cómo se hace cumplir

No se hace cumplir: el `.gitlab-ci.yml` no corre lint y no hay hooks activos.

## Línea base

Con esa copia, sobre `src` (`.js` y `.vue`), el 2026-11-19: 243 archivos, 131 con problemas, **21 698
errores y 5089 avisos**: `no-tabs` 6468, `indent` 6254, `semi` 4002, `quotes` 2506,
`vue/html-indent` 2498. Un fallo no significa que la rama lo trajo.
