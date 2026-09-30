/**
 * Mapeo de las capturas del ingreso a su ruta dentro del manual.
 *
 * Las imagenes del ingreso ya vivian en `img/Status/ManualUsuarioBI/AccesoUsuarios/`, que es de
 * donde las lee `docs/Status/ManualUsuarioBI/AccesoUsuarios/ingreso_plataforma.md`. Los nombres
 * `AccesoUsuarios_N` son los que ya estaban publicados: renombrarlos romperia el documento.
 */
export const MAPPINGS = {
  ingreso: {
    "login.png": "Status/ManualUsuarioBI/AccesoUsuarios/AccesoUsuarios_1.png",
    "empresa.png": "Status/ManualUsuarioBI/AccesoUsuarios/AccesoUsuarios_2.png",
    "tablero.png": "Status/ManualUsuarioBI/AccesoUsuarios/AccesoUsuarios_3.png",
    "captcha.png": "Status/ManualUsuarioBI/AccesoUsuarios/captcha.png",
    "barra-superior.png": "Status/ManualUsuarioBI/AccesoUsuarios/barra-superior.png",
    "tablero-oscuro.png": "Status/ManualUsuarioBI/AccesoUsuarios/tablero-oscuro.png",
  },
};
