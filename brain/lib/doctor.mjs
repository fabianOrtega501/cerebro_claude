#!/usr/bin/env node
/**
 * Doctor del cerebro: revisa que ~/.claude este sano y coherente, y nunca corrige nada.
 * Uso: node doctor.mjs [--json] [--only <modulo>]. Sale con 1 si hay errores, 0 si no.
 */
import { buildContext } from "./doctor/context.mjs";
import * as config from "./doctor/config.mjs";
import * as inventory from "./doctor/inventory.mjs";
import * as versioning from "./doctor/versioning.mjs";
import * as secrets from "./doctor/secrets.mjs";
import * as projects from "./doctor/projects.mjs";
import * as memory from "./doctor/memory.mjs";

const MODULES = { config, inventory, versioning, secrets, projects, memory };
const ORDER = { error: 0, aviso: 1, info: 2 };
const LABEL = { error: "ERROR", aviso: "AVISO", info: "info " };

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const ctx = buildContext();
const findings = [];

for (const [name, module] of Object.entries(MODULES)) {
	if (only && name !== only)
		continue;

	try {
		findings.push(...module.run(ctx));
	}
	catch (error) {
		findings.push({ level: "error", area: name, message: `El modulo fallo al revisar: ${error.message}` });
	}
}

findings.sort((a, b) => ORDER[a.level] - ORDER[b.level]);

const count = level => findings.filter(f => f.level === level).length;
const errors = count("error");

if (args.includes("--json")) {
	console.log(JSON.stringify({ errors, warnings: count("aviso"), info: count("info"), findings }, null, 2));
}
else {
	const verdict = errors ? "CON ERRORES" : count("aviso") ? "sano, con avisos" : "sano";

	console.log(`Doctor del cerebro: ${verdict} — ${errors} error(es), ${count("aviso")} aviso(s), ${count("info")} info`);

	for (const f of findings) {
		console.log(`${LABEL[f.level]} [${f.area}] ${f.message}`);

		if (f.fix)
			console.log(`       -> ${f.fix}`);
	}
}

process.exit(errors ? 1 : 0);
