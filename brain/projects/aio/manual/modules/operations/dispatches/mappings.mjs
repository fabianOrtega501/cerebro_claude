/**
 * Mapeo captura -> ruta dentro de static/img/aio, para las vistas de Operaciones > Despachos.
 *
 * El documento del módulo es `Operaciones/Operaciones/Despachos/Despachos.md` y sus imágenes
 * viven en `Operaciones/Despachos/`.
 *
 * Ojo con el nombre: en el código la entidad es `movements` (`dispatch-movements`,
 * `DispatchMovementsTable.vue`), pero en la interfaz y en el manual la pestaña se llama
 * **Desplazamientos**. Los nombres de destino usan el término del usuario.
 */
export const MAPPINGS = {
	/*
	 * Pestaña Desplazamientos, documentada en `Desplazamientos.md`.
	 *
	 * Los destinos son los nombres que el documento ya referencia. Antes apuntaban a nombres
	 * inventados —`desplazamientos-tabla.png` y compañía— que ningún documento usa: copiarlos
	 * dejaba imágenes huérfanas en el manual mientras la página seguía mostrando las viejas.
	 *
	 * La tabla de despachos que captura el flujo no se publica aquí: su imagen es
	 * `despachos_01.png` y le corresponde al flujo de Tripulación, que este perfil no tiene.
	 */
	"dispatch-movements": {
		"despacho_movimientos.png": "Operaciones/Despachos/desplazamientos_01.png",
		"despacho_movimiento_form.png": "Operaciones/Despachos/desplazamientos_02.png",
	},

	/*
	 * Log de Despacho. `despachos_08.png` ya está publicada: conserva el nombre numerado con el
	 * que existe desde el principio.
	 */
	"dispatch-log": {
		"despacho_log.png": "Operaciones/Despachos/despachos_08.png",
	},

	/*
	 * Cambio de vehículo del despacho, la acción con permiso propio del encabezado de la gestión.
	 *
	 * `despachos_11.png` ya está publicada: es el recorte de la tarjeta con el grupo de acciones y
	 * quedó sin el botón nuevo, así que se regenera con `--sobrescribir`. La del formulario es
	 * nueva, el documento no tenía nada de esta acción.
	 */
	"dispatch-change-vehicle": {
		"despacho_acciones.png": "Operaciones/Despachos/despachos_11.png",
		"cambio_vehiculo_formulario.png": "Operaciones/Despachos/cambio-vehiculo-formulario.png",
	},
	/*
	 * Criterios de la Gestion Diaria. `despachos_03.png` ya esta publicada y es de antes de la
	 * cascada de limpieza entre campos, asi que se regenera con `--sobrescribir`.
	 */
	"dispatch-daily-filters": {
		"gestion_diaria_filtros.png": "Operaciones/Despachos/despachos_03.png",
	},

	/*
	 * Tarjeta del despacho encontrado, ya con Servicio y Vehiculo. Es nueva: el documento no
	 * mostraba la tarjeta por separado.
	 */
	"dispatch-daily-card": {
		"gestion_diaria_tarjeta.png": "Operaciones/Despachos/gestion-diaria-tarjeta.png",
	},
};
