/** Machine check, storage: full partitions and space that can be recovered, with how to do it. */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { bytes, finding, has, list, metric, sh, size } from "./context.mjs";

const AREA = "storage";
const PSEUDO = ["tmpfs", "devtmpfs", "squashfs", "overlay", "efivarfs"];

/** Local mounted filesystems as `{mount, pct}`, or `null` if df failed; `inodes` measures files instead of bytes. */
function mounts(inodes = false) {
	const out = sh("df", ["-P", "-l", ...(inodes ? ["-i"] : []), ...PSEUDO.flatMap(t => ["-x", t])]);

	if (out === null)
		return null;

	return out.trim().split("\n").slice(1).map(l => l.split(/\s+/)).map(c => ({
		mount: c.slice(5).join(" "),
		used: Number(c[2]) * (inodes ? 1 : 1024),
		avail: Number(c[3]) * (inodes ? 1 : 1024),
		pct: parseInt(c[4]) || 0,
	}));
}

/** Size of a path in bytes with `du`; 0 if the path does not exist, `null` if it could not be measured.
 * Unreadable subfolders are skipped, not fatal: du still prints the total. */
function du(path) {
	const out = sh("du", ["-sb", path], { timeout: 60000, anyStatus: true });

	if (out === null)
		return null;

	if (!out.trim())
		return existsSync(path) ? null : 0;

	const total = Number(out.split("\t")[0]);

	return Number.isFinite(total) ? total : null;
}

/** The biggest direct subfolders of a directory, as `name size` text. */
function biggest(path, n = 3) {
	const out = sh("du", ["-b", "--max-depth=1", path], { timeout: 60000, anyStatus: true }) ?? "";

	return out.trim().split("\n").map(l => l.split("\t")).filter(([, p]) => p && p !== path)
		.sort((a, b) => b[0] - a[0]).slice(0, n).map(([b, p]) => `${p.split("/").at(-1)} ${size(Number(b))}`).join(", ");
}

/** Findings and metrics of the module. `du` over the home cache can take a few seconds. */
export function run() {
	const findings = [];
	const metrics = {};
	const home = homedir();
	const partitions = mounts();
	const inodes = mounts(true);
	const dfFailed = [partitions ? null : "las particiones", inodes ? null : "los inodos"].filter(Boolean);

	if (dfFailed.length)
		findings.push(finding("aviso", AREA, `No se pudo consultar el uso de ${dfFailed.join(" ni de ")} con df.`, "df -h; df -i"));

	for (const m of partitions ?? []) {
		metrics[`diskUsed_${m.mount}`] = metric(`Uso de ${m.mount}`, m.used / 1024 ** 3, "GB");

		const text = `${m.mount} al ${m.pct}% (${size(m.avail)} libres).`;

		if (m.pct >= 95)
			findings.push(finding("error", AREA, text + " Casi lleno: las apps empiezan a fallar al escribir."));
		else if (m.pct >= 85)
			findings.push(finding("aviso", AREA, text));
		else
			findings.push(finding("info", AREA, text));
	}

	for (const m of (inodes ?? []).filter(m => m.pct >= 90))
		findings.push(finding("aviso", AREA, `${m.mount} tiene ocupado el ${m.pct}% de sus inodos: se pueden acabar los "espacios" para archivos aunque sobren GB.`));

	const reclaim = [];

	if (has("docker")) {
		const df = (sh("docker", ["system", "df", "--format", "{{json .}}"], { timeout: 30000 }) ?? "").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
		const fixes = {
			"Images": "docker image prune -a  (borra imagenes que ningun contenedor usa; se vuelven a bajar)",
			"Build Cache": "docker builder prune",
			"Local Volumes": "NO usar prune a ciegas: los volumenes guardan datos de bases. Revisar con docker volume ls -f dangling=true",
			"Containers": "docker container prune  (borra contenedores detenidos)",
		};

		for (const row of df) {
			metrics[`docker_${row.Type.replace(/\s+/g, "")}`] = metric(`Docker, ${row.Type}`, bytes(row.Size) / 1024 ** 3, "GB");

			if (bytes(row.Reclaimable) > 1024 ** 3)
				reclaim.push([`Docker ${row.Type}: ${row.Reclaimable} recuperables de ${row.Size}`, fixes[row.Type]]);
		}
	}

	const journalSize = (sh("journalctl", ["--disk-usage"]) ?? "").match(/take up ([\d.]+[KMGT]?)/)?.[1];
	const journal = journalSize ? bytes(journalSize) : null;
	const aptCache = du("/var/cache/apt/archives");
	const userCache = du(join(home, ".cache"));
	const trash = du(join(home, ".local/share/Trash"));
	const crashes = list("/var/crash").filter(f => f.endsWith(".crash"));
	const oldSnaps = has("snap") ? (sh("snap", ["list", "--all"]) ?? "").split("\n").filter(l => /\bdisabled\b/.test(l)).length : 0;

	if (journal === null)
		findings.push(finding("aviso", AREA, "No se pudo consultar o interpretar el tamano del journal.", "journalctl --disk-usage"));
	else
		metrics.journal = metric("Tamano del journal", journal / 1024 ** 3, "GB");

	if (userCache !== null)
		metrics.homeCache = metric("Tamano de ~/.cache", userCache / 1024 ** 3, "GB");

	for (const [value, label] of [[aptCache, "/var/cache/apt/archives"], [userCache, "~/.cache"], [trash, "la papelera"]])
		if (value === null)
			findings.push(finding("aviso", AREA, `No se pudo medir el tamano de ${label} con du.`));

	if (journal > 1024 ** 3)
		reclaim.push([`Journal del sistema: ${size(journal)}`, "sudo journalctl --vacuum-size=500M"]);

	if (aptCache > 500 * 1024 ** 2)
		reclaim.push([`Paquetes descargados de apt: ${size(aptCache)}`, "sudo apt clean"]);

	if (userCache > 2 * 1024 ** 3)
		reclaim.push([`~/.cache: ${size(userCache)} (lo mas grande: ${biggest(join(home, ".cache"))})`, "Borrar la subcarpeta de la app que sobra; todo ~/.cache se regenera, pero las apps arrancan mas lentas la primera vez"]);

	if (trash > 500 * 1024 ** 2)
		reclaim.push([`Papelera: ${size(trash)}`, "Vaciar la papelera desde Archivos"]);

	if (oldSnaps)
		reclaim.push([`${oldSnaps} revision(es) viejas de snaps`, "LANG=C LANGUAGE=C LC_ALL=C snap list --all | awk '/disabled/{print $1, $3}' | while read n r; do sudo snap remove \"$n\" --revision=\"$r\"; done"]);

	if (crashes.length)
		reclaim.push([`${crashes.length} reporte(s) de fallos en /var/crash`, "sudo rm /var/crash/*.crash  (antes mirar de que app son)"]);

	for (const [message, fix] of reclaim)
		findings.push(finding("info", AREA, `Espacio recuperable — ${message}.`, fix));

	return { findings, metrics };
}
