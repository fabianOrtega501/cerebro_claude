/** Doctor, modulo environments: registro valido, credenciales con ambiente y estado sano. */
import { PATHS, ENVIRONMENTS, databasesFromSecrets, describeState, readState, secretEntries } from "../environments.mjs";
import { finding, read } from "./context.mjs";

const AREA = "environments";

/** Hallazgos del modulo. */
export function run() {
	const out = [];
	const text = read(PATHS.registry);

	if (text === null)
		out.push(finding("aviso", AREA, "No existe brain/environments.json: solo cuentan las bases de secrets.env y lo siempre permitido se pierde (Mantis, GLPI, GitLab)."));
	else {
		try {
			const registry = JSON.parse(text);
			const extra = Object.keys(registry.environments ?? {}).filter(e => !ENVIRONMENTS.includes(e));

			if (extra.length)
				out.push(finding("error", AREA, `environments.json define ambientes que la guarda no conoce: ${extra.join(", ")}.`,
					`Los validos son ${ENVIRONMENTS.join(", ")}.`));
		}
		catch (error) {
			out.push(finding("error", AREA, `brain/environments.json no es JSON valido (${error.message}): la guarda trabaja sin sus hosts registrados.`));
		}
	}

	for (const key of databasesFromSecrets().unclassified)
		out.push(finding("aviso", AREA, `${key} en secrets.env no encaja en el esquema de bases, o su ambiente no tiene servidor: la guarda no la reconoce por credencial.`,
			"Servidores: DB_<SERVIDOR>_HOST/PORT/USERNAME/PASSWORD, declarados en \"servers\" de environments.json. Bases: DB_<PROYECTO>_<DESA|QA|PRE|PROD>."));

	const counts = new Map();

	for (const [key] of secretEntries())
		counts.set(key, (counts.get(key) ?? 0) + 1);

	const repeated = [...counts].filter(([, n]) => n > 1).map(([k]) => k);

	if (repeated.length)
		out.push(finding("error", AREA, `secrets.env repite claves (${repeated.join(", ")}): secret() devuelve solo la ultima, y un script puede conectarse al ambiente equivocado.`,
			"Deja una sola por nombre; si son de ambientes distintos, pon el ambiente en el nombre."));

	const stateText = read(PATHS.state);

	if (stateText !== null) {
		try {
			JSON.parse(stateText);
		}
		catch {
			out.push(finding("aviso", AREA, "cache/environment/state.json esta danado: la guarda asume local.", "Corre /ambiente local para reescribirlo."));
		}
	}

	const state = readState();

	if (state.environment !== "local")
		out.push(finding("info", AREA, `Ambiente activo: ${describeState(state)}.`));

	return out;
}
