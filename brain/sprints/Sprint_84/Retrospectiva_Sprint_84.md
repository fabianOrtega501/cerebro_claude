# Retrospectiva del Sprint 84 — cierre 2026-10-27

Periodo: 2026-10-13 a 2026-10-27 (10 días hábiles). Autor: Fabian.

## AIO

### Estado del vehículo por inspección — ticket 11491
- **Problema abordado:** Al rechazar una inspección en Control Vehicular, el vehículo seguía disponible y AVL no se enteraba.
- **Valor generado:** El vehículo rechazado queda No apto por inspección vehicular, con su alerta en GPS, y vuelve a Disponible al aprobarse.
- **Decisión técnica relevante:** Una sola regla en el servidor para AIO y AMI, que registra el evento en gps.events para que AVL genere la alerta.
- **Aprendizaje clave:** Una regla en un solo punto, usada por todos los canales, evita que la web y el celular se comporten distinto.
- **Mejora futura:** Al aprobar, devolver el vehículo al estado que tenía antes del rechazo y no siempre a Disponible.

### Visitas del dashboard — ticket 11442
- **Problema abordado:** Las visitas del dashboard no cuadraban con el Reporte Seguimiento y Visitas, que es la base de las comisiones de los gestores.
- **Valor generado:** Los buscadores de la visita solo ofrecen clientes de la empresa en sesión, y el sistema rechaza los de otra empresa.
- **Decisión técnica relevante:** La pantalla enviaba el filtro de empresa con un nombre que la API ignoraba; se corrigió y se validó también en el servidor.
- **Aprendizaje clave:** Un filtro que la API descarta en silencio no da error; lo que el usuario no debe enviar se valida en el servidor.
- **Mejora futura:** Anular las visitas mal asociadas que ya existen y validar la empresa también al editar una visita.

### Tarjetas de indicadores del Dashboard de Despachos — ticket 11467
- **Problema abordado:** El Dashboard de Despachos no mostraba toneladas, kilómetros recorridos ni personal en las rutas del plan operativo.
- **Valor generado:** Tres tarjetas nuevas, Toneladas, Km recorridos y Personal participante, que responden a los filtros del dashboard.
- **Decisión técnica relevante:** Los kilómetros salen del odómetro de los desplazamientos de cada despacho, no del GPS, por el costo de la consulta.
- **Aprendizaje clave:** Un indicador aproximado se documenta con su regla de cálculo, para que nadie lo tome como un dato exacto.
- **Mejora futura:** Contar el tramo anterior al primer desplazamiento y confirmar si los despachos en operación deben sumar.

### Portal Ciudadano: redes sociales y PQR — ticket 11488, 11411
- **Problema abordado:** El portal no mostraba las redes de la empresa, PQR no tenía acceso al portal y las fotos se guardaban sin fecha ni ubicación.
- **Valor generado:** El portal muestra Facebook, Instagram y LinkedIn; las fotos del PQR llevan marca de agua y anular pide un motivo.
- **Decisión técnica relevante:** La marca de agua se aplica en segundo plano, después de guardar el PQR, con la fecha y hora de la empresa.
- **Aprendizaje clave:** El trabajo pesado, como procesar imágenes, va en segundo plano para que el usuario no espere al guardar.
- **Mejora futura:** Validar que los enlaces de redes sociales tengan formato de URL; hoy se aceptan como texto libre.

### Gerencias de SGH y su asociación con el Personal — ticket 11477, 11479
- **Problema abordado:** En Personal no había forma de saber a qué gerencia pertenece cada persona, ni un listado de gerencias en AIO.
- **Valor generado:** Las gerencias de SGH llegan solas cada día, y en Personal se asigna la Gerencia o Dependencia de cada persona.
- **Decisión técnica relevante:** La conexión con SGH guarda la contraseña cifrada en la base, sin credenciales en el código, igual que en Status.
- **Aprendizaje clave:** Un catálogo que vive en otro sistema se sincroniza, no se copia a mano, para tener una sola fuente de verdad.
- **Mejora futura:** Cifrar las dos conexiones que aún tienen la contraseña en texto plano y automatizar su configuración por ambiente.

### Cierre individual de la tripulación — ticket 11397
- **Problema abordado:** En Captura diaria, pestaña Tripulación, cada tecla en la fecha guardaba, salía un error y se borraba lo escrito.
- **Valor generado:** La fecha se escribe sin alertas y se guarda una sola vez; un error se marca en el campo sin borrar lo digitado.
- **Decisión técnica relevante:** El guardado pasó al cierre del calendario, con validación previa en la pantalla; el servidor no requirió cambios.
- **Aprendizaje clave:** Guardar con cada tecla castiga al usuario; se guarda cuando termina de escribir y se valida antes de enviar.
- **Mejora futura:** No requiere.

### Captcha del Portal Ciudadano en el idioma elegido — ticket 11497
- **Problema abordado:** Con el portal en inglés, el captcha de Radicar PQR y de Consultar mi radicado se mostraba y se leía en español.
- **Valor generado:** El captcha del portal se muestra y se lee en voz alta en el idioma que elige el ciudadano.
- **Decisión técnica relevante:** El captcha recibe el idioma del portal sin cambiar el del resto del aplicativo, como el login.
- **Aprendizaje clave:** Un mensaje se guarda como clave de traducción y se traduce al mostrarlo, no ya traducido.
- **Mejora futura:** Corregir la devolución de QA: al cambiar de idioma con el error en pantalla, el mensaje queda en el idioma anterior.

## Status

### Permiso Bloquear Registros del Directivo Comercial — ticket 11404
- **Problema abordado:** En Roles, el permiso Bloquear Registros del Directivo Comercial volvía a activarse aunque soporte lo apagara.
- **Valor generado:** Aprobar en SIPA ya no enciende Bloquear Registros en STATUS; cada sistema conserva su propio permiso.
- **Decisión técnica relevante:** SIPA escribía en la misma columna que STATUS; se creó una propia y se copiaron los permisos sin que ningún rol perdiera.
- **Aprendizaje clave:** Una falla que vuelve después de corregirla como dato pide buscar la causa en el código, no repetir el ajuste.
- **Mejora futura:** Validar en el servidor el permiso de Autorizar mes, que hoy solo controla la pantalla.

### Nueva versión de STATUS: correcciones tras las pruebas de QA — ticket 7433
- **Problema abordado:** Las pruebas de QA de la nueva versión de STATUS encontraron fallas que había que corregir antes de liberarla.
- **Valor generado:** Se corrigieron las fallas que encontró QA y se hicieron mejoras, para que la nueva versión pase a una nueva ronda de pruebas.
- **Decisión técnica relevante:** Las reglas de negocio del cargue se devuelven como advertencia y no como error, y el cargue completo va en una sola transacción.
- **Aprendizaje clave:** El primer registro del periodo y el estado abierto se prueban primero, porque es lo que QA revisa antes que nada.
- **Mejora futura:** Autorizar y aislar por empresa en la API, y conectar SIPA a la nueva versión.
