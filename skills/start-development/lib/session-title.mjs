/**
 * Names the current Claude Code session `<ticket> <PROJECT> <Description>`, like `/rename` does.
 *
 * Usage: node session-title.mjs --project aio --ticket 10842 --desc "Filtro por tipo" [--dry-run]
 */

import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { toBranchWords } from "./create-branch.mjs";

/**
 * Builds the title; the ticket is optional.
 * @param {{ticket?: string, project: string, desc: string}} parts
 * @returns {string}
 */
export function sessionTitle({ ticket, project, desc }) {
	return [ticket, project.toUpperCase(), toBranchWords(desc)].filter(Boolean).join(" ");
}

/**
 * Transcript path of a session, searched in every project folder. `null` if not found.
 * @param {string} sessionId
 * @param {string} [root]
 * @returns {string|null}
 */
export function findTranscript(sessionId, root = join(homedir(), ".claude", "projects")) {
	for (const dir of readdirSync(root)) {
		const file = join(root, dir, `${sessionId}.jsonl`);

		if (existsSync(file)) return file;
	}

	return null;
}

/**
 * Reads a command line argument.
 * @param {string} name
 * @returns {string|undefined}
 */
function arg(name) {
	const index = process.argv.indexOf(`--${name}`);

	return index === -1 ? undefined : process.argv[index + 1];
}

/** Appends the `custom-title` entry to the transcript of the current session. */
function main() {
	const project = arg("project");
	const desc = arg("desc");
	const sessionId = arg("session") ?? process.env.CLAUDE_CODE_SESSION_ID;

	if (!project || !desc) {
		console.error("Faltan --project y --desc.");
		process.exit(1);
	}

	if (!sessionId) {
		console.error("No hay CLAUDE_CODE_SESSION_ID: corre esto desde la sesion principal de Claude Code, o pasa --session.");
		process.exit(1);
	}

	const title = sessionTitle({ ticket: arg("ticket"), project, desc });
	const transcript = findTranscript(sessionId);

	if (!transcript) {
		console.error(`No se encontro el transcript de la sesion ${sessionId}. Usa /rename ${title}`);
		process.exit(1);
	}

	if (!process.argv.includes("--dry-run")) {
		appendFileSync(transcript, JSON.stringify({ type: "custom-title", customTitle: title, sessionId }) + "\n");
	}

	console.log(`${process.argv.includes("--dry-run") ? "(dry-run) " : ""}Sesion nombrada: ${title}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
