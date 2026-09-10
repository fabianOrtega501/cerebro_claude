# Retrospectiva del Sprint 81 — cierre 2026-09-09

Periodo: 2026-08-26 a 2026-09-09 (10 días hábiles). Autor: Fabian.

## AIO

### Permisos granulares de acciones — tickets 10810, 10811, 10812
- **Problema abordado:** Varias acciones delicadas se le mostraban a cualquier usuario o quedaban amarradas al permiso de otra función.
- **Valor generado:** Cada cliente define quién consulta, edita o reporta en elementos, categorías AVL y novedades de inspección.
- **Decisión técnica relevante:** Se creó un permiso propio para las novedades de inspección y se heredaron los accesos que los usuarios ya tenían.
- **Aprendizaje clave:** Un permiso mal ubicado solo se nota cuando quitarlo no cambia nada: dos menús con la misma dirección lo escondían.
- **Mejora futura:** Revisar de una sola vez los menús repetidos, en lugar de irlos encontrando ticket por ticket.

### Log de despachos legible — ticket 9357
- **Problema abordado:** El historial de cambios de un despacho mostraba los nombres técnicos de los campos y no se entendía.
- **Valor generado:** El usuario lee el historial en su idioma y con el nombre real de cada campo.
- **Decisión técnica relevante:** Los títulos se traducen siguiendo el nombre del campo, y si alguno no tiene traducción se muestra tal cual.
- **Aprendizaje clave:** Dejar una salida por defecto evita que la pantalla se dañe cuando llegue un campo nuevo.
- **Mejora futura:** Que el nombre para mostrar venga del servidor y no lo arme cada pantalla.

### Clasificación de trabajo sin duplicados — ticket 10845
- **Problema abordado:** Se podían guardar dos clasificaciones activas con el mismo cargo para un mismo puesto y los filtros de personal quedaban con datos repetidos.
- **Valor generado:** El sistema no deja repetir el cargo al guardar y los registros repetidos que ya existían quedaron corregidos.
- **Decisión técnica relevante:** La validación quedó en el servidor, que es el que decide; la pantalla solo bloquea los cargos restantes.
- **Aprendizaje clave:** No basta con evitar el error de ahora en adelante: limpiar lo que ya estaba mal es parte del trabajo.
- **Mejora futura:** Quedaron registros sin cargo o con varios que solo se dejaron anotados; falta definir qué hacer con ellos.

## Status

### Densidad de compactación — ticket 10919
- **Problema abordado:** La densidad de compactación del sitio de disposición se calculaba por fuera del sistema.
- **Valor generado:** Se calcula al registrar las variables técnicas, queda guardada y aparece en el listado, el resumen y el archivo de Excel.
- **Decisión técnica relevante:** El cálculo se hace en el servidor y la pantalla solo lo muestra mientras se llena el formulario.
- **Aprendizaje clave:** Cuando la misma fórmula queda en dos lados, hay que dejar claro cuál es la que vale.
- **Mejora futura:** El rediseño del formulario entró junto con el campo nuevo; separados se revisan más fácil.

### Varios formularios por trámite — ticket 10841
- **Problema abordado:** Un trámite solo aceptaba un formulario, aunque en la operación real agrupa varios con periodos distintos.
- **Valor generado:** El usuario asocia varios formularios a un mismo trámite, cada uno con su periodicidad y sus formatos afectados.
- **Decisión técnica relevante:** Se creó una tabla intermedia y el cambio se hizo por etapas para no perder los trámites ya registrados.
- **Aprendizaje clave:** Guardar el trámite en una sola operación evita que quede a medias si algo falla en el camino.
- **Mejora futura:** En la misma rama entraron ajustes que no eran del ticket; conviene dejarlos aparte.

## También se realizaron (solo mención)

- **10614 — Manejo de errores en asistentes de capacitaciones (AIO):** los errores no controlados dejan de mostrarle el detalle técnico al usuario, y los intentos fallidos de ingreso ya no se registran como fallas del sistema.
- **10898 — Mejora del captcha (AIO):** se rediseñó el captcha del ingreso y del registro de asistencia, y las vistas de queja y seguimiento pasaron a usar el componente central.
- **10830 — Restricción de caracteres en el detalle de salida (app móvil):** el campo queda marcado como obligatorio y se retira el filtro de caracteres, dejando solo el límite de cantidad.

## Fuera del slide

- 10675 Plataforma Gestión Operativa (decisión del autor).
- Ramas sin número de ticket: ajuste de búsqueda de eventos, arreglo de lectura de id encriptado, ajustes de redimensionamiento de columnas.
- En la rama de 10830 del backend viaja otro cambio (tolerancia al enviar la visita desde el móvil) que no corresponde al enunciado del ticket.
