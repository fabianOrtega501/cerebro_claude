/** Doctor, modulo versioning: lo que no debe viajar no viaja, y lo que se usa si viaja. */
import { spawnSync } from "node:child_process";
import { finding, git, has } from "./context.mjs";

const AREA = "versioning";

/** Lo que nunca debe estar en el repo del cerebro. */
const FORBIDDEN = [
	[/^secrets\.env$/, "las credenciales"],
	[/^cache\//, "el cache (las HU son documentos de clientes)"],
	[/\.jsonl$/, "una transcripcion de sesion"],
	[/(^|\/)__pycache__\//, "bytecode de Python"],
	[/^brain\/upstream\//, "el snapshot del .claude/ de un repo"],
];

/** Hallazgos del modulo. */
export function run(ctx) {
	const out = [];
	const tracked = new Set(ctx.tracked);

	for (const file of ctx.tracked) {
		const hit = FORBIDDEN.find(([pattern]) => pattern.test(file));

		if (hit)
			out.push(finding("error", AREA, `${file} esta versionado y es ${hit[1]}: viaja a GitHub.`,
				`git -C ~/.claude rm --cached '${file}' y revisa la lista blanca del .gitignore.`));
	}

	const used = [...(ctx.settingsText ?? "").matchAll(/(?:\$HOME|~)\/\.claude\/([\w./-]+\.(?:mjs|js|py|sh))/g)].map(m => m[1]);

	for (const file of new Set(used)) {
		const ignored = spawnSync("git", ["-C", ctx.root, "check-ignore", "-q", file]).status === 0;

		if (ignored)
			out.push(finding("error", AREA, `settings.json usa ${file}, pero el .gitignore lo excluye: restaurar el respaldo lo deja sin ese hook.`,
				"Agregalo a la lista blanca del .gitignore."));
		else if (!tracked.has(file) && ctx.exists(`${ctx.root}/${file}`))
			out.push(finding("info", AREA, `settings.json usa ${file}, que aun no esta commiteado.`));
	}

	const pending = (git(["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;

	if (pending)
		out.push(finding("info", AREA, `${pending} archivo(s) sin commitear en el cerebro.`, "Se commitea con tu aprobacion, despues de este diagnostico."));

	for (const remote of (git(["remote"]) ?? "").split("\n").filter(Boolean)) {
		const ahead = git(["rev-list", "--count", `${remote}/main..main`]);

		if (ahead && Number(ahead) > 0)
			out.push(finding("info", AREA, `${ahead.trim()} commit(s) sin subir a ${remote}.`));
	}

	const github = git(["remote", "get-url", "github"])?.trim().match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1];

	if (github && has("gh")) {
		const r = spawnSync("gh", ["repo", "view", github, "--json", "isPrivate", "-q", ".isPrivate"], { encoding: "utf8", timeout: 10000 });

		if (r.status === 0 && r.stdout.trim() === "false")
			out.push(finding("error", AREA, `El repo ${github} en GitHub es PUBLICO: memorias y reglas del equipo quedan expuestas.`,
				"Hazlo privado en GitHub > Settings > Danger Zone."));
		else if (r.status !== 0)
			out.push(finding("info", AREA, `No se pudo confirmar que ${github} siga privado (gh sin sesion o sin red).`));
	}
	else if (github)
		out.push(finding("info", AREA, `Sin gh instalado no se verifica que ${github} siga privado.`));

	return out;
}
