---
name: revision-de-pares-propia
description: "Antes de proponer el commit en AIO, revisar el diff como lo haría el revisor de pares, con la lista de fallas que ya devolvió un MR"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8c34b7cf-528c-4a38-9db5-224293c71ab9
  modified: 2026-10-19T15:50:53.674Z
---

Antes de proponer el commit de un desarrollo en AIO, se revisa el diff completo como lo haría la
revisión de pares, con esta lista. Cada punto salió de una devolución real del ticket 11411:

1. **Empresa en toda acción por id.** Anular, cerrar, editar o ver un registro por su id tiene que
   comprobar que es de la empresa de la sesión, reutilizando el bloqueo que ya use el método vecino
   (en PQR, `lockEditablePqr`). Y cada endpoint nuevo o reescrito lleva su prueba «de otra empresa».
2. **Lo que otro canal ya descargó.** Si una acción inactiva algo que el AMI pudo bajar sin conexión
   (una prestación, una visita), revisar qué hace la sincronización cuando llega ese registro
   inactivo, y probarlo. Un rechazo hace que el celular lo reenvíe para siempre: se confirma el id.
3. **Las reglas de privacidad viven en el servidor.** Lo que la pantalla limpia (el anónimo) también
   lo limpia el servicio, y se prueba llamando la API directo, no solo desde la vista.
4. **Docblocks completos en todo archivo nuevo**, también en Form Requests y pruebas: `rules()`,
   `messages()`, `@return void`. Se compara con el archivo vecino, que suele tenerlos.
5. **Formato de las líneas nuevas**: `pint --test` sobre los archivos tocados y corregir a mano solo
   lo de nuestras líneas (ver [[no-usar-pint-en-aio]]).
6. **Datos vacíos**: sin ubicación, sin dirección, sin roles. No llamar un servicio externo con un
   valor de relleno (OSM en 0, 0); cada caso vacío lleva su prueba.
7. **Un canal no tumba al otro**: si un aviso sale por dos vías (buzón y correo), cada una en su
   propio intento, y su prueba de fallo.
8. **SonarQube**: máximo 3 `return` por método (php:S1142); las validaciones previas van a un método.
9. **Copiar una referencia también copia sus defectos**: no sumar una tercera copia de funciones; si
   no se extraen, se documenta la deuda.
10. **Los dobles de prueba usan datos reales**: bytes binarios de verdad, no `BBBB`, o la prueba no
    ve la falla del guardado.
11. **Un renombre se busca en todo el repo**, incluidos `docs/` y los enlaces a archivos: quedó un
    enlace a la migración con el nombre viejo.
12. **Antes de cada `git add`, el diff de ese archivo.** Si trae líneas que no son del desarrollo, se
    pregunta. Un commit del 11411 llevó dos cambios de `es.json` hechos a mano en la copia de trabajo
    (un texto y una clave repetida de `desa`) sin que se notaran.

**Why:** el MR del ticket 11411 volvió con 1 bloqueante (anular un PQR de otra empresa), 4
correcciones y 4 mejoras, aunque las 119 pruebas pasaban. Fabian lo pidió el 2026-10-19: «no
podemos permitir un desarrollo que presente tantas novedades, se debe ser más exigente y
exhaustivo con las pruebas».

**How to apply:** en `finish-development`, después de `review-overengineering` y antes de proponer el
commit, se recorre esta lista sobre el diff y se dice qué punto se verificó y cómo. Lo que falte se
corrige o se le muestra a Fabian antes del commit. Relacionado: [[error-logging-rompe-aislamiento-tests]],
[[cada-consulta-en-su-entidad]].
