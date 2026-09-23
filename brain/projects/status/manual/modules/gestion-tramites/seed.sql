-- Escenario presentable de Gestion de Tramites para las capturas del manual.
--
-- La base local tiene 150 tramites migrados, todos con un solo formulario y sin formatos
-- afectados, asi que ninguno muestra lo que el modulo hace hoy. Este seed deja un tramite con
-- tres formularios de periodicidades distintas, dos formatos afectados colgados del primero y
-- un seguimiento, que es lo que el manual necesita ensenar.
--
-- Empresa 1 (SERVICIOS AMBIENTALES S.A.S E.S.P.) es la unica con aplicabilidad amplia.
-- Idempotente: se puede aplicar antes de cada tanda sin duplicar nada.

-- 1. El tramite. Tipo 1 = Soporte Mesa de Ayuda, estado '0' = Abierto.
insert into gestor_transaccional.tramites
  (idtramite, tramite, fecha_reporte, idempresa, estado, creado_por, fecha_creacion,
   modificado_por, fecha_modificacion, afecta_formatos, afecta_tramites_anteriores)
select 1, 'SUI-2026-0458', current_date, 1, '0', 100, now(), 100, now(), true, false
where not exists (
  select 1 from gestor_transaccional.tramites where tramite = 'SUI-2026-0458' and idempresa = 1
);

-- 2. Los tres formularios del tramite, con periodicidades distintas.
insert into gestor_transaccional.dt_tramites_formularios
  (idtramite, idformulario, periodicidad, anio, periodo, afecta_formatos, creado_por,
   fecha_creacion, modificado_por, fecha_modificacion)
select t.id, v.idformulario, v.periodicidad, v.anio, v.periodo, v.afecta, 100, now(), 100, now()
from gestor_transaccional.tramites t
cross join (values
  (156, 'Anual',     '2026', '20260101', true),
  (46,  'Semestral', '2026', '20260101', false),
  (151, 'Mensual',   '2026', '20260301', false)
) as v(idformulario, periodicidad, anio, periodo, afecta)
where t.tramite = 'SUI-2026-0458' and t.idempresa = 1
  and not exists (
    select 1 from gestor_transaccional.dt_tramites_formularios d
    where d.idtramite = t.id and d.idformulario = v.idformulario
  );

-- 3. Dos formatos afectados, colgados del formulario anual. `idtramite` queda en NULL: desde el
--    10841 el formato pertenece al formulario del tramite, no al encabezado.
insert into gestor_transaccional.dt_formularios_tramites
  (idformulario, idtramite, periodicidad, anio, periodo, idtramite_formulario, creado_por,
   fecha_creacion, modificado_por, fecha_modificacion)
select v.idformulario, null, v.periodicidad, v.anio, v.periodo, tf.id, 100, now(), 100, now()
from gestor_transaccional.dt_tramites_formularios tf
join gestor_transaccional.tramites t on t.id = tf.idtramite
cross join (values
  (105, 'Anual',      '2025', '20250101'),
  (104, 'Trimestral', '2025', '20250701')
) as v(idformulario, periodicidad, anio, periodo)
where t.tramite = 'SUI-2026-0458' and t.idempresa = 1 and tf.idformulario = 156
  and not exists (
    select 1 from gestor_transaccional.dt_formularios_tramites d
    where d.idtramite_formulario = tf.id and d.idformulario = v.idformulario
  );

-- 4. Un seguimiento, para la ventana de consulta de seguimientos.
insert into gestor_transaccional.seguimiento_tramites
  (idtramite, fecha_seguimiento, observacion, creado_por, fecha_creacion, modificado_por,
   fecha_modificacion)
select t.id, current_date,
  'Se radico la solicitud ante la entidad y se adjunto el soporte de los formularios reportados.',
  100, now(), 100, now()
from gestor_transaccional.tramites t
where t.tramite = 'SUI-2026-0458' and t.idempresa = 1
  and not exists (
    select 1 from gestor_transaccional.seguimiento_tramites s where s.idtramite = t.id
  );
