# depuracion — Seguir el dato hacia atrás hasta la causa

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente (primera clase en el ticket 11349 de AMI, 2026-09-30).

## 1. Que problema resuelve

Un reporte de falla describe un **síntoma** ("no sale la firma"), no una **causa**. Si se arregla
donde aparece el síntoma, casi siempre se pone un parche: un `v-if` forzado o una condición extra
que tapa el problema en un caso y lo deja vivo en los demás.

Depurar es como seguir una tubería con una fuga: el agua sale en la sala, pero el tubo roto puede
estar dos pisos arriba. Se empieza donde se ve el agua y se sube, tramo por tramo, hasta encontrar
el tramo por donde entra.

## 2. Como funciona

El método, en cuatro pasos:

1. **Nombrar la decisión.** ¿Qué línea de código decide mostrar o no mostrar lo que falla? Siempre
   hay un `if`, un `v-if` o un `computed` que toma esa decisión. Se busca por el texto visible, por
   la clave de i18n o por el nombre del componente.
2. **Preguntar de qué depende esa decisión.** Una variable. ¿De dónde sale esa variable?
3. **Subir un tramo y repetir.** Variable → componente que la calcula → servicio que la consulta →
   tabla local → importación que la llena → API → filtro. En cada tramo se pregunta: *¿aquí el
   dato ya llega mal, o llega bien y se daña después?*
4. **Parar en el primer tramo donde el dato ya es incorrecto.** Esa es la causa. Arreglar más abajo
   es un parche.

Dos herramientas que alcanzan para casi todo:

- **`grep` del nombre del dato** en todo el repo, no solo en la carpeta del módulo. `grep` es el
  "Ctrl+F" de la terminal, pero sobre miles de archivos a la vez: `grep -rn "texto" src` recorre
  la carpeta (`-r`) y devuelve cada archivo y número de línea (`-n`) donde aparece. Un nombre en
  `snake_case` (`capture_staff_information`) suele cruzar de la API a la base local y a la vista
  sin cambiar.
- **`git log -S "<texto>"`**: dice en qué commit apareció una línea. Si la línea sospechosa entró
  en un ticket reciente, ese ticket explica por qué se puso, y eso es parte del diagnóstico.

## 3. Como se ve en este repo

En AMI la cadena casi siempre tiene la misma forma, por ser offline-first (ver la lección
`offline-first-sincronizacion`):

```
vista (.vue)  ->  servicio local (services/app, SQL a SQLite)  ->  importación (ImportData.vue)
      ->  servicio remoto (services/api, filtros del GET)  ->  backend
```

| Proyecto | Ejemplo | Nota |
|---|---|---|
| ami | Ticket 11349: botón "Siguiente" vs "Guardar" en Visitas Clientes | La decisión vive en un `computed` de un componente hijo; la causa estaba cuatro tramos atrás |

## 4. Errores tipicos

- **Arreglar donde se ve el síntoma.** Forzar el paso de firma en la vista cuando la causa es que
  el dato no llegó: funciona en la prueba y rompe la regla de la configuración.
- **Quedarse en un solo repo.** Si el filtro que se sospecha lo aplica el backend, hay que ir a
  mirar qué hace con él, aunque el arreglo termine siendo del front.
- **Tuyo, ticket 11349** — Proponer cambiar el backend sin leer cómo trataba el parámetro (ya era
  opcional), y agregar una protección que ya existía en otro tramo. Leer antes de proponer.
- **No preguntar por qué está la línea.** Borrar un filtro sin mirar el `git log` puede reabrir la
  falla que ese filtro corrigió.

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 11349 | ami | Visita sin preguntas que no pedía firma: la causa estaba en un filtro de la importación | 2 |

## Preguntas de cierre

1. ¿Cuál es el primer tramo de la cadena en el que el dato ya llega mal, y cómo lo demuestras?
2. Esa línea la puso alguien a propósito. ¿Qué problema estaba resolviendo, y tu arreglo lo reabre?
