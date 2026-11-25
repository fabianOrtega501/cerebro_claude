# Reglas del equipo para la revisión de pares

Reglas que han salido de revisiones reales de merge requests y que el equipo ya exige. Cada una dice a
qué aplicativos aplica. **Si el `CLAUDE.md` del repo dice otra cosa, manda el `CLAUDE.md`**, y se le
avisa al revisor de la diferencia.

Al citarlas en un informe, el respaldo es «reglas del equipo para la revisión de pares». El número de
una regla no cambia una vez publicada: las nuevas se agregan al final de su sección con el número
siguiente libre.

## Para todos los proyectos

### Código

1. **Sin comentarios dentro del código.** Solo se admiten los docblocks que documentan funciones,
   métodos y clases; toda clase nueva lleva el suyo, y las constantes y las propiedades no llevan docblock. Tampoco en CSS (ni en el `<style>` de un `.vue` ni en el de una plantilla de PDF) ni
   encima de cada interfaz de TypeScript. Si algo necesita explicación, va en el docblock. Que un archivo
   vecino tenga comentarios no es permiso: es deuda heredada. Excepción: los comentarios de Blade
   (`{{-- --}}`) en plantillas, donde son convención.
2. **La descripción de un docblock tiene máximo 2 líneas; lo recomendado es 1,5** (sin contar `@param`
   ni `@return`): el qué; el porqué largo no va ahí. Hasta 2 líneas se acepta; más de 2 debe
   corregirse.
3. **Una función recibe como máximo 3 parámetros**, también las privadas y los ayudantes de las pruebas.
   Lo que viaja junto va en un objeto de opciones con valores por defecto (o en un DTO, si el proyecto
   los usa). Un dato que se deduce de otro parámetro no se pasa aparte. Los parámetros que no se usan se
   eliminan. Una constante o un método es `public` solo si se usa fuera de su clase; si no, `private`.
   Lo comprueba `lib/max-params.mjs` en cada revisión.
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
20. **Un cambio en un componente compartido es aditivo**: una prop u opción nueva es opcional y por
    defecto conserva el comportamiento de antes; solo la pantalla del ticket la activa. Tampoco se meten
    banderas de un caso de negocio en el componente estándar: se usa el propio del módulo.
21. **Las reglas de estado de la historia de usuario también se validan en el back**, no solo en la
    pantalla (por ejemplo, «solo se edita si está Solicitada»).
22. **Los ids que llegan como filtro se validan como enteros**, para que un texto responda 422 y no 500.
23. **Las condiciones evidentes se simplifican**: `String(value ?? '')` en vez de tres comparaciones
    contra `null`, `undefined` y `''`.
24. **Máximo 3 `if` por función.** Cuentan los `if`, los `else if` y las salidas tempranas, no los de las
    funciones anónimas internas, y se compara contra la versión de la base. Se resuelve partiendo la
    función por responsabilidad y dejando la principal como orquestadora.
25. **Las dependencias se reciben por el constructor**, igual que el resto de la clase, no se piden al
    contenedor a mitad del código (`app(...)` en Laravel).
26. **Sin docblock en constantes, propiedades, interfaces ni computados.** El docblock va sobre funciones,
    métodos y clases; lo que un nombre no explica va al manual técnico.
27. **Traducciones (i18n) sin valores repetidos y sin prefijo de módulo**: una clave nueva no repite un
    texto que ya existe y su nombre es genérico, salvo que el texto nombre el módulo. Van en todos los
    idiomas del proyecto.
28. **El botón de una acción principal se inhabilita desde el toque hasta que termina la petición.** Si
    antes de la primera espera hay otra (ubicación, confirmación), la bandera de «guardando» se pone antes
    de esa espera, para que un doble toque no duplique el registro.
29. **Una migración que clasifica registros existentes usa `CASE` con `ELSE`**: un registro sin clasificar
    queda fuera de los conteos y de los envíos que filtran por tipo.
30. **Sin `any` en código nuevo de TypeScript**: `catch (error)` sin tipo e interfaces para las respuestas
    del servidor.
31. **Un cambio global que el responsable aprobó se explica en la descripción del MR**, para que el
    revisor no lo tome por un descuido.
32. **El código sigue el idioma del proyecto.** Los nombres nuevos (variables, funciones, clases, rutas,
    columnas) van en el idioma que declara el `CLAUDE.md` o, si no lo declara, en el del código más
    reciente del módulo; los docblocks, comentarios y mensajes para el usuario van en español. Cómo se
    decide: [`references/code-language.md`](../../../references/code-language.md). Hoy: AIO
    (`aio-app`, `aio-backend`) y `app-movil` en inglés; STATUS todo en español.

