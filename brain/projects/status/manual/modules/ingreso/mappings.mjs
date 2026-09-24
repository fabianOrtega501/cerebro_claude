/**
 * Mapeo de las capturas del ingreso a su ruta dentro del manual.
 *
 * Las imagenes cuelgan de `img/Status/Ingreso/` y no de `img/` a secas: la raiz del manual la
 * comparten diecinueve productos y ahi ya hay nombres genericos como `Agregar.png`.
 */
export const MAPPINGS = {
  ingreso: {
    "login.png": "Status/Ingreso/login.png",
    "captcha.png": "Status/Ingreso/captcha.png",
    "empresa.png": "Status/Ingreso/empresa.png",
    "tablero.png": "Status/Ingreso/tablero.png",
    "barra-superior.png": "Status/Ingreso/barra-superior.png",
    "tablero-oscuro.png": "Status/Ingreso/tablero-oscuro.png",
  },
};
