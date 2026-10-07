/**
 * Mapeo captura -> ruta dentro de static/img/aio, para Novedades de mantenimiento.
 *
 * El documento es `Mantenimiento/Novedades.md`; la página de Operaciones
 * (`Operaciones/Operaciones/Novedades/Novedades.md`) reutiliza estas mismas imágenes.
 */
export const MAPPINGS = {
	/*
	 * Seguimientos por tramos y el cierre con fecha. Son imágenes nuevas: la publicada
	 * `cerrarNovedad.png` es de la confirmación anterior y se deja intacta.
	 */
	"issue-trackings": {
		"seguimientos-accion.png": "Mantenimiento/Novedades/seguimientos-accion.png",
		"seguimientos-ventana.png": "Mantenimiento/Novedades/seguimientos-ventana.png",
		"seguimientos-agregar.png": "Mantenimiento/Novedades/seguimientos-agregar.png",
		"cerrar-novedad-fecha.png": "Mantenimiento/Novedades/cerrar-novedad-fecha.png",
	},
};