### Cómo se clasifica

9. **Un cambio de alcance global fuera del caso** (algo que cambia lo que ven todas las pantallas o
   todos los módulos), aunque sea correcto, es **Impide aprobar**: se pide en un cambio aparte.
10. **Un arreglo que ninguna prueba protege** (corrige algo que las pruebas no detectaban) es **Debe
    corregirse**: se pide la prueba que lo cubra.
11. **Los errores de lint que ya existían en el archivo no se le cargan al compañero.** Se comparan con la
    versión de la rama base y se reporta solo lo nuevo (y se reconoce si los bajó).
12. **Cada cita del `CLAUDE.md` u otra fuente se verifica antes de escribirla.** Si la fuente no lo dice,
    el comentario es una sugerencia, no una exigencia.
33. **No se le cobra al compañero el código de otro ticket que viaja en su rama** (porque mezcló otra
    rama): se comenta en el MR de ese ticket. Se ve con `git log` o con la lista de archivos del MR.
34. **Una prueba de la propia rama que falla es Impide aprobar.** Una que ya fallaba en la base se dice y
    no se le cobra.

## AIO (`aio-app`, `aio-backend`)

13. **Listados y eventos con muchos registros arman la respuesta campo por campo**, con las relaciones
    justas. Algunos modelos traen atributos calculados que consultan la base por cada fila (`Vehicle`
    tiene 24; `User`, `BusinessUnit`, `Company` y `TypeVehicle` también traen los suyos): serializar el
    modelo completo en un listado multiplica las consultas. Ojo al recortar: quitar un atributo puede
    quitar una relación que el front usaba sin dar error.
14. **Los listados de usuarios no envían datos personales que la pantalla no usa** (cédula, correo,
    dirección, género, geometría): se seleccionan columnas explícitas.
35. **`aio-backend` usa el modelo, no `DB::table(...)`**, tampoco en reglas de validación ni subconsultas.
    Si la tabla no tiene modelo, se crea (sin `$appends`). Al señalarlo, se revisan todos los `DB::table`
    de la rama.
36. **Sin `$casts` que repitan el tipo de la columna**: PostgreSQL ya devuelve el tipo.
37. **Sin lógica de negocio en el modelo** (`booted()` con eventos, funciones estáticas que calculan):
    va en el `Custom…Service` y la llama el controlador.
38. **El repositorio y el servicio estándar generados no se tocan.** Un filtro especial va en el servicio
    propio, que llama a `listAll($request, $filters)` del estándar con los filtros que reemplazan a los de
    la petición.
39. **Los request usan lo que ya tiene `CommonFormRequest`** (propiedades, ayudantes, `mergeRules`,
    `ForeignKeyExists` para las foráneas) y cada regla de cada campo lleva su mensaje en `messages()`,
    también las que agrega un ayudante. Lo comprueba `aio:check-form-requests` si está instalado.
40. **Las pruebas no llevan docblock de clase**: solo los de sus funciones.
41. **Un endpoint para el celular que recibe `company_id` valida que la empresa sea del usuario**, o
    expone datos de otra empresa.
42. **Una URL que se muestra al público se valida con `url:http,https`** (**Impide aprobar**): sin eso se
    acepta `javascript:`.

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
43. **Lo que corre en segundo plano usa `LocalDatabaseService`** (envíos automáticos, registros de
    errores): con `DatabaseService` puede coincidir con un guardado y dar `Database closed`. Tampoco se
    arregla con una bandera global que cambie `DatabaseService` para todos los módulos.
44. **Lo que debe sobrevivir al cierre de sesión no va en `localStorage`** (el logout lo borra): va en
    `Preferences` o en SQLite.
45. **Las escrituras locales que van juntas se hacen en una transacción** (`runTransaction`), con un
    candado si dos caminos pueden correr a la vez.
46. **Un 4xx del AIO no se reintenta sin fin**: los registros rechazados se marcan con su motivo y la
    respuesta 422 tiene su prueba.
47. **Un borrador se limpia también al salir sin guardar** (botón atrás o menú), con sus fotos; si se
    guarda al abrir, debe tener una salida para el operario.
48. **Un servicio nuevo con SQL extiende `BaseService`** y guarda en lote con `storeMulti`.
49. **Los archivos nuevos se sangran con tabuladores**, como sus vecinos.
