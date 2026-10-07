/**
 * Destino en el manual de cada captura de Mantenimiento > Órdenes de trabajo.
 */
export const MAPPINGS = {
	/*
	 * Formulario de búsqueda, con el criterio Estado desplegado. Es imagen nueva: el documento
	 * describía el botón Buscar sin mostrar el formulario ni enumerar sus criterios.
	 */
	"work-order-search": {
		"orden_trabajo_buscar.png": "Mantenimiento/ordenDeTrabajo/OT_buscar.png",
	},

	/* Supply search with the menu open. `OT_26.png` is already published: regenerate with `--sobrescribir`. */
	"work-order-supplies": {
		"suministro-buscar.png": "Mantenimiento/ordenDeTrabajo/OT_26.png",
	},

	/* Activities: OT_22 and OT_36 are published (regenerate with `--sobrescribir`); OT_64-66 are new. */
	"work-order-activities": {
		"finalizar-actividad.png": "Mantenimiento/ordenDeTrabajo/OT_22.png",
		"procesar-masivo.png": "Mantenimiento/ordenDeTrabajo/OT_36.png",
		"observacion-botones.png": "Mantenimiento/ordenDeTrabajo/OT_64.png",
		"observacion-editable.png": "Mantenimiento/ordenDeTrabajo/OT_65.png",
		"observacion-consulta.png": "Mantenimiento/ordenDeTrabajo/OT_66.png",
	},
};
