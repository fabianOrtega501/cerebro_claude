---
name: peer-review
description: >-
  Revisión de pares con las reglas del equipo, en dos modos. Manual: el usuario da el número de un
  ticket de Mantis o el código de un caso de GLPI ("revisa el 11256", "revisión de pares del GLPI
  56226", "revisa la rama de Neiron") y se hace todo el proceso: HU, ramas del ticket en todos los
  repos, merge request, revisión sin tocar el código e informe claro para el compañero. Propio:
  `finish-development` la corre SIEMPRE antes del commit de cierre, sobre la rama actual con lo que
  está sin commit, y entrega los hallazgos antes de proponer el commit. Niveles: Impide aprobar,
  Debe corregirse, Mejora sugerida, Pregunta. En GitLab solo lee. Absorbida de `development:peer-review`
  de main-brain y adaptada al cerebro.
---

# Revisión de pares

El objetivo es que el merge request quede acorde al estándar del proyecto y que quien lo escribió
entienda **por qué** se pide cada cambio. Es una revisión, no una reescritura.

Viene de `development:peer-review` (main-brain). Se adaptó así: token en `secrets.env`, HU con
`ticket-context`, repos y contrato desde `brain/projects.json` y `stack.json`, lint contra la base sin
copiar archivos al repo, informes fuera de git, y el modo propio para el cierre. **Las reglas del
equipo (`references/team-rules.md`) se copian tal cual**, para compararlas cuando main-brain las cambie.

| Modo | Cuándo | Sobre qué | Contra qué | Entrega |
|---|---|---|---|---|
| **Manual** | El usuario la pide con un número de ticket | Las ramas del ticket, en la rama del compañero | El repo y las reglas del equipo | Informe para el compañero y resumen en el chat |
| **Propio** | `finish-development`, antes del commit de cierre | La rama actual **con lo que está sin commit** | Además, las reglas del usuario | Hallazgos en el chat, antes de proponer el commit |

**Si las ramas que aparecen en el modo manual son del usuario**, se pasa al modo propio: no tiene
sentido revisarse como a un compañero.

## Configuración

| Dato | Dónde | Sin él |
|---|---|---|
| `GITLAB_TOKEN` | `~/.claude/secrets.env`, token personal de GitLab con scope **`read_api`** y nada más. **Nunca en `settings.json`**: ese archivo se versiona y viaja a GitHub. El usuario lo escribe en el archivo, nunca en el chat | La revisión sigue con el diff local y lo dice al final |
| `GITLAB_URL` | `secrets.env`, solo si la API no está en el host del remoto | Se deduce del remoto `origin` |

GitLab (`192.168.100.34`) solo responde por `http`: el script prueba `https` y cae a `http`, así que el
token viaja sin cifrar dentro de la red corporativa o la VPN. Si da timeout fuera de la red, se pregunta
por la VPN.

**Informes**: `~/.claude/brain/peer-reviews/<repo>/<rama con / cambiada por ->.md`. Están **fuera de
git**: son sobre el código de otros y no viajan al respaldo de GitHub.

## Modo manual: con el número del ticket

### M1. La HU

Con `ticket-context`: el subagente `ticket-reader` con `fetch <mantis>` o `fetch --glpi <código>`. Con
un código de GLPI, si el caso trae número de Mantis, se usan los dos para buscar ramas. La HU define si
el cambio está **completo**; sin ella solo se revisa la forma, y se dice en el informe.

### M2. Las ramas del ticket

```bash
node ~/.claude/skills/peer-review/lib/find-branches.mjs <mantis> [<glpi>]
```

Hace `fetch --prune` en todos los repos de `projects.json` (salvo main-brain) y devuelve, por repo:

- `branches`: ramas del remoto con el número. **Lo normal: aquí está lo que se revisa.**
- `localOnly`: ramas que solo están en este clon (el remoto ya las borró, o nunca se subieron).
- `merges`: merges del remoto que mencionan el ticket. Si no hay rama pero sí merge, **ya entró a una
  base**: los comentarios pasan a ser ajustes para un cambio siguiente, y el diff de cada merge
  (`git diff <merge>^1 <merge>`) es lo que se revisa.
- `current`: la rama en que está el clon. Si el usuario está en medio de su propio ticket, se le dice.
- `fetchFailed`: repos que no bajaron (sin red o sin VPN): se avisa y se sigue con lo que hay.

Se le muestra al usuario qué ramas aparecieron, de quién y de cuándo, y **se confirma cuáles se
revisan** antes de seguir. Si las ramas son suyas, modo propio.

### M3. El merge request

Por cada rama:

```bash
node ~/.claude/skills/peer-review/lib/gitlab-mr.mjs <rama> --repo <ruta>
```

Devuelve número, título, estado, autor, **rama destino** y la lista **completa** de archivos. Sale con
`3` si no hay `GITLAB_TOKEN`: se dice y se sigue sin el MR.

- **La lista del MR manda**: es lo que se va a mezclar. Si difiere del diff local, se revisa la del MR
  y se dice en el informe.
- Si ya está `merged`, se dice al principio del resumen y del informe.
- Si `truncatedByGitlab` sale en `true`, se completa con el diff local.
- La URL del MR es interna: va en el resumen del chat, no en el informe.

### M4. Traer la rama, con permiso

**Antes de cambiar de rama se pide el sí**, diciendo en qué rama está cada repo: el cambio deja el repo
del usuario en la rama del compañero.

```bash
node ~/.claude/skills/peer-review/lib/prepare.mjs <rama> --base <rama destino> --repo <ruta>
```

- La base es la **rama destino del MR**; sin MR, la del `CLAUDE.md` del repo o la que diga el `stack.json`
  del proyecto, y si no, se pregunta.
- **Si el repo tiene cambios sin commit, el script no cambia de rama.** Se le dice al usuario y se espera.
  Nunca `stash`, `commit` ni `checkout --` por cuenta propia.
- Si falla por un archivo con `skip-worktree` (en aio-backend, `.env.testing`), se detiene y se cuenta:
  la memoria del repo dice cómo manejarlo, y lo decide el usuario.
- Devuelve `originalBranch`, autores, commits propios y archivos con líneas, marcando los generados. Si
  hay **varios autores**, se pregunta a cuál se le hace la revisión.

Al terminar, **siempre**: `node ~/.claude/skills/peer-review/lib/prepare.mjs --return <originalBranch> --repo <ruta>`.

Después: **revisar** (sección común) y **entregar** (M5).

### M5. Entregar

**En el chat, para el usuario:** la rama, el autor, el requerimiento y el MR con su URL; cuántos
comentarios hay por nivel, primero los que impiden aprobar; dónde quedó el informe; y lo que solo él
puede decidir (una regla sin respaldo escrito, el orden de despliegue, algo visto en el otro repo). Si
con sus reglas propias (`~/.claude/CLAUDE.md`, memorias como `revision-de-pares-propia`) se vería algo
más, se le menciona aquí **como opcional**: al compañero no se le exigen.

**El informe, para el compañero**, en `brain/peer-reviews/…`. Si ya existe de una revisión anterior de
la misma rama, se agrega una sección nueva con la fecha. Se escribe en español de Colombia, pretérito
simple, con respeto, directo y sin jerga innecesaria; cada comentario se entiende solo:

- Empieza por **lo que pasa o lo que se ve**, en palabras simples, y después el detalle técnico.
- Sin jerga de framework cuando no aporta; si un término hace falta, se explica en una línea.
- Nada de hashes, números de línea de diagnósticos ni códigos de reglas en el texto. El archivo basta
  como ubicación; la línea, solo si el archivo es largo.
- Ejemplos de código solo cuando el cambio no se entiende sin verlos, cortos y sin comentarios dentro.
- **Sin datos privados**: IPs, hosts y URLs internas, tokens, contraseñas, contenido de `.env`, nombres
  de contenedores o bases, ni datos personales.

~~~markdown
# Revisión de la rama <rama> (<repo>)

- **Requerimiento:** <número> — <título>
- **Autor:** <nombre>
- **Fecha de la revisión:** <fecha>
- **Resumen:** <2–3 líneas en lenguaje simple: qué hace el cambio, la impresión general y si se puede aprobar>

| Impide aprobar | Debe corregirse | Mejora sugerida | Pregunta |
|---|---|---|---|
| n | n | n | n |

## Impide aprobar

### 1. <título corto en lenguaje claro>
**Dónde:** `ruta/archivo.ext` (y otras ubicaciones si se repite)
**Qué noté:** <el problema y el efecto concreto, en palabras simples>
**Por qué hay que corregirlo:** <la regla y de dónde sale>
**Cómo podría quedar:**
```<lenguaje>
<antes y después, corto>
```

## Debe corregirse
...

## Mejoras sugeridas
...

## Preguntas
...

## Lo que está bien
<2–4 puntos concretos>

## Cómo se revisó
<qué se leyó, lint, calidad, pruebas corridas o no y por qué>
~~~

Al cerrar: vuelta a la rama original de cada repo, y `git status` para confirmar que quedó como estaba.
Si apareció una regla que el usuario confirma y que debería aplicar a todos, se le propone para el
`CLAUDE.md` del repo o, si sirve a varios proyectos, para `team-rules.md` de main-brain con
`contribute-main-brain`.

## Modo propio: antes del commit de cierre

Lo corre `finish-development` en su Fase 1b, **siempre**, después de `review-overengineering`.

1. **Sin cambiar de rama ni hacer stash.** Por cada repo del ticket:

   ```bash
   node ~/.claude/skills/peer-review/lib/prepare.mjs --local --base <rama base> --repo <ruta>
   ```

   Resume la rama actual contra su base **con lo que está sin commit y los archivos nuevos**, que es lo
   que se va a commitear.
2. **Si el MR ya existe** (un ajuste después de una devolución), `gitlab-mr.mjs` también: la revisión se
   cruza con la lista del MR.
3. **La HU** ya la tiene el desarrollo: se usa la de `ticket-context` (`tickets.py check` antes, por si
   cambió).
4. **Se revisa** con la sección común y, además, con **las reglas del usuario**, porque el código es suyo:
   `~/.claude/CLAUDE.md` (docblocks, comentarios, claves i18n al final, nombres de 5 palabras, solo
   lecturas al probar) y la lista de la memoria del proyecto (en AIO, `revision-de-pares-propia`), punto
   por punto, diciendo qué se verificó y cómo.
5. **Entrega en el chat**, sin informe: la tabla de conteos por nivel y cada hallazgo con archivo, qué
   pasa, la regla y la corrección propuesta. **Lo que «Impide aprobar» o «Debe corregirse» se corrige, o
   el usuario lo acepta de forma explícita, antes de proponer el commit.** `finish-development` no sigue
   hasta que eso quede resuelto.

Las pruebas y el build los corre la Fase 2 de `finish-development`: aquí no se repiten, salvo para
confirmar una sospecha concreta.

## Revisión, común a los dos modos

### Entender antes de juzgar

- **Qué debía hacer**: la HU, el asunto y cuerpo de los commits y la descripción del MR.
- **El otro repo**: los repos del proyecto en `projects.json` y su `stack.json`.
  - Si la rama tiene par con el mismo nombre, su diff sin cambiar de rama:
    `git -C <otro repo> diff origin/<base>...origin/<rama>`.
  - Aunque no haya par, cómo usa la base del otro repo lo que cambió:
    `git -C <otro repo> grep -n <campo> origin/<base>`. Si este MR completa o rompe algo que ya está en
    la base del otro lado, se dice **en el chat**: el orden de despliegue es del usuario.
  - Lo que se vea mal en el otro repo va **solo en el chat**.
- **El contrato**: el `contract` del `stack.json` (en AIO, `docs/contrato-backend.md`) y su verificador
  (`node ~/.claude/brain/projects/aio/stack/check-contract.mjs`), sobre los recursos del cambio.
- Se lee el diff completo de cada archivo no generado; de los generados basta ver que correspondan.
- Se ubica el flujo afectado: de dónde se llama lo que cambió y qué más lo usa.

### Contra qué se revisa

En este orden. Cada comentario cita **de dónde sale la regla**; sin respaldo, es sugerencia o pregunta.

1. **El repo**: su `CLAUDE.md`, su `.claude/memory/`, la documentación que cite y uno o dos módulos
   vecinos análogos. Manda la convención que ya existe en el código.
2. **Las reglas del equipo**: [references/team-rules.md](references/team-rules.md), las que aplican al
   aplicativo. Si el `CLAUDE.md` del repo dice otra cosa, manda el `CLAUDE.md`.
3. **Solo en el modo propio**, las reglas del usuario (paso 4 del modo propio).
4. **Calidad**: SonarQube u otra herramienta si está a mano, separando lo del cambio de lo heredado; si
   no, se omite y se dice.
5. **Lint contra la base, sin copiar archivos al repo** (los `checks` del `stack.json`):
   - ESLint lee la versión de la base por la entrada estándar:
     `git show origin/<base>:<archivo> | pnpm exec eslint --stdin --stdin-filename <archivo>`.
   - Pint y PHPStan corren en el contenedor del proyecto, con la versión de la base en el `/tmp` **del
     contenedor**, nunca en una carpeta del repo.
   - Se reporta solo lo nuevo, y se reconoce si el cambio bajó errores heredados.
6. **Pruebas**: si el cambio trae pruebas o el módulo las tiene, se corren **contra la base de pruebas**
   (la configuración de pruebas del repo, sin caché de configuración que la pise), con el comando de
   `tests` del `stack.json` y lo que digan las memorias del repo. Sin entorno, se dice; no se inventa el
   resultado.
7. **Impacto**: por cada artefacto compartido que cambió (servicio, componente, trait, función SQL,
   interceptor, seeder), quién más lo usa y si su comportamiento cambia.
8. **Seguridad y rendimiento**: permisos, empresa de la sesión en toda acción por id, validación de
   entrada, SQL con parámetros, datos personales en respuestas o logs, consultas por fila, paginación y
   secretos en el código.

### Clasificar

| Nivel | Cuándo |
|---|---|
| **Impide aprobar** | Rompe algo, es riesgo de seguridad o de pérdida de datos, incumple la HU o cambia el comportamiento de otro módulo |
| **Debe corregirse** | Incumple el `CLAUDE.md`, la documentación técnica del repo o una regla del equipo (en el modo propio, también una regla del usuario) |
| **Mejora sugerida** | Mejora claridad, reutilización o rendimiento, pero lo actual es aceptable |
| **Pregunta** | No queda clara la intención; se pregunta en vez de suponer |

Un mismo problema en varios archivos es **un** comentario con todas sus ubicaciones. Un arreglo sin
prueba que lo proteja es «Debe corregirse»; un cambio de alcance global fuera del caso, «Impide
aprobar». **Cada cita se verifica antes de escribirla.**

## Guardrails

- Solo lectura sobre el código revisado: no se edita, no se hace commit ni push. En GitLab solo se
  consulta: no se comenta ni se aprueba.
- En el modo manual, cambiar de rama pide el sí, y con cambios sin commit no se cambia.
- Las pruebas, solo contra la base de pruebas; cualquier llamada a una API, solo de lectura.
- Nada temporal dentro del repo revisado; al cerrar, `git status` igual que al empezar.
- Un comentario sin regla que lo respalde es sugerencia o pregunta, nunca exigencia.
