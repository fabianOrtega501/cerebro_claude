# Retrospectiva del Sprint 82 — cierre 2026-09-23

Periodo: 2026-09-09 a 2026-09-23 (10 días hábiles). Autor: Fabian.

## AIO

### Exoneración de la auditoría para las tramas GPS — ticket 11118
- **Problema abordado:** La auditoría guardaba cada posición enviada por los GPS de la flota: era el 99 % del registro y la base de producción llegó a caerse.
- **Valor generado:** El registro de auditoría deja de crecer unas 135.000 filas al día y lo que sí sirve para una investigación se encuentra más rápido.
- **Decisión técnica relevante:** Se exoneró de la auditoría solo la ruta de tramas GPS, sin cambiar tablas ni la autenticación y validación del endpoint.
- **Aprendizaje clave:** Medir antes de cambiar: el tamaño de las particiones y el volumen diario fueron los que sustentaron la decisión ante el equipo.
- **Mejora futura:** Depurar las tramas que ya se acumularon en la auditoría, que siguen ocupando espacio en la base.

### Autorización de acuerdos de fidelización — ticket 10987
- **Problema abordado:** Los acuerdos de fidelización no pasaban por una autorización formal de la Dirección Comercial antes de firmarse con el cliente.
- **Valor generado:** El Director Comercial aprueba o rechaza con motivo desde un modal, el asesor recibe el aviso y un acuerdo autorizado ya no se edita.
- **Decisión técnica relevante:** El cargo de Director Comercial y el estado resultante se validan en el servidor; la pantalla solo envía la decisión: aprobar o rechazar.
- **Aprendizaje clave:** Toda propuesta puede aprobarse o rechazarse: si el diseño no contempla el rechazo, el usuario no tiene cómo dejar constancia de él.
- **Mejora futura:** Estandarizar los estilos de las ventanas modales: esta se creó desde cero y no tomaba los estilos que maneja el resto del sistema.

## Status

### Puesta en marcha de Status API — ticket 7433
- **Problema abordado:** El backend separado de Status no estaba completo: le faltaban módulos del monolito, pruebas automáticas y documentación de sus servicios.
- **Valor generado:** La API quedó en Laravel 13 con los módulos del monolito, pruebas automáticas y cada endpoint documentado en Swagger para el front.
- **Decisión técnica relevante:** Cada módulo se llevó a la estructura de AIO (servicio, validación y Swagger) y se parametrizaron las consultas SQL armadas a mano.
- **Aprendizaje clave:** Una arquitectura modular y bien distribuida hace mucho más fácil migrar o actualizar un sistema de versión.
- **Mejora futura:** Quedaron nueve puntos por corregir o mejorar, tres de ellos de prioridad alta; el detalle está en el siguiente slide.

#### Pendientes y mejoras futuras de Status API (segundo slide)

Resumen de `status-api/docs/pendientes-y-no-migrado.md`.

**Prioridad alta**
1. **Permisos por empresa.** La API no valida permisos: un usuario de una empresa puede consultar los datos de las demás. → Validar permisos en cada consulta y tomar la empresa de la sesión, no de la petición.
2. **SIPA sigue conectado al sistema anterior.** Si se apaga el monolito, SIPA deja de funcionar. → Conectar SIPA a la nueva API y ajustar sus pantallas.
3. **Contraseñas visibles en la base.** Las vistas `bi.vw_balance_2` y `bi.vw_ti_pqrs_arqprod` guardan en texto plano la clave del usuario `tablerobi` para el servidor 192.168.100.41; `bi.vw_toneladas_residuos_recibidas_inc` guarda la del usuario `davidramirez`. → Mover las claves a una conexión segura de PostgreSQL y cambiarlas.

**Prioridad media**

4. **Configuración con nombres cruzados.** `DB_LOCAL` / `DB_local`: dos servicios de SIPA no guardan en la base local. `SSH_USER` y `SSH_HOST` / `SSH_USER_DB` y `SSH_PASSWORD_DB`: el cargue por shapefile se conecta sin usuario ni servidor. `FILESYSTEM_DRIVER` / `FILESYSTEM_DISK`: la configuración no controla dónde se guardan los archivos. → Dejar un solo nombre para cada variable.
5. **Tablero que se queda cargando.** Las vistas `bi.vw_balance_2`, `bi.vw_ti_pqrs_arqprod` y `bi.vw_toneladas_residuos_recibidas_inc` consultan otro servidor sin tiempo límite; dos tarjetas quedan girando. → Fijar un tiempo máximo y mostrar un mensaje si el servidor no responde.
6. **Pantallas sin acceso.** Sin opción de menú: Cronogramas de proyectos, Índices de presupuesto, Localidades, Gestor de variables técnicas y Resultado de encuesta. En el menú sin pantalla: Prestadores de aprovechamiento, Formularios de transacciones y Variables técnicas APS por CSV. → Decidir con el equipo cuáles se habilitan y cuáles se retiran.

**Prioridad baja**

7. **Código sin uso.** 25 componentes quedaron apartados en vez de borrados. → Confirmarlos con el equipo y eliminarlos.
8. **Dos rutas de SIPA responden error.** `prestadores-empresa-ususarios/{id}` y `cargar-archivos` apuntan a funciones que no existen; así venían del sistema anterior. → Definir qué debían hacer y corregirlas.
9. **Nombres fuera de la convención.** Archivos con errores de escritura o de mayúsculas, como `DTIncosistenciasArchivosController` y `UsuariosrolesController`. → Corregirlos en un ticket propio de renombres.
