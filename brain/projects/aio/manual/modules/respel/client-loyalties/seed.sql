-- Escenario presentable para las capturas de la Autorizacion de fidelizacion.
--
-- La ventana muestra cinco datos del acuerdo: estado, total ventaja sustancial, valor mensual
-- individual, permanencia y quorum. Con los valores de trabajo salen en guion o con cifras que no
-- se sostienen en una pagina de manual, asi que se fijan aqui.
--
-- Idempotente: son `update` repetibles sobre un acuerdo concreto. No crea ni borra nada, y no
-- toca el nombre del cliente ni ningun otro registro.

-- Se aplica a todos los acuerdos pendientes del cliente del escenario, no a uno solo: el flujo
-- abre el primero que el listado devuelva, y no siempre es el mismo.
update public.client_loyalties
set permanence_months        = 24,
    total_subscribers        = 180,
    quorum_percentage        = 70,
    total_advantage_value    = 8400000,
    monthly_individual_value = 35000,
    status                   = 'Pendiente de Autorización',
    active                   = true
where client_id = 1076155
  and status = 'Pendiente de Autorización'
  and active = true;
