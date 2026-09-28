#!/usr/bin/env node
/**
 * SessionStart: el ambiente sobrevive entre sesiones, asi que si una arranca fuera de local el
 * usuario lo ve de inmediato y Claude lo sabe desde el primer mensaje.
 */
import { describeState, isProduction, readRegistry, readState } from "../brain/lib/environments.mjs";

const state = readState();
const text = describeState(state);
const out = {
	hookSpecificOutput: {
		hookEventName: "SessionStart",
		additionalContext: `Ambiente activo: ${text}. Antes de iniciar un desarrollo nuevo, recuerdale al usuario en que ambiente estamos.`,
	},
};

if (state.environment !== "local") {
	const prod = isProduction(readRegistry(), state.environment) ? " PRODUCCION: cada operacion te pedira aprobacion." : "";

	out.systemMessage = `La sesion arranca con el ambiente ${text} activo.${prod} Para volver a local: /ambiente local`;
}

process.stdout.write(JSON.stringify(out));
