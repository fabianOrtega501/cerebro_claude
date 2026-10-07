#!/usr/bin/env node
/**
 * SessionStart hook: when the session opens inside a registered repo whose project has a reuse
 * inventory, puts its "No se hace" section in context and points to the full inventory.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { projectOf } from "../brain/lib/projects.mjs";

let event = {};

try {
	event = JSON.parse(readFileSync(0, "utf8") || "{}");
}
catch { /* without the event the current directory is used */ }

const project = projectOf(event.cwd ?? process.cwd());
const inventory = project && join(homedir(), ".claude", "brain", "projects", project, "standards", "reuse.md");

let text = "";

try {
	text = inventory ? readFileSync(inventory, "utf8") : "";
}
catch {
	process.exit(0);
}

const forbidden = text.match(/^## No se hace\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1]?.trim();

if (!forbidden)
	process.exit(0);

process.stdout.write(JSON.stringify({
	hookSpecificOutput: {
		hookEventName: "SessionStart",
		additionalContext: [
			`Estándar del proyecto ${project}. Antes de planear, lee el inventario de lo reutilizable: ${inventory}`,
			"El plan lleva la tabla Se reutiliza / No se implementa / Se escribe nuevo. Esto no se hace:",
			forbidden,
		].join("\n"),
	},
}));
