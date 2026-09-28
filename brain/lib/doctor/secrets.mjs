/** Doctor, modulo secrets: permisos de secrets.env y ningun valor secreto dentro del repo. */
import { statSync } from "node:fs";
import { join } from "node:path";
import { finding, git, read } from "./context.mjs";

const AREA = "secrets";

/** Solo estos valores se buscan: un host o un puerto aparecen legitimamente en la documentacion. */
const SENSITIVE_KEY = /PASSWORD|TOKEN|SECRET|_KEY$/;

/** Mas corto que esto, un valor da falsos positivos en cualquier texto. */
const MIN_LENGTH = 6;

/** Pares clave-valor de secrets.env, ignorando comentarios y lineas sin valor. */
function entries(text) {
	return (text ?? "").split("\n")
		.map(l => l.trim())
		.filter(l => l && !l.startsWith("#") && l.indexOf("=") > 0)
		.map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
		.filter(([, v]) => v);
}

/** Hallazgos del modulo. Nunca imprime un valor: solo el nombre de la clave y el archivo. */
export function run(ctx) {
	const out = [];
	const path = join(ctx.root, "secrets.env");
	const text = read(path);

	if (text === null) {
		out.push(finding("aviso", AREA, "No existe ~/.claude/secrets.env: los flujos con login o conexion van a fallar.",
			"Crealo con permisos 600."));
		return out;
	}

	const mode = statSync(path).mode & 0o777;

	if (mode !== 0o600)
		out.push(finding("error", AREA, `secrets.env tiene permisos ${mode.toString(8)}: otros usuarios de la maquina lo pueden leer.`,
			"chmod 600 ~/.claude/secrets.env"));

	const secrets = entries(text).filter(([k, v]) => SENSITIVE_KEY.test(k) && v.length >= MIN_LENGTH);
	// Tambien lo no rastreado que no esta ignorado: es lo que entraria en el proximo `git add -A`.
	const candidates = [...ctx.tracked, ...(git(["ls-files", "--others", "--exclude-standard", "-z"]) ?? "").split("\0").filter(Boolean)];

	for (const file of new Set(candidates)) {
		const content = read(join(ctx.root, file));

		if (!content || content.length > 2 * 1024 * 1024)
			continue;

		for (const [key, value] of secrets) {
			if (content.includes(value))
				out.push(finding("error", AREA, `El valor de ${key} aparece en ${file}, que se versiona.`,
					`Quita el valor de ${file} y leelo con secret("${key}"); si ya se subio, rota la credencial.`));
		}
	}

	// The template must list every key, so a lost secrets.env can be rebuilt knowing what was there.
	const example = read(join(ctx.root, "secrets.example.env"));

	if (example === null)
		out.push(finding("aviso", AREA, "No existe secrets.example.env: si se pierde secrets.env no queda registro de que claves hacian falta.",
			"Crealo con las mismas claves y valores de ejemplo; se versiona."));
	else {
		const keysOf = t => new Set(entries(t).map(([k]) => k).concat([...t.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*$/gm)].map(m => m[1])));
		const real = keysOf(text);
		const template = keysOf(example);
		const missing = [...real].filter(k => !template.has(k));
		const extra = [...template].filter(k => !real.has(k));

		if (missing.length)
			out.push(finding("aviso", AREA, `secrets.example.env no tiene ${missing.length} clave(s) de secrets.env: ${missing.join(", ")}.`,
				"Agregalas al ejemplo con un valor de muestra."));
		if (extra.length)
			out.push(finding("info", AREA, `secrets.example.env lista claves que secrets.env no tiene: ${extra.join(", ")}.`));
	}

	return out;
}
