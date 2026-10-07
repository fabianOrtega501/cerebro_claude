-- Escenario de capture-activities.mjs, sobre la OT 5 de Empresa Demo (base local).
-- Idempotente: se puede aplicar antes de cada tanda sin duplicar nada.

-- El usuario de pruebas (colaborador 1270) asignado y en proceso en "Diagnóstico de bomba de agua":
-- da el botón verde de su propia observación y el diálogo de finalizar.
insert into maintenance.work_staffs (work_activity_id, staff_id, minutes, cost, status, created_by, updated_by, active, created_at, updated_at, observation)
select 8, 1270, 30, 0, 'En Proceso', 76, 76, true, now(), now(), null
where not exists (
    select 1 from maintenance.work_staffs where work_activity_id = 8 and staff_id = 1270
);

update maintenance.work_staffs
set status = 'En Proceso', active = true, observation = null
where work_activity_id = 8 and staff_id = 1270;

-- Observación de otro técnico en "Instalación de bomba de agua": da el botón de solo lectura.
update maintenance.work_staffs
set observation = 'Se instaló la bomba nueva y se verificó la presión de salida.'
where id = 11;
