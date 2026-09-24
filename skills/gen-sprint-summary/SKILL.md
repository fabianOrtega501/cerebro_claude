---
name: gen-sprint-summary
description: >-
  Arma el RESUMEN DEL SPRINT en una sola diapositiva: lista los desarrollos que se iniciaron en los
  últimos días hábiles barriendo los repos de producto del cerebro (los manuales quedan fuera:
  documentan un desarrollo, no son uno), y por cada uno responde las cinco
  preguntas del formato del equipo (Problema abordado, Valor generado, Decisión técnica relevante,
  Aprendizaje clave, Mejora futura). El borrador sale del diff real de las ramas; el usuario corrige.
  Entrega el texto para copiar y un PNG de 1920x1080 listo para insertar como imagen en Google
  Slides. No toca ramas, no commitea, no sube nada a ningún servicio y en base de datos no entra.
  USO MANUAL: se ejecuta SOLO cuando el usuario lo pide (/gen-sprint-summary o "arma el resumen del
  sprint"), nunca por iniciativa propia. Palabras gatillo: resumen del sprint, diapositiva del
  sprint, slide del sprint, cierre de sprint, qué hice este sprint, gen-sprint-summary.
---

# Resumen del sprint en una diapositiva

Al cierre de cada sprint hay que entregar **una diapositiva por desarrollador**. La presentación
completa junta la de todos; aquí se arma la de Fabian, con **todos los desarrollos en un solo
slide**.

Por cada desarrollo se responden siempre las mismas cinco preguntas:

| Campo | Pregunta que responde |
|---|---|
| 🛠️ Problema abordado | ¿Qué necesidad del usuario o del negocio resolví? |
| ❇️ Valor generado | ¿Qué cambia ahora gracias a este desarrollo? |
| 📚 Decisión técnica relevante | ¿Qué decisión importante tomé y por qué? |
| ✅ Aprendizaje clave | ¿Qué aprendí que mejora mi forma de trabajar o la del equipo? |
| 🚀 Mejora futura | Si lo hiciera otra vez, ¿qué haría diferente? |

## Lo que esta skill NO hace

- **No toca git**: no crea ni cambia de rama, no commitea, no hace push.
- **No sube nada a Google Slides** ni a ningún otro servicio. Produce un PNG local; lo inserta el
  usuario.
- **No escribe en base de datos**, ni lee de ella: todo sale de git.
- **No inventa desarrollos.** Lo que no esté en una rama o no lo aporte el usuario, no entra.
- **No decide qué es relevante.** Propone un recorte; elige el usuario.

## Fase 0 — De qué sprint es el slide

**Lo primero, antes de listar nada.** El número del sprint da nombre a la carpeta y a los archivos,
y es como el equipo se refiere al trabajo; sin él, el PNG llega a la presentación sin decir de qué
periodo habla.

Para proponer el siguiente:

```bash
ls -1 ~/.claude/brain/sprints 2>/dev/null | grep -oE '[0-9]+$' | sort -n | tail -1
```

Se propone ese número **más uno** y se espera confirmación. Si no hay ninguna carpeta todavía, se
pregunta sin proponer: la numeración la lleva el equipo, no el disco.

## Fase 1 — Listar los desarrollos del periodo

```bash
node ~/.claude/skills/gen-sprint-summary/lib/collect-developments.mjs                  # 10 días hábiles
node ~/.claude/skills/gen-sprint-summary/lib/collect-developments.mjs --dias-habiles 15
node ~/.claude/skills/gen-sprint-summary/lib/collect-developments.mjs --desde 2026-08-26 --hasta 2026-09-09
node ~/.claude/skills/gen-sprint-summary/lib/collect-developments.mjs --incluir-manuales
node ~/.claude/skills/gen-sprint-summary/lib/collect-developments.mjs --json
```

Barre los proyectos de `brain/projects.json` **menos `manuales`**: el manual documenta un desarrollo
que ya se cuenta en su propio proyecto, y contarlo aparte infla la lista con trabajo que no es un
desarrollo. Si alguna vez hacen falta, `--incluir-manuales`, o pedirlos con `--proyecto manuales`.

La fecha de inicio es la de creación de la rama según su reflog, no la del último commit: lo que se
pregunta es qué se **empezó** en el periodo.

Un ticket es **un solo desarrollo** aunque tenga rama en el front, en el back y en la app móvil; el
recolector ya las agrupa y muestra los repos involucrados.

**Mostrar la lista al usuario y esperar.** Se le pide que:

1. Marque cuáles entran en el slide.
2. Agregue los que falten: tickets sin rama propia, trabajo hecho sobre la rama de otro, o
   desarrollos anteriores al periodo que quiera incluir igual.

Las ramas marcadas `[posible ruido]` (copias `-desa`, ramas de prueba, ramas de configuración) se
muestran igual, pero se sugiere dejarlas fuera.

**Con más de seis desarrollos el slide deja de leerse en proyección.** Si salen más, proponer un
recorte razonado —los de más impacto para el usuario final, no los más largos de programar— y
esperar el visto bueno. Dos desarrollos muy parecidos (tres tickets de permisos, por ejemplo) se
pueden fundir en una caja, y conviene proponerlo.

## Fase 2 — Leer el diff de cada desarrollo

El contenido sale del código, no de la memoria. Se reutiliza el recolector que ya existe:

```bash
node ~/.claude/skills/gen-changes-controls/lib/collect-changes.mjs --repo <ruta> --json
node ~/.claude/skills/gen-changes-controls/lib/collect-changes.mjs --repo <front> --repo <back> --json
```

Para un ticket fullstack se pasan sus repos en **una sola corrida**: el desarrollo es uno.

Casi siempre la rama ya se mezcló, así que el rango hay que reconstruirlo con `--commit <sha>` o
`--since "2 weeks ago"`, igual que en `gen-test-set`. Si el diff sale vacío o `base.confidence` es
`"baja"`, **preguntar** contra qué se compara en vez de escribir sobre un rango inventado.

Si el usuario compartió el enunciado del ticket, mejor: el "Problema abordado" real está ahí, no en
el diff. Si no, se redacta con lo que hay y se avisa.

## Fase 3 — Redactar el borrador

Reglas duras, porque el destino es una caja de una diapositiva:

- **Una frase por campo, máximo ~140 caracteres.** Si no cabe, sobra contexto.
- **Problema y Valor se escriben desde el usuario del sistema**, no desde el código: *"el usuario
  podrá cargar el combustible de forma masiva"*, no *"se agregó un endpoint de carga"*. El slide lo
  lee gente que no programa.
- **Decisión técnica es la decisión**, no el listado de archivos: *"modificación de la tabla
  dispatchs_fuel para almacenar la información completa"*, no *"se tocaron 12 archivos"*.
- **Aprendizaje y Mejora futura son suyos.** Se proponen a partir de lo que de verdad pasó en el
  ticket —lo que costó, lo que se rehízo, lo que quedó pendiente—, y se presentan marcados como
  *propuesta*. Si no hay base real para uno, **decirlo y preguntar**, en vez de rellenar con una
  frase de manual.
- **Español de Colombia, de presentación**, según la regla del `CLAUDE.md` del cerebro: pretérito
  simple (*se implementó*, no *se ha implementado*), palabras de aquí, y anglicismo solo si el
  equipo ya lo usa. Lo propio del slide: **lo que el usuario ve en pantalla se nombra como está en
  el aplicativo** —cargue, tanqueo, novedad, despacho—, aunque suene informal, porque así lo
  reconoce quien lee.
- `Mejora futura: No requiere` es una respuesta válida.
- Ni números de ticket ni nombres de rama dentro del texto: el ticket va aparte si se quiere
  mostrar.

## Fase 4 — Presentar el texto y esperar correcciones

Se muestra el texto agrupado por proyecto, con los cinco campos por desarrollo. **Aquí se para.**

Si el usuario solo quería el texto, la skill termina en esta fase.

## Fase 5 — Maquetar el slide

Con el texto ya aprobado se escribe el JSON y se renderiza:

```bash
node ~/.claude/skills/gen-sprint-summary/lib/render-slide.mjs \
  --entrada ~/.claude/brain/sprints/Sprint_<n>/Retrospectiva_Sprint_<n>.json \
  --sprint <n>
```

Sin `--salida` escribe en `~/.claude/brain/sprints/Sprint_<n>`, que es lo que se usa siempre.

Formato del JSON:

```json
{
  "author": "Fabian",
  "sprint": "18",
  "showTickets": false,
  "developments": [
    { "project": "AIO", "ticket": "9357",
      "problem": "…", "value": "…", "decision": "…", "learning": "…", "improvement": "…" }
  ]
}
```

`project` es la etiqueta corta que se ve en el slide (`AIO`, `Epsilon`, `Status`), no la clave de
`projects.json`. El orden de los desarrollos en el arreglo es el orden en la diapositiva.

**Slides de lista.** Cuando un campo remite a algo que no cabe en una caja —los pendientes de una
migración, por ejemplo—, va en un slide aparte con `extraSlides`. Cada uno sale como
`Retrospectiva_Sprint_<n>_2.png`, `_3`…, con el mismo diseño y la medición de letra del principal:

```json
"extraSlides": [
  { "title": "Status API — pendientes y mejoras futuras",
    "groups": [
      { "name": "Prioridad alta",
        "items": [{ "title": "Permisos por empresa", "issue": "…", "action": "…" }] }
    ] }
]
```

Cada grupo es una sección de color con sus cajas en tres columnas; `issue` se pinta como *Qué pasa*
y `action` como *Qué hacer*. Si la caja habla de archivos, variables, vistas o pantallas, **se
nombran**: en la reunión van a preguntar cuáles son.

El renderizador **encoge la letra solo, midiendo en la página**, hasta que todo quepa; si avisa de
que ni al mínimo cabe, hay texto cortado y toca quitar desarrollos o acortar frases. No ignorar ese
aviso: el recorte de CSS no se ve hasta que alguien lee el slide proyectado.

Para insertarlo: en Google Slides, **Insertar > Imagen > Subir de tu computadora**. Google Slides no
importa HTML, por eso se entrega el PNG. Corregir una frase es editar el JSON y volver a renderizar.

## Dónde queda todo

`~/.claude/brain/sprints/Sprint_<n>/`, con el número que se acordó en la Fase 0:

| Archivo | Qué es | ¿Se versiona? |
|---|---|---|
| `Retrospectiva_Sprint_<n>.md` | El texto de los cinco campos por desarrollo | Sí: es la memoria del sprint |
| `Retrospectiva_Sprint_<n>.json` | La entrada del renderizador | No |
| `Retrospectiva_Sprint_<n>.html` | La maqueta intermedia | No |
| `Retrospectiva_Sprint_<n>.png` | Lo que se sube a Slides | No |
| `Retrospectiva_Sprint_<n>_2.png`, … | Los slides de `extraSlides`, con su `.html` | No |

El PNG llega a la presentación con el nombre puesto, sin depender de la carpeta que lo ubicaba.

El `.gitignore` del cerebro ya está configurado así. Al terminar, si el cerebro quedó con cambios
sin commitear, ofrecerlo en una línea.
