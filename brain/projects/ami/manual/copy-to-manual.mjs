/**
 * Copia las capturas generadas al repositorio del manual, con el nombre y la carpeta que
 * espera cada documento.
 *
 * Por defecto **no sobrescribe** imágenes que ya existen en el manual: regenerar una captura
 * histórica cambia documentación que nadie pidió tocar. Para reemplazarlas hay que pedirlo
 * con `--sobrescribir`.
 *
 * Uso:
 *   node copy-to-manual.mjs --origen <carpeta> [--modulo censo] [--sobrescribir]
 *                           [--manual <ruta a manua-web>]
 *
 * La ruta del manual se toma de `--manual`, o de la variable de entorno AIO_MANUAL_WEB.
 */

import { copyScreenshots, imagesRoot, resolveManualRoot } from "./lib/manual.mjs";

// Al agregar un módulo, importa su mappings.mjs y agrégalo aquí. Es el único punto
// que hay que tocar fuera de la carpeta del módulo.
import { MAPPINGS as censo } from "./modules/censo/mappings.mjs";
import { MAPPINGS as settings } from "./modules/settings/mappings.mjs";

const MAPPINGS_BY_MODULE = { ...censo, ...settings };

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : fallback;
};

const from = arg("origen", "./capturas");
const moduleName = arg("modulo", "censo");
const overwrite = args.includes("--sobrescribir");
const manualRoot = resolveManualRoot(arg("manual"));

const mappings = MAPPINGS_BY_MODULE[moduleName];

if (!mappings) {
	console.error(`Módulo desconocido: ${moduleName}. Opciones: ${Object.keys(MAPPINGS_BY_MODULE).join(", ")}`);
	process.exit(1);
}

copyScreenshots({ from, mappings, imagesDir: imagesRoot(manualRoot), overwrite });
