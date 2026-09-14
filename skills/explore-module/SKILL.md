---
name: explore-module
description: >-
  Usar cuando haga falta entender un modulo completo antes de tocarlo: un ticket que cae en un modulo
  que nunca se trabajo, un modulo cuyo mapa esta importado sin verificar, o cuando se pide
  explicitamente "explora el modulo X". Coordina el mapeo: consulta la memoria, lanza el subagente
  `module-explorer` si de verdad hace falta, y consolida el indice. No documenta reglas de negocio
  —eso es `update-tech-docs`— ni actualiza el manual. Sirve para cualquier proyecto con carpeta de
  exploracion. Dispara con "explora el modulo", "mapea el modulo", "entiende como funciona X".
---

# Explorar un modulo

Deja escrito el plano tecnico de un modulo para que el siguiente ticket que caiga ahi no vuelva a
leer el mismo codigo. La memoria y su plantilla las define `exploration-memory`; **aqui se decide
cuando vale la pena mapear y quien lo hace**.

## 0. Antes que nada: probablemente no hay que explorar

Explorar un modulo entero cuesta. Antes de lanzar nada:

1. **Mira el indice** del proyecto: `brain/projects/<proy>/exploration/index.md`.
2. **Decide con el estado en la mano:**

| Estado en el indice | Que hacer |
|---|---|
| `explorado` y el usuario no dijo que cambio | **No explores.** Dilo y usa lo que hay |
| `explorado` pero el usuario dice que el modulo cambio | Explora **solo lo que cambio** |
| `importado, sin verificar` | Explora para **contrastar**: el archivo es el punto de partida, no la verdad |
| `parcial` | Retoma por lo que dice su seccion "Pendiente" |
| No esta | Explora, **si el ticket lo justifica** (ver abajo) |

3. **Un ticket puntual no justifica mapear un modulo entero.** Si el ticket toca un campo de un
   formulario, se hace el ticket y al cerrar se guarda lo aprendido. Mapear completo vale cuando
   el ticket va a recorrer el modulo, cuando es un modulo nuevo para ti, o cuando el usuario lo
   pide. **Ante la duda, preguntar** en vez de gastar una exploracion.

## 1. Encuadrar

Con el usuario, dejar fijo antes de lanzar nada:

- **Proyecto** y **modulo**, con su ruta tal como se ve en el menu.
- El **`<slug>`** en ingles kebab-case, del modulo del backend mas el submodulo:
  `settings-reports`, `operation-dispatches`.
- Si hay que **contrastar** un archivo existente o mapear de cero.

## 2. Lanzar el subagente

`module-explorer`, en Sonnet, **solo lectura**. Se le pasa proyecto, modulo, slug y si contrasta o
mapea de cero. Se espera su resultado.

Corre en Sonnet porque rastrear archivos tiene procedimiento fijo y exito comprobable, y porque
asi las cientos de lineas de codigo no entran a esta sesion. **Lo que ahorra no es el modelo: es
que la salida no vuelva.**

**Un subagente no puede lanzar otro subagente**, asi que si hicieran falta dos pasadas —front y
back por separado en un modulo grande— se lanzan desde aqui, en orden.

## 3. Consolidar

1. Confirmar que el archivo del modulo quedo escrito y que su linea esta en `index.md`.
2. **Subir el estado a `explorado`** solo si de verdad se contrasto contra el codigo. Si quedaron
   huecos, va `parcial` y se escriben en su seccion "Pendiente".
3. **Reportar al usuario en pocas lineas**: que se mapeo, que quedo pendiente y cualquier hallazgo
   que merezca decision propia —un endpoint sin permiso, una tabla sin indice, dos rutas que hacen
   lo mismo—. Eso no se entierra en el archivo.

## Lo que esta skill NO hace

- **No documenta reglas de negocio.** El *porque* va al `docs/` del repo con `update-tech-docs`.
  Si al mapear aparece una regla que no esta documentada, se dice y se ofrece; no se escribe aqui.
- **No actualiza el manual de usuario.** Eso es `update-manual`.
- **No escribe datos ni toca el codigo.** El explorador es de solo lectura, y esa restriccion no
  se levanta desde aqui.
- **No commitea nada** en un repo de trabajo.

## Como se encadena

`start-development` recoge el enunciado del ticket. Si el modulo que toca **no esta en el indice**
o esta `importado, sin verificar`, se propone esta skill antes de escribir codigo — se propone,
no se arranca sola. Al cerrar, `finish-development` es buen momento para guardar lo aprendido,
aunque no se haya hecho una exploracion formal.

## Agregar un proyecto

Solo hace falta que exista `brain/projects/<proy>/exploration/modules/` y su `index.md`. El resto
sale del `stack.json` del proyecto. **Ni la skill ni el agente se tocan.**
