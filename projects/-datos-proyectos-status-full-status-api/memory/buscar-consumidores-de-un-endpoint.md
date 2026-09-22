---
name: buscar-consumidores-de-un-endpoint
description: "Antes de migrar un endpoint: mirar a que backend apunta cada repo, y buscar por fragmento de ruta, nunca por la URL completa."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-22T01:13:07.528Z
---

Antes de cambiar el contrato de un endpoint de `status-api` hay que encontrar **todos** sus
consumidores. Dos reglas, y las dos se aprendieron rompiendo algo.

## 0. Primero: a que backend apunta ese repo

Que un repo llame a `/Roles/select` **no significa que llame a esta API**. Hay que mirar su
`baseURL` antes de darlo por consumidor:

| Repo | Apunta a | Consume status-api? |
|---|---|---|
| `status-frontend` | status-api, puerto 8087 | **si** |
| `sipa` | `VUE_APP_API=http://localhost:8086/api`, el monolito | **no**, hoy no |
| monolito `status` | `MIX_PATH_API=http://localhost:8086/api`, el mismo | no, es su propio backend |

El 2026-09-22 se dieron por rotas diez pantallas de SIPA por no mirar esto: su codigo llama a
esas rutas, pero contra el monolito, que conserva el contrato viejo. El inventario sigue
sirviendo —ver [[sipa-roto-por-la-migracion]]— pero como lista de lo que habra que ajustar el
dia que SIPA se apunte a status-api, no como incendio.

**Comando:**

```bash
grep -rn "baseURL" <repo>/src/**/*.js | head
grep -riE "VUE_APP_API|MIX_PATH_API" <repo>/.env
```

## 1. Buscar en los repos que si apuntan aqui

`status-api` **sirve a dos productos**, Status y SIPA. Sus consumidores viven en:

| Repo | Ruta |
|---|---|
| `status-frontend` | `/datos/proyectos/status-full/status-frontend` |
| **`sipa`** | `/datos/proyectos/sipa` |
| monolito `status` | `/datos/proyectos/status` (revisar `resources/js`) |

```bash
for r in /datos/proyectos/status-full/status-frontend /datos/proyectos/sipa /datos/proyectos/status; do
  echo "== $r"; grep -rn "Roles/select" "$r/src" "$r/resources/js" 2>/dev/null | head
done
```

**Por que:** el 2026-09-21 se migraron Roles y Usuarios buscando consumidores solo en
`status-frontend`. El front de SIPA tambien los consumia y **quedo roto**: `Roles/select`,
`Roles/indexAll`, `Usuarios/show` y `Usuarios/updatePassword` se usan en
`sipa/src/views/configuracion/`, leyendo `response.data.ArrayRoles` y
`response.data.ArrayUsuRoles`. Se detecto tarde, cuando ya estaba commiteado y subido.

**Al encontrar un consumidor en otro repo, parar y decirlo**, no seguir migrando: el otro repo
tiene su propia rama y su propio MR, y eso cambia el alcance del ticket. Si se decide dejarlo
roto por ahora, **no empeorarlo**: un endpoint que solo usa el otro repo —como
`Menu/showMenuExterior`, que es el login de SIPA— se deja con su contrato viejo y con una prueba
que lo fije, en vez de migrarlo y dejar a ese producto sin acceso.

## 2. Por fragmento de ruta, nunca por la URL completa

```bash
grep -rn "formularios/show" src --include=*.vue    # bien
grep -rn '"/formularios/show"' src                 # mal: se pierde lo que concatena
```

La mayoria de las llamadas arman la URL concatenando —`.get("/formularios/show?id=" + id)`—, asi
que buscar la URL entera entre comillas las deja fuera. El 2026-09-18, en `MtFormularios`, eso
hizo que el plan dijera **8 vistas** cuando eran **33**, y 25 pantallas quedaron rotas.

**Cuidado con el prefijo:** `Usuarios/update` tambien encuentra `Usuarios/updatePassword`. Hay que
mirar la linea, no solo contar archivos.

## Como aplicarlo

1. Buscar por fragmento en los tres repos y **contar archivos unicos** antes de estimar.
2. Revisar si la vista arma la ruta con una variable —`"/"+this.ruta+"/store"`—: eso es un
   componente que sirve a varios maestros.
3. Anotar **que clave lee cada consumidor** (`ArrayRoles`, `datos`, `ListaEmpresas`): esa es la
   que hay que cambiar, y es donde aparecen las roturas silenciosas.
4. Al terminar, repetir la busqueda para confirmar que no queda ningun resto.

**Cuidado con el reemplazo masivo:** cambiar `response.data.datos` por `response.data` con un
`replace` global alcanza llamadas de otros endpoints que viven en el mismo archivo. Paso en 6
archivos el 2026-09-18.

Ver [[servicios-front-espejan-al-back]].
