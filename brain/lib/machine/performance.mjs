/** Machine check, performance: CPU load, memory, swap, pressure stall and the heaviest processes. */
import { cpus } from "node:os";
import { bytes, finding, has, list, metric, read, sh, size } from "./context.mjs";

const AREA = "performance";
const SAMPLE_SECONDS = 5;
const CLK_TCK = Number(sh("getconf", ["CLK_TCK"])) || 100;
const PAGE = Number(sh("getconf", ["PAGESIZE"])) || 4096;

/** CPU ticks and resident pages per pid, read from /proc/<pid>/stat. */
function processTable() {
	const table = new Map();

	for (const pid of list("/proc")) {
		if (!/^\d+$/.test(pid))
			continue;

		const stat = read(`/proc/${pid}/stat`);

		if (!stat)
			continue;

		const close = stat.lastIndexOf(")");
		// Fields after the comm start at field 3 (state); utime=14, stime=15, rss=24.
		const f = stat.slice(close + 2).split(" ");

		table.set(pid, { comm: stat.slice(stat.indexOf("(") + 1, close), ticks: +f[11] + +f[12], rss: +f[21] * PAGE });
	}

	return table;
}

/** Sums a per-process value by command name and returns the top `n` groups. */
function topBy(rows, key, n = 5) {
	const groups = new Map();

	for (const row of rows) {
		const g = groups.get(row.comm) ?? { comm: row.comm, count: 0, value: 0 };

		g.count++;
		g.value += row[key];
		groups.set(row.comm, g);
	}

	return [...groups.values()].sort((a, b) => b.value - a.value).slice(0, n);
}

/** Averages of the vmstat columns over the sample, skipping the since-boot first row. */
function vmstat() {
	const out = sh("vmstat", ["1", String(SAMPLE_SECONDS + 1)], { timeout: (SAMPLE_SECONDS + 5) * 1000 });

	if (!out)
		return null;

	const lines = out.trim().split("\n");
	const header = lines[1].trim().split(/\s+/);
	const rows = lines.slice(3).map(l => l.trim().split(/\s+/).map(Number));
	const avg = {};

	header.forEach((name, i) => avg[name] = rows.reduce((s, r) => s + r[i], 0) / rows.length);

	return avg;
}

/** `avg60` of the `some` and `full` lines of a /proc/pressure file, or `null` without PSI. */
function pressure(resource) {
	const text = read(`/proc/pressure/${resource}`);

	if (!text)
		return null;

	const value = kind => Number(text.match(new RegExp(`${kind} avg10=[\\d.]+ avg60=([\\d.]+)`))?.[1] ?? 0);

	return { some: value("some"), full: value("full") };
}

/** Values of /proc/meminfo in bytes. */
function meminfo() {
	const out = {};

	for (const line of (read("/proc/meminfo") ?? "").split("\n")) {
		const m = line.match(/^(\w+):\s+(\d+)/);

		if (m)
			out[m[1]] = Number(m[2]) * 1024;
	}

	return out;
}

/** Top containers by CPU and memory, or empty if docker is not running. */
function containers() {
	if (!has("docker"))
		return [];

	const out = sh("docker", ["stats", "--no-stream", "--format", "{{json .}}"], { timeout: 20000 });

	return (out ?? "").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)).map(c => ({
		name: c.Name,
		cpu: parseFloat(c.CPUPerc) || 0,
		mem: bytes(c.MemUsage.split("/")[0]),
	}));
}

