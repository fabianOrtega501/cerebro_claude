---
name: contribute-main-brain
description: Usar cuando algo del cerebro (~/.claude) —una skill, un agente, una mejora o la correccion de una falla en un plugin— deba pasar a main-brain, el marketplace de plugins del equipo, para que otros lo reciban. Prepara el aporte en el clon de main-brain: rama feature desde origin/qa, limpieza de todo lo personal, version y CHANGELOG, validacion, commit y push con permiso, y el texto del merge request hacia qa. Dispara con "sube esto a main-brain", "aporta esta skill al equipo", "comparte esto en main-brain", "manda la correccion al plugin". Es la pareja de salida de `sync-brain`, que solo baja y absorbe.
---

# contribute-main-brain

Llevar un aporte del cerebro a main-brain por merge request hacia `qa`, sin que viaje nada personal.

| Dato | Valor |
|---|---|
| Clon | El repo del proyecto `main-brain` en `brain/projects.json` (`/datos/proyectos/main-brain`) |
| Rama de partida | **Siempre `origin/qa`**, aunque `sync-brain` vigile `prod`: el proceso del equipo exige que todo entre por `qa` |
| Destino del MR | `qa`. Solo un Maintainer mergea a `qa` y promueve a `prod` |
| Estandar | `README.md` de main-brain y `docs/Claude/main-brain.md` del manual tecnico |

## Principios

- **Se sigue trabajando en el cerebro.** El aporte es una copia limpia de algo que ya funciona aqui; la
  pieza propia no se borra hasta que el plugin este instalado y probado.
- **Nada nace en main-brain.** Si no funciona ya en el cerebro, todavia no se aporta.
- **Una skill por trabajo.** Antes de crear algo se revisa el catalogo del `README.md` de main-brain: si
  existe algo parecido, se mejora eso. La correccion de un motor va al plugin que lo tiene.
- **Plan antes que archivos.** Como todo desarrollo: que se aporta, a que plugin, que se limpia y
  que version sube, y se espera el si.
- **Cada paso de git con su si**: crear la rama, el commit y el push son tres permisos distintos.
  Nunca se escribe en `qa` ni en `prod`, nunca se mergea y nunca se abre el MR por el usuario.

## Procedimiento

### 1. Plan

Leer la pieza propia y el plugin destino (`plugins/<plugin>/` en `origin/qa`) y presentar:

- **Que va**: los archivos y si es nuevo, mejora o correccion.
- **Plugin destino**: uno existente por dominio. Un plugin nuevo necesita un Maintainer que sea su dueño:
  se dice y se espera la decision.
- **Que se limpia**: la tabla del paso 3, con lo que se encontro en la pieza.
- **Version**: correccion o agregado compatible sube el numero menor (`0.1.0` -> `0.1.1` / `0.2.0`);
  si rompe algo, la mayor, y hay que coordinarlo con el equipo antes (los cambios a un motor son
  aditivos: quien tenga una rama vieja sigue usando la misma version instalada).

### 2. Rama

Con el si:

```bash
node ~/.claude/skills/contribute-main-brain/lib/contribute.mjs start <slug>
```

Hace `fetch`, se niega si el clon tiene cambios sin commitear y crea `feature/<slug>` desde
`origin/qa`. El slug sigue lo que ya usa el equipo: `fabian-<que-aporta>` en kebab-case.

### 3. Llevar el aporte, limpio

Se escribe la version para el equipo, no se copia la propia tal cual:

| Del cerebro | En el plugin |
|---|---|
| Rutas absolutas, `~/.claude/...` | `${CLAUDE_PLUGIN_ROOT}` dentro del `SKILL.md`; en los scripts, rutas relativas a su archivo |
| `secrets.env`, `credentialsFor`, `dbConnection` | Variables de entorno del `settings.local.json` de cada quien, documentadas en el `README.md` del plugin. Si falta una, el script dice cual y donde se define |
| Imports de `brain/lib/` o de otra skill | Lo necesario se copia dentro del plugin: **cada plugin es una isla** y no puede importar de fuera de su carpeta |
| Skills y hooks personales (`ticket-context`, `start-development`, `hu-pdf-guard`, guardas de ambiente) | Se nombran como paso opcional ("si el desarrollador lo tiene, lo usa") o se quitan |
| Reglas del CLAUDE.md del cerebro | Solo las que el equipo ya comparte. Una regla personal nueva va como propuesta en el MR, no metida en la skill |
| Nombres de proyectos o clientes | Solo si el plugin es de ese dominio (`aio`) |

