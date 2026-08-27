/**
 * Mapeo captura -> ruta dentro de static/img/aio, para el Portal Ciudadano.
 *
 * Ojo con los nombres: en el código la vista es `citizen-portal` (`/public/citizen-portal`), en la
 * pantalla se titula **Portal Ciudadano**, y la carpeta del manual conserva el nombre con el que se
 * creó, `ConsultaElementosPublico`. Los tres conviven a propósito: renombrar la carpeta rompería
 * los enlaces de las imágenes ya publicadas.
 */
export const MAPPINGS = {
	"citizen-portal": {
		"landing.png": "Operaciones/ConsultaElementosPublico/pantalla-principal.png",
		"landing-qr.png": "Operaciones/ConsultaElementosPublico/pantalla-qr.png",
		"landing-movil.png": "Operaciones/ConsultaElementosPublico/pantalla-movil.png",
		"control-tamano.png": "Operaciones/ConsultaElementosPublico/control-tamano-texto.png",
		"idioma.png": "Operaciones/ConsultaElementosPublico/selector-idioma.png",
		"landing-ingles.png": "Operaciones/ConsultaElementosPublico/pantalla-ingles.png",
		"opcion-proximamente.png": "Operaciones/ConsultaElementosPublico/aviso-proximamente.png",
		"boton-accesibilidad.png": "Operaciones/ConsultaElementosPublico/boton-accesibilidad.png",
		"panel-accesibilidad.png": "Operaciones/ConsultaElementosPublico/menu-accesibilidad.png",
		"texto-ampliado.png": "Operaciones/ConsultaElementosPublico/texto-ampliado.png",
		"fuente-legible.png": "Operaciones/ConsultaElementosPublico/fuente-legible.png",
		"espaciado-texto.png": "Operaciones/ConsultaElementosPublico/espaciado-texto.png",
		"resaltar-enlaces.png": "Operaciones/ConsultaElementosPublico/resaltar-enlaces.png",
		"alto-contraste.png": "Operaciones/ConsultaElementosPublico/alto-contraste.png",
		"panel-restablecer.png": "Operaciones/ConsultaElementosPublico/menu-restablecer.png",
	},

	// Reciclaje y voluminosos tiene su propio documento, y por eso su propia carpeta de imágenes.
	"citizen-portal-recycling": {
		"reciclaje.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/pantalla.png",
		"reciclaje-movil.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/pantalla-movil.png",
		"reciclaje-filtros.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/filtros.png",
		"reciclaje-filtro-apagado.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/filtro-apagado.png",
		"reciclaje-controles.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/controles-mapa.png",
		"reciclaje-punto.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/punto-seleccionado.png",
		"reciclaje-globo.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/globo-punto.png",
		"reciclaje-ubicacion.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/con-ubicacion.png",
		"reciclaje-escaneado.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/punto-escaneado.png",
		"reciclaje-globo-escaneado.png": "Operaciones/ConsultaElementosPublico/ReciclajeVoluminosos/globo-escaneado.png",
	},
};
