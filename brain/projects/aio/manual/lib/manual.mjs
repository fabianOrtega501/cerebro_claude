/**
 * Puente al `manual.mjs` del motor transversal, con el perfil del AIO ya inyectado.
 *
 * El motor necesita saber a qué manual copiar y a qué subcarpeta; eso lo dice el perfil. Atarlo
 * aquí deja a `copy-to-manual.mjs` y a los módulos con la misma firma de siempre, sin tener que
 * pasar el perfil en cada llamada.
 */

import { PROFILE } from "../profile.mjs";
import * as engine from "../../../../../skills/update-manual/lib/manual.mjs";

export { copyScreenshots, pngSize } from "../../../../../skills/update-manual/lib/manual.mjs";

/** Igual que la del motor, pero sin tener que pasar el perfil. */
export const resolveManualRoot = explicitPath => engine.resolveManualRoot(PROFILE, explicitPath);

/** Igual que la del motor, pero sin tener que pasar el perfil. */
export const imagesRoot = manualRoot => engine.imagesRoot(PROFILE, manualRoot);
