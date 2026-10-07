-- Escenario de las capturas de Novedades de mantenimiento: seguimientos por tramos.
--
-- Empresa 9 (PROMOAMBIENTAL DISTRITO, UTC-5), que en local tiene solo dos novedades de
-- mantenimiento, ambas abiertas. Traían descripciones de tecleo y la 13 un vehículo con placa
-- inventada; se les pone texto del dominio y se dejan donde están.
--
-- Se puede repetir: los seguimientos de la novedad 13 se borran y se vuelven a crear **relativos a
-- la hora actual**, para que la novedad quede hoy, con tres tramos contiguos y el último en curso.
-- La inoperatividad acumulada sale entonces de unas seis horas, y cambia con cada consulta.

-- El tipo venía sin tilde.
update operation.issue_types set name = 'Servicio de Grúa' where id = 4 and name = 'Servicio de Grua';

-- Novedad del ejemplo: varada en vía, con fecha de hoy en la hora de la empresa (issue_date se
-- guarda en hora local, no en UTC).
update operation.issues
set description = 'Compactador varado en la Av. Boyacá con calle 80 por pérdida de presión en el sistema de frenos. Se solicita grúa para trasladarlo al taller.',
    vehicle_id = 112,
    -- Venía con "Prueba Centro Operativo".
    operational_center_id = 301,
    issue_date = date_trunc('minute', (now() at time zone 'UTC') - interval '5 hours' - interval '7 hours'),
    status = 'Abierta',
    closed_at = null,
    resolution_description = null
where id = 13;

-- La otra novedad de la empresa, que sale en el listado.
update operation.issues
set description = 'Grúa para retirar el vehículo con el eje trasero averiado en la zona de descargue del relleno Doña Juana.'
where id = 7;

delete from maintenance.issue_trackings where issue_id = 13;

-- Tres tramos contiguos, en UTC: el fin de cada uno es el inicio del siguiente y el último sigue
-- en curso. Actividad y área salen de los maestros MTMT-005 y MTMT-006 de la empresa 9.
with detail as (
  select m.code, d.name, d.id
  from public.details_masters d
  join public.masters m on m.id = d.master_id
  where m.company_id = 9 and m.code in ('MTMT-005', 'MTMT-006') and d.active
),
base as (select date_trunc('minute', now() at time zone 'UTC') as ahora)
insert into maintenance.issue_trackings
  (issue_id, activity_id, responsible_area_id, vehicle_id, start_date, end_date, description, created_by, updated_by, active, created_at, updated_at)
select 13,
       (select id from detail where code = 'MTMT-005' and name = t.activity),
       (select id from detail where code = 'MTMT-006' and name = t.area),
       t.vehicle_id,
       base.ahora - t.start_ago,
       case when t.end_ago is null then null else base.ahora - t.end_ago end,
       t.description, 576, 576, true, now(), now()
from base, (values
  ('Reacción',       'Mantenimiento', null::bigint, interval '6 hours 40 minutes', interval '6 hours 5 minutes',
   'Se recibe el reporte del conductor, se confirma la ubicación y se programa la salida del taller móvil.'),
  ('Desplazamiento', 'Taller móvil',  102,          interval '6 hours 5 minutes',  interval '5 hours 10 minutes',
   'Desplazamiento del taller móvil hasta la Av. Boyacá con calle 80.'),
  ('Asistencia',     'Taller móvil',  102,          interval '5 hours 10 minutes', null,
   'Diagnóstico en sitio: fuga en la línea de aire del freno trasero. Se asegura el vehículo y se espera la grúa.')
) as t(activity, area, vehicle_id, start_ago, end_ago, description);
