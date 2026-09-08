/**
 * Perfil de Status para la skill transversal `update-manual`.
 *
 * Es lo unico que el motor necesita saber de este proyecto. La ruta del manual no se declara en
 * el repo de trabajo: se resuelve desde `projects.json`, que ya sabe donde esta clonado.
 */

/** @type {import("../../../../skills/update-manual/lib/profile.mjs").Profile} */
export const PROFILE = {
  key: "status",
  label: "Status",

  /** Override opcional; normalmente la ruta sale de `projects.json`. */
  manualRootSetting: "STATUS_MANUAL_WEB",
  manualRepoName: "manua-web",

  /** Carpeta de imagenes dentro del manual, en segmentos. */
  imagesPath: ["website", "static", "img"],

  /** Como se referencian esas imagenes desde los `.md`: el sitio sirve `website/static` en la raiz. */
  imagesPublicPath: "/Manual/img",

  session: "./lib/session.mjs",

  /** Repo del front y carpetas cuyo cambio percibe el usuario final. */
  uiRepo: "/datos/proyectos/status",
  uiGlobs: ["resources/js/src/views"],

  /** Base local para los datos de demostracion de `lib/seed.mjs`. */
  db: {
    containerSetting: "STATUS_DB_CONTAINER",
    name: "status",
    user: "postgres",
  },
}
