-- Presentable PQRs for the PQR manual captures (local base, Empresa Demo).
-- Idempotent: only updates, matched by tracking number.

UPDATE operation.pqrs
SET contact_name = 'María Fernanda Gómez',
    client_number = '7894561',
    description = 'El contenedor de la esquina se encuentra desbordado desde hace dos días.',
    annulment_reason = 'Reporte duplicado: el ciudadano radicó la misma solicitud dos veces.'
WHERE tracking_number = 'LQKH-2026-074996';

UPDATE operation.pqrs
SET contact_name = 'Carlos Andrés Ruiz',
    client_number = '5512309',
    description = 'No pasó el vehículo recolector en el horario de la mañana.'
WHERE tracking_number = 'MLKA-2026-727005';
