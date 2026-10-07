---
name: gen-changes-controls
description: >-
  Genera el CONTROL DE CAMBIOS (texto) de un desarrollo ya realizado, en cualquier proyecto, con 5
  apartados: Descripción, Justificación, Riesgo (bajo/medio/alto + mitigación si medio/alto), Impacto
  (bajo/medio/alto + medidas de adopción si medio/alto) y Efectos de no implementarlo. Formato limpio,
  SIN emojis; textos claros, concisos, profesionales, con nivel de tecnicismo MEDIO (entendibles para
  cualquier persona, técnica o no). Solo produce el TEXTO. Se basa siempre en el contexto real que el
  usuario comparte del desarrollo (qué hizo, para qué lo hizo, cómo lo hizo); nunca inventa. USO MANUAL:
  se ejecuta SOLO cuando el usuario lo pide (/gen-changes-controls o "genera el control de cambios"),
  nunca automáticamente. Palabras gatillo: control de cambios, gen-changes-controls, documentar el
  cambio, control de cambio.
---

# Generador de Control de Cambios (texto)

Ayudas a redactar el **control de cambios** de desarrollos ya realizados, en cualquier proyecto en el
que esté trabajando el usuario. El usuario comparte el contexto del desarrollo (qué hizo, por qué y
cómo) y tú produces el texto de cada apartado, listo para pegar en el documento de control de cambios.

No está atado a ningún proyecto, tecnología ni flujo de trabajo en particular. Se aplica a cualquier
desarrollo: backend, frontend, base de datos, integraciones, correcciones de errores, mejoras técnicas,
etc.

## Reglas fijas

- Formato **limpio, sin emojis**; encabezados simples.
- Textos **claros, concisos y breves** (2–5 líneas por apartado); nada extenso ni con relleno.
- **Nivel de tecnicismo medio**: el texto debe ser profesional y preciso, pero entendible tanto por
  perfiles técnicos como por perfiles funcionales o de negocio. Se pueden mencionar conceptos técnicos
  cuando aporten claridad (por ejemplo, "se optimizó la consulta a la base de datos" o "se creó un nuevo
  servicio"), pero evitando el detalle excesivo (nombres exactos de archivos, rutas internas, líneas de
  código, nombres de variables). Si un término muy técnico es imprescindible, se explica en pocas
  palabras.
- **Uso MANUAL**: solo cuando el usuario lo pida explícitamente. No se genera por iniciativa propia.
- **Solo texto**: no escribe en ningún sistema (Mantis, GLPI, GitLab, Jira, etc.), no se hace commit
  ni push. Leer la HU con `ticket-context` sí está permitido: es solo lectura.
- **Las medidas de adopción y de mitigación no mencionan tareas del propio desarrollo**: actualizar el
  manual, acompañar en algún ambiente, desplegar o probar. Cuando se redacta el control de cambios,
  eso ya está hecho. Solo van las medidas que dependen de las personas o de la operación tras la
  salida. Lo pidió Fabian el 2026-10-07.

## Insumo

El contexto del desarrollo terminado, que el usuario comparte directamente en la conversación. Puede
incluir:

- Una explicación en sus propias palabras de qué hizo, por qué y cómo.
- Un diff, commits o fragmentos de código relevantes.
- Resultados de pruebas realizadas.
- Cualquier otro contexto útil (ticket, correo, conversación previa).
- **La HU vigente del ticket**, para la Descripción y la Justificación: con el número de la rama,
  `tickets.py check <clave>` de la skill `ticket-context`, y su `hu.md`. Si la HU cambió o no está
  en caché, se baja con esa skill antes de redactar. La justificación sale de la HU, no se supone.

Si falta información clave para clasificar riesgo o impacto (por ejemplo, si el cambio ya se probó, qué
módulos toca, si hay usuarios afectados), **pregúntala** — no inventes ni asumas.

### Desarrollos que involucran back y front

Un mismo desarrollo (una funcionalidad, una entrega) puede tocar back y front a la vez, sin importar si
viven en el mismo repositorio o en repositorios separados. En ese caso, el control de cambios es **uno
solo**, no uno por cada capa. Al redactar cada apartado, integra ambos lados como partes de un mismo
cambio de negocio:

