---
name: exploration-memory
description: >-
  Usar al empezar un ticket para saber si el modulo que se va a tocar YA esta mapeado, y al terminar
  para guardar lo que se aprendio de el. Guarda el mapa TECNICO de un modulo —permisos, rutas y su
  controlador, servicios, consultas, modelos y tablas, y los archivos del front— para no releer el
  mismo codigo en cada ticket. NO guarda reglas de negocio: esas van al `docs/` del repo con
  `update-tech-docs`. Sirve para cualquier proyecto con perfil de exploracion. Dispara con "ya
  exploramos este modulo?", "que sabemos de", "donde esta el endpoint de", "mapea el modulo".
---

# Memoria de exploracion

El mapa tecnico de un modulo, guardado en el cerebro para que el siguiente ticket que caiga ahi
arranque con el plano en la mano en vez de releer el codigo desde cero.

**Que es y que no es.** Aqui va lo **tecnico**: que endpoint atiende cada accion, que permiso la
exige, que servicio la resuelve, que tabla toca. El **porque** de una regla de negocio no va aqui
—va al `docs/` del repo, y de eso se encarga `update-tech-docs`—. La frontera es la misma de
siempre: esto responde *donde esta*, aquello responde *por que es asi*.

**Tampoco es el manual de usuario**, que cuenta lo que el usuario ve y vive en otro repo.

## Donde vive

```
brain/projects/<proy>/exploration/
    index.md              una linea por modulo, con su estado
    modules/<slug>.md     el mapa de un modulo
```

Un modulo, un archivo. El `<slug>` va en **ingles y kebab-case**, formado por el modulo del backend
y el submodulo: `settings-reports.md`, `operation-dispatches.md`. En un proyecto que es solo movil
—AMI, Ruta+— sobra el prefijo `mobile-` que en AIO marca los modulos de la app: ya lo da la carpeta.

**No hay archivo de configuracion.** Lo que hace falta ya esta escrito: `stack.json` da los repos,
sus roles y sus contenedores; `docs/profile.json` da el vocabulario de modulos del backend. Si
alguna vez hiciera falta algo mas, va en esos perfiles, no en uno nuevo.

## Al empezar un ticket

1. **Mirar el indice** del proyecto. Si el modulo esta, leer su archivo antes de abrir el codigo.
2. **Mirar el estado**, que dice cuanto se puede confiar:

| Estado | Que hacer |
|---|---|
| `explorado` | Usarlo. Esta verificado contra el codigo |
| `importado, sin verificar` | Usarlo como punto de partida y **verificar lo que se vaya a tocar** antes de decidir nada sobre ello |
| `parcial` | Lo que falta esta dicho al final del archivo |

3. **Si el modulo no esta**, no es obligatorio mapearlo: se hace el ticket y, al cerrar, se guarda
   lo que se aprendio. Mapear un modulo entero por adelantado solo vale la pena si el ticket va a
   recorrerlo completo.

**Un mapa desactualizado en el que se confia es peor que no tener mapa.** Por eso el estado es la
primera columna del indice y no un detalle: lo que distingue un plano util de uno que manda a
buscar un endpoint que ya no existe.

## Al cerrar un ticket

Solo si se aprendio algo que sobreviva al ticket:

1. Crear o **actualizar** `modules/<slug>.md` con la plantilla de abajo. Nunca crear un segundo
   archivo del mismo modulo.
2. Llenar **solo lo verificado**. Lo que no se comprobo se deja fuera o se marca `pendiente`; una
   fila inventada es exactamente el daño que esta memoria viene a evitar.
3. Si se verifico contra el codigo un archivo `importado, sin verificar`, **subirlo a
   `explorado`** y poner la fecha de hoy.
4. Actualizar su linea en `index.md`.

**Nunca escribir aqui una credencial, un nombre de cliente ni un id de empresa.** Van en
`secrets.env` y se referencian por su variable: `$AIO_COMPANY_NAME`, `$AIO_TEST_EMAIL`.

## Plantilla de `modules/<slug>.md`

Las secciones que no apliquen se omiten; no se dejan vacias.

```markdown
# <Ruta del modulo tal como se ve en el menu>

- Ruta (URL): <path>  |  Modulo del backend: <Nombre>  |  Estado: `<estado>`  |  Actualizado: AAAA-MM-DD

## Permisos
| Subject (ruta) | Abilities | Donde se exige (router del front / middleware del back) |

## Rutas / Endpoints
| Metodo | Endpoint | Controlador@metodo | Accion de la interfaz que lo dispara | Permiso |

## Servicios y consultas
| Clase (archivo) | Metodos | Que resuelve tecnicamente |

## Modelos / Tablas
| Modelo | Tabla | Relaciones | Indices o defaults que importan |

## Front
| Vista | Servicio | Estado compartido | Notas |

## Pendiente
<que quedo sin mapear, y por que>
```

## Reglas

- **`index.md` es un indice, no un resumen**: una linea por modulo, sin volcar contenido.
- **Las fechas, absolutas.** "La semana pasada" no significa nada dentro de tres meses.
- **Enlaces al codigo relativos y al archivo real**, para que se rompan de forma visible cuando
  algo se mueve: esa es la señal de que el mapa quedo viejo.
- **Un hallazgo que no es de un modulo concreto no va aqui.** Si es una restriccion del entorno o
  una correccion sobre como trabajar, es una memoria: donde va —`<repo>/.claude/memory/` o
  `projects/<repo>/memory/`— lo decide `manage-memory`. No se abre una segunda memoria en paralelo.

## Agregar un proyecto

Crear `brain/projects/<proy>/exploration/modules/` y su `index.md`. Nada mas: la skill no se toca.
