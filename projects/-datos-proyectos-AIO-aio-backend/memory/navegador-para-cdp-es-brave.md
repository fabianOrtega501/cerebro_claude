---
name: navegador-para-cdp-es-brave
description: Manejar el navegador por CDP en esta maquina exige CHROME_PATH=/snap/bin/brave; no hay Chrome ni Chromium instalados
metadata:
  type: project
---

> Copia identica en los `memory/` de **aio-app** y **aio-backend**, para que un ticket fullstack la
> vea desde cualquiera de los dos. Si cambias una, cambia la otra.

Cualquier script que use `launchChrome` de `~/.claude/skills/update-manual/lib/browser.mjs`
—capturas del manual, humo test de `finish-development`, validaciones de UI a mano— necesita:

```bash
TMPDIR=/home/fabian-ortega/aio-shots/tmp CHROME_PATH=/snap/bin/brave node <script>
```

Sin `CHROME_PATH` muere de entrada con **`No se encontró Chrome ni Edge`**: en esta maquina no hay
`google-chrome`, `chromium` ni `chromium-browser`, solo **Brave instalado por snap**.

**Why:** el mensaje de error apunta a definir la variable pero no dice que valor, y el dato no esta
en ningun `CLAUDE.md`: vive disperso en las entradas de `permissions` del
`aio-app/.claude/settings.local.json`, que es donde hay que ir a leerlo si no se sabe. Buscarlo ahi
cuesta varias vueltas en medio de una validacion.

**How to apply:** exportar las dos variables en el mismo comando del `node`. `TMPDIR` apunta a
`~/aio-shots/tmp` porque es lo que ya usa la configuracion del repo —Brave viene confinado por snap
y el scratchpad de la sesion en `/tmp/claude-*` le queda fuera del alcance—; **no se probo sin
ella**, asi que puede ser prescindible, pero con ella funciona. Ver
[[lint-del-aio-reformatea-todo]] para el resto de la verificacion del front.
