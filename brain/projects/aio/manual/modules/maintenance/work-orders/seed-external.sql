-- Escenario de capture-external.mjs: una orden externa de la Empresa Demo (base local), número 900.
-- Idempotente: se puede aplicar antes de cada tanda sin duplicar nada.
-- La mano de obra precargada sale del valor hora del cargo del usuario de pruebas (cargo 48); para que
-- la captura no muestre $ 0, súbalo antes de capturar y devuélvalo después (ver NOTES.md).

insert into maintenance.work_orders (company_id, order_number, maintenance_type, vehicle_id, hours, kilometers, planned_date,
    responsible_id, status, notes, created_by, updated_by, active, reason_id, priority_id, failure_system_id, is_external, created_at, updated_at)
select 0, 900, 'Correctivo', 1426, 500, 7000, '2026-11-19 08:00:00', 1270, 'En ejecución',
    'Reparación del sistema de frenos en taller externo autorizado.', 76, 76, true,
    (select reason_id from maintenance.work_orders where id = 16), (select priority_id from maintenance.work_orders where id = 16), 5, true, now(), now()
where not exists (select 1 from maintenance.work_orders where company_id = 0 and order_number = 900);

update maintenance.work_orders set is_external = true, active = true, status = 'En ejecución'
where company_id = 0 and order_number = 900;

-- Suministro con costo digitado: hace que el cambio a interna muestre la alerta.
insert into maintenance.work_supplies (work_order_id, supply_id, quantity, cost, created_by, updated_by, active, created_at, updated_at)
select wo.id, 13, 2, 170000, 76, 76, true, now(), now()
from maintenance.work_orders wo
where wo.company_id = 0 and wo.order_number = 900
  and not exists (select 1 from maintenance.work_supplies s where s.work_order_id = wo.id and s.supply_id = 13);

-- Actividad en proceso del usuario de pruebas: da el diálogo de finalizar con el campo Valor.
insert into maintenance.work_activities (work_order_id, maintenance_activity_id, planned_date, completed, cost, "order", status, active, planned_hours, created_by, updated_by, created_at, updated_at)
select wo.id, 23, '2026-11-19', false, 0, 1, 'En Proceso', true, 2, 76, 76, now(), now()
from maintenance.work_orders wo
where wo.company_id = 0 and wo.order_number = 900
  and not exists (select 1 from maintenance.work_activities wa where wa.work_order_id = wo.id and wa.maintenance_activity_id = 23);

-- Actividad pendiente con dos técnicos: da el masivo con las columnas de valor y tiempo.
insert into maintenance.work_activities (work_order_id, maintenance_activity_id, planned_date, completed, cost, "order", status, active, planned_hours, created_by, updated_by, created_at, updated_at)
select wo.id, 20, '2026-11-19', false, 0, 2, 'Pendiente', true, 1.5, 76, 76, now(), now()
from maintenance.work_orders wo
where wo.company_id = 0 and wo.order_number = 900
  and not exists (select 1 from maintenance.work_activities wa where wa.work_order_id = wo.id and wa.maintenance_activity_id = 20);

insert into maintenance.work_staffs (work_activity_id, staff_id, minutes, cost, status, active, created_by, updated_by, created_at, updated_at)
select wa.id, s.staff_id, s.minutes, 0, s.status, true, 76, 76, now(), now()
from maintenance.work_activities wa
join maintenance.work_orders wo on wo.id = wa.work_order_id and wo.company_id = 0 and wo.order_number = 900
join (values (23, 1270, 120, 'En Proceso'), (20, 1270, 90, 'Pendiente'), (20, 123, 60, 'Pendiente')) s(activity, staff_id, minutes, status)
  on s.activity = wa.maintenance_activity_id
where not exists (select 1 from maintenance.work_staffs ws where ws.work_activity_id = wa.id and ws.staff_id = s.staff_id);

update maintenance.work_staffs ws set status = s.status, minutes = s.minutes, cost = 0, active = true
from maintenance.work_activities wa
join maintenance.work_orders wo on wo.id = wa.work_order_id and wo.company_id = 0 and wo.order_number = 900
join (values (23, 1270, 120, 'En Proceso'), (20, 1270, 90, 'Pendiente'), (20, 123, 60, 'Pendiente')) s(activity, staff_id, minutes, status)
  on s.activity = wa.maintenance_activity_id
where ws.work_activity_id = wa.id and ws.staff_id = s.staff_id;
