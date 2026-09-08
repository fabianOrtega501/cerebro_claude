/**
 * Puente al `manual.mjs` del motor, con el perfil de Status ya inyectado.
 *
 * Asi los modulos y `copy-to-manual.mjs` no tienen que pasarlo en cada llamada.
 */

import { PROFILE } from "../profile.mjs";
import * as motor from "../../../../../skills/update-manual/lib/manual.mjs";

export * from "../../../../../skills/update-manual/lib/manual.mjs";

/** Raiz del repo del manual. Se resuelve con el perfil de Status. */
export const resolveManualRoot = (explicitPath) => motor.resolveManualRoot(PROFILE, explicitPath);

/** Carpeta de imagenes dentro del manual, ya con el perfil de Status aplicado. */
export const imagesRoot = (manualRoot) => motor.imagesRoot(PROFILE, manualRoot);
