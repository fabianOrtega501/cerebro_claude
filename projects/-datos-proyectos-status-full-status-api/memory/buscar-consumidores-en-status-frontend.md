---
name: buscar-consumidores-en-status-frontend
description: "En status-frontend los consumidores de un endpoint se buscan por fragmento de ruta, nunca por la URL completa entrecomillada."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-18T20:15:38.921Z
---

Antes de migrar un endpoint de `status-api`, los consumidores en `status-frontend` se buscan
**por fragmento de ruta**, no por la URL completa entre comillas:

```bash
# Bien: encuentra tambien las que concatenan
grep -rn "formularios/show" src --include=*.vue

# Mal: solo encuentra las que escriben la URL entera entre comillas
grep -rn '"/formularios/show"' src
```

**Por que:** en este front la mayoria de las llamadas arman la URL concatenando
—`.get("/formularios/show?id=" + this.idFormulario)`—, asi que la busqueda por URL completa las
deja fuera. El 2026-09-18, en `MtFormularios`, eso hizo que el plan dijera **8 vistas** cuando
eran **33**; como el backend ya habia cambiado el contrato, 25 pantallas quedaron rotas y solo
aparecieron en una barrida final de restos. Con el fragmento, el conteo del lote siguiente
(categorias, frecuencias, tipos y opciones de cargue) salio exacto a la primera: 10 vistas.

**Como aplicarlo:**

1. Buscar por fragmento y **contar archivos unicos** (`grep -rl ... | wc -l`) antes de estimar.
2. Revisar si la vista arma la ruta con una variable —`"/"+this.ruta+"/store"`—: eso es un
   componente que puede servir a varios maestros, y hay que comprobar con que valores se usa.
3. Al terminar, repetir la busqueda para confirmar que no queda ningun resto fuera del servicio.

**Cuidado con el reemplazo masivo:** cambiar `response.data.datos` por `response.data` con un
`replace` global alcanza tambien a llamadas de otros endpoints que viven en el mismo archivo, y
esos siguen con el contrato viejo. Paso en 6 archivos el mismo dia. Hay que acotar el reemplazo
al bloque de la llamada migrada y despues verificar que cada lectura nueva cuelgue de un servicio.

Ver [[servicios-front-espejan-al-back]].
