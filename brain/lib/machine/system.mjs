/** Machine check, system: failed services, journal errors, OOM kills, boot time and uptime. */
import { finding, metric, read, sh } from "./context.mjs";

const AREA = "system";

/** Units in failed state, for the system (`[]`) or the user session (`["--user"]`). */
function failedUnits(scope) {
	const out = sh("systemctl", [...scope, "--failed", "--no-legend", "--plain"]) ?? "";

	return out.trim().split("\n").filter(Boolean).map(l => l.trim().split(/\s+/)[0]);
}

/** Error messages of this boot grouped by text, digits masked so repeats collapse. */
function journalErrors() {
	const out = sh("journalctl", ["-b", "-p", "err", "-q", "-o", "cat", "--no-pager"], { timeout: 30000 }) ?? "";
	const lines = out.split("\n").filter(Boolean);
	const groups = new Map();

	for (const line of lines) {
		const key = line.replace(/0x[0-9a-f]+|\d+/gi, "#").slice(0, 140);

		groups.set(key, (groups.get(key) ?? 0) + 1);
	}

	return { total: lines.length, top: [...groups].sort((a, b) => b[1] - a[1]).slice(0, 5) };
}

/** Processes killed for lack of memory in the last 7 days, by the kernel or systemd-oomd. */
function oomKills() {
	const kernel = sh("journalctl", ["-k", "--since", "-7d", "-q", "-o", "short-iso", "--no-pager", "--grep", "Killed process"], { timeout: 30000, anyStatus: true }) ?? "";
	const oomd = sh("journalctl", ["-u", "systemd-oomd", "--since", "-7d", "-q", "-o", "short-iso", "--no-pager", "--grep", "Killed"], { timeout: 30000, anyStatus: true }) ?? "";

	return [...kernel.split("\n"), ...oomd.split("\n")]
		.filter(l => /Killed/.test(l))
		.map(l => `${l.slice(0, 16)} ${l.match(/\(([^)]+)\)/)?.[1] ?? l.match(/Killed (\S+)/)?.[1] ?? ""}`.trim());
}

/** Findings and metrics of the module. */
export function run() {
	const findings = [];
	const metrics = {};

	for (const [scope, label] of [[[], "del sistema"], [["--user"], "de tu sesion"]]) {
		for (const unit of failedUnits(scope))
			findings.push(finding("aviso", AREA, `Servicio ${label} caido: ${unit}.`, `systemctl ${scope.join(" ")} status ${unit}; journalctl ${scope.join(" ")} -b -u ${unit} -n 30`.replace(/  +/g, " ")));
	}

	const errors = journalErrors();

	metrics.journalErrors = metric("Errores en el journal desde el arranque", errors.total);

	if (errors.total)
		findings.push(finding("info", AREA, `${errors.total} errores en el journal desde el arranque. Los que mas se repiten: ${errors.top.map(([text, n]) => `(${n}x) ${text}`).join(" | ")}`));

	const kills = oomKills();

	metrics.oomKills7d = metric("Procesos matados por falta de memoria (7 dias)", kills.length);

	if (kills.length)
		findings.push(finding("aviso", AREA, `${kills.length} proceso(s) matados por falta de memoria en 7 dias: ${kills.slice(-5).join("; ")}.`,
			"La RAM se esta agotando en picos: revisar contenedores y pestanas del navegador abiertas."));

	// "= 29.627s" or "= 1min 5.123s".
	const boot = (sh("systemd-analyze") ?? "").match(/=\s*(?:(\d+)min\s*)?([\d.]+)s/);
	const total = boot ? Number(boot[1] ?? 0) * 60 + Number(boot[2]) : 0;

	if (total) {
		metrics.bootSeconds = metric("Tiempo de arranque", total, "s");

		const blame = (sh("systemd-analyze", ["blame", "--no-pager"]) ?? "").trim().split("\n").slice(0, 5).map(l => l.trim()).join(", ");

		findings.push(finding(total > 60 ? "aviso" : "info", AREA, `Arranque en ${total.toFixed(0)} s. Servicios que mas tardaron (algunos corren despues del inicio y no lo retrasan): ${blame}.`));
	}

	const days = Number((read("/proc/uptime") ?? "0").split(" ")[0]) / 86400;

	metrics.uptimeDays = metric("Dias encendido sin reiniciar", days, "d");

	if (days > 14)
		findings.push(finding("info", AREA, `Lleva ${days.toFixed(0)} dias sin reiniciar: las actualizaciones del kernel y de librerias no se aplican hasta reiniciar.`));

	return { findings, metrics };
}
