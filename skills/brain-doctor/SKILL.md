---
name: brain-doctor
description: Usar para diagnosticar si el cerebro (~/.claude) esta sano y coherente —hooks registrados que existen y compilan, README al dia con skills, agentes y hooks, secretos fuera del repo, memorias con indice y frontmatter correctos, repos registrados en disco— sin corregir nada. Corre sola al cerrar `sync-brain` y antes de proponer cualquier commit del cerebro. Dispara con "corre el doctor", "revisa el cerebro", "esta sano el cerebro?", "algo no funciona en mis skills o hooks". No confundir con `/doctor` de Claude Code, que revisa la instalacion.
---

# Diagnosticar el cerebro

Doctor revisa y **nunca corrige**. Cada hallazgo dice que esta mal y como se arregla; quien
decide es el usuario.

```bash
node ~/.claude/brain/lib/doctor.mjs            # diagnostico legible
node ~/.claude/brain/lib/doctor.mjs --json     # para procesarlo
node ~/.claude/brain/lib/doctor.mjs --only memory
```

Sale con 1 si hay errores. Tarda unos segundos: compila cada script del cerebro.

## Que revisa

| Modulo | Que |
|---|---|
| `config` | settings.json valido; cada hook y la statusline apuntan a un script que existe; todo `.mjs` y `.py` compila; hooks sin registrar; secretos en el `env` de settings.json |
| `inventory` | `name` de cada skill y agente igual a su carpeta o archivo; agentes con `model`; README con toda skill, agente y hook, y sin piezas que ya no existen; `subagent_type` y rutas `~/.claude/...` que no existen |
| `versioning` | Nada prohibido versionado (secrets.env, cache, transcripciones, `__pycache__`); lo que usa settings.json no esta ignorado; cambios sin commitear y commits sin subir; el repo de GitHub sigue privado (con `gh`) |
| `secrets` | secrets.env en 600; ningun valor de clave `PASSWORD`/`TOKEN`/`SECRET`/`_KEY` aparece en un archivo versionado **o por versionar** |
| `projects` | Repos de projects.json en disco; `additionalDirectories` al dia; proyectos sin usuario de pruebas |
| `memory` | Cada carpeta de memoria —del cerebro y `.claude/memory/` de los repos— con MEMORY.md, sin enlaces rotos ni huerfanas, frontmatter completo, y copias del equipo que no divergen entre repos |

Niveles: **error** rompe algo hoy; **aviso** se va a degradar o confunde; **info** es contexto.
Un `[[enlace]]` a una memoria que aun no existe es info, no error: marca algo por escribir.

## Cuando corre

- **Al cerrar `sync-brain`**: `settle.mjs` lo llama solo.
- **Antes de proponer un commit del cerebro**, cualquiera. El orden es fijo: Doctor, resumen al
  usuario con lo que encontro, y solo con su si, el commit. Si hay errores se dicen **antes** de
  pedir la aprobacion; el usuario decide si se corrigen primero.
- Cuando algo del cerebro no se comporta como se espera: es el primer paso, antes de depurar a mano.

## Como reportar

- Sin errores ni avisos: una linea (`Doctor: sano, 0 errores, 0 avisos`) y la info solo si
  importa para lo que sigue (por ejemplo, cuantos archivos quedan sin commitear).
- Con hallazgos: los errores y avisos tal cual, agrupados por modulo, con la correccion propuesta.
  Ofrecer corregirlos; no corregir sin el si.

## Lo que Doctor no ve

Contradicciones de fondo —una skill que dice lo contrario del `CLAUDE.md`, dos memorias que
cuentan lo mismo con palabras distintas— no se detectan con codigo. Esa revision la hace la
sesion, sobre lo que cambio, en el paso 5b de `sync-brain`.

## Agregar una revision

Un modulo nuevo es un archivo en `brain/lib/doctor/` que exporta `run(ctx)` y devuelve
`finding(level, area, message, fix)`. Se registra en `MODULES` de `doctor.mjs`. Antes de darlo
por bueno, probarlo sembrando la falla en una copia del cerebro (`HOME=<copia>`), no en el real.
