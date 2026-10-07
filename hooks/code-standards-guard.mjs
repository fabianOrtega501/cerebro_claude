#!/usr/bin/env node
/**
 * PreToolUse guard for Edit / MultiEdit / Write: denies an edit whose ADDED lines break a common
 * rule (brain/standards/common.json) or a rule of the file's project (brain/projects/<p>/standards/rules.json).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { readProjects, repoContaining } from "../brain/lib/projects.mjs";

const BRAIN = join(homedir(), ".claude");
const ALLOWED_DIRECTIVES = /eslint-|@ts-|phpcs:|prettier-ignore|@vite-ignore|stylelint-|istanbul ignore/;

/** Parses a JSON file; `null` when missing or broken (the guard then stays out of the way). */
function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	}
	catch {
		return null;
	}
}

/**
 * Text before and after the edit, the same way the i18n guard rebuilds it.
 * @returns {{ before: string, after: string }}
 */
function texts(tool, input) {
	if (tool === "Write") {
		const before = input.previous_content ?? (existsSync(input.file_path) ? readFileSync(input.file_path, "utf8") : "");

		return { before, after: input.content ?? "" };
	}

	if (tool === "MultiEdit") {
		const edits = input.edits ?? [];

		return { before: edits.map(e => e.old_string ?? "").join("\n"), after: edits.map(e => e.new_string ?? "").join("\n") };
	}

	return { before: input.old_string ?? "", after: input.new_string ?? "" };
}

/** Lines of `after` that `before` did not have, counting repeats; each with its 1-based line number. */
function addedLines(before, after) {
	const pool = new Map();

	for (const line of before.split("\n"))
		pool.set(line, (pool.get(line) ?? 0) + 1);

	return after.split("\n").map((text, index) => ({ text, line: index + 1 })).filter(({ text }) => {
		const left = pool.get(text) ?? 0;

		if (left > 0) {
			pool.set(text, left - 1);

			return false;
		}

		return true;
	});
}

/** Docblocks of `after` that are not in `before`, with the set of their lines that were added. */
function newDocblocks(before, after, added) {
	const addedText = new Set(added.map(a => a.text));

	return [...after.matchAll(/\/\*\*[\s\S]*?\*\//g)]
		.map(m => m[0])
		.filter(block => !before.includes(block))
		.map(block => ({ block, lines: block.split("\n"), isAdded: line => addedText.has(line) }));
}

/** Prose lines of a docblock before its first @tag. */
function proseLines(lines) {
	const prose = [];

	for (const raw of lines) {
		const line = raw.replace(/^\s*\/\*\*|\*\/\s*$/g, "").replace(/^\s*\*\s?/, "").trim();

		if (line.startsWith("@"))
			break;
		if (line)
			prose.push(raw);
	}

	return prose;
}

/** Words of an identifier, splitting snake_case and camelCase, without a leading `test`. */
function words(name) {
	const parts = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[_\s]+/).filter(Boolean);

	return parts[0]?.toLowerCase() === "test" ? parts.slice(1) : parts;
}

/** Findings of the rules that need context, not a single regex. */
const KINDS = {
	"inline-comment": (rule, { added, path }) => added.filter(({ text }) => {
		const t = text.trim();

		if (ALLOWED_DIRECTIVES.test(t))
			return false;
		if (/^\/\/|^\/\*(?!\*)|^<!--|[;{},)]\s*\/\/\s/.test(t))
			return true;

		return path.endsWith(".php") && /^#(?!\[)/.test(t);
	}),

	"docblock-length": (rule, { blocks, before }) => {
		const legacy = new Map([...before.matchAll(/\/\*\*[\s\S]*?\*\//g)]
			.map(m => proseLines(m[0].split("\n")))
			.filter(prose => prose.length)
			.map(prose => [prose[0].trim(), prose.length]));

		return blocks
			.filter(b => !b.block.includes("@OA\\"))
			.filter(b => {
				const prose = proseLines(b.lines);
				const previous = legacy.get(prose[0]?.trim()) ?? 0;

				return prose.length > Math.max(rule.max, previous) && prose.some(b.isAdded);
			})
			.map(b => ({ text: proseLines(b.lines)[0] ?? b.lines[0], line: null }));
	},

	"phpdoc-with-oa": (rule, { blocks }) => blocks
		.filter(b => b.block.includes("@OA\\"))
		.flatMap(b => b.lines.filter(l => /@(param|return)\b/.test(l) && b.isAdded(l)))
		.map(text => ({ text: text.trim(), line: null })),

	"function-name-words": (rule, { added }) => added.filter(({ text }) => {
		const name = text.match(/function\s+&?\s*([A-Za-z_]\w*)\s*\(/)?.[1] ?? text.match(/^\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(/)?.[1];

		return !!name && !name.startsWith("__") && words(name).length > rule.max;
	}),

	"standard-service-method": (rule, { added, path }) => {
		const match = path.match(/^app\/Services\/Modules\/[^/]+\/([^/]+)\/([^/]+)Service\.php$/);

		if (!match || match[1] !== match[2])
			return [];

		return added.filter(({ text }) => /\bfunction\s+(?!__construct\b)\w+\s*\(/.test(text));
	},
};

/** Findings of one rule over the edit. */
function check(rule, ctx) {
	if (rule.kind)
		return KINDS[rule.kind]?.(rule, ctx) ?? [];

	const re = new RegExp(rule.pattern);

	return ctx.added.filter(({ text }) => re.test(text));
}

let event = {};

try {
	event = JSON.parse(readFileSync(0, "utf8") || "{}");
}
catch {
	process.exit(0);
}

const tool = event.tool_name;
const input = event.tool_input ?? {};
const file = input.file_path ?? "";

if (!["Edit", "MultiEdit", "Write"].includes(tool) || !file || file.startsWith(`${BRAIN}/`))
	process.exit(0);

const repo = repoContaining(file);

if (!repo)
	process.exit(0);

const path = relative(repo, file);
const common = readJson(join(BRAIN, "brain", "standards", "common.json"));

if (common?.skipPaths && new RegExp(common.skipPaths).test(path))
	process.exit(0);

const project = Object.entries(readProjects()).find(([, config]) => config.repos?.includes(repo))?.[0];
const own = project ? readJson(join(BRAIN, "brain", "projects", project, "standards", "rules.json")) : null;
const rules = [...(common?.rules ?? []), ...(own?.rules ?? [])]
	.filter(rule => !rule.repos || rule.repos.includes(basename(repo)))
	.filter(rule => new RegExp(rule.files ?? ".").test(path) && !(rule.exceptions ?? []).includes(path));

const { before, after } = texts(tool, input);
const added = addedLines(before, after);
const ctx = { added, path, before, blocks: newDocblocks(before, after, added) };
const violations = rules.flatMap(rule => check(rule, ctx).slice(0, 3).map(hit => ({ rule, hit })));

if (!violations.length)
	process.exit(0);

const reason = [
	`code-standards-guard niega la edicion de ${path}:`,
	...violations.slice(0, 6).map(({ rule, hit }) => `- [${rule.id}] ${rule.message}\n    ${hit.text.trim().slice(0, 140)}\n    Fuente: ${rule.source}`),
	"Si es un falso positivo, propon agregar el archivo a `exceptions` de la regla, en brain/standards/common.json o en el rules.json del proyecto, y espera la aprobacion.",
].join("\n");

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
