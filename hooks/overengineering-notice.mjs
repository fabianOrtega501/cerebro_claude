#!/usr/bin/env node
/**
 * Stop hook: reminds once that the uncommitted code of a work repo was not reviewed with
 * `review-overengineering`. Silent again until the review is recorded or the code changes after it.
 * Never blocks: always exits 0.
 */
import { readFileSync } from "node:fs";
import { projectOf, reposOf } from "../brain/lib/projects.mjs";
import { diffSignature, readState, writeState } from "../brain/lib/review-state.mjs";

let event = {};

try {
	event = JSON.parse(readFileSync(0, "utf8") || "{}");
}
catch { /* without the event the current directory is used */ }

const project = projectOf(event.cwd ?? process.cwd());

if (!project)
	process.exit(0);

const state = readState();
const pending = [];

for (const repo of reposOf(project)) {
	const signature = diffSignature(repo);

	if (!signature)
		continue;

	const key = `${repo}|${signature.branch}`;
	const entry = state[key] ?? { reviewed: null, notified: null };

	if (entry.reviewed === signature.hash || entry.notified === (entry.reviewed ?? "never"))
		continue;

	state[key] = { ...entry, notified: entry.reviewed ?? "never" };
	pending.push(repo);
}

if (!pending.length)
	process.exit(0);

writeState(state);

process.stdout.write(`${JSON.stringify({
	hookSpecificOutput: {
		hookEventName: "Stop",
		additionalContext: [
			`Hay código sin commitear que no se ha revisado con review-overengineering: ${pending.join(", ")}.`,
			"Dilo en una línea al final de tu respuesta y ofrece correr la revisión antes de cerrar el desarrollo.",
			"No insistas: este aviso no se repite hasta que se registre la revisión o el código cambie después de ella.",
		].join("\n"),
	},
})}\n`);
