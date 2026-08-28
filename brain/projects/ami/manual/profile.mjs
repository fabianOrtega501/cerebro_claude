/**
 * Perfil de AMI para la skill transversal `update-manual`.
 * Lo unico que el motor necesita saber de este proyecto; el motor no se toca.
 */

/** @type {import("../../../../skills/update-manual/lib/profile.mjs").Profile} */
export const PROFILE = {
	key: "ami",
	label: "AMI — app movil",

	manualRootSetting: "AIO_MANUAL_WEB",
	manualRepoName: "manua-web",

	/** Carpeta de imagenes dentro del manual. AMI escribe en AppMovil, no en aio. */
	imagesPath: ["website", "static", "img", "AppMovil"],
	imagesPublicPath: "/Manual/img/AppMovil",

	session: "./lib/session.mjs",

	/** Repo del front y carpetas cuyo cambio percibe el operario. Las usa el hook del push. */
	uiRepo: "/datos/proyectos/app-movil",
	uiGlobs: ["src/views/pages", "src/components"],
}
