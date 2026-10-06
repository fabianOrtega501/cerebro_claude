---
name: ticket-context
description: Usar para traer el ticket de Mantis (o el caso de GLPI) y su Historia de Usuario como insumo del desarrollo, en cualquier proyecto. Baja la HU de esa misma ejecucion, la convierte a Markdown en un cache por ticket y devuelve un resumen con criterios de aceptacion y reglas. Tambien confirma si la HU guardada sigue vigente antes de revisar un ajuste, armar el set de pruebas o el control de cambios. La ejecuta `start-development` en su Paso 4. Dispara con "lee el ticket", "baja la HU", "que dice la HU", "trae el 10842 de Mantis", "el GLPI es 56226".
---

# Traer el ticket y su HU

La HU es el requerimiento contra el que se valida todo: el plan, las pruebas y el cierre. Esta
skill la trae **de la fuente**, no de lo que haya quedado en la conversacion ni de un PDF viejo.

Todo sale de `~/.claude/brain/lib/tickets/tickets.py`, que habla con Mantis (REST, solo GET) y con
GLPI (sesion web, solo el login es POST). El resultado queda en:

```
~/.claude/cache/tickets/<clave>/   clave = numero de Mantis, o glpi-<codigo> si no hay Mantis
  ticket.md    ficha de Mantis: campos, descripcion y notas completas
  hu.md        la HU convertida: lo unico que se lee
  hu-*.pdf     los originales, para mirar paginas con capturas
  meta.json    de donde salio, cuando, y que candidatas habia
```

`cache/` esta fuera de la lista blanca del cerebro: **una HU es un documento de un cliente y no
viaja al respaldo de GitHub**.

## Paso 1 — Saber que ticket

- **Numero de Mantis**: es el mismo de la rama. Si ya hay rama, sale solo:
  `python3 ~/.claude/brain/lib/tickets/tickets.py current <repo>` devuelve la `key`.
- **Codigo de GLPI**: solo si el usuario lo da, o si el ticket de Mantis no lo trae en su campo
  `Codigo GLPI`. Nunca se deduce.
- Si no hay ninguno de los dos, se pregunta. No se busca "el que se parezca".

## Paso 2 — Bajar y resumir, en el subagente

Delegar siempre al subagente `ticket-reader` (Sonnet). El PDF, el ticket entero y las notas se
quedan en su contexto; a la sesion llega un resumen de unas 30 lineas:

```
Agent(subagent_type: "ticket-reader", run_in_background: false,
      prompt: "fetch 10842")                 # o "fetch --glpi 56226", o con "--pick glpi:123"
```

Segun el `code` que devuelva:

| code | Que paso | Que hacer |
|---|---|---|
| 0 | Listo | Seguir al paso 3 |
| 2 | El caso no abre (no existe o sin permiso) | Decirlo: casi siempre el `Codigo GLPI` del ticket esta mal. Pedir el correcto |
| 3 | Sin adjuntos | Trabajar con `ticket.md` si alcanza; si no, **pedir la HU al usuario** |
| 4 | Hay adjuntos, ninguno es HU | Mostrar la lista y preguntar cual es. No elegir |
| 5 | Varias HU candidatas | Mostrar las candidatas y preguntar; relanzar con `--pick fuente:id` |
| 6 | Falta una credencial | Decir la linea exacta que falta en `secrets.env`. **No inventarla ni reusar otra** |
| 7 | Sin conexion o login rechazado | Si es timeout y el usuario esta fuera de la red corporativa, preguntar por la VPN |

Si la misma HU viene en PDF y DOCX, se bajan las dos y `hu.md` sale del DOCX: sus tablas salen limpias.

## Paso 3 — Leer lo que haga falta, nada mas

- El resumen del subagente alcanza para encuadrar el ticket. Para planear, **leer `hu.md`** con
  Read: son 2.000 a 8.000 tokens, contra varias veces eso si se leyera el PDF.
- Si el resumen trae `paginas con imagenes` y la pantalla importa para el desarrollo, leer **solo
  esas paginas** del PDF: `Read(file_path: <pdf>, pages: "2-3")`. El hook `hu-pdf-guard` niega el
  PDF entero y deja pasar las paginas pedidas.
- Las **ambiguedades** del resumen se le cuentan al usuario antes del plan, no se resuelven solas.

## Paso 4 — Vigencia, cada vez que la HU se vuelva a usar

Antes de revisar o ajustar un desarrollo ya hecho, y antes de `gen-test-set` o
`gen-changes-controls`:

```bash
python3 ~/.claude/brain/lib/tickets/tickets.py check <clave>
```

- `vigente`: usar el `hu.md` guardado.
- `cambio`: decir que cambio (HU nueva o nota nueva en Mantis) y volver al paso 2. Contrastar lo
  hecho contra la HU nueva antes de seguir.
- `sin-cache`: correr el paso 2.

Es barato: lista adjuntos sin descargarlos. No hay excusa para usar la HU de memoria.

## Reglas

- **Solo cuenta la HU que bajo el script.** Un `TI-PR-0005-F02…pdf` de `~/Descargas` o
  `~/Documentos` no se usa aunque el nombre coincida: todas se llaman igual y la del mes pasado
  es el requerimiento equivocado. La excepcion es que el usuario entregue un archivo a proposito:
  entonces se convierte con `to_markdown.py` y se lee el `.md`.
- **Solo lectura** en Mantis y GLPI. Esta skill no cambia estados, no agrega notas ni sube nada.
- **Credenciales** solo en `~/.claude/secrets.env`: `MANTIS_URL`, `MANTIS_API_TOKEN`, `GLPI_URL`,
  `GLPI_USER`, `GLPI_PASSWORD`. Nunca en el `env` de `settings.json`, que se versiona.
- La conexion es transversal: otro flujo que necesite un ticket usa `tickets.py` (o importa
  `mantis.py` / `glpi.py`) en vez de escribir la suya.
