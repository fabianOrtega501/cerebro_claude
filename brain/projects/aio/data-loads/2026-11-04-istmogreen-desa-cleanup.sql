-- Limpieza de la copia de despachos de Istmo Green (prod, empresa 17) cargada en desa (empresa 18) el 2026-11-04, ticket 11632.
-- Borra solo los ids que creó esa carga. Los despachos que QA cree después en la empresa 18 no se tocan.
\set ON_ERROR_STOP on
BEGIN;

DELETE FROM gps.vehicle_locations
WHERE date_gps >= '2026-10-17 05:00:00' AND date_gps < '2026-11-01 05:00:00'
  AND device_gps IN ('10105842','10105841','10106297','10103722','10103659','10108627','10108684','10108634','10108633','10108628','10108629','10108630','10108631','10108683','10105335','10105336','10108807','10107804','10107801','10107796','10107797','10105883','10101191','10103547','10108943','10108944','10108632');

DELETE FROM operation.dispatch_downloads WHERE dispatch_id BETWEEN 86 AND 480 AND dispatch_download_origin_id IS NOT NULL;
DELETE FROM operation.dispatch_downloads WHERE dispatch_id BETWEEN 86 AND 480;
DELETE FROM operation.dispatch_movements WHERE dispatch_id BETWEEN 86 AND 480;
DELETE FROM operation.dispatch_audit_logs WHERE dispatch_id BETWEEN 86 AND 480;
DELETE FROM operation.dispatches WHERE id BETWEEN 86 AND 480 AND company_id = 18;

DELETE FROM operation.movement_types_details WHERE id BETWEEN 36 AND 73;
DELETE FROM operation.movement_types WHERE id BETWEEN 10 AND 14 AND company_id = 18;
DELETE FROM public.download_locations WHERE id IN (7, 8) AND company_id = 18;

DELETE FROM public.user_units WHERE business_unit_id = 36;
DELETE FROM public.vehicles WHERE id BETWEEN 1430 AND 1459 AND business_unit_id = 36;
DELETE FROM public.gps_devices WHERE id BETWEEN 6 AND 32 AND company_id = 18;
DELETE FROM public.business_units WHERE id = 36 AND company_id = 18;

COMMIT;
