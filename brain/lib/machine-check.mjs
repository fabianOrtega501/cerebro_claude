#!/usr/bin/env node
/**
 * Machine check: reads the state of this computer, saves it in the history and compares it with the last run.
 * Use: node machine-check.mjs [--only performance,updates,...] [--json] [--no-save]. Read-only, no root.
 */
import * as performance from "./machine/performance.mjs";
import * as updates from "./machine/updates.mjs";
import * as hardware from "./machine/hardware.mjs";
import * as system from "./machine/system.mjs";
import * as storage from "./machine/storage.mjs";
import { compare, save } from "./machine/history.mjs";

const MODULES = { performance, updates, hardware, system, storage };
const ORDER = { error: 0, aviso: 1, info: 2 };
const LABEL = { error: "ERROR", aviso: "AVISO", info: "info " };

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : Object.keys(MODULES);
const unknown = only.filter(name => !MODULES[name]);

if (unknown.length) {
	console.error(`Modulo(s) desconocido(s): ${unknown.join(", ")}. Disponibles: ${Object.keys(MODULES).join(", ")}`);
	process.exit(2);
}

const findings = [];
const metrics = {};

for (const name of only) {
	try {
		const result = MODULES[name].run();

		findings.push(...result.findings);
		Object.assign(metrics, result.metrics);
	}
	catch (error) {
		findings.push({ level: "error", area: name, message: `El modulo fallo al revisar: ${error.message}` });
	}
}

findings.sort((a, b) => ORDER[a.level] - ORDER[b.level]);

const changes = compare(metrics);
const snapshot = { date: new Date().toISOString(), modules: only, metrics, findings };
const file = args.includes("--no-save") ? null : save(snapshot);
const count = level => findings.filter(f => f.level === level).length;

if (args.includes("--json")) {
	console.log(JSON.stringify({ ...snapshot, changes, saved: file }, null, 2));
	process.exit(0);
}

console.log(`Diagnostico del computador (${only.join(", ")}): ${count("error")} error(es), ${count("aviso")} aviso(s), ${count("info")} info`);

for (const f of findings) {
	console.log(`${LABEL[f.level]} [${f.area}] ${f.message}`);

	if (f.fix)
		console.log(`       -> ${f.fix}`);
}

if (changes.length) {
	console.log("\nCambios frente a la medicion anterior:");

	for (const c of changes) {
		const delta = Math.round((c.after - c.before) * 100) / 100;

		console.log(`  ${c.label}: ${c.before} -> ${c.after}${c.unit ? ` ${c.unit}` : ""} (${delta > 0 ? "+" : ""}${delta}) desde ${new Date(c.since).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}`);
	}
}
else
	console.log("\nSin medicion anterior con que comparar, o nada cambio.");

if (file)
	console.log(`\nGuardado en ${file}`);