Se respetan las reglas del estandar: identificadores en ingles, textos en español, la `description`
dice **cuando** usarla, y si hay hooks, rapidos e inofensivos (corren en la maquina de todos).

Al terminar:

```bash
node ~/.claude/skills/contribute-main-brain/lib/contribute.mjs check
```

Lista cada linea agregada frente a `origin/qa` que parece personal. **Cada hallazgo se revisa con el
usuario**: o se limpia, o se explica por que es legitimo (un ejemplo en la documentacion).

### 4. Version, CHANGELOG y catalogo

- `plugins/<plugin>/.claude-plugin/plugin.json`: la `version` del plan. Sin subirla nadie recibe el cambio.
- `plugins/<plugin>/CHANGELOG.md`: una seccion `## <version> — <AAAA-MM-DD>` con viñetas en español
  que digan que cambia para quien usa el plugin.
- `README.md` de la raiz: la fila del catalogo si la skill es nueva. El dueño lo decide el usuario.
- `.claude-plugin/marketplace.json`: solo si el plugin es nuevo o cambia su descripcion.

### 5. Validar y probar

```bash
node ~/.claude/skills/contribute-main-brain/lib/contribute.mjs validate <plugin>
```

Corre `claude plugin validate .` y `claude plugin validate ./plugins/<plugin> --strict`. Las advertencias
que ya estaban en `origin/qa` no son del aporte; las nuevas se corrigen.

La prueba real la hace el usuario en una sesion aparte: `claude --plugin-dir ./plugins/<plugin>` desde
el clon, y `/reload-plugins` tras cada ajuste. Se le dice exactamente que probar y que resultado esperar.

### 6. Commit y push

Con el si para cada uno:

```bash
git -C /datos/proyectos/main-brain add <archivos del aporte>
git -C /datos/proyectos/main-brain commit -m "<que aporta, en español, sin numero de ticket>"
git -C /datos/proyectos/main-brain push -u origin feature/<slug>
```

- Solo los archivos del aporte; nunca `git add -A`.
- Mensaje en español, como los demas commits del repo, y **sin trailer de coautoria**.
- Si mientras tanto `origin/qa` avanzo y toca lo mismo: `fetch` y `merge origin/qa` en la rama antes
  del push. **Los conflictos los resuelve el usuario**; se le muestra que trae cada lado.
- Si el push da timeout de SSH, se pregunta por la VPN. No se pide por adelantado.

### 7. Merge request y registro

- Se entrega el **titulo y la descripcion del MR** como texto normal para pegar en GitLab: que aporta,
  por que le sirve al equipo, como se probo, la version y el CHANGELOG. Lo abre el usuario hacia `qa`.
- Se agrega el aporte a `contributions` de `~/.claude/brain/main-brain.json`:

```json
{ "branch": "feature/<slug>", "commit": "<sha del ultimo commit>", "plugin": "<plugin>", "version": "<version>", "piece": "<pieza del cerebro>", "status": "pending" }
```

  Cuando el MR entre y `sync-brain` baje la rama vigilada, lo reconoce como propio y su `status` pasa a
  `merged`. Si en `equivalents` falta la relacion entre la skill del plugin y la pieza propia, se agrega.
- El cambio a `main-brain.json` es del cerebro: se commitea en `~/.claude` con su propio permiso, despues
  de Doctor, como cualquier cambio del cerebro.
- Al final, el clon se deja en la rama donde estaba (`git switch qa`), con el si.

## Trampas

- **`${CLAUDE_PLUGIN_ROOT}` no existe en los comandos de Bash**: solo se reemplaza dentro del `SKILL.md`
  y de los hooks. El `SKILL.md` escribe la ruta completa en cada comando.
- **Un plugin no trae permisos**: si la skill necesita `permissions.allow`, se documenta en su README
  para el `settings.json` de cada proyecto.
- **Instalar el plugin propio no es automatico**: si se quiere usar la version del equipo en lugar de la
  pieza propia, se instala, se prueba y recien ahi se retira la propia, en un cambio aparte del cerebro.
