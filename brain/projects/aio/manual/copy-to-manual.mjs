/**
 * Copia las capturas generadas al repositorio del manual, con el nombre y la carpeta que
 * espera cada documento.
 *
 * Por defecto **no sobrescribe** imágenes que ya existen en el manual: regenerar una captura
 * histórica cambia documentación que nadie pidió tocar. Para reemplazarlas hay que pedirlo
 * con `--sobrescribir`.
 *
 * Uso:
 *   node copy-to-manual.mjs --origen <carpeta> --vista <vista> [--sobrescribir]
 *                           [--manual <ruta a manua-web>]
 *
 * La ruta del manual se toma de `--manual`, o de la variable de entorno AIO_MANUAL_WEB.
 */

import { copyScreenshots, imagesRoot, resolveManualRoot } from "./lib/manual.mjs";

// Al agregar un módulo, importa su mappings.mjs y agrégalo aquí. Es el único punto
// que hay que tocar fuera de la carpeta del módulo.
import { MAPPINGS as authLogin } from "./modules/auth/login/mappings.mjs";
import { MAPPINGS as avl } from "./modules/avl/mappings.mjs";
import { MAPPINGS as avlRouteSearch } from "./modules/avl/mappings-route-search.mjs";
import { MAPPINGS as maintenanceLogbook } from "./modules/maintenance/logbook/mappings.mjs";
import { MAPPINGS as maintenanceSystems } from "./modules/maintenance/systems/mappings.mjs";
import { MAPPINGS as maintenanceWorkOrders } from "./modules/maintenance/work-orders/mappings.mjs";
import { MAPPINGS as mobileVisits } from "./modules/mobile/visits/mappings.mjs";
import { MAPPINGS as operationsDispatches } from "./modules/operations/dispatches/mappings.mjs";
import { MAPPINGS as operationsRoutes } from "./modules/operations/routes/mappings.mjs";
import { MAPPINGS as operationsTraining } from "./modules/operations/training-records/mappings.mjs";
import { MAPPINGS as respelClients } from "./modules/respel/clients/mappings.mjs";
import { MAPPINGS as respelClientLoyalties } from "./modules/respel/client-loyalties/mappings.mjs";
import { MAPPINGS as respelClientOperationCosts } from "./modules/respel/client-operation-costs/mappings.mjs";
import { MAPPINGS as publicCitizenPortal } from "./modules/public/citizen-portal/mappings.mjs";

const MAPPINGS_BY_VIEW = { ...authLogin, ...avl, ...avlRouteSearch, ...maintenanceLogbook, ...maintenanceSystems, ...maintenanceWorkOrders, ...mobileVisits, ...operationsDispatches, ...operationsRoutes, ...operationsTraining, ...respelClients, ...respelClientLoyalties, ...respelClientOperationCosts, ...publicCitizenPortal };

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const from = arg("origen", "./capturas");
const view = arg("vista", "gps-history");
const overwrite = args.includes("--sobrescribir");
const manualRoot = resolveManualRoot(arg("manual"));

const mappings = MAPPINGS_BY_VIEW[view];

if (!mappings) {
	console.error(`Vista desconocida: ${view}. Opciones: ${Object.keys(MAPPINGS_BY_VIEW).join(", ")}`);
	process.exit(1);
}

copyScreenshots({ from, mappings, imagesDir: imagesRoot(manualRoot), overwrite });
