-- Datos presentables para las capturas del buscador de rutas del Seguimiento Vehicular (10646).
--
-- El unico servicio con volumen suficiente para que el buscador tenga sentido es el 38, que se
-- creo para probar la carga masiva: se llamaba "CARGA MASIVA (pruebas)" y sus 1.200 rutas,
-- "Ruta carga masiva N". Ese fixture es el que hace falta —sin muchas rutas no se entiende para
-- que sirve buscar ni la paginacion de la tabla—, asi que se renombra en vez de esquivarlo.
--
-- Idempotente: son updates que se pueden repetir.

update public.services
set name_service = 'RECOLECCIÓN RESIDENCIAL'
where id = 38;

-- El numero de la ruta sale de su micro codigo (MI00547 -> 547), asi que el nombre sigue
-- correspondiendo con lo que muestran las columnas Macro Código y Micro Código de la tabla.
update operation.routes
set name = 'Ruta Residencial ' || ltrim(regexp_replace(micro_code, '\D', '', 'g'), '0')
where service_id = 38
  and name like 'Ruta carga masiva %';

-- El centro operativo de esas rutas se llamaba "CO PRUEBAS" y sale repetido en cada fila de la
-- tabla. Es el municipio 149 (Bogota), asi que se le pone un nombre coherente con su ubicacion.
update public.operational_centers
set name_center = 'CO Norte'
where id = 381
  and name_center = 'CO PRUEBAS';
