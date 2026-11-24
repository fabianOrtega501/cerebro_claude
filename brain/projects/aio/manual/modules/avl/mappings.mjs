/**
 * Mapeo captura -> ruta dentro de static/img/aio, para las vistas del módulo AVL.
 *
 * Cada vista tiene su propio documento en el manual y su propia carpeta de imágenes: el
 * popup es el mismo, pero la pantalla alrededor no, así que no se comparten capturas.
 */
export const MAPPINGS = {
	"gps-history": {
		"popup_ruta.png": "AVL/HistoricoGps/popup_ruta.png",
		"popup_ruta_detalle.png": "AVL/HistoricoGps/popup_ruta_detalle.png",
		"modal_detalle_ruta.png": "AVL/HistoricoGps/modal_detalle_ruta.png",

		// Ya existe en el manual: solo se reemplaza con --sobrescribir.
		"capa_rutas.png": "AVL/HistoricoGps/capa_rutas.png",
	},
	"vehicle-tracking": {
		"popup_ruta.png": "AVL/SeguimientoVehicular/ruta_popup.png",
		"popup_ruta_detalle.png": "AVL/SeguimientoVehicular/ruta_popup_detalle.png",
		"modal_detalle_ruta.png": "AVL/SeguimientoVehicular/ruta_modal_detalle.png",
	},

	/*
	 * Herramientas del mapa (controles flotantes, medición, coordenadas del cursor y pantalla
	 * completa). Están en las dos vistas del módulo, así que hay una entrada por vista y cada
	 * documento usa su carpeta.
	 */
	"map-tools-vehicle-tracking": {
		"controles_mapa.png": "AVL/SeguimientoVehicular/controles_mapa.png",
		"capas.png": "AVL/SeguimientoVehicular/capas.png",
		"agrupar.png": "AVL/SeguimientoVehicular/agrupar.png",
		"medicion.png": "AVL/SeguimientoVehicular/medicion.png",
		"coordenadas.png": "AVL/SeguimientoVehicular/coordenadas.png",
		"pantalla_completa.png": "AVL/SeguimientoVehicular/pantalla_completa.png",
	},
	"map-tools-gps-history": {
		"medicion.png": "AVL/HistoricoGps/medicion.png",
		"coordenadas.png": "AVL/HistoricoGps/coordenadas.png",
	},

	/* Nube del vehículo y su ventana «Despachos (24 h)»: capture-dispatch-history.mjs. */
	"vehicle-dispatch-history": {
		"vehiculo_nube.png": "AVL/SeguimientoVehicular/vehiculos_popup.png",
		"despachos_24h.png": "AVL/SeguimientoVehicular/despachos_24h.png",
	},
};