- **Descripción**: cuenta el cambio de forma unificada (qué gana o qué puede hacer ahora el usuario o el
  sistema), y si aporta claridad, menciona brevemente qué se ajustó en cada capa (por ejemplo: "se
  incorporó un nuevo servicio para calcular X y se actualizó la pantalla correspondiente para mostrar el
  resultado"). No dupliques el apartado en dos bloques separados de "back" y "front".
- **Justificación**: normalmente es una sola necesidad de negocio que motivó el cambio en ambas capas;
  redáctala como una sola justificación.
- **Riesgo**: evalúa el riesgo combinado. Si una de las dos capas es más compleja o menos probada que la
  otra, que eso pese en la clasificación final (el riesgo del conjunto no puede ser menor al de su parte
  más riesgosa).
- **Impacto**: igual, evalúa el impacto conjunto sobre el usuario final y sobre los sistemas relacionados,
  no el impacto de cada capa por separado.
- **Efectos de no implementarlo**: descríbelos también de forma unificada.

Si el contexto que comparte el usuario solo cubre una de las dos capas (por ejemplo, solo el back de una
entrega que también tuvo front), pregunta si hay cambios en la otra capa que deban incluirse en el mismo
control de cambios antes de darlo por completo.

## Qué produces: 5 apartados

Basado en hechos reales del desarrollo que el usuario comparte:

1. **Descripción del cambio** — QUÉ se hizo: modificaciones concretas (nueva funcionalidad, ajuste de un
   proceso existente, servicio nuevo, corrección de error, mejora técnica). Deja evidencia de la acción
   realizada.
2. **Justificación del cambio** — POR QUÉ fue necesario: la necesidad funcional, técnica o de negocio que
   lo originó (optimización, cumplimiento normativo, rendimiento, interoperabilidad). El valor o
   beneficio del cambio.
3. **Riesgo del cambio** — nivel **bajo / medio / alto**, según la complejidad del desarrollo, el impacto
   sobre otros módulos, la estabilidad del sistema y los resultados de las pruebas. Si el cambio ya se
   probó y validó correctamente, el riesgo residual suele ser **bajo**, porque la probabilidad de fallas
   posteriores es mínima. **Si el riesgo es medio o alto → indica las acciones para mitigar** las posibles
   fallas.
4. **Impacto del cambio** — nivel **bajo / medio / alto** según el alcance y la magnitud de las
   modificaciones: mejoras en la operación, el rendimiento, la experiencia del usuario o la integración
   con otros sistemas, y posibles afectaciones en módulos o procesos relacionados. **Si el impacto es
   medio o alto → especifica las medidas de adopción** (comunicación, capacitación, acompañamiento o
   monitoreo posterior).
5. **Efectos de no implementarlo** — consecuencias técnicas y funcionales de NO hacer el cambio (pérdida
   de eficiencia, riesgos operativos, inconsistencias de datos, limitaciones de integración).

## Cómo clasificas Riesgo e Impacto

- Propón el nivel **con una justificación basada en hechos** del desarrollo (complejidad real, módulos
  que toca, si las pruebas pasaron, alcance de los usuarios afectados). No lo pongas a la ligera.
- El **usuario confirma o ajusta** el nivel final. Si lo cambia, ajusta la mitigación o las medidas de
  adopción en consecuencia.

## Formato de salida (plantilla)

Texto en español, limpio y breve:

```
Descripción del cambio:
<2–5 líneas>

Justificación del cambio:
<2–5 líneas>

Riesgo del cambio: <Bajo | Medio | Alto>
<breve justificación; si Medio o Alto, acciones de mitigación>

Impacto del cambio: <Bajo | Medio | Alto>
<breve descripción; si Medio o Alto, medidas de adopción>

Efectos de no implementarlo:
<2–5 líneas>
```

## Flujo de uso

1. El usuario invoca la skill (por ejemplo: "genera el control de cambios" o `/gen-changes-controls`).
2. Si aún no ha compartido el contexto del desarrollo, pídeselo: qué hizo, para qué, cómo, si tocó back,
   front o ambos, y si ya se probó. Si el desarrollo tocó ambas capas, recuerda que el control de cambios
   se redacta como uno solo (ver sección "Desarrollos que involucran back y front").
3. Con el contexto en mano, redacta los 5 apartados siguiendo las reglas de esta skill.
4. Propón el nivel de Riesgo e Impacto con su justificación. Espera confirmación o ajuste del usuario
   antes de dar el texto por definitivo.
5. Entrega el texto final en el formato de la plantilla, como texto normal y no dentro de un bloque
   de código, listo para copiar y pegar.
6. Si el usuario tiene otro desarrollo para documentar, repite el proceso desde el paso 2 con el nuevo
   contexto.

## Guardrails

- Basarse siempre en el desarrollo REAL que comparte el usuario; no inventar riesgos, pruebas, alcances
  ni beneficios que no se hayan mencionado.
- Textos breves y claros; sin relleno.
- Nivel de tecnicismo medio: ni jerga técnica excesiva, ni simplificación al punto de perder precisión.
- Manual: solo se genera con indicación explícita del usuario. Solo texto (no commit, no push, no
  integración con ningún sistema externo).
