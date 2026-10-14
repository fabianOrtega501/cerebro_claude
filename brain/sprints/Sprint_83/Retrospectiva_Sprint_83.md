# Retrospectiva del Sprint 83 — cierre 2026-10-12

Periodo: 2026-09-28 a 2026-10-12 (10 días hábiles). Autor: Fabian.

## AIO

### Maestro Costos de Operación — ticket 11308
- **Problema abordado:** Comercial no sabía cuánto cuesta operar cada cliente, ni qué costo pactado regía cuando este cambiaba durante el año.
- **Valor generado:** Nuevo maestro Costos de Operación en Green: costo por cliente y línea de negocio con su vigencia, historial, estados y anulación.
- **Decisión técnica relevante:** El estado (Vigente, Programada, Vencida) se calcula al consultar con la fecha de la empresa, y el cruce de vigencias se valida en el servidor.
- **Aprendizaje clave:** Reutilizar las piezas estándar del repositorio evita reprocesos en la revisión y mantiene el código uniforme.
- **Mejora futura:** Alinear el permiso del botón Anular, que en pantalla usa el de eliminar mientras el servidor exige el de editar.

### Observación propia por técnico en las actividades de la OT — ticket 11254
- **Problema abordado:** Los técnicos no tenían cómo registrar ni consultar su propia observación por actividad de la OT, y la ejecución masiva no tenía filtros.
- **Valor generado:** Cada técnico escribe y ve su observación en la OT, en la ejecución masiva y al finalizar la actividad; la ejecución masiva ya tiene filtros.
- **Decisión técnica relevante:** Se creó un servicio que guarda solo la observación, para no recalcular costos y horas ni volver a cerrar la OT.
- **Aprendizaje clave:** Que las pruebas automáticas pasen no basta: un dato que se guarda se prueba en pantalla por cada camino que lo edita.
- **Mejora futura:** Mostrar un mensaje claro cuando falla la ejecución masiva, que hoy muestra la ruta interna del campo, y agregar pruebas al front.

### Salida No Conforme en Novedades de Operaciones — ticket 11041
- **Problema abordado:** La Salida No Conforme se marcaba al crear la novedad, aunque es resultado de su gestión, y aparecía también en novedades de Personal y Mantenimiento.
- **Valor generado:** Ahora se indica al cerrar la novedad, solo en las de Operaciones y con su concepto obligatorio; además, el cierre muestra la etiqueta Solución.
- **Decisión técnica relevante:** La regla se valida en el servidor, no solo se oculta en pantalla, y los registros anteriores se conservan sin cambios.
- **Aprendizaje clave:** Una regla de negocio que solo se oculta en pantalla no protege el dato: el servidor debe rechazar lo que no la cumpla.
- **Mejora futura:** Mostrar la Salida No Conforme en el PDF de la novedad y permitir corregirla después del cierre.

### Permisos independientes para los dashboards — ticket 10615
- **Problema abordado:** Para ver un dashboard se necesitaba el permiso de la pantalla de gestión relacionada, y varios no tenían permiso propio.
- **Valor generado:** Cada dashboard tiene su propio permiso en Roles, agrupado en Operaciones y Comercial; quien no tenga ninguno ve un aviso claro.
- **Decisión técnica relevante:** Dos niveles: el permiso de la página abre el menú y uno por dashboard controla la gráfica y su consulta en el servidor.
- **Aprendizaje clave:** Separar el permiso de ver del de gestionar permite dar acceso a los reportes sin abrir la edición de los datos.
- **Mejora futura:** Asignar los nuevos permisos a los roles con una migración: después del despliegue nadie ve los dashboards hasta que se asignen.

## SIPA

### Cargue de toneladas sin el mes procesado — ticket 11180
- **Problema abordado:** Si un municipio no tenía toneladas del mes procesado, SIPA rechazaba el cargue y el analista agregaba una fila en 0 al archivo.
- **Valor generado:** Los archivos se cargan tal como llegan: el sistema avisa que falta el mes procesado y el usuario decide si continúa.
- **Decisión técnica relevante:** Una prueba mostró que la fórmula ya promediaba el semestre anterior, así que se cambió el rechazo por una confirmación sin tocar el cálculo.
- **Aprendizaje clave:** Probar el comportamiento actual antes de cambiar una fórmula evita reescribir lo que ya funciona.
- **Mejora futura:** Evitar que un mes mal escrito en el archivo se convierta en diciembre sin aviso, y conectar SIPA a la nueva API de Status.

## AMI

### Firma del cliente en visitas PQRS de Green — ticket 11349
- **Problema abordado:** En Green, algunas visitas, como las de PQRS, no pedían la firma del cliente y se guardaban sin ella.
- **Valor generado:** Esas visitas ya abren la ventana de firma, con autorización y testigo, después de importar de nuevo Visitas Clientes.
- **Decisión técnica relevante:** Se corrigió en el origen: se quitó el filtro que solo bajaba al celular los formularios con preguntas, en vez de forzar la firma en pantalla.
- **Aprendizaje clave:** En una app que trabaja sin conexión, los datos cambian solo al importar de nuevo; reinstalarla borra lo que no se ha enviado.
- **Mejora futura:** Confirmar que quitar ese filtro no trae de vuelta la falla que el filtro corregía.
