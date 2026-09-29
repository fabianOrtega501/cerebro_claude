-- Escenario presentable del maestro Costos de Operación (Green > Comercial).
-- Cuatro vigencias de COSMITET LTDA (cliente 2290) en PROMOCALI (empresa 4), línea Ruta
-- Hospitalaria (2): una por estado. El cliente tiene prestaciones ejecutadas en 2026, así que la
-- vigente dispara el aviso de rentabilidad al editar su costo.
-- Idempotente: cada vigencia se inserta solo si no existe la misma terna con la misma fecha inicial.
-- No toca las vigencias de otros clientes. created_by 76 es el usuario de pruebas en la base local.

insert into wastes.client_operation_costs
    (company_id, client_id, business_line_id, start_date, end_date, cost_amount, observations, created_by, updated_by, active, created_at, updated_at)
select v.company_id, v.client_id, v.business_line_id, v.start_date, v.end_date, v.cost_amount, v.observations, 76, 76, v.active, now(), now()
from (values
    (4, 2290, 2, date '2025-07-01', date '2025-12-31', 18500000.00, 'Costo pactado para el segundo semestre de 2025.', true),
    (4, 2290, 2, date '2026-01-01', date '2026-12-31', 39600000.00, 'Renovación anual del contrato de recolección hospitalaria.', true),
    (4, 2290, 2, date '2027-01-01', date '2027-06-30', 21000000.00, 'Costo acordado para el primer semestre de 2027.', true),
    (4, 2290, 6, date '2026-03-01', date '2026-12-31', 9800000.00, 'Vigencia registrada por error en la línea equivocada.', false)
) as v(company_id, client_id, business_line_id, start_date, end_date, cost_amount, observations, active)
where not exists (
    select 1 from wastes.client_operation_costs c
    where c.company_id = v.company_id and c.client_id = v.client_id
      and c.business_line_id = v.business_line_id and c.start_date = v.start_date
);
