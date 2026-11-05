# AMI — perfil del manual

Lo específico de la app móvil para la skill `update-manual`. El procedimiento general está en
`~/.claude/skills/update-manual/SKILL.md`. Cada punto costó al menos una corrida fallida.

## Lo que hay que saber de la app para automatizarla

- **El servidor al que habla el AMI no sale solo del `.env`.** En el login, el campo «Código
  Identificación Empresa» busca una fila de `company_endpoints` y guarda su `api` en
  `CapacitorStorage.API_URL`. Ese código **no es el NIT**: en local, `123456789-2` apunta a
  `localhost:8085`. Si un navegador ya tenía guardado el de desa o QA, importa de allá y la lista sale
  vacía sin ningún error.
- **El conductor de las programaciones de prueba es el usuario de pruebas del AIO**, no el del AMI:
  los flujos de Green toman `credentialsFor("aio")`.
- **En un perfil de navegador nuevo, el login puede dejar al usuario sin menús**
  (`authUserMenus` vacío) y la importación de Green no muestra «Prestación de Servicio» ni
  «Inspecciones», aunque `menus/v0/mobile/{user}/{company}` sí devuelve los menús. Cambiar de empresa
  desde la barra superior tampoco lo arregló. El flujo `respel/service-provision/capture-sequence.mjs`
  acepta `--puerto` para conectarse a un navegador con una sesión que ya funcione. Pasó el
  2026-11-05; la causa no se encontró.
- **La importación tiene copias ocultas de la pantalla** (las páginas anteriores de Ionic siguen en el
  DOM). Un `element.click()` sobre el primer «Prestación de Servicio» que aparece cae en una copia
  invisible y no importa nada: hay que hacer clic de ratón real sobre el elemento visible.
- **El AMI solo descarga las programaciones aprobadas de hoy** (en la hora de la empresa), con su
  inspección aprobada. Datos de prueba de otro día no aparecen.
