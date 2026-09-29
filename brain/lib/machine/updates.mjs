/** Machine check, updates: apt, snap, flatpak, firmware, pending reboot and installed kernels. */
import { existsSync, statSync } from "node:fs";
import { release } from "node:os";
import { finding, has, list, metric, read, sh } from "./context.mjs";

const AREA = "updates";

/** Upgradable apt packages as `{name, security}`, from the local package lists. */
function aptPending() {
	const out = sh("apt", ["list", "--upgradable"], { timeout: 30000 }) ?? "";

	return out.split("\n")
		.filter(l => l.includes("[upgradable from"))
		.map(l => ({ name: l.split("/")[0], security: /^[^ ]+\/[^ ]*-security/.test(l) }));
}

/** Snaps with a pending refresh; the table header is translated, so it is dropped by position. */
function snapPending() {
	const out = sh("snap", ["refresh", "--list"], { timeout: 30000, anyStatus: true });

	if (!out || !/\bRev\b/.test(out.split("\n")[0]))
		return [];

	return out.trim().split("\n").slice(1).map(l => l.split(/\s+/)[0]);
}

/** Devices with a firmware update available, or `null` if fwupd could not answer. */
function firmwarePending() {
	const out = sh("fwupdmgr", ["get-updates", "--json"], { timeout: 45000, anyStatus: true });

	try {
		return JSON.parse(out).Devices.map(d => `${d.Name} ${d.Version ?? ""} -> ${d.Releases?.[0]?.Version ?? "?"}`.trim());
	}
	catch {
		return null;
	}
}

/** Installed kernel versions from /boot, oldest first. */
function kernels() {
	return list("/boot")
		.filter(f => f.startsWith("vmlinuz-"))
		.map(f => f.slice("vmlinuz-".length))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Findings and metrics of the module. Queries snap and fwupd, so it needs network to be exact. */
export function run() {
	const findings = [];
	const metrics = {};

	findings.push(finding("info", AREA, `Sistema: ${read("/etc/os-release")?.match(/PRETTY_NAME="(.+)"/)?.[1] ?? "?"}, kernel ${release()}.`));

	const apt = aptPending();
	const security = apt.filter(p => p.security);
	const cache = "/var/cache/apt/pkgcache.bin";
	const listsAge = existsSync(cache) ? (Date.now() - statSync(cache).mtimeMs) / 86400000 : null;

	metrics.aptPending = metric("Paquetes apt pendientes", apt.length);
	metrics.aptSecurity = metric("Paquetes apt de seguridad pendientes", security.length);

	if (security.length)
		findings.push(finding("aviso", AREA, `${security.length} actualizacion(es) de seguridad de apt pendientes: ${security.slice(0, 8).map(p => p.name).join(", ")}${security.length > 8 ? "…" : ""}.`,
			"sudo apt update && sudo apt upgrade"));

	if (apt.length)
		findings.push(finding(apt.length > 50 ? "aviso" : "info", AREA, `${apt.length} paquete(s) de apt por actualizar: ${apt.slice(0, 10).map(p => p.name).join(", ")}${apt.length > 10 ? "…" : ""}.`,
			"sudo apt update && sudo apt upgrade"));
	else
		findings.push(finding("info", AREA, "apt: no hay paquetes pendientes segun la ultima lista descargada."));

	if (listsAge !== null && listsAge > 3)
		findings.push(finding("aviso", AREA, `La lista de paquetes de apt tiene ${listsAge.toFixed(0)} dias: lo pendiente puede ser mas de lo que se ve.`, "sudo apt update"));

	const auto = read("/etc/apt/apt.conf.d/20auto-upgrades") ?? "";

	if (!/Unattended-Upgrade\s+"1"/.test(auto))
		findings.push(finding("info", AREA, "Las actualizaciones automaticas de seguridad (unattended-upgrades) estan apagadas."));

	if (has("snap")) {
		const snaps = snapPending();

		metrics.snapPending = metric("Snaps pendientes", snaps.length);

		if (snaps.length)
			findings.push(finding("info", AREA, `${snaps.length} snap(s) con actualizacion pendiente: ${snaps.join(", ")}. Snap los actualiza solo, pero espera a que la app este cerrada.`,
				"Cerrar esas apps y correr: sudo snap refresh"));
	}

	if (has("flatpak")) {
		const flatpaks = (sh("flatpak", ["remote-ls", "--updates", "--columns=application"], { timeout: 30000 }) ?? "").trim().split("\n").filter(Boolean);

		metrics.flatpakPending = metric("Flatpaks pendientes", flatpaks.length);

		if (flatpaks.length)
			findings.push(finding("info", AREA, `${flatpaks.length} flatpak(s) por actualizar: ${flatpaks.join(", ")}.`, "flatpak update"));
	}

	if (has("fwupdmgr")) {
		const firmware = firmwarePending();

		if (firmware === null)
			findings.push(finding("info", AREA, "No se pudo consultar el firmware (sin red o metadatos viejos).", "fwupdmgr refresh && fwupdmgr get-updates"));
		else {
			metrics.firmwarePending = metric("Firmware pendiente", firmware.length);

			if (firmware.length)
				findings.push(finding("aviso", AREA, `Firmware por actualizar: ${firmware.join("; ")}.`, "fwupdmgr update  (conectado a la corriente; puede reiniciar)"));
			else
				findings.push(finding("info", AREA, "Firmware al dia segun fwupd."));
		}
	}

	const installed = kernels();
	const newest = installed.at(-1);

	metrics.kernelsInstalled = metric("Kernels instalados", installed.length);

	if (existsSync("/var/run/reboot-required")) {
		const pkgs = (read("/var/run/reboot-required.pkgs") ?? "").split("\n").filter(Boolean);

		findings.push(finding("aviso", AREA, `Hay un reinicio pendiente para aplicar actualizaciones${pkgs.length ? `: ${[...new Set(pkgs)].join(", ")}` : ""}.`, "Reiniciar cuando se pueda."));
	}
	else if (newest && newest !== release())
		findings.push(finding("aviso", AREA, `Esta corriendo el kernel ${release()} pero hay uno mas nuevo instalado (${newest}).`, "Reiniciar para usarlo."));

	if (installed.length > 2)
		findings.push(finding("info", AREA, `${installed.length} kernels instalados: ${installed.join(", ")}.`, "sudo apt autoremove --purge  (deja el actual y el anterior)"));

	return { findings, metrics };
}
