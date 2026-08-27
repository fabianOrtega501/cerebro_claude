/**
 * Mapeo captura -> ruta dentro de static/img/aio, para las vistas de Operaciones > Rutas.
 */
export const MAPPINGS = {
	/*
	 * Consulta geográfica de la ruta. El mismo modal se documenta en dos documentos: `rutas.md`,
	 * donde se abre desde la tabla de rutas, y `routesGeometries.md`, donde se abre por cada
	 * versión de la geometría. Cada documento usa su propia carpeta de imágenes.
	 */
	"route-geometry": {
		"tabla_rutas.png": "Operaciones/Rutas/ruta_mapa_boton.png",
		"modal_mapa.png": "Operaciones/Rutas/ruta_mapa.png",
		"popup_geometria.png": "Operaciones/Rutas/ruta_mapa_popup_linea.png",
		"popup_poligono.png": "Operaciones/Rutas/ruta_mapa_popup_poligono.png",
		"popup_punto_control.png": "Operaciones/Rutas/ruta_mapa_popup_punto_control.png",
		"modal_mapa_capa_oculta.png": "Operaciones/Rutas/ruta_mapa_capa_oculta.png",
		"modal_mapa_ampliado.png": "Operaciones/Rutas/ruta_mapa_ampliado.png",

		// El documento de geometrías numera sus imágenes; 1..8 ya existen.
		"tab_geometrias.png": "Operaciones/GeometriasRutas/9.png",
		"modal_mapa_version.png": "Operaciones/GeometriasRutas/10.png",

		/*
		 * 4.png mostraba la columna de acciones con el botón de ver, que fue reemplazado por el
		 * de consulta geográfica: hay que regenerarla con --sobrescribir.
		 */
		"tab_geometrias_edicion.png": "Operaciones/GeometriasRutas/4.png",
	},

	/*
	 * Asistente de la ruta abierto con el botón Ver. Se documentan dos pestañas: con las cuatro
	 * el documento quedaría repitiendo la misma idea con distintas tablas.
	 *
	 * `modal_detalle_ruta_personal.png` se genera pero no se copia: con los datos de prueba ese
	 * paso del wizard sale vacío ("No data available") y documentaría un estado sin información.
	 * Agregarlo cuando exista una ruta con personal asignado.
	 */
	"route-read-only": {
		"consulta_personal.png": "Operaciones/Rutas/ruta_consulta_personal.png",
		"consulta_puntos_control.png": "Operaciones/Rutas/ruta_consulta_puntos_control.png",
	},
};
