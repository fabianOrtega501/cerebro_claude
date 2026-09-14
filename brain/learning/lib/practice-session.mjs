#!/usr/bin/env node
/**
 * Marca de que hay un ticket en modo practica sin registrar en el temario.
 *
 * Existe porque el cierre de `practice-ticket` era un parrafo de su SKILL.md, y un parrafo se
 * olvida: a la fecha de escribir esto habia tres lecciones dadas y un plan de practica, con el
 * temario entero todavia en `pendiente`. La marca la abre la clase y la cierra el registro; entre
 * medias, `finish-development` la ve en su preflight y el hook `practice-unrecorded-notice` avisa
 * si el ticket se cerro sin pasar por ahi.
 *
 * Uso:
 *   node practice-session.mjs open --project status --ticket 10841 --repo /ruta --branch f/x \
 *                                  --topics laravel-migraciones,laravel-servicios
 *   node practice-session.mjs status [--json]
 *   node practice-session.mjs close
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(dirname(fileURLToPath(import.meta.url))), ".active-practice.json");

/** La sesion de practica abierta, o `null` si no hay ninguna o el archivo esta roto. */
export function active() {
	if (!existsSync(FILE)) return null;
	try {
		return JSON.parse(readFileSync(FILE, "utf8"));
	} catch {
		return null;
	}
}

/** Abre la marca. Sobrescribe la anterior: solo se practica un ticket a la vez. */
export function open(data) {
	const session = { ...data, openedAt: new Date().toISOString().slice(0, 10) };
	writeFileSync(FILE, `${JSON.stringify(session, null, 2)}\n`, "utf8");

	return session;
}

/** Borra la marca. Se llama cuando los temas ya quedaron en el temario. */
export function close() {
	if (existsSync(FILE)) rmSync(FILE);
}

/** Lee `--clave valor` de los argumentos. Devuelve solo lo que venga. */
function flags(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++)
		if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i];

	return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [cmd] = process.argv.slice(2);
	const opts = flags(process.argv.slice(3));

	if (cmd === "open") {
		const falta = ["project", "ticket", "repo", "branch"].filter(k => !opts[k]);
		if (falta.length) {
			console.error(`Faltan: ${falta.map(f => `--${f}`).join(", ")}`);
			process.exit(1);
		}
		const s = open({ ...opts, topics: (opts.topics || "").split(",").filter(Boolean) });
		console.log(`Practica abierta: ${s.project} ${s.ticket} (${s.topics.length} tema(s)).`);
		console.log("Se cierra sola cuando los temas queden registrados con syllabus.mjs --record.");
	}
	else if (cmd === "status") {
		const s = active();
		if (opts.json) console.log(JSON.stringify(s));
		else if (!s) console.log("Sin practica abierta.");
		else console.log(`Practica abierta desde ${s.openedAt}: ${s.project} ${s.ticket}, rama ${s.branch}.\nTemas: ${s.topics.join(", ") || "(ninguno anotado)"}`);
		process.exit(s ? 1 : 0);
	}
	else if (cmd === "close") {
		close();
		console.log("Marca de practica cerrada.");
	}
	else {
		console.error("Comandos: open | status | close");
		process.exit(1);
	}
}
