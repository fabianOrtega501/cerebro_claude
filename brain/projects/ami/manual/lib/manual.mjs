/** Puente al motor de copia, con el perfil de AMI ya inyectado para no pasarlo en cada llamada. */

import { PROFILE } from "../profile.mjs";
import * as engine from "../../../../../skills/update-manual/lib/manual.mjs";

export { copyScreenshots, pngSize } from "../../../../../skills/update-manual/lib/manual.mjs";

export const resolveManualRoot = explicitPath => engine.resolveManualRoot(PROFILE, explicitPath);
export const imagesRoot = manualRoot => engine.imagesRoot(PROFILE, manualRoot);
