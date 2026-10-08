/**
 * Mapeo captura -> ruta dentro de static/img/aio, para la pestana Mapa de Clientes.
 *
 * El documento es `AIO/Respel/Maestros/General/clients-map.md` y las imagenes van en una carpeta
 * propia bajo las de Clientes, al lado de las de Prospectos.
 *
 * Las cinco primeras se publicaron con la pestana; desde que el mapa muestra sucursales se
 * regeneran con --sobrescribir y se suma la del globo de sucursal.
 */
export const MAPPINGS = {
	"clients-map": {
		"mapa-general.png": "Respel/Maestros/Clientes/Mapa/general.png",
		"mapa-capas.png": "Respel/Maestros/Clientes/Mapa/capas.png",
		"mapa-filtros.png": "Respel/Maestros/Clientes/Mapa/filtros.png",
		"mapa-globo.png": "Respel/Maestros/Clientes/Mapa/globo.png",
		"mapa-globo-sucursal.png": "Respel/Maestros/Clientes/Mapa/globo-sucursal.png",
		"mapa-pantalla-completa.png": "Respel/Maestros/Clientes/Mapa/pantalla-completa.png",
	},
};
