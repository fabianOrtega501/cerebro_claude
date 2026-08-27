/**
 * Mapeo captura -> ruta dentro de static/img/aio, para el maestro de Sistemas.
 *
 * El documento del módulo es `Mantenimiento/Sistemas.md` y sus imágenes viven en
 * `Mantenimiento/sistemas/` (en minúscula, a diferencia del nombre del documento).
 *
 * Esa carpeta tiene además subcarpetas de otras pestañas de la misma vista (`componentes`,
 * `componentesTipoVehiculo`, `componenteVehiculo`): estas cuatro imágenes son las de la
 * pestaña Sistemas y viven sueltas en la raíz de la carpeta.
 */
export const MAPPINGS = {
	systems: {
		"agregar.png": "Mantenimiento/sistemas/agregar.png",
		"buscar.png": "Mantenimiento/sistemas/buscar.png",
		"ver.png": "Mantenimiento/sistemas/ver.png",
		"editar.png": "Mantenimiento/sistemas/editar.png",
	},
};
