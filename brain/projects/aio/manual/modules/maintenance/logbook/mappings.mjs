/**
 * Mapeo captura -> ruta dentro de static/img/aio, para la Bitacora de Mantenimiento.
 *
 * El documento del modulo es `Mantenimiento/BitacoraDeMantenimiento.md` y sus imagenes viven
 * sueltas en `Mantenimiento/`, con nombres correlativos (`bita1.png`, `bita2.png`...).
 */
export const MAPPINGS = {
	/*
	 * Formulario de busqueda. `bita3.png` ya esta publicada y es de antes de quitar el campo
	 * Tipo de Equipo —que no filtraba y salia deshabilitado—, asi que se regenera con
	 * `--sobrescribir`.
	 */
	"logbook-search": {
		"bitacora_buscar.png": "Mantenimiento/bita3.png",
	},

	/* Logbook follow-ups with responsible area and times. Already published: regenerate with `--sobrescribir`. */
	"logbook-tracking": {
		"bitacora_seguimientos.png": "Mantenimiento/bita7.png",
		"bitacora_seguimiento_form.png": "Mantenimiento/bita8.png",
		"bitacora_seguimiento_detalle.png": "Mantenimiento/bita9.png",
	},
};
