-- Datos presentables para las capturas del mapa geográfico de clientes y prospectos.
--
-- El mapa se documenta con PROMOCALI (empresa 4), que es la única con volumen real. Dos problemas
-- con sus datos de desarrollo: los tres prospectos se llamaban "Prospecto Genérico", "Prueba" y
-- "pepito perez", y ningún cliente tenía comuna ni barrio ni asesor, así que el globo del mapa
-- salía con la mitad de sus filas en guion.
--
-- Idempotente: solo son updates y un insert guardado con "where not exists".

-- 1. El cliente del globo de ejemplo. Clínica Versalles está en la Av. 5 Norte, que es Comuna 2 /
--    San Vicente: se le completan las dos zonas para que la tarjeta salga entera.
update public.clients
set commune_id = 39,        -- Comuna 2
    neighborhood_id = 113   -- San Vicente
where id = 9;

-- 2. Su asesor comercial, que es la última fila del globo. 1062 es Anderson Steven Aguilar
--    Portillo, asesor real de PROMOCALI con otros clientes asignados.
insert into public.client_advisors (client_id, advisor_id, company_id, active, created_at, updated_at)
select 9, 1062, 4, true, now(), now()
where not exists (
    select 1 from public.client_advisors
    where client_id = 9 and advisor_id = 1062 and company_id = 4
);

-- 3. Los tres prospectos de PROMOCALI. Se conservan sus coordenadas: los dos del norte caen en la
--    misma zona que la clínica, así que llevan Comuna 2 / San Vicente; el del sur se queda sin
--    comuna porque sus coordenadas no corresponden a ese sector.
update public.clients
set name = 'SUPERMERCADO LA GRAN COLOMBIA S.A.S.',
    identification_number = 901234567,
    address = 'CL 44 # 8 - 25',
    phone = '6023456789',
    municipality_id = 1006  -- CALI, antes figuraba con el país como municipio
where id = 1076105;

update public.clients
set name = 'PANIFICADORA EL TRIGAL LTDA',
    identification_number = 900876543,
    address = 'CL 33 N # 2 - 15',
    phone = '6024456712',
    commune_id = 39,
    neighborhood_id = 113
where id = 1076425;

update public.clients
set name = 'TALLER AUTOMOTRIZ LOS ANDES S.A.S.',
    identification_number = 901567234,
    address = 'CL 3B # 69 - 22',
    phone = '3168211965',
    commune_id = 39,
    neighborhood_id = 113
where id = 1076427;
