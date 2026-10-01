-- Presentable issues for the Novedades manual captures (local base, Empresa Demo).
-- Idempotent: updates are repeatable and the closed issue is inserted only once.

UPDATE operation.issue_types
SET name = 'Incumplimiento de Frecuencia'
WHERE name = 'novedad operaciones';

UPDATE operation.issues
SET description = 'La ruta 12 del sector norte no se recolectó en la frecuencia programada del turno de la mañana.'
WHERE id = 20 AND company_id = 0;

UPDATE operation.issues
SET description = 'El vehículo presentó una falla en el sistema de frenos durante el recorrido y se retiró de la operación.'
WHERE id = 18 AND company_id = 0;

INSERT INTO operation.issues (
    company_id, issue_type_id, vehicle_id, staff_id, operational_center_id, item_id, issue_date,
    generate_work_order, generate_incident_report, description, status, closed_at,
    resolution_description, active, created_by, updated_by, created_at, updated_at,
    non_conforming_output, non_conforming_concept_id
)
SELECT
    i.company_id, i.issue_type_id, i.vehicle_id, i.staff_id, i.operational_center_id, i.item_id,
    now() - interval '1 day', false, false,
    'El barrido de la avenida principal no se completó dentro del horario establecido por lluvia intensa.',
    'Cerrada', now(),
    'Se reprogramó el barrido para el turno de la tarde y se completó el recorrido.',
    true, i.created_by, i.updated_by, now(), now(),
    true,
    (SELECT d.id FROM public.details_masters d
       JOIN public.masters m ON m.id = d.master_id
      WHERE m.code = 'MTOP-001' AND m.company_id = i.company_id AND d.active
      ORDER BY d.id LIMIT 1)
FROM operation.issues i
WHERE i.id = 20
  AND NOT EXISTS (
      SELECT 1 FROM operation.issues
       WHERE description = 'El barrido de la avenida principal no se completó dentro del horario establecido por lluvia intensa.'
  );
