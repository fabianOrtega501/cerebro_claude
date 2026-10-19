# Reglas del equipo para la revisión de pares

Reglas que han salido de revisiones reales de merge requests y que el equipo ya exige. Cada una dice a
qué aplicativos aplica. **Si el `CLAUDE.md` del repo dice otra cosa, manda el `CLAUDE.md`**, y se le
avisa al revisor de la diferencia.

Al citarlas en un informe, el respaldo es «reglas del equipo para la revisión de pares».

## Para todos los proyectos

### Código

1. **Sin comentarios dentro del código.** Solo se admiten los docblocks que documentan funciones,
   métodos y clases. Tampoco en CSS (ni en el `<style>` de un `.vue` ni en el de una plantilla de PDF) ni
   encima de cada interfaz de TypeScript. Si algo necesita explicación, va en el docblock. Que un archivo
   vecino tenga comentarios no es permiso: es deuda heredada. Excepción: los comentarios de Blade
   (`{{-- --}}`) en plantillas, donde son convención.
2. **La descripción de un docblock tiene máximo 1,5 líneas** (sin contar `@param` ni `@return`): una
   línea con el qué; el porqué largo no va ahí.
3. **Una función recibe como máximo 3 parámetros.** Lo demás va en un objeto de opciones con valores por
   defecto. Los parámetros que no se usan se eliminan.
4. **Un componente genérico solo hace lo suyo.** Nada de props, banderas ni eventos de un caso de negocio
   concreto: lo variable se inyecta (por ejemplo, una lista de acciones con su función), para que agregar
   un caso no obligue a modificar el componente.
5. **El código de una funcionalidad se ubica de forma modular**, en la carpeta de su módulo. Lo que
   comparten varios módulos va en la carpeta común del proyecto, agrupado por funcionalidad, no suelto.
6. **Las funciones utilitarias no van en los servicios.** El servicio solo hace consultas. Una función que
   valida o transforma un dato va en el archivo de utilidades del proyecto (`useFunction` o los
   composables), es genérica y no hace consultas: quien la usa consulta el servicio y le pasa el valor.
7. **No se toca un artefacto global para un caso puntual** (el interceptor de peticiones, un servicio
   base, un componente compartido). Si un caso necesita otro comportamiento, se resuelve en ese caso.
8. **No se commitean archivos generados que el proyecto regenera**, como `storage/api-docs/api-docs.json`
   (Swagger). La documentación de un endpoint va en las anotaciones del controlador.

### Cómo se clasifica

9. **Un cambio de alcance global fuera del caso** (algo que cambia lo que ven todas las pantallas o
   todos los módulos), aunque sea correcto, es **Impide aprobar**: se pide en un cambio aparte.
10. **Un arreglo que ninguna prueba protege** (corrige algo que las pruebas no detectaban) es **Debe
    corregirse**: se pide la prueba que lo cubra.
11. **Los errores de lint que ya existían en el archivo no se le cargan al compañero.** Se comparan con la
    versión de la rama base y se reporta solo lo nuevo (y se reconoce si los bajó).
12. **Cada cita del `CLAUDE.md` u otra fuente se verifica antes de escribirla.** Si la fuente no lo dice,
    el comentario es una sugerencia, no una exigencia.

## AIO (`aio-app`, `aio-backend`)

13. **Listados y eventos con muchos registros arman la respuesta campo por campo**, con las relaciones
    justas. Algunos modelos traen atributos calculados que consultan la base por cada fila (`Vehicle`
    tiene 24; `User`, `BusinessUnit`, `Company` y `TypeVehicle` también traen los suyos): serializar el
    modelo completo en un listado multiplica las consultas. Ojo al recortar: quitar un atributo puede
    quitar una relación que el front usaba sin dar error.
14. **Los listados de usuarios no envían datos personales que la pantalla no usa** (cédula, correo,
    dirección, género, geometría): se seleccionan columnas explícitas.

## STATUS (`status-api`, `status-frontend`)

15. **No se crean controladores ni servicios dedicados a leer un parámetro puntual.** Se usan los
    servicios estándar: el listado `obtener-datos` con su filtro por llave, o uno genérico por llave. Si la
    validación es de presentación (por ejemplo, que una URL sea http), va en el front.
16. **Nombres de servicios del front:** carpeta en singular y archivo en plural (`Pais/PaisesService.js`),
    salvo que el revisor del módulo haya pedido otra cosa.
17. **El aviso global de errores del front no se apaga para un caso.** Toda petición fallida muestra el
    aviso global, salvo el 401, que manda al login.
18. **En `status-frontend` no se usa `??`**: su ESLint no lo entiende y se cae; se usa `||`. `?.` sí
    funciona. Una función flecha cuyo cuerpo es un ternario lleva cuerpo de bloque (`no-confusing-arrow`).

## App móvil (`app-movil`)

19. **Lo que comparten varios módulos va en `src/composables/Modules/common/<funcionalidad>/`**, no
    suelto en `src/composables/`.
