/** Machine check, hardware: battery wear, temperatures, fans, disk health (udisks) and drivers. */
import { finding, has, list, metric, num, read, sh, size } from "./context.mjs";

const AREA = "hardware";
const UDISKS = "org.freedesktop.UDisks2";

/** Battery wear and state for each battery under /sys/class/power_supply. */
function batteries(findings, metrics) {
	for (const name of list("/sys/class/power_supply")) {
		const dir = `/sys/class/power_supply/${name}`;

		if (read(`${dir}/type`) !== "Battery")
			continue;

		const full = num(`${dir}/energy_full`) ?? num(`${dir}/charge_full`);
		const design = num(`${dir}/energy_full_design`) ?? num(`${dir}/charge_full_design`);
		const cycles = num(`${dir}/cycle_count`);
		const state = `${read(`${dir}/status`)}, ${num(`${dir}/capacity`)}% de carga`;

		if (!full || !design) {
			findings.push(finding("info", AREA, `Bateria ${name}: ${state}; no reporta su capacidad de fabrica.`));
			continue;
		}

		const health = full / design * 100;
		const text = `Bateria ${name}: conserva ${health.toFixed(0)}% de su capacidad original${cycles ? ` tras ${cycles} ciclos` : ""} (${state}).`;

		metrics[`battery_${name}`] = metric(`Salud de la bateria ${name}`, health, "%");

		if (cycles)
			metrics[`batteryCycles_${name}`] = metric(`Ciclos de la bateria ${name}`, cycles);

		findings.push(finding(health < 60 ? "error" : health < 80 ? "aviso" : "info", AREA, text,
			health < 80 ? "La autonomia ya es notablemente menor; considerar el cambio de bateria." : undefined));
	}
}

/** CPU temperature and fan speeds, from lm-sensors if installed or from the kernel thermal zones. */
function temperatures(findings, metrics) {
	let cpu = null;
	const fans = [];
	const json = has("sensors") ? sh("sensors", ["-j"], { anyStatus: true }) : null;

	if (json) {
		const chips = JSON.parse(json);

		for (const [chip, features] of Object.entries(chips)) {
			for (const [label, values] of Object.entries(features)) {
				if (typeof values !== "object")
					continue;

				for (const [key, value] of Object.entries(values)) {
					if (/^fan\d+_input$/.test(key))
						fans.push(`${label} ${value} rpm`);

					if (/^temp\d+_input$/.test(key) && /^(coretemp|k10temp|zenpower)/.test(chip) && /Package|Tctl|Tdie/.test(label))
						cpu = Math.max(cpu ?? 0, value);
				}
			}
		}
	}

	if (cpu === null) {
		for (const zone of list("/sys/class/thermal").filter(z => z.startsWith("thermal_zone"))) {
			const type = read(`/sys/class/thermal/${zone}/type`);

			if (["x86_pkg_temp", "TCPU", "k10temp"].includes(type))
				cpu = Math.max(cpu ?? 0, num(`/sys/class/thermal/${zone}/temp`) / 1000);
		}
	}

	if (cpu !== null) {
		metrics.cpuTempC = metric("Temperatura del CPU", cpu, "C");
		findings.push(finding(cpu >= 95 ? "error" : cpu >= 85 ? "aviso" : "info", AREA, `CPU a ${cpu.toFixed(0)} °C en este momento.`,
			cpu >= 85 ? "Revisar que las rejillas no esten tapadas y si hay polvo; un CPU caliente baja su velocidad para protegerse." : undefined));
	}

	if (fans.length)
		findings.push(finding("info", AREA, `Ventiladores: ${fans.join(", ")}.`));
	else if (!has("sensors"))
		findings.push(finding("info", AREA, "Sin lm-sensors no se leen los ventiladores.", "sudo apt install lm-sensors && sudo sensors-detect --auto"));
}

/** A udisks D-Bus property as its JSON `data`, or `null`. */
function property(path, iface, name) {
	const out = sh("busctl", ["get-property", "--json=short", UDISKS, path, iface, name], { timeout: 10000 });

	return out ? JSON.parse(out).data : null;
}

