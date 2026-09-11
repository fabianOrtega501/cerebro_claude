---
name: archivos-al-separar-origenes
description: Al separar front y back, las descargas y los cargues de archivos hay que rediseñarlos — como lo resolvieron AIO y Epsilon
metadata:
  type: project
---

Con la sesion en un header `Authorization`, **no se puede apuntar un `<a href>` a una URL protegida**:
el navegador no manda el header en una navegacion. Toda descarga y todo cargue de Status hay que
rediseñarlos al separar los repos.

**Why:** los dos proyectos ya separados tuvieron que inventar un camino, y ninguno es gratis.
Epsilon devuelve el archivo como **base64 dentro del JSON** (`{fileName, fileData}`) y lo materializa
en el navegador con Blob; no usa `responseType: 'blob'` en ninguna parte, y sube los archivos tambien
en base64 en vez de multipart, de ahi su `express.json({limit:"50mb"})`. Cuesta memoria y ~33% de
payload. AIO tiene dos vias: `downloadFile64()` con base64 en el JSON, y otra en la que **el backend
devuelve un path de storage y el front arma la URL a `/storage/...`**, que queda **fuera de Sanctum**
—cualquiera con la URL descarga el archivo— y encima la reconstruye tomando indices fijos del path
partido por `/`, asi que cambiar la profundidad del directorio rompe la descarga en silencio. Eso
ultimo es lo que no hay que copiar.

**How to apply:** inventariar primero lo que Status entrega hoy —exportaciones a Excel del gestor de
informacion, plantillas, evidencias de seguimientos de tramites, actas y reportes de Aprovechamiento,
y todo lo que arme URLs con `MIX_PATH_DOWNLOAD`— y decidir **una** sola via para todo el sistema
antes de migrar la primera pantalla. La opcion sana es que el backend exponga la descarga como
endpoint autenticado y el front la pida con `responseType: 'blob'`, o una URL firmada de vida corta
si el archivo es grande; base64 solo para archivos chicos. Para los cargues, mantener `multipart` con
`FormData` y un unico helper, no tres como AIO. Ver [[acoples-front-monorepo-status]].
