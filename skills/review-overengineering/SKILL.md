---
name: review-overengineering
description: >-
  Usar para revisar un diff buscando SOBREINGENIERIA —lo que sobra, no lo que esta mal—: codigo que
  reimplementa algo que ya existe en el repo o en el framework, dependencias innecesarias,
  abstracciones con una sola implementacion, flexibilidad que nadie usa. Sirve en cualquier
  proyecto, antes de `finish-development` o al revisar un MR. Solo senala, no corrige. Complementa a
  `/code-review`, que busca fallas. Dispara con "revisa si sobra codigo", "esta sobreingenierizado?",
  "que se puede borrar", "revision de sobreingenieria".
---

# Revision de sobreingenieria

Busca en el diff lo que se puede quitar. El mejor resultado es un diff mas corto. No busca fallas,
seguridad ni rendimiento: eso es `/code-review`.

## Alcance

Por omision, el diff de la rama contra su base, mas lo que no se ha commiteado. Si el usuario nombra
otra cosa (un archivo, lo que esta en `staged`, un MR), se revisa eso.

## Procedimiento

1. Leer el diff completo y, por cada pieza nueva, el codigo que la rodea. Sin entender el flujo no
   se marca nada.
2. Pasar cada funcion, clase, dependencia o componente nuevo por la escalera de `CLAUDE.md`
   ("Antes de escribir codigo"). Para el escalon 2, buscar el concepto en el repo con `grep` y
   revisar las memorias de estandar del proyecto (en AIO, `buscar-antes-de-crear`).
3. Antes de marcar algo con `borrar`, buscar el simbolo en todo el repo, incluidas las pruebas y
   las referencias por string.

## Etiquetas

- `borrar`: codigo muerto, flexibilidad sin uso, funcionalidad especulativa. No lo reemplaza nada.
- `reusar`: ya existe en el repo. Se da la ruta.
- `framework`: lo hace el lenguaje o el framework. Se da el nombre de la funcion.
- `nativo`: lo hace la plataforma (la base, el navegador). Se dice cual caracteristica.
- `yagni`: abstraccion con una sola implementacion, configuracion que nadie cambia, capa con un solo
  llamador.
- `encoger`: la misma logica en menos lineas. Se muestra la forma corta.

## Formato

Una linea por hallazgo, numerada, para que se pueda pedir "corrige el 2 y el 5":

`N. archivo:Llinea: etiqueta — que sobra. Que lo reemplaza.`

`1. app/Models/OperationCost.php:L40-58: reusar — companyToday() con cache propio. CustomCompanyService::getActuallyDateByCountryCompany.`

Cierre: `neto: -N lineas posibles.` Si no hay hallazgos: `Nada que quitar.`

## Reglas

- Solo senala, no edita. Las correcciones se aplican si el usuario las pide; en modo practica las
  hace el.
- Nunca marca para borrar la validacion del request, el manejo de errores que evita perder datos,
  los permisos, lo que pide la HU ni la prueba que cubre la logica nueva.
- Lo que sigue el estandar del repo no es sobreingenieria, aunque ocupe mas lineas.
- Corre en la sesion principal: decidir que sobra es juicio, no una tarea mecanica.