/** Health of each NVMe or ATA disk through udisks, which needs no root. */
function disks(findings, metrics) {
	const tree = sh("busctl", ["tree", "--list", UDISKS], { timeout: 10000 }) ?? "";

	for (const path of tree.split("\n").map(l => l.trim()).filter(l => l.startsWith("/org/freedesktop/UDisks2/drives/"))) {
		const model = property(path, `${UDISKS}.Drive`, "Model") || path.split("/").at(-1);
		const smart = sh("busctl", ["call", "--json=short", UDISKS, path, `${UDISKS}.NVMe.Controller`, "SmartGetAttributes", "a{sv}", "0"], { timeout: 15000 });

		if (smart) {
			const a = Object.fromEntries(Object.entries(JSON.parse(smart).data[0]).map(([k, v]) => [k, v.data]));
			const hours = property(path, `${UDISKS}.NVMe.Controller`, "SmartPowerOnHours");
			const warnings = property(path, `${UDISKS}.NVMe.Controller`, "SmartCriticalWarning") ?? [];
			const key = model.replace(/\W+/g, "_");

			metrics[`diskWear_${key}`] = metric(`Desgaste del disco ${model}`, a.percent_used, "%");
			metrics[`diskWritten_${key}`] = metric(`Escrito en el disco ${model}`, a.total_data_written / 1e12, "TB");
			metrics[`unsafeShutdowns_${key}`] = metric(`Apagados forzados del disco ${model}`, a.unsafe_shutdowns);

			findings.push(finding("info", AREA, `Disco ${model}: desgaste ${a.percent_used}%, reserva ${a.avail_spare}%, ${hours ?? "?"} h encendido, ${(a.total_data_written / 1e12).toFixed(1)} TB escritos, ${a.media_errors} errores de medio.`));

			if (warnings.length)
				findings.push(finding("error", AREA, `El disco ${model} reporta alertas criticas: ${warnings.join(", ")}.`, "Respaldar ya lo importante."));

			if (a.media_errors > 0 || a.avail_spare <= a.spare_thresh)
				findings.push(finding("error", AREA, `El disco ${model} tiene ${a.media_errors} errores de medio y ${a.avail_spare}% de reserva (umbral ${a.spare_thresh}%).`, "Respaldar y planear el cambio del disco."));
			else if (a.percent_used >= 80)
				findings.push(finding(a.percent_used >= 100 ? "error" : "aviso", AREA, `El disco ${model} ya consumio ${a.percent_used}% de su vida util estimada.`, "Planear el cambio del disco y mantener respaldos al dia."));

			if (a.power_cycles && a.unsafe_shutdowns / a.power_cycles > 0.2)
				findings.push(finding("info", AREA, `${a.unsafe_shutdowns} de ${a.power_cycles} apagados del disco fueron forzados (sin apagar el sistema): boton de encendido sostenido, bateria agotada o congelamientos.`));

			if (a.warning_temp_time > 0)
				findings.push(finding("aviso", AREA, `El disco ${model} ha pasado ${a.warning_temp_time} min por encima de su temperatura de alerta.`));

			continue;
		}

		const failing = property(path, `${UDISKS}.Drive.Ata`, "SmartFailing");

		if (failing === null)
			continue;

		const bad = property(path, `${UDISKS}.Drive.Ata`, "SmartNumBadSectors") ?? 0;

		metrics[`diskBadSectors_${model.replace(/\W+/g, "_")}`] = metric(`Sectores danados del disco ${model}`, bad);
		findings.push(finding(failing ? "error" : bad > 0 ? "aviso" : "info", AREA,
			`Disco ${model}: SMART ${failing ? "PREDICE FALLA" : "sano"}, ${bad} sectores danados.`, failing || bad ? "Respaldar lo importante." : undefined));
	}
}

/** Proprietary drivers ubuntu-drivers offers that are not installed. */
function drivers(findings) {
	if (!has("ubuntu-drivers"))
		return;

	const offered = (sh("ubuntu-drivers", ["list"], { timeout: 30000 }) ?? "").trim().split("\n").filter(Boolean).map(l => l.split(/[, ]/)[0]);
	const missing = offered.filter(pkg => !/install ok installed/.test(sh("dpkg-query", ["-W", "-f=${Status}", pkg], { anyStatus: true }) ?? ""));

	if (missing.length)
		findings.push(finding("info", AREA, `Drivers disponibles sin instalar: ${missing.join(", ")}.`, "sudo ubuntu-drivers install  (revisar antes cual recomienda: ubuntu-drivers devices)"));
}

/** Findings and metrics of the module. Everything is read without root. */
export function run() {
	const findings = [];
	const metrics = {};
	const model = (sh("lscpu") ?? "").match(/Model name:\s+(.+)/)?.[1];
	const ram = Number((read("/proc/meminfo") ?? "").match(/MemTotal:\s+(\d+)/)?.[1] ?? 0) * 1024;

	const vendor = read("/sys/class/dmi/id/sys_vendor") ?? "";
	const product = read("/sys/class/dmi/id/product_name") ?? "";

	findings.push(finding("info", AREA, `Equipo: ${product.startsWith(vendor) ? product : `${vendor} ${product}`}; CPU ${model ?? "?"}; RAM ${size(ram)}.`));

	batteries(findings, metrics);
	temperatures(findings, metrics);
	disks(findings, metrics);
	drivers(findings);

	return { findings, metrics };
}
