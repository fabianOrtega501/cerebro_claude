/**
 * Copia de capturas al repositorio del manual.
 *
 * El motor es genérico: recibe un mapeo `captura -> ruta dentro de la carpeta de imágenes` y
 * hace la copia con las validaciones. Los mapeos concretos viven en cada módulo del proyecto
 * (`modules/<modulo>/mappings.mjs`), y a qué manual y a qué subcarpeta van lo dice el perfil.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MOTOR TRANSVERSAL del cerebro. Las dos funciones que dependen del proyecto reciben su
 * `profile`; el proyecto se lo inyecta desde `lib/manual.mjs` de su carpeta de manual.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requiredSetting } from "./config.mjs";

/**
 * Resuelve la ruta del repo del manual y aborta con un mensaje claro si no está.
 *
 * @param {object} profile - Perfil del proyecto (ver `profile.mjs`); de él salen el nombre de
 *        la variable de configuración y cómo se llama el repo en el mensaje de error
 * @param {string} [explicitPath] - Ruta pasada por `--manual`; tiene prioridad
 * @returns {string} La ruta al repositorio del manual, ya comprobada. **Si falta o no existe,
 *          no devuelve: termina el proceso** con un mensaje que dice dónde definirla
 */
export function resolveManualRoot(profile, explicitPath) {
	const root = explicitPath ?? requiredSetting(profile.manualRootSetting, { para: `la ruta al repo del manual, ${profile.manualRepoName}` });

	if (!existsSync(root)) {
		console.error(`La ruta del manual no existe: ${root}`);
		process.exit(1);
	}

	return root;
}

/**
 * Carpeta de imágenes del proyecto dentro del manual.
 *
 * La ruta pública que se escribe en los `.md` no coincide con la del disco (el manual sirve
 * `website/static` desde la raíz); por eso el perfil declara las dos por separado.
 *
 * @param {object} profile - Perfil del proyecto; aporta `imagesPath`, los segmentos de carpeta
 *        relativos a la raíz del manual
 * @param {string} manualRoot - Raíz del repositorio del manual (ver `resolveManualRoot`)
 * @returns {string} Ruta absoluta a la carpeta de imágenes. **No la crea**: de eso se encarga
 *          `copyScreenshots` al copiar cada archivo
 */
export const imagesRoot = (profile, manualRoot) => join(manualRoot, ...profile.imagesPath);

/**
 * Lee el ancho y alto de un PNG desde su cabecera IHDR.
 *
 * Se hace a mano y no con una librería para no meterle dependencias a la skill.
 *
 * @param {string} path - Ruta del PNG
 * @returns {{width: number, height: number}} Dimensiones en píxeles. **No valida que el archivo
 *          sea un PNG**: con otro formato devuelve números sin sentido
 */
export function pngSize(path) {
	const bytes = readFileSync(path);

	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Copia las capturas de una vista al manual.
 *
 * Por defecto **no sobrescribe** lo que ya existe: regenerar una captura histórica cambia
 * documentación que nadie pidió tocar.
 *
 * @param {object} options
 * @param {object} options
 * @param {string} options.from - Carpeta con las capturas generadas
 * @param {Record<string,string>} options.mappings - captura -> ruta relativa en el manual
 * @param {string} options.imagesDir - Carpeta destino (ver `imagesRoot`)
 * @param {boolean} [options.overwrite=false] - Reemplazar las que ya existan
 * @returns {{copied: number, missing: string[], suspicious: string[], kept: string[]}} Resumen
 *          de la copia. **Conviene revisarlo**: `missing` son capturas que el flujo no generó y
 *          `suspicious` las que se descartaron por tamaño (recorte fallido), y ninguna de las
 *          dos interrumpe el proceso
 */
export function copyScreenshots({ from, mappings, imagesDir, overwrite = false }) {
	let copied = 0;
	const missing = [];
	const suspicious = [];
	const kept = [];

	for (const [screenshot, relativeTarget] of Object.entries(mappings)) {
		const source = join(from, screenshot);

		if (!existsSync(source)) {
			missing.push(screenshot);
			continue;
		}

		// Un recorte fallido no falla: produce una imagen de 20x20 o de miles de píxeles de alto.
		const { width, height } = pngSize(source);
		if (width < 200 || height < 100 || height > 4000) {
			suspicious.push(`${screenshot} (${width}x${height})`);
			continue;
		}

		const target = join(imagesDir, relativeTarget);

		if (existsSync(target) && !overwrite) {
			kept.push(relativeTarget);
			continue;
		}

		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(source, target);
		console.log(`  ${screenshot.padEnd(34)} ${width}x${height} -> ${relativeTarget}`);
		copied++;
	}

	console.log(`\nCopiadas ${copied} de ${Object.keys(mappings).length}`);
	if (missing.length) console.log(`Sin generar: ${missing.join(", ")}`);
	if (suspicious.length) console.log(`Descartadas por tamaño (recorte fallido): ${suspicious.join(", ")}`);
	if (kept.length) console.log(`Ya existían y se dejaron intactas (usar --sobrescribir): ${kept.join(", ")}`);

	return { copied, missing, suspicious, kept };
}
