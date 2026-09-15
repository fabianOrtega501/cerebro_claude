/**
 * Mapeo captura -> ruta dentro de static/img/aio, para la Autorizacion de fidelizacion.
 *
 * El documento es `AIO/Respel/Maestros/General/clients.md`, seccion "Fidelizacion de clientes", y
 * las imagenes van en la carpeta que ya usan las demas capturas de ese flujo.
 *
 * Todas son nuevas: la ventana de autorizacion no existia, asi que no hay nada que sobrescribir.
 */
export const MAPPINGS = {
	"client-loyalties-authorization": {
		"acciones-tabla.png": "Respel/Maestros/Clientes/Gestiones/loyalty/autorizacion-acciones.png",
		"modal-aprobar.png": "Respel/Maestros/Clientes/Gestiones/loyalty/autorizacion-aprobar.png",
		"modal-rechazar.png": "Respel/Maestros/Clientes/Gestiones/loyalty/autorizacion-rechazar.png",
	},
};
