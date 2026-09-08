/**
 * Mapeo captura -> ruta dentro de static/img/aio, para el buscador de rutas del Seguimiento
 * Vehicular (ticket 10646).
 *
 * `ruta_2.png` y `ruta_3.png` ya estan publicadas y muestran el formulario **anterior**, sin el
 * buscador de ruta ni la casilla de puntos de control, asi que se regeneran con `--sobrescribir`.
 * Las otras tres son nuevas.
 */
export const MAPPINGS = {
	"route-search": {
		"ruta-buscador-vacio.png": "AVL/SeguimientoVehicular/ruta_2.png",
		"ruta-resultados.png": "AVL/SeguimientoVehicular/ruta_3.png",
		"ruta-filtrada.png": "AVL/SeguimientoVehicular/ruta_filtrada.png",
		"ruta-ver-puntos.png": "AVL/SeguimientoVehicular/ruta_ver_puntos.png",
		"ruta-puntos-control.png": "AVL/SeguimientoVehicular/ruta_puntos_control.png",
		"ruta-punto-popup.png": "AVL/SeguimientoVehicular/ruta_punto_popup.png",
	},
};
