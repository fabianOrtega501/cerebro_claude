---
name: local-check-form-requests
description: Revisar los FormRequest de Laravel de una rama de aio-backend contra el request común del repo (CommonFormRequest) — reglas escritas a mano que ya existen como propiedad o ayudante del request común, y reglas sin su mensaje en messages(). La usa peer-review (en los dos modos) sobre los requests que toca la rama; también a mano. Absorbida de `aio:check-form-requests` de main-brain. Solo para aio-backend o repos Laravel con un request común.
---

# Revisar los FormRequest del AIO

En aio-backend cada request hereda de `app/Http/Requests/Common/CommonFormRequest.php`. Ahí viven las
propiedades con reglas listas (`$this->requiredInteger`, `$this->nullableString`…) y los ayudantes
(`validateString`, `validateNumeric`…). Dos fallos se repiten en las revisiones:

- una regla escrita a mano que ya existe en el request común;
- una regla sin su mensaje `campo.regla` en `messages()`, incluidas las que agrega un ayudante
  (`validateString` agrega `string` y `max`).

Desde la raíz del repo, con la rama puesta:

```bash
node ~/.claude/brain/projects/aio/skills/local-check-form-requests/lib/check-form-requests.mjs --base origin/<rama base> <request.php> [<request.php>…]
```

- `--base` es obligatorio: la rama destino del MR o la base del ticket.
- En otro repo Laravel, si el request común tiene otra ruta, se pasa con `--common <ruta>`; si no hay
  request común, se pasa la clase de la que heredan los requests vecinos.
- Sale con `0` si no hay hallazgos en líneas de la rama, `1` si los hay y `2` por uso o base inválida.

Por archivo devuelve:

| Llave | Qué es |
| --- | --- |
| `unusedHelpers` | Regla a mano (`written`) y lo que se debe usar del request común (`use`) |
| `missingMessages` | Reglas del campo sin mensaje en `messages()` (`missing`) |
| `inBranch` | Si la línea es de la rama; solo eso se le cobra al autor |
| `notice` | `rules()` no se pudo leer: revisar a mano |

Lo de líneas de la rama es **Debe corregirse**. Por ejemplo, `'nullable|string|max:100'` pasa a
`$this->validateString(100, $this->nullable)`. Si el request no tiene `messages()` y sus vecinos del
módulo sí, se pide crearlo.

**El nombre de cada ayudante se verifica en el request común antes de citarlo**, porque cambia entre
ramas.

No entiende reglas propias (`new …`), `rules()` armados por partes ni mensajes heredados del padre: esos
se revisan a mano.
