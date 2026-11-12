# Retrospectiva Sprint 85 — Fabian

## AIO

### 11632 — Reporte de despachos y descargues por vehículo · Pasó: desa, QA y prod
- 🛠️ Problema abordado: La AAUD no tenía un documento para auditar la facturación cruzando cada despacho con sus descargues en el relleno.
- ❇️ Valor generado: Reportes genera PDF, y el nuevo formato muestra cada vehículo por día con sus despachos, descargues y el mapa del recorrido.
- 📚 Decisión técnica relevante: El PDF quedó como un formato más de Reportes, con filtro de varios valores y tope de 9 días, en vez de un reporte aparte.
- ✅ Aprendizaje clave: Ampliar el motor de reportes que ya existe sirve a los formatos que vengan; un reporte suelto solo resuelve un caso.
- 🚀 Mejora futura: Depurar la caché de mosaicos del mapa y quitar la dependencia del tope de 9 días con los nombres de los filtros de fecha.

### 11549 — Secuencia en frecuencia y programación (AIO y AMI) · Pasó: desa y QA
- 🛠️ Problema abordado: El operario recibía las prestaciones sin el orden de visita que la operación diseñó para la ruta.
- ❇️ Valor generado: La programación toma la secuencia de la frecuencia, se puede ajustar sin cambiar la ruta y el AMI muestra las prestaciones en ese orden.
- 📚 Decisión técnica relevante: La secuencia se guarda en la frecuencia y se copia a la programación, y admite valores repetidos para intercalar servicios especiales.
- ✅ Aprendizaje clave: Copiar un dato a la programación permite ajustarlo para un día sin alterar la configuración base de la ruta.
- 🚀 Mejora futura: No requiere.

### 11858 — Gerencia del personal desde SGH · Pasó: desa y QA
- 🛠️ Problema abordado: El personal de AIO no tenía la gerencia a la que pertenece, y llenarla a mano repetía lo que ya está en SGH.
- ❇️ Valor generado: La importación de personal asigna a cada persona la gerencia de su contrato vigente en SGH, lista para usar en Flex.
- 📚 Decisión técnica relevante: SGH predomina: en cada importación se escribe la gerencia de SGH, y nunca se asigna una gerencia inactiva.
- ✅ Aprendizaje clave: Cuando dos sistemas editan el mismo dato hay que definir cuál manda, o las diferencias pasan sin que nadie las note.
- 🚀 Mejora futura: Avisar en la pantalla de Personal que un cambio manual de la gerencia se reemplaza en la siguiente importación.

### 11730 — Semáforo de puntos de control en Despachos · No pasó: rama local
- 🛠️ Problema abordado: Para saber si una ruta se saltó puntos de control había que abrir el seguimiento vehicular y revisar el mapa punto por punto.
- ❇️ Valor generado: En Despachos, un semáforo muestra cuántos puntos alcanzó cada despacho del día y si llegó a tiempo, con el detalle por punto.
- 📚 Decisión técnica relevante: El cumplimiento y el color se calculan en cada consulta con los umbrales de la empresa, sin guardar resultados que se desactualicen.
- ✅ Aprendizaje clave: Calcular un indicador al consultarlo evita datos guardados que quedan viejos cuando cambian las reglas.
- 🚀 Mejora futura: Al revisar un día pasado se usan los puntos de control de hoy; si alguien movió o desactivó uno, el resultado de ese día cambia. Falta guardar los puntos vigentes de cada día.

### 11433 — Vista satelital en los mapas · No pasó: rama local
- 🛠️ Problema abordado: Los mapas del AIO solo mostraban el mapa dibujado y no dejaban ver el terreno real para ubicar puntos, vehículos o direcciones.
- ❇️ Valor generado: En todos los mapas del AIO el usuario puede cambiar entre Mapa y Satélite, con los nombres de las calles sobre la imagen.
- 📚 Decisión técnica relevante: Un componente de capas base compartido por todos los mapas, con la imagen satelital de Esri configurable por ambiente.
- ✅ Aprendizaje clave: Centralizar una pieza que se repite en muchas pantallas permite cambiar de proveedor tocando un solo lugar.
- 🚀 Mejora futura: Funcionalidad en espera: falta decidir si la capa satelital sigue con Esri o pasa a Google, según el costo presentado.

## SGH

### 11542 — Unidad de negocio en la planta de presupuesto · No pasó: solo desa
- 🛠️ Problema abordado: Quien prepara el presupuesto de nómina para contabilidad asignaba la unidad de negocio a mano, fila por fila, en cada versión.
- ❇️ Valor generado: Cada planta lleva su unidad de negocio en el formulario y en el cargue por Excel, y el dato sale en los reportes 800, 802 y 804.
- 📚 Decisión técnica relevante: Las unidades de negocio de cada empresa se toman de los parámetros generales, para configurarlas sin desarrollo.
- ✅ Aprendizaje clave: Un dato que cambia por empresa va en parámetros configurables, no en el código.
- 🚀 Mejora futura: No requiere.
