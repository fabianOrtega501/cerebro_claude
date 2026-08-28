/**
 * Mapeo captura -> ruta dentro de static/img/AppMovil, para la configuración de empresa.
 *
 * Va a `Login/CompanyEndpoint/` porque la pantalla vive en el login: es el paso previo a
 * iniciar sesión, y así queda junto a las demás capturas de esa sección del manual.
 */
export const MAPPINGS = {
	settings: {
		"auto_open.png": "Login/CompanyEndpoint/auto_open.png",
		"auto_open_steps.png": "Login/CompanyEndpoint/auto_open_steps.png",
		"required.png": "Login/CompanyEndpoint/required.png",
		"not_found.png": "Login/CompanyEndpoint/not_found.png",
		"found.png": "Login/CompanyEndpoint/found.png",
		"fab.png": "Login/CompanyEndpoint/fab.png",
		"select.png": "Login/CompanyEndpoint/select.png",
		"select_open.png": "Login/CompanyEndpoint/select_open.png",
	},
};
