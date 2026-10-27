/**
 * Arma el inventario de lo que toca un desarrollo, para que la prueba cubra el cambio entero y no
 * lo que a uno se le ocurra mirar.
 *
 * Por cada archivo del diff devuelve: que tipo de cambio es, que simbolos se tocaron, quien los
 * consume en los demas repos del proyecto, y que hay que comprobar segun el tipo. No ejecuta
 * ninguna prueba ni decide si algo esta bien: devuelve la matriz en JSON y la prueba se hace arriba.
 *
 * Los tipos de cambio salen de devoluciones reales de QA: cada uno es un error que ya nos costo
 * una devolucion. La lista crece cuando aparezca uno nuevo.
 *
 * Uso:
 *   node impact-inventory.mjs --base desa
 *   node impact-inventory.mjs --repo /ruta --base origin/desa --json
 *   node impact-inventory.mjs --base desa --tambien /datos/proyectos/sipa
 *
 * `--tambien` agrega repos que consumen este pero viven en otro proyecto de projects.json, como
 * SIPA frente a status-api. Sin eso sus consumidores no aparecen.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Tipos de cambio y que hay que comprobar en cada uno. `patron` se busca en las lineas del diff.
 */
const TIPOS = [
	{
		id: "transaccion",
		patron: /^\+.*->transaction\(|^\+.*DB::(connection\([^)]*\))?->transaction/,
		comprobar: "Toda escritura dentro del bloque: por que conexion va. Otra conexion no ve lo sin confirmar.",
		origen: "F7 del 7433: el primer cargue fallaba por llave foranea",
	},
	{
		id: "firma",
		patron: /^[+-]\s*(public|private|protected)?\s*function\s+\w+\s*\(/,
		comprobar: "Todos los llamadores y que tipo declaran recibir o devolver.",
		origen: "F8 del 7433: deLaEmpresa paso a arreglo y el llamador pedia objeto",
	},
	{
		id: "clave-respuesta",
		patron: /^[+-].*(ApiResponse::|['"]data['"]\s*=>|->json\()/,
		comprobar: "Los consumidores de esa clave en todos los repos del proyecto.",
		origen: "archivoLog contra log en el 7433",
	},
	{
		id: "manejo-error",
		patron: /^-.*(catch|\.success|notify|toast|\$vs\.notify)/,
		comprobar: "Que reemplaza al manejo que se quito, y bajo que respuesta del backend se activa.",
		origen: "F10 del 7433: Reversiones dejo de avisar del error",
	},
	{
		id: "url-o-ruta",
		patron: /^\+.*(asset\(|url\(|public_path\(|APP_URL|baseURL)/,
		comprobar: "Que el destino se alcance DESDE DONDE CORRE EL CODIGO, no solo desde el navegador.",
		origen: "Las fuentes del PDF: el contenedor no alcanzaba su propio dominio",
	},
	{
		id: "recurso",
		patron: /^\+.*(view\(|loadView\(|@include|src=|require\()/,
		comprobar: "Que la vista, imagen, fuente o archivo que referencia exista en ESTE repo.",
		origen: "F3 del 7433: las plantillas del acta no se habian traido",
	},
	{
		id: "conexion",
		patron: /^[+-].*(DB::table|DB::connection|getConnection\(\))/,
		comprobar: "Que la conexion sea la del modelo y no la de por defecto.",
		origen: "F7 del 7433 y el mismo patron en BloqueoService",
	},
];

/** Carpetas cuyo contenido no se prueba: lo genera una herramienta. */
const IGNORADAS = /^(vendor|node_modules|dist|storage\/api-docs|public\/build)\//;

/** Carpetas que el grep de consumidores no mira: son dependencias o build. */
const FUERA = ["node_modules", "vendor", "dist", "build", ".git", "chunks", "storage"];

/**
 * Nombres tan comunes que buscarlos devuelve medio repositorio. Un consumidor de estos no dice
 * nada: hay que mirar el flujo, no el grep.
 */
const DEMASIADO_COMUNES = new Set([
	"__construct", "render", "report", "campo", "data", "index", "store", "update", "destroy",
	"show", "create", "edit", "delete", "get", "set", "save", "find", "query", "handle", "boot",
	"rules", "messages", "id", "nombre", "estado", "value", "type", "name", "key", "item", "list",
	"error", "errors", "message", "status", "result", "response", "request", "config", "options",
]);

/**
 * Corre git y devuelve la salida limpia.
 *
 * @param {string[]} args
 * @param {string} repo
 * @returns {string}
 */
function git(args, repo) {
	return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

/**
 * Repos del proyecto al que pertenece el repo dado, segun projects.json del cerebro.
 *
 * @param {string} repo
 * @returns {string[]}
 */
function reposHermanos(repo) {
	const registro = path.join(homedir(), ".claude/brain/projects.json");

	if (!existsSync(registro)) {
		return [];
	}

	const proyectos = JSON.parse(readFileSync(registro, "utf8"));
	const todos = Object.values(proyectos.projects ?? proyectos).flatMap((p) =>
		Object.values(p.repos ?? {}).map((r) => (typeof r === "string" ? r : r.path)),
	);
	const mio = todos.find((r) => r && path.resolve(r) === path.resolve(repo));
	const grupo = Object.values(proyectos.projects ?? proyectos).find((p) =>
		Object.values(p.repos ?? {}).some((r) => (typeof r === "string" ? r : r?.path) === mio),
	);

	return Object.values(grupo?.repos ?? {})
		.map((r) => (typeof r === "string" ? r : r.path))
		.filter((r) => r && existsSync(r));
}

/**
 * Nombres de funcion, metodo o clave que cambiaron en el diff de un archivo.
 *
 * @param {string} diff
 * @returns {string[]}
 */
function simbolosTocados(diff) {
	const nombres = new Set();

	for (const linea of diff.split("\n")) {
		if (!/^[+-]/.test(linea) || /^[+-]{3}/.test(linea)) {
			continue;
		}

		const funcion = linea.match(/function\s+(\w+)/);
		const metodoJs = linea.match(/^\s*[+-]\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/);
		const clave = linea.match(/['"](\w{4,})['"]\s*=>/);

		for (const encontrado of [funcion?.[1], metodoJs?.[1], clave?.[1]]) {
			if (encontrado && encontrado.length >= 5 && !DEMASIADO_COMUNES.has(encontrado.toLowerCase())) {
				nombres.add(encontrado);
			}
		}
	}

	return [...nombres].slice(0, 12);
}

/**
 * Archivos de los demas repos que mencionan alguno de los simbolos.
 *
 * @param {string[]} simbolos
 * @param {string[]} repos
 * @param {string} propio
 * @returns {object[]}
 */
function consumidores(simbolos, repos, propio) {
	const hallados = [];

	for (const repo of repos) {
		if (path.resolve(repo) === path.resolve(propio)) {
			continue;
		}

		for (const simbolo of simbolos) {
			try {
				const salida = execFileSync(
					"grep",
					[
						"-rl",
						"--include=*.php",
						"--include=*.js",
						"--include=*.vue",
						...FUERA.map((d) => `--exclude-dir=${d}`),
						"-e",
						simbolo,
						repo,
					],
					{ encoding: "utf8", timeout: 20000 },
				).trim();

				for (const archivo of salida.split("\n").filter(Boolean).slice(0, 4)) {
					hallados.push({ repo: path.basename(repo), simbolo, archivo: path.relative(repo, archivo) });
				}
			} catch {
				// grep sale 1 cuando no encuentra nada: no es un error
			}
		}
	}

	return hallados.slice(0, 25);
}

/**
 * Tipos de cambio que encajan con el diff de un archivo.
 *
 * @param {string} diff
 * @returns {object[]}
 */
function tiposDelDiff(diff) {
	const lineas = diff.split("\n");

	return TIPOS.filter((tipo) => lineas.some((l) => tipo.patron.test(l))).map(({ id, comprobar, origen }) => ({
		id,
		comprobar,
		origen,
	}));
}

const args = process.argv.slice(2);
const valor = (bandera) => {
	const i = args.indexOf(bandera);
	return i === -1 ? null : args[i + 1];
};

const repo = path.resolve(valor("--repo") ?? process.cwd());
const base = valor("--base") ?? "desa";
const comoJson = args.includes("--json");

const referencia = git(["rev-parse", "--verify", `origin/${base}`], repo).length
	? `origin/${base}`
	: base;
const archivos = git(["diff", "--name-only", `${referencia}...HEAD`], repo)
	.split("\n")
	.filter((f) => f && !IGNORADAS.test(f));

const extra = args.flatMap((a, i) => (a === "--tambien" ? [args[i + 1]] : [])).filter(Boolean);
const hermanos = [...new Set([...reposHermanos(repo), ...extra.map((r) => path.resolve(r))])].filter(existsSync);
const inventario = archivos.map((archivo) => {
	const diff = git(["diff", `${referencia}...HEAD`, "--", archivo], repo);
	const simbolos = simbolosTocados(diff);

	return {
		archivo,
		tipos: tiposDelDiff(diff),
		simbolos,
		consumidores: consumidores(simbolos, hermanos, repo),
		lineas: diff.split("\n").filter((l) => /^[+-]/.test(l) && !/^[+-]{3}/.test(l)).length,
	};
});

const salida = {
	repo,
	base: referencia,
	archivos: inventario.length,
	reposDelProyecto: hermanos.map((r) => path.basename(r)),
	inventario,
};

if (comoJson) {
	console.log(JSON.stringify(salida, null, 2));
} else {
	console.log(`${path.basename(repo)}  ${inventario.length} archivo(s) contra ${referencia}`);
	console.log(`repos del proyecto: ${salida.reposDelProyecto.join(", ") || "(solo este)"}\n`);

	for (const fila of inventario) {
		console.log(`  ${fila.archivo}  (${fila.lineas} lineas)`);

		for (const tipo of fila.tipos) {
			console.log(`     [${tipo.id}] ${tipo.comprobar}`);
		}

		for (const c of fila.consumidores) {
			console.log(`     usa "${c.simbolo}": ${c.repo}/${c.archivo}`);
		}

		if (fila.tipos.length === 0 && fila.consumidores.length === 0) {
			console.log("     sin riesgo tipificado: igual hay que decir como se probo");
		}
	}

	console.log(`\nCada archivo necesita su fila en la tabla de cobertura, incluso los que no se probaron.`);
}
