#!/usr/bin/env node
/**
 * Consulta en GitLab (solo lectura) el merge request de una rama y lista todos los archivos que toca.
 * Uso: node gitlab-mr.mjs <rama> [--repo <ruta>]   ·   sale con 3 si no hay GITLAB_TOKEN: la revisión sigue con el diff local.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { SECRETS_PATH, secret } from "../../../brain/lib/secrets.mjs";

/** Registros por página que pide a la API. */
const PER_PAGE = 100;

/** Espera máxima al probar si la API responde en una URL. */
const PROBE_TIMEOUT_MS = 5000;

/** Código de salida cuando falta el token. */
const NO_TOKEN = 3;

/** Setting from the environment or `~/.claude/secrets.env`; never from settings.json, which is versioned. */
function setting(name) {
	return process.env[name] || secret(name) || null;
}

/** Host, esquema y ruta del proyecto en GitLab a partir del remoto `origin` del repo. */
function remoteProject(path) {
	const remote = execFileSync("git", ["-C", resolve(path ?? process.cwd()), "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
	const http = /^(https?):\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(remote);
	if (http) return { schemes: [http[1]], host: http[2], project: http[3] };

	const ssh = /^(?:ssh:\/\/)?(?:[^@]+@)?([^:/]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/.exec(remote);
	if (ssh) return { schemes: ["https", "http"], host: ssh[1], project: ssh[2] };

	throw new Error("No se reconoce el proyecto de GitLab en el remoto origin.");
}

/** GET a la API de GitLab con todas las páginas del resultado. */
async function get(base, token, path) {
	const results = [];
	let page = 1;
	for (;;) {
		const separator = path.includes("?") ? "&" : "?";
		const response = await fetch(`${base}/api/v4${path}${separator}per_page=${PER_PAGE}&page=${page}`, { headers: { "PRIVATE-TOKEN": token } });
		if (!response.ok) throw new Error(`GitLab respondió ${response.status} en ${path.split("?")[0]}: ${(await response.text()).slice(0, 200)}`);
		const data = await response.json();
		if (!Array.isArray(data)) return data;
		results.push(...data);
		if (!response.headers.get("x-next-page")) return results;
		page += 1;
	}
}

/** Primera URL base que responde a la API: la de GITLAB_URL o las que salen del remoto. */
async function apiBase(remote, token) {
	const configured = setting("GITLAB_URL");
	const candidates = configured ? [configured.replace(/\/$/, "")] : remote.schemes.map((scheme) => `${scheme}://${remote.host}`);
	for (const candidate of candidates) {
		try {
			const response = await fetch(`${candidate}/api/v4/version`, { headers: { "PRIVATE-TOKEN": token }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
			if (response.ok) return candidate;
		}
		catch {
			continue;
		}
	}
	throw new Error(`GitLab no respondió en ${candidates.join(" ni en ")}. Si la API está en otra URL, defínela en GITLAB_URL.`);
}

/** Diffs del merge request: `/diffs` (GitLab ≥ 15.7) o, si no existe, `/changes` con diffs sin recortar. */
async function mergeRequestDiffs(base, token, path) {
	try {
		return { diffs: await get(base, token, `${path}/diffs`), truncated: false };
	}
	catch (error) {
		if (!String(error.message).includes(" 404 ")) throw error;
		const changes = await get(base, token, `${path}/changes?access_raw_diffs=true`);

		return { diffs: changes.changes ?? [], truncated: Boolean(changes.overflow) };
	}
}

/** Estado de un archivo en el diff del merge request. */
function fileState(diff) {
	if (diff.new_file) return "nuevo";
	if (diff.deleted_file) return "borrado";
	if (diff.renamed_file) return "renombrado";

	return "modificado";
}

const args = process.argv.slice(2);
const branch = args[0];
const repoPath = args.includes("--repo") ? args[args.indexOf("--repo") + 1] : null;

try {
	if (!branch || branch.startsWith("--")) throw new Error("Uso: node gitlab-mr.mjs <rama> [--repo <ruta>]");
	const token = setting("GITLAB_TOKEN");
	if (!token) {
		process.stderr.write([
			"Sin GITLAB_TOKEN: no se consulta el merge request. La revisión sigue con el diff local.",
			"Para activarlo, crea en GitLab un token personal con scope read_api y agrega esta línea a",
			`${SECRETS_PATH}:  GITLAB_TOKEN=<token>   (nunca en settings.json, que se versiona).`,
		].join("\n") + "\n");
		process.exit(NO_TOKEN);
	}
	const remote = remoteProject(repoPath);
	const base = await apiBase(remote, token);
	const project = encodeURIComponent(remote.project);

	const requests = await get(base, token, `/projects/${project}/merge_requests?source_branch=${encodeURIComponent(branch)}&state=all&order_by=updated_at`);
	if (requests.length === 0) throw new Error(`No hay merge request con la rama de origen ${branch}.`);

	const mr = requests[0];
	const { diffs, truncated } = await mergeRequestDiffs(base, token, `/projects/${project}/merge_requests/${mr.iid}`);
	const files = diffs.map((d) => ({ path: d.new_path, previous: d.renamed_file ? d.old_path : undefined, state: fileState(d) }));

	process.stdout.write(`${JSON.stringify({
		iid: mr.iid,
		title: mr.title,
		state: mr.state,
		author: mr.author?.name,
		targetBranch: mr.target_branch,
		url: mr.web_url,
		otherMergeRequests: requests.slice(1).map((r) => ({ iid: r.iid, state: r.state, targetBranch: r.target_branch })),
		totalFiles: files.length,
		truncatedByGitlab: truncated,
		files,
	}, null, 2)}\n`);
}
catch (error) {
	process.stderr.write(`${error.message}\n`);
	process.exit(1);
}
