#!/usr/bin/env node
/**
 * UserPromptSubmit: cambia el ambiente solo con mensajes del usuario, por `/ambiente <amb> [modo]`
 * o por frase con sustantivo e intencion («vamos a trabajar en el ambiente de qa»). Produccion solo
 * por comando. Le recuerda a Claude el ambiente cuando cambia y en cada mensaje fuera de local;
 * en local sin cambios calla, porque ya lo dijo `environment-start` al abrir la sesion.
 */
import { readFileSync } from "node:fs";
import { ALIAS_PATTERN, describeState, isProduction, log, normalizeEnvironment, readRegistry, readState, saveState } from "../brain/lib/environments.mjs";

/** El comando tal como lo escribe el usuario, o ya expandido por la skill `ambiente`. */
const EXPLICIT = /^\s*\/ambiente\b(.*)$|AMBIENTE-SOLICITADO:(.*)$/im;

/** Ambiente nombrado con un sustantivo. Sin el, «haz el MR a desa» activaria desa: es una rama. */
const NOUN = new RegExp(`\\b(?:ambiente|entorno|servidor(?:es)?|bases? de datos|bd)\\s+(?:de\\s+|del\\s+)?(${ALIAS_PATTERN})\\b`, "i");

/** Intencion de trabajar ahi; se evitan sustantivos como «cambio» para no activar por error. */
const INTENT = /\b(?:vamos a|trabaj(?:emos|ar|aremos|amos)|ejecut(?:emos|ar|arlo|arla|amos)|hag(?:amos|ámoslo|amoslo)|hacerlo|cambi(?:emos|ar|arnos|amos)|pas(?:emos|ar|amos)|us(?:emos|ar)|conect(?:émonos|emonos|ate|arnos|arte)|entr(?:emos|ar)|volv(?:amos|er)|oper(?:emos|ar))\b/i;

const READ = /\b(?:solo lectura|lectura|solo consulta|de consulta)\b/i;
const WRITE = /\bescritura\b/i;

function readEvent() {
	try {
		return JSON.parse(readFileSync(0, "utf8") || "{}");
	}
	catch {
		return null;
	}
}

/** Modo que menciona un texto, o `null`. */
function modeOf(text) {
	if (WRITE.test(text))
		return "escritura";

	return READ.test(text) ? "lectura" : null;
}

const event = readEvent();

if (!event)
	process.exit(0);

const message = String(event.prompt ?? "");
const registry = readRegistry();
const previous = readState();
const notices = [];
const instructions = [];
let state = previous;

/** Cambia el ambiente activo y deja constancia en la bitacora. */
function change(environment, mode, origin) {
	const next = environment === "local" ? { environment: "local", mode: "escritura" } : { environment, mode };

	if (next.environment === previous.environment && next.mode === previous.mode) {
		notices.push(`Ambiente activo: ${describeState(next)} (sin cambios).`);
		state = next;
		return;
	}

	saveState({ ...next, origin });
	log({ event: "cambio de ambiente", from: describeState(previous), to: describeState(next), origin });
	state = next;
	notices.push(`Ambiente activo: ${describeState(next)}.`);

	if (next.environment !== "local" && !next.mode)
		instructions.push(`Preguntale al usuario en que modo vamos a trabajar en ${next.environment}: lectura o escritura. Hasta que responda, la guarda niega cualquier operacion en ${next.environment}.`);
	if (isProduction(registry, next.environment))
		notices.push("PRODUCCION: cada operacion que llegue a produccion te pedira aprobacion.");
}

const explicit = message.match(EXPLICIT);

if (explicit) {
	const args = String(explicit[1] ?? explicit[2] ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
	const environment = args.map(normalizeEnvironment).find(Boolean);
	const mode = args.find(a => a === "lectura" || a === "escritura") ?? null;

	if (!args.length)
		notices.push(`Ambiente activo: ${describeState(previous)}.`);
	else if (!environment)
		instructions.push(`El usuario pidio un ambiente que no existe (${args.join(" ")}). Los validos son local, desa, qa, pre y prod.`);
	else
		change(environment, mode, "comando /ambiente");
}
else {
	const mention = message.match(NOUN);

	if (mention && INTENT.test(message)) {
		const environment = normalizeEnvironment(mention[1]);

		if (isProduction(registry, environment))
			instructions.push("El usuario hablo de trabajar en produccion, pero produccion solo se activa con /ambiente prod <lectura|escritura>. Recuerdaselo y no operes sobre produccion.");
		else
			change(environment, modeOf(message), "frase del usuario");
	}
	else if (previous.environment !== "local" && !previous.mode) {
		const mode = modeOf(message);

		if (mode)
			change(previous.environment, mode, "modo indicado por el usuario");
	}
}

if (state.environment !== "local" || instructions.length || notices.length)
	instructions.push(`Ambiente activo: ${describeState(state)}.`);

if (!instructions.length)
	process.exit(0);

const out = { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: instructions.join(" ") } };

if (notices.length)
	out.systemMessage = notices.join(" ");

process.stdout.write(JSON.stringify(out));
