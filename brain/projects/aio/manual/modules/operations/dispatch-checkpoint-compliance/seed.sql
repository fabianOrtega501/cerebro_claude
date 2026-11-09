-- Scenario for the "Cumplimiento Por Puntos De Control" tab: Empresa Demo, 28/09/2026.
-- Needs the dispatches of ../dispatches-overview/seed.sql (routes 6, 3, 1 and 7).
-- Idempotent: checkpoints are inserted once per route and name, GPS frames once per device and time.
-- Expected result: 16 planned, 13 reached, 2 late, 81,3 % yellow.

with points (route_id, sequence_order, name, expected, lon, lat) as (
    values
        (6, 1, 'Parque Principal', time '07:00', -74.0700, 4.6500),
        (6, 2, 'Plaza de Mercado', time '08:00', -74.0600, 4.6500),
        (6, 3, 'Colegio Distrital', time '09:00', -74.0500, 4.6500),
        (6, 4, 'Hospital Municipal', time '10:00', -74.0400, 4.6500),
        (6, 5, 'Terminal de Transporte', time '11:00', -74.0300, 4.6500),
        (3, 1, 'Centro Comercial', time '07:30', -74.0700, 4.6600),
        (3, 2, 'Biblioteca Pública', time '08:30', -74.0600, 4.6600),
        (3, 3, 'Estación de Bomberos', time '09:30', -74.0500, 4.6600),
        (3, 4, 'Polideportivo', time '10:30', -74.0400, 4.6600),
        (1, 1, 'Alcaldía Local', time '07:00', -74.0700, 4.6700),
        (1, 2, 'Parque Industrial', time '08:00', -74.0600, 4.6700),
        (1, 3, 'Cementerio Central', time '09:00', -74.0500, 4.6700),
        (1, 4, 'Plaza de Toros', time '10:00', -74.0400, 4.6700),
        (7, 1, 'Glorieta Norte', time '07:00', -74.0700, 4.6800),
        (7, 2, 'Universidad', time '08:00', -74.0600, 4.6800),
        (7, 3, 'Coliseo Cubierto', null, -74.0500, 4.6800)
)
insert into operation.route_checkpoints
    (route_id, name, sequence_order, tolerance_radius_meters, expected_arrival_time, location, active, created_by, updated_by, created_at, updated_at)
select p.route_id, p.name, p.sequence_order, 50, p.expected, ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326), true, 1, 1, now(), now()
from points p
where not exists (
    select 1 from operation.route_checkpoints rc where rc.route_id = p.route_id and rc.name = p.name
);

-- Frames in UTC (company time + 5 h). Points without a frame stay "No visitado".
with frames (vehicle_id, local_time, lon, lat) as (
    values
        (450, timestamp '2026-09-28 07:05', -74.0700, 4.6500),
        (450, timestamp '2026-09-28 08:35', -74.0600, 4.6500),
        (450, timestamp '2026-09-28 08:55', -74.0500, 4.6500),
        (450, timestamp '2026-09-28 11:10', -74.0300, 4.6500),
        (453, timestamp '2026-09-28 07:28', -74.0700, 4.6600),
        (453, timestamp '2026-09-28 08:40', -74.0600, 4.6600),
        (453, timestamp '2026-09-28 09:20', -74.0500, 4.6600),
        (453, timestamp '2026-09-28 10:30', -74.0400, 4.6600),
        (1426, timestamp '2026-09-28 07:10', -74.0700, 4.6700),
        (1426, timestamp '2026-09-28 08:50', -74.0600, 4.6700),
        (451, timestamp '2026-09-28 06:58', -74.0700, 4.6800),
        (451, timestamp '2026-09-28 08:05', -74.0600, 4.6800),
        (451, timestamp '2026-09-28 09:15', -74.0500, 4.6800)
)
insert into gps.vehicle_locations
    (device_gps, plate_vehicle, code_vehicle, gps_geometry, course, speed, address, date_gps, created_at, updated_at)
select 'DEMO-CHECKPOINTS', v.plate, v.code, ST_SetSRID(ST_MakePoint(f.lon, f.lat), 4326),
    0, 20, 'Recorrido de demostración', f.local_time + interval '5 hours', now(), now()
from frames f
join public.vehicles v on v.id = f.vehicle_id
where not exists (
    select 1 from gps.vehicle_locations vl
    where vl.device_gps = 'DEMO-CHECKPOINTS' and vl.plate_vehicle = v.plate and vl.date_gps = f.local_time + interval '5 hours'
);
