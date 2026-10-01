# offline-first-sincronizacion — Apps offline-first: importar, trabajar sin red y enviar

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente (creado en el ticket 11349 de AMI, 2026-09-30).

## 1. Que problema resuelve

El operario de campo pasa horas sin señal: en un relleno sanitario, en un sótano o en una vereda.
Si la app necesitara la API para cada pantalla, dejaría de funcionar justo donde más se usa.

La solución es trabajar como un **vendedor con catálogo impreso**. En la mañana, con wifi en la
oficina, se lleva una copia del catálogo (**importar**). Durante el día anota los pedidos en su
libreta, sin llamar a nadie (**trabajar**). En la tarde vuelve y entrega la libreta (**enviar**).

La consecuencia importante: **durante el día, la app solo sabe lo que se llevó en la mañana.** Lo
que no se importó no existe para ella, aunque sí exista en el servidor.

## 2. Como funciona

Tres momentos, cada uno con su dueño:

| Momento | Quién habla con quién | Qué garantiza |
|---|---|---|
| Importar | API → SQLite local | Que la copia local sea la que el servidor entregó en ese momento |
| Trabajar | Pantalla ↔ SQLite local | Que todo funcione sin red |
| Enviar | SQLite local → API, por lotes | Que lo capturado suba, y que lo que no subió se pueda reintentar |

Tres ideas para decidir bien:

- **La importación es un filtro.** Casi siempre no se trae "todo": se trae lo de esta empresa, de
  este usuario, de hoy, activo. Cada filtro es una decisión de negocio: *"esto el operario no lo
  va a necesitar"*. Si esa decisión es equivocada, la pantalla falla horas después y lejos del
  filtro, con un síntoma que no se parece a la causa.
- **La pantalla no sabe por qué falta un dato.** Para la consulta local, "no se importó" y "no
  existe" son lo mismo: la fila no está. Por eso una falla en campo casi nunca se ve en la vista;
  hay que ir hacia atrás.
- **Importar reemplaza.** En AMI la importación borra lo de la empresa y vuelve a insertar. Cambiar
  el filtro cambia lo que habrá en el celular desde la siguiente importación, no antes.

## 3. Como se ve en este repo

El trío de pantallas se repite por módulo (`ImportData.vue`, la vista del módulo, `SendData.vue`).
El caso de Visitas Clientes de Green:

| Proyecto | Ejemplo | Nota |
|---|---|---|
| ami | `src/views/pages/modules/respel/ImportData.vue:433` (`importDynamicForms`) | Borra por empresa y vuelve a insertar maestros, tipos de visita y campos |
| ami | `src/services/api/modules/respel/commercial-advisor-visits/CommercialAdvisorVisitsApi.ts:46` (`getAllForm`) | **Aquí están los filtros de la importación**: empresa, activo, y otros dos |
| ami | `src/services/app/modules/respel/commercial-advisor-visits/DynamicFormMastersService.ts:17` (`loadLocal`) | Lo que la pantalla consulta: solo la copia local |
| ami | `src/services/app/DatabaseService.ts:113` (`tableIntegrated`) | Decide si el módulo "ya tiene datos" para trabajar |
| ami | `src/views/pages/modules/respel/SendData.vue:457` (`getToSend`) | El envío: solo lo pendiente |

## 4. Errores tipicos

- **Filtrar en la importación por una condición que la pantalla no necesita.** Se ve como una
  optimización ("¿para qué traer lo que no tiene X?"), pero si alguna regla de la pantalla depende
  de esa fila por otra razón, la regla deja de cumplirse en silencio.
- **Buscar la falla solo en la pantalla.** La vista hace bien su trabajo con los datos que tiene;
  el problema es que no los tiene.
- **Probar sin volver a importar.** Cambiar el filtro y mirar la pantalla sin importar de nuevo
  muestra el comportamiento viejo, y lleva a pensar que el cambio no sirvió.
- **Tuyo, ticket 11349** — Creer que cerrar sesión o reinstalar refresca los datos. Lo que los
  refresca es volver a importar; reinstalar además borra lo que no se ha enviado.
- **Escribir directo a la API desde la pantalla** para esquivar el problema: rompe el modo sin red.

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 11349 | ami | Un maestro de formulario sin preguntas no llegaba al celular y la visita no pedía firma | 2 |

## Preguntas de cierre

1. Si un filtro de la importación deja fuera un registro, ¿en qué pantalla y en qué momento lo va a
   notar el operario?
2. Al quitar o cambiar un filtro de importación, ¿qué otra pantalla que use esa misma tabla local
   podría cambiar de comportamiento?
3. ¿Cómo compruebas el arreglo si el celular ya tiene la copia vieja?
