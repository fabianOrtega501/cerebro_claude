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
	"dispatch-movements": {
		"despachos_tabla.png": "Operaciones/Despachos/desplazamientos-boton-gestion.png",
		"despacho_movimientos.png": "Operaciones/Despachos/desplazamientos-tabla.png",
		"despacho_movimiento_form.png": "Operaciones/Despachos/desplazamientos-formulario.png",
	},
};
