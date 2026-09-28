#!/usr/bin/env node
/**
 * PreToolUse sobre Bash: niega los comandos que escriben archivos de codigo de un repo registrado.
 * Un cambio por Bash no pasa por las guardas de Edit/Write ni deja diff en el editor. Lo que se
 * escape de aqui lo atrapa `bash-change-audit.mjs`. Se apaga con CLAUDE_ALLOW_BASH_WRITES=1.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { allRepos, repoContaining } from "../brain/lib/projects.mjs";

/** Extensiones que se consideran codigo. */
const CODE = /\.(php|js|cjs|mjs|jsx|ts|tsx|vue|json|sql|css|scss)$/i;

/** Programas que ejecutan un script escrito en linea o por heredoc. */
const INTERPRETERS = new Set(["python", "python3", "node", "php", "ruby", "perl"]);

/** Llamadas que, dentro de un script en linea, abren un archivo para escribir. */
const WRITE_APIS = [
	/\bopen\([^)]*,\s*(?:mode\s*=\s*)?['"](?:[wax][+b]*|r\+b?|rb\+)['"]/,
	/\.write_(?:text|bytes)\s*\(/,
	/\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream)\s*\(/,
	/\bfile_put_contents\s*\(/,
	/\bfopen\([^)]*,\s*['"][wax]/,
	/\bshutil\.(?:copy|copyfile|copy2|move)\s*\(/,
];

/** Separadores entre comandos de una misma linea. */
const SEPARATORS = /&&|\|\||;|\||\n/;

const REPOS = allRepos();

/** Evento del hook leido de stdin; `null` si no es JSON valido. */
function readEvent() {
	try {
		return JSON.parse(readFileSync(0, "utf8") || "{}");
	}
	catch {
		return null;
	}
}

/** Quita las comillas que envuelven un token y expande `~`. */
function clean(token) {
	const bare = token.replace(/^['"]|['"]$/g, "");

	return bare.startsWith("~") ? join(homedir(), bare.slice(1)) : bare;
}

/** Carpetas desde las que se resuelven las rutas relativas: el cwd y cada `cd` del comando. */
function baseDirs(command, cwd) {
	const bases = [cwd];

	for (const [, target] of command.matchAll(/\bcd\s+(['"]?[^\s'"&;|]+['"]?)/g)) {
		const dir = clean(target);

		if (!dir.includes("$"))
			bases.push(isAbsolute(dir) ? dir : resolve(cwd, dir));
	}

	return bases;
}

/** El token tal como se escribio si apunta a codigo dentro de un repo registrado; si no, `null`. */
function protectedCode(token, bases) {
	const path = clean(token);

	if (!CODE.test(path) || /[$*`]/.test(path))
		return null;

	const candidates = isAbsolute(path) ? [path] : bases.map(base => resolve(base, path));

	return candidates.some(candidate => repoContaining(candidate, REPOS)) ? path : null;
}

/** Programa y argumentos de cada comando de la linea, saltando `sudo` y las asignaciones `X=1`. */
function segments(command) {
	return command
		.split(SEPARATORS)
		.map(segment => segment.trim().split(/\s+/).filter(Boolean))
		.filter(tokens => tokens.length)
		.map((tokens) => {
			let i = 0;

			while (i < tokens.length && (tokens[i] === "sudo" || /^[A-Za-z_]\w*=/.test(tokens[i])))
				i++;

			return { program: basename(tokens[i] ?? ""), args: tokens.slice(i + 1) };
		});
}

/** El comando sin los cuerpos de heredoc que solo se guardan (`cat > x <<EOF`) y no se ejecutan. */
function withoutDataBodies(command) {
	const lines = command.split("\n");
	const out = [];

	for (let i = 0; i < lines.length; i++) {
		out.push(lines[i]);

		const mark = lines[i].match(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1/);

		if (!mark)
			continue;

		const [segment] = segments(lines[i].slice(0, mark.index)).slice(-1);
		const executes = Boolean(segment && INTERPRETERS.has(segment.program));
		let j = i + 1;

		while (j < lines.length && lines[j].trim() !== mark[2]) {
			if (executes)
				out.push(lines[j]);
			j++;
		}

		if (j < lines.length)
			out.push(lines[j]);

		i = j;
	}

	return out.join("\n");
}

/**
 * Operaciones del comando que escriben en codigo protegido.
 *
 * @param {string} original - Comando de Bash
 * @param {string} cwd - Directorio de trabajo del evento
 * @returns {Array<{operation: string, file: string}>}
 */
function writes(original, cwd) {
	const command = withoutDataBodies(original);
	const bases = baseDirs(command, cwd);
	const found = [];
	const add = (operation, file) => found.push({ operation, file });

	for (const { program, args } of segments(command)) {
		const hits = args.map(arg => protectedCode(arg, bases)).filter(Boolean);
		const inPlace = args.some(arg => /^-[a-zA-Z]*i/.test(arg) || arg === "--in-place");

		if ((program === "sed" || program === "perl") && inPlace && hits.length)
			add(`${program} -i`, hits[0]);

		if (program === "tee" && hits.length)
			add("tee", hits[0]);

		if (["cp", "mv", "install"].includes(program) && args.length) {
			const target = protectedCode(args[args.length - 1], bases);

			if (target)
				add(program, target);
		}

		const inRepo = bases.some(base => repoContaining(base, REPOS));

		if (inRepo && (program === "patch" || (program === "git" && args[0] === "apply")))
			add(program === "git" ? "git apply" : "patch", "el repositorio");
	}

	for (const [, , target] of command.matchAll(/(?:^|[^<>0-9&])(?:\d|&)?>>?\s*(['"]?)([^\s'"|;&<>()]+)\1/g)) {
		const file = protectedCode(target, bases);

		if (file)
			add("redireccion >", file);
	}

	const usesInterpreter = segments(command).some(({ program }) => INTERPRETERS.has(program));

	if (usesInterpreter && WRITE_APIS.some(pattern => pattern.test(command))) {
		const mentioned = [...command.matchAll(/[~\w@./${}-]+\.[A-Za-z]+\b/g)]
			.map(([token]) => protectedCode(token, bases))
			.find(Boolean);

		if (mentioned)
			add("script en linea que abre el archivo para escribir", mentioned);
	}

	return found;
}

const event = readEvent();

if (!event || event.tool_name !== "Bash" || process.env.CLAUDE_ALLOW_BASH_WRITES === "1")
	process.exit(0);

const found = writes(event.tool_input?.command ?? "", event.cwd ?? process.cwd());

if (!found.length)
	process.exit(0);

const detail = [...new Map(found.map(f => [`${f.operation}|${f.file}`, f])).values()]
	.slice(0, 3)
	.map(f => `${f.operation} sobre ${f.file}`)
	.join("; ");

process.stdout.write(JSON.stringify({
	hookSpecificOutput: {
		hookEventName: "PreToolUse",
		permissionDecision: "deny",
		permissionDecisionReason: `No escribas archivos de codigo del proyecto desde Bash (${detail}). `
			+ "Asi no corren las guardas de Edit/Write, no queda diff en el editor ni vuelven los diagnosticos. "
			+ "Haz el cambio con Edit o Write. Leer, buscar, probar, git, docker y consultas por Bash siguen permitidos.",
	},
}));
