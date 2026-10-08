-- Gráfica de prospectos del Dashboard › Comercial, empresa 7 (CENTRAL COLOMBIANA DE
-- ASEO, Chía).
--
-- 180 prospectos repartidos de octubre de 2025 a septiembre de 2026, con más altas en los meses
-- recientes, para que las barras por mes muestren una tendencia y no un solo pico. Se reconocen por
-- el rango de documento 9780000001–9780000180: todo lo de este seed sale de ese número, así que
-- repetirlo no duplica nada ni cambia los valores.
--
-- Valores tomados de los maestros que ofrece el formulario del prospecto:
--   uso      → MTGR-010 general (475–479); ~12 % sin uso, para que se vea «Sin uso»
--   segmento → MT-007 de la empresa 7; ~10 % sin segmento, para probar el filtro opcional
--   estado   → MT-PSTATUS de la empresa 7, con más peso en las etapas tempranas del embudo
--   asesor   → los 6 «ASESOR COMERCIAL» de la empresa 7; ~8 % sin asesor, para «Sin asesor»

with months(month_offset, quantity) as (
  values (0, 8), (1, 10), (2, 12), (3, 9), (4, 14), (5, 16),
         (6, 13), (7, 18), (8, 20), (9, 17), (10, 22), (11, 21)
),
numbered as (
  select row_number() over (order by month_offset, g) as i, month_offset
  from months, generate_series(1, quantity) as g
),
base as (
  select
    9780000000 + i as ident,
    i,
    -- Día 2 a 28 a las 15:00 UTC (10:00 en Colombia): siempre dentro del rango por defecto
    (date '2025-10-02' + make_interval(months => month_offset::int, days => (abs(hashtext(i || 'd')) % 27)::int) + time '15:00') as created_at,
    abs(hashtext(i || 'u')) % 100 as use_roll,
    abs(hashtext(i || 's')) % 100 as segment_roll,
    abs(hashtext(i || 'e')) % 100 as status_roll
  from numbered
),
named as (
  select
    b.*,
    case
      when use_roll < 40 then 475   -- 1 Residencial
      when use_roll < 62 then 476   -- 2 Pequeño Productor
      when use_roll < 77 then 477   -- 3 Gran Productor
      when use_roll < 83 then 478   -- 5 Especial
      when use_roll < 88 then 479   -- 7 Áreas Comunes
    end as use_id,
    (array['Conjunto Residencial', 'Edificio', 'Condominio', 'Panadería', 'Restaurante', 'Ferretería',
           'Clínica', 'Colegio', 'Supermercado', 'Hotel', 'Parque Empresarial', 'Club'])
      [1 + (case
             when use_roll < 40 then abs(hashtext(i || 'n')) % 3
             when use_roll < 62 then 3 + abs(hashtext(i || 'n')) % 3
             when use_roll < 77 then 6 + abs(hashtext(i || 'n')) % 3
             else 9 + abs(hashtext(i || 'n')) % 3
           end)] as kind,
    (array['Fonquetá', 'Bojacá', 'La Balsa', 'Samaria', 'Yerbabuena', 'Fagua', 'Tíquiza',
           'Cerca de Piedra', 'Santa Lucía', 'El Cedro', 'Calahorra', 'Las Juntas', 'Delicias',
           'San Luis', 'La Caro'])[1 + i % 15] as place
  from base b
)
insert into public.clients (
  identification_number, name, person_type, phone, email, municipality_id, use, segment_id,
  prospect_status_id, is_prospect, active, notify, credit_blocked, created_by, updated_by,
  created_at, updated_at
)
select
  n.ident,
  n.kind || ' ' || n.place || (array['', ' II', ' Norte', ' Plaza', ' Real', ' Central', ' del Parque', ' Campestre', ' Etapa 2', ' Express', ' Sur', ' Alto'])[1 + (n.i / 15)::int % 12],
  case when n.kind in ('Conjunto Residencial', 'Edificio', 'Condominio') then 'Natural' else 'Jurídica' end,
  '31' || lpad((abs(hashtext(n.i || 'p')) % 100000000)::text, 8, '0'),
  'contacto' || n.i || '@prospectos-chia.co',
  475,
  n.use_id,
  case when n.segment_roll < 90 then (array[191, 192, 193, 194, 195, 642, 643, 644])[1 + n.segment_roll % 8] end,
  (array[650, 650, 650, 649, 649, 651, 651, 652, 652, 638, 656, 746, 749, 653, 631, 633, 647, 648])[1 + n.status_roll % 18],
  true, true, true, false, 576, 576,
  n.created_at, n.created_at
from named n
where not exists (select 1 from public.clients c where c.identification_number = n.ident);

-- Vínculo con la empresa
insert into public.client_companies (client_id, company_id, active, created_by, updated_by, created_at, updated_at)
select c.id, 7, true, 576, 576, c.created_at, c.created_at
from public.clients c
where c.identification_number between 9780000001 and 9780000180
  and not exists (select 1 from public.client_companies cc where cc.client_id = c.id and cc.company_id = 7);

-- Asesor: uno por prospecto, salvo el ~8 % que queda sin asignar
insert into public.client_advisors (client_id, company_id, advisor_id, active, created_by, updated_by, created_at, updated_at)
select c.id, 7,
  (array[1329, 1330, 1331, 1332, 1333, 1334])[1 + abs(hashtext((c.identification_number - 9780000000) || 'a')) % 6],
  true, 576, 576, c.created_at, c.created_at
from public.clients c
where c.identification_number between 9780000001 and 9780000180
  and abs(hashtext((c.identification_number - 9780000000) || 'x')) % 100 >= 8
  and not exists (select 1 from public.client_advisors ca where ca.client_id = c.id and ca.company_id = 7);
