---
name: revision-de-pares-propia
description: "Antes de proponer el commit en AIO, revisar el diff como lo haría el revisor de pares, con la lista de fallas que ya devolvió un MR"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8c34b7cf-528c-4a38-9db5-224293c71ab9
  modified: 2026-11-20T13:58:26.807Z
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
   `messages()`. El `@return` solo es obligatorio si la función devuelve algo (regla del 2026-11-05). Se compara con el archivo vecino, que suele tenerlos.
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

13. **Sin docblock en constantes ni propiedades**, en PHP y en TypeScript (11730).
14. **Lo que la HU prescribe técnicamente cede ante el estándar del repo**: un parámetro va en
    `parameters.json`, no en una migración (11730, [[parametros-en-parameters-json]]).
15. **Toda ventana de tiempo sobre GPS lleva tope**, y se prueba con un despacho abierto de días atrás
    (11730, [[ventana-gps-con-tope]]).
16. **Lo copiado de un archivo de referencia se justifica línea por línea**: una propiedad o un import
    sin quien lo use se quita. El `$messageError` del controlador estándar lo usan sus métodos CRUD; un
    `Custom*Controller` cuyos errores salen del servicio no lo necesita (11730).
17. **Cada regla del request se cruza con su migración.** Un `nullable` sobre una columna `NOT NULL`
    deja pasar el null hasta la base y responde 500; si el campo es opcional, `['sometimes', $this->bool]`.
    Se prueba enviando el campo en null (11857).
18. **Todas las salidas de una función devuelven las mismas llaves**, también las salidas tempranas, y un
    dato ausente vale lo mismo (`null`) en todo lugar que lo expone: endpoint, atributo del modelo y
    docblock (11857).
19. **Un dato nuevo en un payload se sigue hasta los docblocks y los comentarios vecinos**: los `@param`
    que enumeran sus llaves se actualizan, y un comentario anterior que quedó desactualizado se borra,
    aunque no lo haya escrito el ticket (11857).
20. **Lo que el servidor puede calcular no se recibe del cliente**: si el front ya calcula un costo o un
    total, el servicio lo calcula igual para todos los caminos y se prueba llamando la API con otro valor
    (11857). Lo mecánico (`app()` dentro de un método, casts booleanos) ya lo niega `code-standards-guard`.

**Why:** el MR del ticket 11411 volvió con 1 bloqueante (anular un PQR de otra empresa), 4
correcciones y 4 mejoras, aunque las 119 pruebas pasaban. Fabian lo pidió el 2026-10-19: «no
podemos permitir un desarrollo que presente tantas novedades, se debe ser más exigente y
exhaustivo con las pruebas».

**How to apply:** en `finish-development`, después de `review-overengineering` y antes de proponer el
commit, se recorre esta lista sobre el diff y se dice qué punto se verificó y cómo. Lo que falte se
corrige o se le muestra a Fabian antes del commit. Relacionado: [[error-logging-rompe-aislamiento-tests]],
[[cada-consulta-en-su-entidad]].
