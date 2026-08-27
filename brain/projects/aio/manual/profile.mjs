/**
 * Perfil del AIO web para la skill transversal `update-manual`.
 *
 * Es lo único que el motor necesita saber de este proyecto. Agregar otro proyecto al flujo del
 * manual es escribir un archivo como este y su adaptador; el motor no se toca.
 */

/** @type {import("../../../../skills/update-manual/lib/profile.mjs").Profile} */
export const PROFILE = {
	key: "aio",
	label: "AIO web",

	/** Variable que apunta al repo del manual, en el `settings.local.json` del repo. */
	manualRootSetting: "AIO_MANUAL_WEB",

	/** Nombre del repo del manual, solo para que los mensajes de error sean reconocibles. */
	manualRepoName: "manua-web",

	/** Carpeta de imágenes dentro del manual, en segmentos. */
	imagesPath: ["website", "static", "img", "aio"],

	/**
	 * Cómo se referencian esas imágenes desde los `.md`.
	 * No es `imagesPath`: el manual sirve `website/static` desde la raíz del sitio.
	 */
	imagesPublicPath: "/Manual/img/aio",

	/** Dónde vive el adaptador de la app, relativo a esta carpeta. */
	session: "./lib/session.mjs",

	/** Repo del front y carpetas cuyo cambio el usuario final percibe. Las usa el hook del push. */
	uiRepo: "/datos/proyectos/AIO/aio-app",
	uiGlobs: ["src/views/pages", "src/pages"],
}
