-- Presentable day for the Dispatches Dashboard captures (local base, Empresa Demo, 2026-09-28).
-- Six of the seven plan routes get a dispatch: four closed, one in operation and one programmed.
-- Idempotent: each dispatch is inserted once per route and day, and its children once per dispatch.

WITH plan (route_id, status, vehicle_id, km_base) AS (
    VALUES (6, 2, 450, 13020), (3, 2, 453, 48210), (8, 2, 452, 192790), (1, 2, 1426, 7010),
           (7, 1, 451, 20340), (3990, 0, 441, 0)
)
INSERT INTO operation.dispatches (
    company_id, service_id, shift_id, operational_center_id, route_id, vehicle_id, start_datetime,
    execution_start_date, end_datetime, final_km, dispatch_status, closed_by_user_id,
    created_by, updated_by, active, created_at, updated_at
)
SELECT r.company_id, r.service_id, r.shift_id, r.operational_center_id, r.id, p.vehicle_id,
       '2026-09-28 06:00:00',
       CASE WHEN p.status > 0 THEN timestamp '2026-09-28 06:12:00' END,
       CASE WHEN p.status = 2 THEN timestamp '2026-09-28 13:45:00' END,
       CASE WHEN p.status = 2 THEN p.km_base + 86 END,
       p.status, CASE WHEN p.status = 2 THEN 1 END,
       1, 1, true, now(), now()
FROM plan p
JOIN operation.routes r ON r.id = p.route_id
WHERE NOT EXISTS (
    SELECT 1 FROM operation.dispatches d
     WHERE d.route_id = r.id AND d.start_datetime::date = '2026-09-28' AND d.active
);

WITH weights (route_id, ticket, weight, hour) AS (
    VALUES (6, 'T-280901', 9.84, 9), (6, 'T-280902', 10.21, 12), (3, 'T-280903', 8.47, 9),
           (3, 'T-280904', 9.12, 12), (8, 'T-280905', 11.36, 10), (8, 'T-280906', 10.58, 13),
           (1, 'T-280907', 7.93, 9), (1, 'T-280908', 8.65, 12), (7, 'T-280909', 9.40, 10)
)
INSERT INTO operation.dispatch_downloads (
    dispatch_id, download_location_id, initial_weight, final_weight, total_weight, route_total_weight,
    entry_ticket, entry_date, exit_date, weight_distribution, capacity_exceeded,
    created_by, updated_by, active, created_at, updated_at
)
SELECT d.id, 1, w.weight * 1000 + 14500, 14500, w.weight, w.weight, w.ticket,
       timestamp '2026-09-28 00:00:00' + make_interval(hours => w.hour),
       timestamp '2026-09-28 00:20:00' + make_interval(hours => w.hour),
       false, false, 1, 1, true, now(), now()
FROM weights w
JOIN operation.dispatches d ON d.route_id = w.route_id AND d.start_datetime = '2026-09-28 06:00:00' AND d.active
WHERE NOT EXISTS (SELECT 1 FROM operation.dispatch_downloads dd WHERE dd.dispatch_id = d.id);

WITH plan (route_id, km_base, steps) AS (
    VALUES (6, 13020, 5), (3, 48210, 5), (8, 192790, 5), (1, 7010, 5), (7, 20340, 3)
),
legs (step, km, hour) AS (
    VALUES (1, 14, 6), (2, 38, 7), (3, 52, 10), (4, 71, 12), (5, 86, 13)
)
INSERT INTO operation.dispatch_movements (
    dispatch_id, movement_type_detail_id, trip_number, movement_date, start_date, end_date,
    "order", final_kilometers, created_by, updated_by, active, created_at, updated_at
)
SELECT d.id, l.step, 1, '2026-09-28',
       timestamp '2026-09-28 00:00:00' + make_interval(hours => l.hour),
       timestamp '2026-09-28 00:45:00' + make_interval(hours => l.hour),
       l.step, p.km_base + l.km + (p.route_id % 5), 1, 1, true, now(), now()
FROM plan p
JOIN legs l ON l.step <= p.steps
JOIN operation.dispatches d ON d.route_id = p.route_id AND d.start_datetime = '2026-09-28 06:00:00' AND d.active
WHERE NOT EXISTS (SELECT 1 FROM operation.dispatch_movements m WHERE m.dispatch_id = d.id);

WITH crew (route_id, staff_id, is_support) AS (
    VALUES (6, 123, false), (6, 215, false), (6, 389, false),
           (3, 1555, false), (3, 1682, false), (3, 1987, false),
           (8, 2056, false), (8, 2192, false), (8, 389, true),
           (1, 2205, false), (1, 2851, false), (1, 2878, false),
           (7, 3289, false), (7, 4429, false), (7, 5241, false),
           (3990, 5255, false), (3990, 15403, false)
)
INSERT INTO operation.dispatch_crews (
    dispatch_id, staff_id, is_support, start_time, created_by, updated_by, active, created_at, updated_at
)
SELECT d.id, c.staff_id, c.is_support, '2026-09-28 06:00:00', 1, 1, true, now(), now()
FROM crew c
JOIN operation.dispatches d ON d.route_id = c.route_id AND d.start_datetime = '2026-09-28 06:00:00' AND d.active
WHERE NOT EXISTS (SELECT 1 FROM operation.dispatch_crews dc WHERE dc.dispatch_id = d.id);
