/**
 * Temario vivo del modo practica: que temas se han ejercitado, con cuanta ayuda y con que
 * resultado. Es la unica forma de leer y escribir `syllabus.json`; a mano se inventan campos.
 *
 * Uso:
 *   node syllabus.mjs --status
 *   node syllabus.mjs --suggest "filtro por tipo de vehiculo"
 *   node syllabus.mjs --record --topic laravel-migraciones --ticket 10850 --project status \
 *                     --hint 2 --blocking 0 [--error "olvido el down()"]
 *   node syllabus.mjs --add-topic <slug> --label "..." --keywords "a,b,c"
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(dirname(fileURLToPath(import.meta.url))), "syllabus.json");

/** Niveles en orden. `pendiente` es no haberlo tocado nunca; el orden define subir y bajar. */
const LEVELS = ["pendiente", "visto", "practicado", "dominado"];

/** Lee el temario del disco. Lanza si el JSON esta roto: es preferible a seguir con datos a medias. */
export function read() {
	return JSON.parse(readFileSync(FILE, "utf8"));
}

/** Escribe el temario con indentacion de dos espacios, para que el diff de git sea legible. */
function write(data) {
	writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Normaliza texto para comparar: minusculas y sin tildes. */
function normalize(text) {
	return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Temas candidatos para un ticket, ordenados por relevancia y luego por lo pendiente que esta.
 * Puntua por palabras clave del tema presentes en el enunciado; sin ninguna coincidencia
 * devuelve los mas atrasados, que siempre son una sugerencia valida.
 */
export function suggest(text, limit = 3) {
	const haystack = normalize(text);
	const topics = read().topics;

	const scored = Object.entries(topics).map(([slug, topic]) => {
		const hits = (topic.keywords || []).filter(k => haystack.includes(normalize(k))).length;

		return { slug, topic, hits, pending: LEVELS.length - LEVELS.indexOf(topic.level) };
	});

	const matched = scored.filter(s => s.hits > 0);
	const pool = matched.length ? matched : scored;

	return pool
		.sort((a, b) => b.hits - a.hits || b.pending - a.pending)
		.slice(0, limit);
}

/**
 * Registra el resultado de un tema en un ticket y mueve su nivel segun las reglas del temario.
 * `hint` es el peldano de ayuda que hizo falta (1..4) y `blocking` los findings bloqueantes del
 * review. Devuelve el nivel anterior y el nuevo.
 */
export function record({ topic: slug, ticket, project, hint, blocking, error, date }) {
	const data = read();
	const topic = data.topics[slug];

	if (!topic) throw new Error(`Tema desconocido: ${slug}. Crealo con --add-topic.`);

	const before = topic.level;

	if (blocking > 0) {
		// Un bloqueante rompe la racha, y degrada lo que ya se daba por dominado: sin bajada, el
		// temario solo sube y a los tres meses miente.
		topic.cleanStreak = 0;
		if (topic.level === "dominado") topic.level = "practicado";
		else if (topic.level === "pendiente") topic.level = "visto";
	}
	else if (hint <= 2) {
		topic.cleanStreak = (topic.cleanStreak || 0) + 1;
		if (LEVELS.indexOf(topic.level) < LEVELS.indexOf("practicado")) topic.level = "practicado";
		if (topic.cleanStreak >= 2) topic.level = "dominado";
	}
	else {
		topic.cleanStreak = 0;
		if (topic.level === "pendiente") topic.level = "visto";
	}

	topic.lastPracticed = date || new Date().toISOString().slice(0, 10);
	topic.tickets = [...(topic.tickets || []), { ticket, project, date: topic.lastPracticed, hint, blocking }];
	if (error) topic.recurringErrors = [...(topic.recurringErrors || []), error];

	write(data);

	return { slug, before, after: topic.level, cleanStreak: topic.cleanStreak };
}

/** Agrega un tema nuevo en nivel `pendiente`. Falla si ya existe, para no pisar su historia. */
export function addTopic({ slug, label, keywords }) {
	const data = read();

	if (data.topics[slug]) throw new Error(`El tema ${slug} ya existe.`);

	data.topics[slug] = {
		label,
		level: "pendiente",
		keywords: keywords || [],
		lastPracticed: null,
		cleanStreak: 0,
		tickets: [],
		recurringErrors: [],
	};
	write(data);

	return data.topics[slug];
}

/** Mapa de progreso en texto: temas agrupados por nivel, con su ultima practica. */
export function status() {
	const topics = read().topics;
	const lines = [];

	for (const level of [...LEVELS].reverse()) {
		const inLevel = Object.entries(topics).filter(([, t]) => t.level === level);

		if (!inLevel.length) continue;

		lines.push(`\n${level.toUpperCase()} (${inLevel.length})`);
		for (const [slug, t] of inLevel) {
			const errors = (t.recurringErrors || []).length;
			const tail = [t.lastPracticed || "nunca", `${(t.tickets || []).length} ticket(s)`, errors ? `${errors} error(es) anotado(s)` : null]
				.filter(Boolean)
				.join(" · ");

			lines.push(`  ${slug.padEnd(32)} ${tail}`);
		}
	}

	return lines.join("\n").trim();
}

/** Lee los argumentos `--clave valor` de la linea de comandos a un objeto plano. */
function parseFlags(argv) {
	const flags = {};

	for (let i = 0; i < argv.length; i++) {
		if (!argv[i].startsWith("--")) continue;

		const key = argv[i].slice(2);
		const next = argv[i + 1];

		flags[key] = next && !next.startsWith("--") ? next : true;
	}

	return flags;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const argv = process.argv.slice(2);
	const flags = parseFlags(argv);

	try {
		if (flags.status) {
			console.log(status());
		}
		else if (flags.suggest) {
			for (const { slug, topic, hits } of suggest(String(flags.suggest))) {
				console.log(`${slug.padEnd(32)} ${topic.level.padEnd(11)} ${hits} coincidencia(s) — ${topic.label}`);
			}
		}
		else if (flags.record) {
			const result = record({
				topic: flags.topic,
				ticket: flags.ticket || null,
				project: flags.project || null,
				hint: Number(flags.hint || 4),
				blocking: Number(flags.blocking || 0),
				error: typeof flags.error === "string" ? flags.error : null,
				date: typeof flags.date === "string" ? flags.date : null,
			});

			console.log(`${result.slug}: ${result.before} -> ${result.after} (racha limpia: ${result.cleanStreak})`);
		}
		else if (flags["add-topic"]) {
			const topic = addTopic({
				slug: String(flags["add-topic"]),
				label: String(flags.label || flags["add-topic"]),
				keywords: typeof flags.keywords === "string" ? flags.keywords.split(",").map(k => k.trim()) : [],
			});

			console.log(`Tema creado: ${flags["add-topic"]} — ${topic.label}`);
		}
		else {
			console.log("Usos: --status | --suggest <texto> | --record --topic <slug> ... | --add-topic <slug> --label <texto>");
			process.exit(1);
		}
	}
	catch (err) {
		console.error(err.message);
		process.exit(1);
	}
}
