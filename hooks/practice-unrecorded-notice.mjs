#!/usr/bin/env node
/**
 * Hook de `Stop`: avisa cuando un ticket de practica se cerro sin registrarse en el temario.
 *
 * `finish-development` ya lo revisa en su preflight, y ese es el momento natural. Este hook es la
 * red por si ese momento no llega: un ticket que se cierra a mano, una rama que se mezcla desde
 * otra ventana. Sin el, el temario miente en silencio — que es exactamente lo que pasaba antes:
 * tres lecciones dadas y los quince temas todavia en `pendiente`.
 *
 * Solo avisa cuando el ticket **parece terminado**: su rama desaparecio, ya se mezclo en su base,
 * o la marca lleva mas de una semana abierta. Avisar mientras la practica esta en curso seria
 * ruido en cada turno, y el ruido es lo que enseña a ignorar los avisos.
 *
 * No bloquea. El dano aqui es un olvido, y un olvido se arregla en cualquier momento; denegar se
 * reserva para lo que ya no tiene vuelta atras, como una clave de traduccion intercalada.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const BRAIN = join(homedir(), ".claude");
const MARCA = join(BRAIN, "brain/learning/.active-practice.json");
const ESTADO = join(tmpdir(), "claude-practice-notice.json");

const quiet = () => process.exit(0);

/** Corre git y devuelve la salida limpia. `null` si el comando falla. */
function git(repo, args) {
	try {
		return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return null;
	}
}

/**
 * Por que el ticket parece cerrado, o `null` si la practica sigue en curso.
 *
 * Solo dos señales, y las dos son inequivocas. **No se mira si la rama esta mezclada**: una rama
 * recien creada sin commits propios da exactamente la misma cuenta que una ya integrada
 * (`base..rama` = 0 en ambas), asi que ese chequeo marcaba como cerrada una practica en curso.
 * Un aviso con falsos positivos es un aviso que se aprende a ignorar.
 */
function motivoDeCierre(session) {
	const dias = Math.floor((Date.now() - Date.parse(session.openedAt)) / 86400000);
	if (dias > 7) return `la marca lleva ${dias} dias abierta`;

	const repo = session.repo;
	if (!repo || !existsSync(repo)) return null;

	if (!git(repo, ["rev-parse", "--verify", `refs/heads/${session.branch}`])) return "su rama ya no existe";

	return null;
}

if (!existsSync(MARCA)) {
	try {
		writeFileSync(ESTADO, JSON.stringify({ firma: "limpio" }));
	} catch { /* el aviso no puede tumbar el turno */ }
	quiet();
}

let session;
try {
	session = JSON.parse(readFileSync(MARCA, "utf8"));
} catch {
	quiet();
}

const motivo = motivoDeCierre(session);
if (!motivo) quiet();

const firma = `${session.project}:${session.ticket}:${motivo}`;
try {
	if (existsSync(ESTADO) && JSON.parse(readFileSync(ESTADO, "utf8")).firma === firma) quiet();
	writeFileSync(ESTADO, JSON.stringify({ firma }));
} catch { /* idem */ }

const temas = session.topics?.length ? session.topics.join(", ") : "(ninguno anotado en la clase)";

process.stdout.write(`${JSON.stringify({
	systemMessage: `Practica del ticket ${session.ticket} sin registrar en el temario.`,
	hookSpecificOutput: {
		hookEventName: "Stop",
		additionalContext: [
			`El ticket ${session.ticket} de ${session.project} se hizo en modo practica y ${motivo},`,
			"pero sus temas nunca se registraron en el temario. Mientras no se registren, el temario",
			"dice que esos temas siguen pendientes y la proxima sesion repetira la misma clase.",
			"",
			`Temas de la clase: ${temas}`,
			"",
			"Dilo en una linea y ofrece cerrarlo. El registro es, por cada tema:",
			"  node ~/.claude/brain/learning/lib/syllabus.mjs --record --topic <slug> \\",
			`       --ticket ${session.ticket} --project ${session.project} --hint <1-4> --blocking <n>`,
			"Y despues:  node ~/.claude/brain/learning/lib/practice-session.mjs close",
			"",
			"Necesitas que el usuario te diga como le fue en cada tema: no inventes el `--hint` ni el",
			"`--blocking`. Si dice que no quiere registrarlo, cierra la marca y no insistas.",
		].join("\n"),
	},
})}\n`);
