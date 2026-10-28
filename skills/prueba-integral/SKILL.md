---
name: prueba-integral
description: Usar antes de commitear un desarrollo, cuando hay que probar de verdad y no solo comprobar que compila: deriva del diff todo lo que el cambio puede haber afectado, lo prueba flujo por flujo y entrega una tabla de cobertura donde cada archivo tiene su fila. Dispara con "pruebas exhaustivas", "pruebas profundas", "revisa todo lo que se pueda ver afectado", "que no se nos escape nada". La corre `finish-development` en su Fase 2b. Sirve para cualquier proyecto.
---

# Prueba integral

Probar el cambio entero, no lo que a uno se le ocurra mirar.

**Por que existe.** En el ticket 7433 se verificaron 65 rutas y las cuatro devoluciones de QA
siguieron saliendo: ninguna se rompia al abrir la pantalla, se rompian al **usarla**. Probar que
una vista carga no es probar que una funcionalidad trabaja, y "no se me ocurrio probar eso" no es
un metodo.

**La regla que ordena todo lo demas:** cada archivo del diff termina con una fila en la tabla de
cobertura. **Lo que no se probo se dice.** Un "todo bien" sin tabla no es una prueba integral.

## Los dos tamaños

| Cuando | Que exige |
|---|---|
| **Normal**, en cualquier cierre | Una fila por archivo del diff, con como se probo. Cinco archivos son cinco filas |
| **Exhaustiva**: el usuario la pide, o el diff pasa de ~20 archivos | Ademas: flujos ejecutados con evidencia, casos limite, y los consumidores en los otros repos |

## Fase 1 — Inventario del impacto

```bash
node ~/.claude/skills/prueba-integral/lib/impact-inventory.mjs --base <rama base>
```

Por cada archivo devuelve que tipo de cambio es, que simbolos se tocaron y **quien los consume en
los demas repos**. Con cincuenta archivos esto a mano no se hace, y por eso se saltaba.

**Cuenta lo que esta sin commitear, y los archivos nuevos.** La skill se corre antes del commit, asi
que el trabajo todavia esta en el working tree: compara contra el punto donde la rama se separo de su
base, no contra `HEAD`. Con `base...HEAD` devolvia cero archivos justo cuando mas se la necesita; paso
en el 7433 con 65 archivos sin commitear.

**`--tambien <ruta>` para el repo que consume este pero vive en otro proyecto.** `projects.json`
agrupa por proyecto, y hay repos que cruzan: `status-api` sirve a Status **y a SIPA**, asi que
SIPA no sale solo. Olvidarlo fue lo que dejo nueve servicios de SIPA sin adaptar.

El inventario es el punto de partida, no el resultado: dice **donde mirar**, no si algo esta bien.

## Fase 2 — La pregunta que corresponde a cada cambio

Cada tipo de cambio tiene su error tipico. Esta tabla **sale de devoluciones reales**: cada fila es
algo que ya costo una devolucion. Cuando aparezca una nueva, se agrega su fila, aqui y en el script.

| Si el cambio es… | Hay que comprobar | De donde salio |
|---|---|---|
| Se abre una transaccion | Toda escritura dentro del bloque, **por que conexion va**. Otra conexion no ve lo que aun no se confirmo | F7: todo primer cargue fallaba por llave foranea |
| Cambia una firma o un tipo | Todos los llamadores y que tipo declaran | F8: `deLaEmpresa` paso a arreglo y el llamador pedia objeto |
| Cambia una clave de la respuesta | Los consumidores **en todos los repos**, incluido el que cruza proyectos | `archivoLog` contra `log` |
| Se borra un manejo de error | Que lo reemplaza y **bajo que respuesta del backend se activa** | F10: Reversiones dejo de avisar |
| Cambia como se arma una URL | Que el destino se alcance **desde donde corre el codigo**, no solo desde el navegador | Las fuentes del PDF: el contenedor no alcanzaba su propio dominio |
| Se migra codigo de otro repo | Que sus vistas, imagenes, fuentes y rutas **existan aqui** | F3: faltaban las plantillas del acta |

## Fase 3 — Ejecutar, no mirar

**Se prueba el flujo, no la pantalla.** Por cada funcionalidad tocada: hacer la accion con datos
reales y observar el resultado. "La vista carga" no es un resultado.

**Se mide el entregable, no el insumo.** Si sale un PDF, se inspecciona el PDF —`pdffonts`, paginas,
contenido—; si sale un Excel, se abre. Comprobar que el archivo de origen existe no prueba nada: las
fuentes Candara estaban en disco y el PDF salia con otra tipografia.

**Los casos que QA prueba primero**, y que son donde aparecieron los dos bloqueantes:

| Caso | Por que |
|---|---|
| El **primer** registro de un periodo, empresa o cliente | Sin datos previos el flujo toma otro camino. Asi salio F7 |
| El periodo o estado **abierto**, no el cerrado | El cerrado ya no se usa; el abierto es el que importa. Asi salio F8 |
| La entidad **sin datos** y el campo **vacio** | Donde aparecen los `null` que nadie espera |
| El segundo intento, tras uno fallido | Deja estado a medias |

**Toda correccion lleva una prueba que falle sin ella.** Se comprueba reintroduciendo el error y
viendo fallar la prueba. Una prueba que no se vio fallar no esta verificada: esta escrita.

## Fase 4 — La tabla de cobertura

Es el entregable. Una fila por archivo del diff:

| Archivo | Como se probo | Resultado |
|---|---|---|
| `app/Services/.../CargueCsvService.php` | Primer cargue de un periodo sin transaccion, con la llave foranea | 2 filas guardadas; falla al revertir el arreglo |
| `resources/views/PDF.blade.php` | Acta generada; `pdffonts` y revision visual | Candara y Candara-Bold, `emb=yes` |
| `docs/configuracion-por-ambiente.md` | **No se probo**: es documentacion | — |

Las filas de "no se probo" son las importantes: son las que el usuario puede cuestionar. Esconderlas
es lo que convierte una prueba en una devolucion.

**El set de pruebas de `gen-test-set` sale de esta tabla**, no se escribe de nuevo: aqui estan los
casos y su resultado.

## Como se dice el resultado

- **No se escribe "verificado" sin la evidencia al lado**: el numero, la salida, la captura.
- Si no se ejecuto, se dice **"no lo probe"**. No "deberia funcionar".
- Un conteo se cuenta antes de decirlo. Decir "hay cuatro casos" y que sean dos quita credibilidad
  a todo el resto del informe.

## Guardrails

- Solo lecturas contra cualquier ambiente que no sea local, y la guarda de ambientes manda.
- Lo que la prueba cree en la base lo borra al terminar, y se comprueba que quedo limpio.
- Una prueba que necesita datos que no existen **se declara como no ejecutada**; no se inventa el
  resultado ni se da por buena.
