/**
 * Cierra una revision de upstream: decide que pasa la proxima vez que se dispare el hook.
 *
 * Se corre **al final** de la skill `sync-brain`, cuando el usuario ya dijo que hacer. Hasta
 * que esto no corre, el aviso sigue vivo: es a proposito, para que una revision interrumpida
 * a la mitad no se pierda en silencio.
 *
 * Uso:
 *   `node settle.mjs reviewed [repo]`   el usuario ya decidio (absorbio algo o no); se congela
 *                                       la version actual del repo como nueva linea base
 *   `node settle.mjs dismissed [repo]`  no interesa esta version, pero la linea base sigue
 *                                       siendo la revision anterior de verdad
 */

import { findRepoRoot, markDismissed, markReviewed } from "../../../brain/lib/upstream.mjs";

const [action, target] = process.argv.slice(2);
const repoRoot = findRepoRoot(target ?? process.cwd());

if (!repoRoot) {
  console.error("No estas dentro de un repositorio git.");
  process.exit(1);
}

if (action === "reviewed") {
  markReviewed(repoRoot);
  console.log(`Linea base actualizada para ${repoRoot}. El hook queda en silencio hasta el proximo cambio.`);
}
else if (action === "dismissed") {
  markDismissed(repoRoot);
  console.log(`Version descartada para ${repoRoot}. No se vuelve a avisar por esta version.`);
}
else {
  console.error("Uso: node settle.mjs <reviewed|dismissed> [ruta-del-repo]");
  process.exit(1);
}
