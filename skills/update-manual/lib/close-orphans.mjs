/**
 * Cierra los navegadores de automatización que quedaron huérfanos.
 *
 * Hace falta porque **con Chrome/Brave instalado por snap no se pueden matar por señal**: el
 * confinamiento devuelve `EACCES`. La única vía es pedirles el cierre por el propio protocolo
 * de depuración.
 *
 * Un navegador huérfano no es inofensivo: sigue escuchando en el puerto 9222, y la corrida
 * siguiente **se conecta a él** en vez de lanzar uno nuevo. El síntoma es desconcertante —un
 * timeout esperando un selector que en la página sí está— porque se está mirando la pestaña de
 * otra corrida. Si un flujo falla esperando algo del login, correr esto primero.
 *
 * Uso:
 *   `node close-orphans.mjs`             cierra todos los que encuentre
 *   `node close-orphans.mjs 9222 9333`   solo esos puertos
 */

import { execSync } from "node:child_process";

/**
 * Puertos de depuración con un navegador vivo detrás.
 *
 * Se sacan de la línea de comandos de los procesos, no de los puertos en escucha: es lo que
 * distingue un navegador de automatización de la sesión normal del usuario, que no debe tocarse.
 *
 * @returns Puertos únicos, como cadenas. Vacío si no hay ninguno.
 */
function debugPorts() {
	try {
		const out = execSync("ps ax -o args=", { encoding: "utf8" });
		const found = [...out.matchAll(/--remote-debugging-port=(\d+)/g)].map(m => m[1]);

		return [...new Set(found)];
	}
	catch {
		return [];
	}
}

/**
 * Pide el cierre de un navegador por el protocolo.
 *
 * @returns `"cerrado"`, `"sin respuesta"` (ya no estaba) o `"falló"`.
 */
async function closeAt(port) {
	try {
		const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
		const ws = new WebSocket(info.webSocketDebuggerUrl);

		await new Promise((ok, no) => {
			ws.onopen = ok;
			ws.onerror = no;
			setTimeout(no, 4000);
		});

		// `Browser.close` casi nunca alcanza a responder: el navegador se va antes de contestar.
		ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
		await new Promise(r => setTimeout(r, 1200));
		ws.close();

		return "cerrado";
	}
	catch {
		return "sin respuesta";
	}
}

const ports = process.argv.slice(2).length ? process.argv.slice(2) : debugPorts();

if (!ports.length) {
	console.log("No hay navegadores de automatización abiertos.");
	process.exit(0);
}

for (const port of ports)
	console.log(`  ${port}: ${await closeAt(port)}`);

/**
 * Comprueba si un puerto todavía tiene un navegador que responda.
 *
 * Se pregunta por HTTP y no por `ps`: al cerrar el navegador quedan procesos hijos que siguen
 * apareciendo en la lista de procesos un buen rato, pero ya no escuchan. Contarlos como vivos
 * haría que este script siempre terminara con un aviso falso.
 */
async function isAlive(port) {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 2000);
		const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: controller.signal });

		clearTimeout(timer);

		return response.ok;
	}
	catch {
		return false;
	}
}

await new Promise(r => setTimeout(r, 1500));

const alive = [];

for (const port of [...new Set([...ports, ...debugPorts()])]) {
	if (await isAlive(port)) {
		console.log(`  ${port}: seguía vivo, segundo intento -> ${await closeAt(port)}`);

		if (await isAlive(port)) alive.push(port);
	}
}

console.log(alive.length ? `\nAviso: siguen vivos los puertos ${alive.join(", ")}.` : "\nTodo limpio.");
