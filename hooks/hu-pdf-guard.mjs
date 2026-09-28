#!/usr/bin/env node
/**
 * PreToolUse sobre Read y Bash: niega leer una HU en PDF/DOCX entera y remite a su `hu.md`.
 * Un PDF leido directo cuesta varias veces mas tokens y puede ser la HU de otro mes. Se permite
 * Read con `pages`, para mirar a proposito las paginas con capturas o maquetas.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const CACHE = join(homedir(), ".claude", "cache", "tickets");
const HU_NAME = /TI-PR-0005-F02/i;
const DOCUMENT = /\.(pdf|docx)$/i;

/** Programas que vuelcan el contenido de un documento en la salida. */
const READERS = new Set(["pdftotext", "cat", "less", "more", "head", "tail", "strings", "python", "python3",
	"node", "markitdown", "unzip", "zcat", "xxd", "od"]);

/** Los conversores del cerebro: la via correcta para leer una HU. */
const SANCTIONED = /brain\/lib\/tickets\/(to_markdown|tickets)\.py/;

/** Evento del hook leido de stdin; `null` si no es JSON valido. */
function readEvent() {
	try {
		return JSON.parse(readFileSync(0, "utf8") || "{}");
	}
	catch {
		return null;
	}
}

/** Si una ruta es una HU en su formato original: por nombre o por estar en el cache de tickets. */
function isHuDocument(path) {
	return DOCUMENT.test(path) && (HU_NAME.test(basename(path)) || resolve(path).startsWith(CACHE + "/"));
}

/** Instruccion para leerla bien, segun la HU este o no en el cache. */
function advice(path) {
	const absolute = resolve(path);

	if (absolute.startsWith(CACHE + "/"))
		return `Lee ${join(dirname(absolute), "hu.md")}, que es esta misma HU ya convertida.`;

	return "Si es la HU del ticket, bajala con `tickets.py fetch <mantis>` (skill ticket-context) y lee su hu.md. "
		+ "Si el usuario te dio este archivo a proposito, conviertelo: "
		+ "`python3 ~/.claude/brain/lib/tickets/to_markdown.py <archivo> -o <scratchpad>/hu.md` y lee ese .md. "
		+ "Nunca uses una HU vieja de Descargas o Documentos por tener un nombre parecido.";
}

function deny(reason) {
	process.stdout.write(JSON.stringify({
		hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
	}));
	process.exit(0);
}

const event = readEvent();
const input = event?.tool_input ?? {};

if (event?.tool_name === "Read" && isHuDocument(input.file_path ?? "") && !input.pages)
	deny(`No leas la HU en su formato original (${basename(input.file_path)}). ${advice(input.file_path)} `
		+ "Si necesitas ver una captura, lee solo esa pagina con el parametro `pages`.");

if (event?.tool_name === "Bash") {
	const command = input.command ?? "";

	if (SANCTIONED.test(command))
		process.exit(0);

	const cwd = event.cwd ?? process.cwd();
	const tokens = command.split(/[\s;&|<>()]+/).map(t => t.replace(/^['"]|['"]$/g, "")).filter(Boolean);
	const hu = tokens.map(t => (t.startsWith("~") ? join(homedir(), t.slice(1)) : resolve(cwd, t))).find(isHuDocument);
	const reads = tokens.some(t => READERS.has(basename(t)));

	if (hu && reads)
		deny(`No vuelques la HU por Bash (${basename(hu)}). ${advice(hu)}`);
}

process.exit(0);
