# Flujo del cerebro — mapa mental

> Complementa el [README](README.md). Aqui esta **como se encadenan** las piezas; alla, que es
> cada una.

## La respuesta corta

**Las skills no se llaman solas.** `start-development` no dispara a las demas. Lo que existe es:

| Mecanismo | Quien decide | Ejemplo |
|---|---|---|
| **Automatico** | El programa | Un hook salta con `git pull` o `git push`, sin que nadie lo pida |
| **Encadenado** | Claude, leyendo el `SKILL.md` | `start-development` termina y dice "sigue con `fullstack-ticket`" |
| **Delegado** | Claude, dentro de una skill | Los pasos mecanicos se van a un subagente en Sonnet |
| **Manual** | Tu | `/gen-changes-controls` solo corre si lo pides |

Un encadenamiento **no es automatico**: se propone y tu puedes decir que no. La unica pieza que
actua sin preguntar es el hook, y ninguno de los tres escribe nada: solo avisan.

---

## Mapa

```mermaid
flowchart TD
    U(["Tu"]) -->|"/start-development"| SD["<b>start-development</b><br/>proyecto, ramas al dia,<br/>crear rama, enunciado"]
    U -->|"/fullstack-ticket aio"| FT
    U -->|"/gen-changes-controls"| GC["<b>gen-changes-controls</b><br/>texto del control de cambios"]

    SD -.->|"delega pasos 2 y 3"| BS["<b>branch-starter</b><br/><i>subagente · Sonnet</i>"]
    BS -.->|"rama creada"| SD

    SD --> M{{"modo del ticket?<br/><i>lo elige el usuario</i>"}}
    M ==>|"entrega"| Q
    M ==>|"practica"| PT["<b>practice-ticket</b><br/>1. clase de los temas<br/>2. el escribe, yo guio<br/>3. review exigente"]
    PT ==> Q
    PT <-.->|"lecciones, bitacora y temario"| LRN[("brain/learning<br/><i>el material y que sabe hacer</i>")]

    Q{{"que lado toca?<br/><i>lo declara el usuario</i>"}}
    Q ==>|"front"| DEVF["Desarrollo normal<br/><i>solo el repo del front</i>"]
    Q ==>|"back"| DEVB["Desarrollo normal<br/><i>solo el repo del back</i>"]
    Q ==>|"los dos · no lo se"| FT["<b>fullstack-ticket</b><br/>contrato antes de codificar"]
    DEVF -.->|"aparece que falta el otro lado"| FT
    DEVB -.->|"aparece que falta el otro lado"| FT
    FT -.->|"si esta en rama protegida"| SD

    FT ==> DEV["Desarrollo<br/><i>codigo en los dos repos</i>"]
    DEVF --> PUSH
    DEVB --> PUSH

    DEV --> PUSH[["git push"]]
    DEV --> PULL[["git pull / merge"]]

    PUSH -->|"hook<br/>docs-on-push"| H1{{"Quedo documentacion<br/>sin actualizar?"}}
    H1 ==>|"cambio regla de negocio"| UTD["<b>update-tech-docs</b><br/>docs/ del backend"]
    H1 ==>|"cambio una pantalla"| UM["<b>update-manual</b><br/>manual web, capturas reales"]

    PULL -->|"hook<br/>claude-upstream-notice"| H2{{"Cambio el .claude/<br/>del repo?"}}
    H2 ==> SB["<b>sync-brain</b><br/>clasifica y recomienda"]
    SB -.->|"solo lo aprobado"| BRAIN[("~/.claude<br/><i>el cerebro</i>")]

    APR{{"aparecio algo que<br/>vale para la proxima?"}} -.->|"se propone, tu apruebas"| BRAIN
    DEV -.-> APR
    DEVF -.-> APR
    DEVB -.-> APR

    BRAIN -->|"hook<br/>brain-unpushed-notice"| H3{{"queda algo sin<br/>commitear o sin subir?"}}
    H3 ==> RESP[["git push backup main<br/>git push github main"]]

    UTD -.->|"si tambien cambio la UI"| UM

    classDef skill fill:#1f6feb,stroke:#1f6feb,color:#fff
    classDef agent fill:#8250df,stroke:#8250df,color:#fff
    classDef hook fill:#bf8700,stroke:#bf8700,color:#fff
    classDef user fill:#1a7f37,stroke:#1a7f37,color:#fff
    class SD,FT,UM,UTD,SB,GC,PT skill
    class BS agent
    class H1,H2,Q,M hook
    class U user
```

**Leyenda de las flechas**

- `===>` encadenado: se propone y puedes decir que no.
- `- - >` delegado o de vuelta.
- `--->` disparo automatico del hook.

> El diagrama es Mermaid. GitLab lo renderiza solo; **la vista previa de VS Code no**, hace falta
> la extension *Markdown Preview Mermaid Support*. Debajo esta el mismo mapa en texto plano, que
> se ve en cualquier sitio.

---

## El mismo mapa, sin extensiones

