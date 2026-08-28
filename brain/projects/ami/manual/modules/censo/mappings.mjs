/**
 * Mapeo captura -> ruta dentro de static/img/AppMovil, para el módulo de Censo.
 *
 * El módulo documenta cuatro pantallas: importar datos, censo programado, el formulario de
 * datos complementarios (igual en censo nuevo y en programado) y enviar datos.
 */
export const MAPPINGS = {
	censo: {
		"imports.png": "Censo/ImportData/imports.png",
		"buttons.png": "Censo/ImportData/buttons.png",
		"visits.png": "Censo/ImportData/visits.png",
		"masters.png": "Censo/ImportData/masters.png",
		"status.png": "Censo/ImportData/status.png",

		"visits_list.png": "CensoProgramado/visits.png",
		"buscar.png": "CensoProgramado/buscar.png",
		"sin_resultados.png": "CensoProgramado/sin_resultados.png",

		"datos_nuevo.png": "CensoNuevo/datos.png",
		"datos_programado.png": "CensoProgramado/datos.png",

		"cards.png": "Censo/SendData/cards.png",
		"sending.png": "Censo/SendData/sending.png",
		"in_process.png": "Censo/SendData/in_process.png",
		"success.png": "Censo/SendData/success.png",
		"partial.png": "Censo/SendData/partial.png",
		"failed.png": "Censo/SendData/failed.png",
		"off_error.png": "Censo/SendData/off_error.png",
	},
};
