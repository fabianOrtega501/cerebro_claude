# vue-componentes — Componer y comunicar componentes Vue (props, eventos, slots)

> Material vivo. Se **dicta desde aqui** y se corrige en cada ticket que toque el tema. Los
> bloques 1 a 4 se mejoran; el 5 acumula apariciones. No se reescribe de cero.

**Nivel actual**: pendiente

## 1. Que problema resuelve

Una vista de 1200 lineas que hace todo (popup, tabla, cascada de selects, validacion) no se
puede reutilizar ni probar, y el mismo cascadeo empresa -> formulario -> periodo se reescribe en
cada pantalla con pequenas diferencias que despues son bugs. Un componente encapsula **una
responsabilidad** y expone un contrato pequeno: props hacia adentro, eventos hacia afuera. El
padre decide; el hijo pinta y avisa.

## 2. Como funciona

- **Props abajo, eventos arriba.** El hijo nunca modifica una prop; emite un evento con el dato
  nuevo y el padre decide que hacer. Un solo evento con el objeto completo (`cambio`) es mas
  facil de consumir que seis eventos sueltos.
- **Estado local vs estado del padre.** Lo que solo importa dentro del hijo (que select esta
  abierto, la lista de opciones cargada) es local. Lo que el padre necesita para guardar (la
  seleccion) sube por evento y vive en el padre.
- **`key` para reiniciar.** Cambiar la `key` destruye y vuelve a montar el componente: es la
  forma limpia de "limpiar el formulario" o de aplicar una `seleccionInicial` nueva, en lugar de
  meter un metodo `reset` que hay que mantener.
- **Modales anidados**: en Vuesax no se anidan en el DOM; son `vs-popup` **hermanos**, cada uno
  con su bandera booleana `:active.sync`. El "anidamiento" es logico: el segundo se abre desde
  un boton del primero y al cerrarse devuelve el dato al estado del padre.
- **Tabla interna con edicion**: la tabla pinta un arreglo del estado del padre; agregar es
  `push`, editar es `splice` por indice, eliminar es `splice`. La tabla no guarda nada en el
  servidor por si sola; el arreglo viaja completo al guardar. `max-items` bajo y `pagination`
  para que el modal no crezca.
- **Errores del servidor por posicion**: Laravel devuelve `formularios.2.periodo`; el padre los
  reparte al indice 2 de su arreglo para pintarlos en la fila correcta.

## 3. Como se ve en este repo

| Proyecto | Ejemplo | Nota |
|---|---|---|
| status | `resources/js/src/views/GestorInformacion/Estandar/SelectorEmpresaFormulario.vue:130-157` | Props `errores`, `empresaFija`, `seleccionInicial`; el comentario de :150-152 explica por que `seleccionInicial` debe ser una instantanea |
| status | `SelectorEmpresaFormulario.vue:344-355` | `fnEmitir`: un solo evento `cambio` con el objeto completo (idempresa, idformulario, idforanea, periodicidad, periodo, nombres) |
| status | `GestionTramites/Crear.vue:18` y `:324` | Dos `vs-popup` hermanos: el tramite y el de formatos afectados. Patron de modal "anidado" |
| status | `Crear.vue:362-369` | El mismo selector reutilizado con `empresa-fija` y `seleccion-inicial`, y `:key="claveFrecuenciaFormato"` para remontarlo |
| status | `Crear.vue:923-930` y `:939` | Tabla interna: push/splice por indice, sin llamar al servidor |
| status | `Crear.vue:767-790` | `fnRepartirErroresDelBackend`: mapea `tramites_afectados.N` al input N |
| status | `Maestros/SitiosDisposicionFinal/Main.vue:204` | Tabla paginada dentro de un popup: `max-items="3" pagination`, sin `search` |
| status | `Estandar/Frecuencia.vue:127-151` y `:236-239` | Componente hijo del selector: prop `frecuencia` requerida, evento `fechaInfo` con el periodo ya formateado |
| status | `GestionTramites/main.vue:192-196` | `Crear` reutilizado en modo edicion via prop `ObjectoEditar` |

## 4. Errores tipicos

- Mutar una prop desde el hijo: funciona a veces y Vue avisa en consola; al remontar se pierde.
- Pasar como `seleccionInicial` el mismo objeto que se actualiza con el evento: el componente lo
  aplica una vez y despues los dos estados pelean.
- Olvidar cambiar la `key` al reabrir el modal de captura: aparece el formulario anterior.
- Anidar un `vs-popup` dentro de otro en el DOM: z-index y scroll rotos. Van hermanos.
- Tabla interna sin `max-items`: el boton Guardar queda fuera de pantalla.
- Guardar cada fila de la tabla interna contra el servidor al agregarla: queda un tramite a
  medias si el usuario cierra; el arreglo viaja completo al guardar.
- Cambiar un dato del encabezado que invalida las filas (la empresa) sin avisar: filas de otra
  empresa se cuelan al guardar.

## 5. Apariciones

| Ticket | Proyecto | Como aparecio | Pista mas alta |
|---|---|---|---|
| 10841 | status | Seccion "Formularios del tramite" con tabla interna paginada, tercer popup de captura reutilizando `SelectorEmpresaFormulario` con empresa fija y sus propios formatos afectados; confirmacion al cambiar empresa | (pendiente) |

## Preguntas de cierre

1. El formulario capturado en la ventana de agregar, con sus formatos afectados: ¿donde vive ese
   estado mientras el usuario no ha pulsado Guardar, y que viaja al servidor al final?
2. Hoy hay dos popups hermanos (tramite y formatos). Con un nivel mas (tramite -> formulario ->
   formatos): ¿cuantos popups y cuantas banderas, y quien es dueno del arreglo de formatos de
   cada formulario?
3. El usuario cambia la empresa con tres formularios ya en la tabla y dice "cancelar" en la
   confirmacion: ¿que valor debe quedar en el select de empresa y como lo logras sin mutar la
   prop del selector?