```
  TU
   │
   ├── /start-development ─────────────────────────────────┐
   │        1. que proyecto            (pregunta)          │
   │        2. ramas al dia      ─┐                        │
   │        3. crear rama         ├─► branch-starter       │
   │                              │   (subagente, Sonnet)  │
   │        4. enunciado + QUE LADO TOCA + QUE MODO        │
   │              │                                        │
   │      modo practica ──► /practice-ticket               │
   │        1. CLASE de los temas del ticket               │
   │           (material en learning/lessons/)             │
   │        2. tu escribes, yo guio con pistas             │
   │        3. review exigente, tu corriges                │
   │        4. bitacora y temario en learning/             │
   │              │                                        │
   │      front ──┼── back ── los dos / no lo se            │
   │        │     │     │           │                       │
   │        ▼     │     ▼           │                       │
   │   desarrollo solo un repo      │                       │
   │        │                       │                       │
   │        └── aparece que falta ──┤                       │
   │            el otro lado        │                       │
   │                              │                        │
   │                              ▼                        │
   ├── /fullstack-ticket aio ◄────┘                        │
   │        0. situarse ── en rama protegida? ─► vuelve a start-development
   │        1. encuadrar                                   │
   │        2. reconocer                                   │
   │        3. FIJAR EL CONTRATO   ◄── punto de control    │
   │        4. ejecutar los dos lados                      │
   │        5. verificacion cruzada                        │
   │        6. cierre                                      │
   │                              │                        │
   │                              ▼                        │
   │                        DESARROLLO                     │
   │                         /        \                    │
   │                 git push          git pull            │
   │                    │                  │               │
   │       [hook docs-on-push]   [hook claude-upstream]    │
   │                    │                  │               │
   │        ┌───────────┴──────┐           ▼               │
   │        ▼                  ▼      /sync-brain          │
   │  /update-tech-docs  /update-manual    │               │
   │   docs/ del back     manual web       ▼               │
   │                                  absorbe al cerebro   │
   │                                                       │
   └── /gen-changes-controls  (suelta, cuando la pidas) ───┘
```

---

## Que pasa exactamente al escribir `/start-development`

1. **Lee lo que ya dijiste.** Si escribiste `/start-development aio feature desa 10842 Descripcion`,
   reconoce los cinco datos en cualquier orden y no pregunta nada.
2. **Pregunta lo que falte.** Proyecto siempre primero, y **nunca deducido** del directorio.
3. **Delega a `branch-starter`** (Sonnet) actualizar ramas y crear la rama, si no falta ningun dato.
4. **Te pide el contexto**: enunciado, recurso nuevo o ajuste, modulo de referencia.
5. **Se detiene y enruta segun el lado que declaraste:** los dos o "no lo se" -> propone
   `fullstack-ticket`; un solo lado -> desarrollo normal en ese repo. **Propone; no arranca solo.**
6. **Y segun el modo:** en `practica`, encadena `practice-ticket`, que conduce el desarrollo
   entero —clase primero, luego tu tecleas y yo guio y reviso—. En `entrega`, todo sigue como
   siempre.

Lo que **no** hace: no commitea, no empuja, no resuelve divergencias, no borra ramas.

---

## Cuando interviene cada skill

| Momento | Skill | Como llega |
|---|---|---|
| Antes de escribir codigo | `start-development` | La pides tu |
| El ticket se hace como ejercicio (clase + desarrollo tuyo) | `practice-ticket` | Encadenada si elegiste modo practica |
| El ticket cruza front y back | `fullstack-ticket` | Encadenada, o la pides |
| A mitad del desarrollo aparece el otro lado | `fullstack-ticket` | Reclasificacion: se avisa, se crea la rama que falta y se entra por la Fase 3 |
| Cambio una regla de negocio del back | `update-tech-docs` | Hook del push, o la pides |
| Cambio algo que el usuario ve | `update-manual` | Hook del push, o al cerrar `fullstack-ticket` |
| Un pull trajo cambios en `.claude/` | `sync-brain` | Hook del pull |
| Hay que entregar el control de cambios | `gen-changes-controls` | Solo manual |

---

## Lo que ningun automatismo hace por ti

- **Redactar la documentacion.** Los hooks avisan; escribir exige entender *por que* cambio algo,
  y eso muchas veces solo lo sabes tu.
- **Generar el manual en un push.** Necesita Chrome, dev server, backend con datos y **revisar las
  capturas**. Tarda de 2 a 4 minutos y una corrida puede salir con el mapa a medio dimensionar.
- **Absorber cambios del equipo.** `sync-brain` clasifica y recomienda; aprobar es tuyo.
- **Commitear.** Ninguna skill commitea en un repo de trabajo sin que lo pidas.
- **Aprender por ti.** En modo practica hay clase antes del codigo, pero el codigo lo escribes tu:
  la skill da pistas graduadas y revisa, y no teclea. Salirse del modo lo decides tu, en cualquier
  momento.
