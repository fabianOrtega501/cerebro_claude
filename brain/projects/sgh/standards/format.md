# SGH — formato y lint

Qué herramientas de formato tiene el repo y qué estilo seguir. Se lee al cerrar un desarrollo
(`finish-development`). Relevado el 2026-11-19 sobre `desa`.

## No hay formateador ni linter

Ni `.editorconfig`, ESLint, Prettier, Pint, php-cs-fixer, phpcs ni PHPStan, en `composer.json`,
`package.json` (solo gulp y elixir) ni `vendor/bin`. No hay hooks de git, y el `.gitlab-ci.yml` solo
despliega y corre SonarQube en `desa` con `allow_failure`. **No se instala ninguno en un ticket.**

## Estilo: el del archivo que se toca

Observado, no impuesto: el repo no es uniforme, así que se respeta lo que ya trae el archivo.

| Zona | Sangría | Otros |
|---|---|---|
| PHP del estándar nuevo (contrato, servicio, `QueryBuilder`) | 4 espacios | Comillas simples, llaves de clase y método en línea propia (PSR-2) |
| PHP legado | Mezcla: 252 archivos de `app/` con tabs y 161 con espacios | Comillas simples; llave de `if` y `foreach` en la misma línea |
| Blade y JS de `public/assets/scripts` | Tab | Comillas simples |

Archivos en UTF-8 (las vistas llevan tildes) y fin de línea LF.

## Verificar solo lo de la rama

Lo único disponible es la sintaxis:

```bash
git diff --name-only --diff-filter=AM origin/desa...HEAD -- '*.php' | xargs -r -n1 php -l
```

El `php` del host es 8.x y el proyecto es **PHP 7.1**: `php -l` no detecta `fn`, `match`, `??=`,
`?->`, enums ni propiedades tipadas. Eso se revisa a mano en el diff.