/** Findings and metrics of the module. Takes about `SAMPLE_SECONDS` to sample CPU usage. */
export function run() {
	const findings = [];
	const metrics = {};
	const cores = cpus().length;
	const [load1, load5] = (read("/proc/loadavg") ?? "0 0").split(" ").map(Number);

	const before = processTable();
	const started = Date.now();
	const vm = vmstat();
	const elapsed = (Date.now() - started) / 1000;
	const after = processTable();

	const rows = [...after].map(([pid, p]) => ({
		comm: p.comm,
		rss: p.rss,
		cpu: before.has(pid) ? Math.max(0, p.ticks - before.get(pid).ticks) / CLK_TCK / elapsed * 100 : 0,
	}));

	metrics.load5 = metric("Carga promedio de 5 min", load5);
	metrics.load5PerCore = metric("Carga de 5 min por nucleo", load5 / cores);

	if (load5 / cores > 2)
		findings.push(finding("error", AREA, `Carga de ${load5} con ${cores} nucleos: hay el doble de trabajo en cola del que el CPU puede atender.`));
	else if (load5 / cores > 1)
		findings.push(finding("aviso", AREA, `Carga de ${load5} con ${cores} nucleos: hay mas trabajo en cola que nucleos.`));
	else
		findings.push(finding("info", AREA, `Carga de ${load1} (1 min) y ${load5} (5 min) con ${cores} nucleos.`));

	if (vm) {
		const busy = 100 - vm.id;

		metrics.cpuBusyPct = metric("CPU ocupado en la muestra", busy, "%");
		metrics.ioWaitPct = metric("CPU esperando al disco", vm.wa, "%");
		findings.push(finding("info", AREA, `CPU en la muestra de ${SAMPLE_SECONDS} s: ${busy.toFixed(0)}% ocupado (${vm.us.toFixed(0)}% programas, ${vm.sy.toFixed(0)}% sistema), ${vm.wa.toFixed(0)}% esperando disco.`));

		if (vm.wa > 15)
			findings.push(finding("aviso", AREA, `El CPU pasa ${vm.wa.toFixed(0)}% del tiempo esperando al disco: el cuello de botella es la lectura/escritura, no el procesador.`));

		if (vm.si + vm.so > 50)
			findings.push(finding("aviso", AREA, `Se esta moviendo memoria a swap activamente (${(vm.si + vm.so).toFixed(0)} KB/s): la RAM no alcanza y todo se vuelve lento.`));
	}

	const mem = meminfo();
	const availablePct = mem.MemAvailable / mem.MemTotal * 100;
	const swapUsed = mem.SwapTotal - mem.SwapFree;

	metrics.memAvailablePct = metric("RAM disponible", availablePct, "%");
	metrics.swapUsed = metric("Swap en uso", swapUsed / 1024 ** 3, "GB");

	const memText = `RAM: ${size(mem.MemAvailable)} disponibles de ${size(mem.MemTotal)} (${availablePct.toFixed(0)}%); swap en uso ${size(swapUsed)} de ${size(mem.SwapTotal)}.`;

	if (availablePct < 5)
		findings.push(finding("error", AREA, memText + " La memoria esta agotada.", "Cerrar lo que mas consume (ver lista de procesos) o bajar contenedores que no se usan."));
	else if (availablePct < 10)
		findings.push(finding("aviso", AREA, memText + " Queda poca memoria."));
	else
		findings.push(finding("info", AREA, memText));

	for (const [resource, label, someLimit, fullLimit] of [["cpu", "CPU", 40, null], ["memory", "memoria", 10, 5], ["io", "disco", 20, 10]]) {
		const p = pressure(resource);

		if (!p)
			continue;

		metrics[`psi_${resource}`] = metric(`Presion de ${label} (some avg60)`, p.some, "%");

		if (fullLimit !== null && p.full > fullLimit)
			findings.push(finding("error", AREA, `Presion de ${label}: todo el sistema estuvo detenido esperando ${label} el ${p.full}% del ultimo minuto.`));
		else if (p.some > someLimit)
			findings.push(finding("aviso", AREA, `Presion de ${label}: algun proceso estuvo esperando ${label} el ${p.some}% del ultimo minuto.`));
	}

	const cpuTop = topBy(rows, "cpu").filter(g => g.value >= 1);
	const memTop = topBy(rows, "rss");

	if (cpuTop.length)
		findings.push(finding("info", AREA, "Mas CPU en la muestra (100% = un nucleo): " + cpuTop.map(g => `${g.comm}${g.count > 1 ? ` x${g.count}` : ""} ${g.value.toFixed(0)}%`).join(", ")));

	findings.push(finding("info", AREA, "Mas memoria (RSS, aproximado en apps de varios procesos): " + memTop.map(g => `${g.comm}${g.count > 1 ? ` x${g.count}` : ""} ${size(g.value)}`).join(", ")));

	for (const g of cpuTop.filter(g => g.value >= 90))
		findings.push(finding("aviso", AREA, `${g.comm} uso ${g.value.toFixed(0)}% de CPU durante toda la muestra.`, `Revisar si es trabajo esperado; ver con: ps -o pid,etime,args -C ${g.comm}`));

	const docker = containers();

	if (docker.length) {
		const byCpu = [...docker].sort((a, b) => b.cpu - a.cpu).slice(0, 3);
		const byMem = [...docker].sort((a, b) => b.mem - a.mem).slice(0, 3);

		metrics.dockerMem = metric("Memoria de contenedores Docker", docker.reduce((s, c) => s + c.mem, 0) / 1024 ** 3, "GB");
		findings.push(finding("info", AREA, `${docker.length} contenedores corriendo; mas CPU: ${byCpu.map(c => `${c.name} ${c.cpu.toFixed(0)}%`).join(", ")}; mas memoria: ${byMem.map(c => `${c.name} ${size(c.mem)}`).join(", ")}.`));

		for (const c of docker.filter(c => c.cpu >= 50))
			findings.push(finding("aviso", AREA, `El contenedor ${c.name} esta usando ${c.cpu.toFixed(0)}% de CPU.`, `docker logs --tail 50 ${c.name}`));
	}

	return { findings, metrics };
}
