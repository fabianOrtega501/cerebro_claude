# Operaciones → Maestros → Elementos

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

Estado: **explorado (parcial, enfocado en validación de feature)** — actualizado: 2026-08-14

Ruta front: `http://localhost:5173/operations/item` (tab "Elementos" del grupo
`Operaciones → Maestros`, junto a Tipo de materiales / Tipo de elementos / Tipo de ubicación /
Tipo de estados). Página: `src/pages/operations/item/index.vue` (`subject: '/operations/item'`).

Esta pasada fue una **validación dirigida** de la rama `feature/sergio-10571` (3er tab
"Inspecciones" en modo Ver del wizard de Elementos + 2 columnas nuevas en la tabla compartida de
inspecciones). No se re-exploró el resto del módulo (búsqueda, exportar, eliminar) porque ya se
sabía funcional; el foco fue el wizard y su nueva pestaña.

## Permisos
- Subject `/operations/item`, abilities `read/create/update/delete` — exigido en
  `aio-backend/routes/api/v0/Modules/Operation/items.php` vía middleware
  `permission:/operations/item,<ability>` en cada ruta.
- La tabla de Inspecciones embebida (`ProcessInspectionsTable.vue`) se instancia con
  `subject="/operations/supervision/process-inspections"` (prop de UI para sus propios botones
  Exportar/Buscar/Ver/PDF), pero el **permiso real de backend** que protege sus endpoints es
  `/operations/inspections` (middleware en `supervisory_inspections.php`), NO el subject pasado
  por prop — el subject de la tabla es solo para resolver abilities del front (CASL), el backend
  no lo consulta.

## Rutas / endpoints relevantes
Items (`aio-backend/routes/api/v0/Modules/Operation/items.php`):
- `GET /items/v0/get-all` → `ItemController@index` (listar, permiso READ).
- `POST /items/v0/store-custom` → `CustomItemController@store` (Agregar).
- `GET /items/v0/show/{id}` → `ItemController@show` (Ver — dispara el wizard en modo `show`).
- `POST /items/v0/update-custom/{id}` → `CustomItemController@update` (Editar).
- `DELETE /items/v0/delete/{id}` → `ItemController@destroy`.

Inspecciones (tab nuevo, `aio-backend/routes/api/v0/Modules/Operation/supervisory_inspections.php`):
- `GET /supervisory-inspections/v0/custom-get-all?filters={"item_id":<id>,"company_id":9,...}`
  → `CustomSupervisoryInspectionController@customGetAll` → query builder en
  `CustomSupervisoryInspectionService::customGetAll()` (joins `process_inspections`/`inspections`
  para derivar `inspection_type`; el filtro `item_id` se resuelve vía `getFilters($data)` genérico
  contra la columna `si.item_id`). Disparado automáticamente al entrar al tab "Inspecciones" del
  wizard en modo Ver, con `fixedFilters={item_id: idItem}` mezclado con los filtros normales del
  usuario dentro de `DataTable.vue::handlePaginationChange`.
- `GET /supervisory-inspections/v0/show/{id}` → botón "Ver Inspección" (detalle, mismo endpoint
  que usa el módulo completo de Supervisión).
- `GET /supervisory-inspections/v0/get-pdf/{id}` → botón "PDF" →
  `CustomSupervisoryInspectionController@getPdf`; sirve el archivo ya generado en
  `http://localhost:8085/storage/pdfs/SupervisoryInspection/{id}.pdf` (confirmado: abre en pestaña
  nueva).

## Frontend — artefactos técnicos de la feature
- `src/views/pages/operations/items/wizards/ItemWizard.vue`:
  - `numberedSteps` pasó de array fijo a `computed()`; agrega un 3er paso
    (`{title: t('inspections'), subtitle: t('inspections')}`) solo si `props.action === 'show'`.
  - `goToNextStep`/`goToPreviousStep` ahora usan `numberedSteps.value.length` (antes `.length` de
    array plano).
  - Nuevo `<VWindowItem v-if="action === 'show'">` con `<ProcessInspectionsTable
    subject="/operations/supervision/process-inspections" :fixed-filters="{ item_id: idItem }"
    :exclude-columns="['service_name','route_name','code_vehicle','inspection_type']" />` + botón
    "Anterior" propio (color `warning`, `variant="tonal"`, icono `tabler-arrow-left`) que llama
    `goToPreviousStep`.
  - En el `<ItemAttachmentsInfo>` (paso 2) se agregó el listener `@next-step="goToNextStep"`
    (el emit `nextStep` YA existía en el componente hijo, solo estaba sin conectar al padre).
- `src/views/pages/operations/items/forms/ItemAttachmentsForm.vue`:
  - Botón submit existente (línea ~249, `v-if="props.action !== 'show' || !isLastStep"`) sin
    cambios — en modo Ver este botón NO se renderiza (`action==='show'` y `isLastStep` siempre
    `true` en este wizard → condición da `false`).
  - Botón NUEVO (línea ~266, `v-if="props.action === 'show'"`) `@click="handleNext"` → emite
    `nextStep`; texto `$t('next')`="Siguiente", icono `tabler-arrow-right`, color `primary`. Solo
    visible en modo Ver, confirmado por código y en vivo (no aparece en Agregar/Editar).
- `src/views/pages/operations/supervision/process-inspections/ProcessInspectionsTable.vue`:
  - Props nuevas `fixedFilters` (`Record<string, any>`, default `{}`) y `excludeColumns`
    (`string[]`, default `[]`), vía `withDefaults`.
  - `headersTable` ahora se filtra: `jsonData.headers.filter(h => !props.excludeColumns.includes(h.key))`.
  - `<DataTable :fixed-filters="props.fixedFilters" ... />` — estos se mezclan con los filtros de
    usuario en `DataTable.vue::handlePaginationChange` (`{...filters.value, ...props.fixedFilters}`).
- `src/models/operations/supervisory-inspections/SupervisoryInspectionModel.json`: 2 headers
  nuevos al final — `{"title":"updatedBy","key":"updater_name"}` y
  `{"title":"updatedAt","key":"updated_at"}`. Estas claves ya existían en el payload de
  `show`/`custom-get-all` (`updater_name`, `updated_at`) — el cambio es solo de presentación
  (agregar columnas), no de query/modelo backend.

## Validación en vivo (evidencia)
- Elemento de prueba usado (ya existente, NO creado ni borrado): `item_id=75665`, código
  `AP00001`, elegido porque tiene 399 inspecciones en BD
  (`operation.supervisory_inspections.item_id=75665`) — confirmado por SQL directo, no por UI
  (paginación de 1168 páginas inviable por click).
- **Modo Ver**: diálogo "Ver Elemento" muestra 3 tabs: "Elementos" / "Formulario Adjuntos" /
  "Inspecciones". Campos del paso 1 en solo lectura (checkbox `disabled`, date pickers
  `disabled`). Navegación confirmada: Elementos → Siguiente → Adjuntos → Siguiente (NUEVO,
  visible SOLO aquí) → Inspecciones → Anterior (NUEVO, mismas clases CSS que el de Adjuntos:
  `text-warning` + `v-btn--variant-tonal`) → vuelve a Adjuntos.
- **Tab Inspecciones**: tabla mostró 10 filas (paginación hasta pág. 40 ≈ 399 registros),
  columnas: Acciones / Id / Fecha Ejecución / Elementos / Estado / Registró / Fecha Registro /
  **Actualizado por** / **Fecha Actualización** — confirmado que NO aparecen Servicio/Ruta/Vehículo/
  Tipo de inspección. Red: `GET /api/supervisory-inspections/v0/custom-get-all?current_page=1&filters=
  {"item_id":75665,"company_id":9}` → 200 OK.
- **Ver Inspección** (detalle, id 34820): `GET /api/supervisory-inspections/v0/show/34820` → 200,
  payload confirma `updater_name`/`updated_at` reales ("Meryi Herrera" / 2026-07-08). Los combos
  (Estado, Tipo de inspección, Centro Operativo, Servicio, Ruta) aparecen vacíos en el detalle
  porque la fila real tiene `service_id/route_id/vehicle_id/status = null` (es una inspección de
  tipo "elemento", no de vehículo) — **dato real, no bug**.
- **PDF**: click abrió nueva pestaña `http://localhost:8085/storage/pdfs/SupervisoryInspection/
  34820.pdf` — funcional.
- **No regresión Agregar**: diálogo "Agregar Elementos" solo con 2 tabs (headers `h5`: "1","2").
- **No regresión Editar**: diálogo "Editar Elemento" (abierto sobre item 75667, sin guardar
  cambios) solo con 2 tabs. Confirma código: el botón nuevo y el 3er `VWindowItem` están
  gateados por `action === 'show'`.
- No se creó/editó/eliminó ningún registro real (tarea de validación, no de exploración con
  ciclo crear→eliminar); no quedó ningún residuo en BD.

## Ronda 2 de validación (2026-08-14) — ajustes P5/P6/P7/Opción C sobre la misma feature
Tras HMR de Vite con nuevos cambios en `feature/sergio-10571`. Diff adicional revisado:
`Item.vue` (`:dialog-max-width`), `ItemWizard.vue` (stepper responsive + `mobileNextStep`),
`ItemAttachmentsForm.vue` (sin cambios en esta ronda), `MapForm.vue`/`ProcessInspectionWizard.vue`/
`ProcessInspectionsTable.vue` (prop `canApprove`, default `true`).

- **P5 — ocultar Aprobar/Rechazar en el tab embebido**: `MapForm.vue` ahora recibe
  `:can-approve="false"` desde `ItemWizard.vue` → `ProcessInspectionsTable` → `ProcessInspectionWizard`
  → `MapForm`; el botón "Aprobar" usa `v-if="props.canApprove && $can(...) && ..."`. **Confirmado por
  contraste directo**: la MISMA inspección (id 34820, "Pendiente") NO muestra "Aprobar" en el tab de
  Elementos (`hasApprove=false` verificado por DOM) pero SÍ lo muestra en
  `Operaciones → Supervisión → Inspecciones` (`hasApprove=true`, botón visible en captura) — confirma
  que el fix no rompió el módulo completo (default `canApprove=true` se mantiene ahí).
- **P7 — ancho de modal**: `Item.vue` pasa `:dialog-max-width="actionModal === 'show' ? 1300 : 1200"`
  a `DialogComponent` (que ya soportaba la prop `dialogMaxWidth`, default 1200, aplicada a
  `VDialog max-width`). **Medido en vivo** (`getBoundingClientRect().width` de `.v-overlay__content`):
  Ver = 1300px, Editar = 1200px. Confirmado.
- **P6 — stepper responsive (`mdAndDown` de `useDisplay()`)**: en `ItemWizard.vue`, si
  `!mdAndDown` se renderiza el `AppStepper` normal (horizontal, con `class="mt-10"`, sin cambios);
  si `mdAndDown` se renderiza un stepper compacto propio (`.mobile-stepper`, con `class="mobile-stepper
  mt-10"`) con flechas `tabler-chevron-left`/`tabler-chevron-right` y texto `Paso X de Y` +
  título del paso. **Confirmado visualmente** (captura): buen margen entre el header del diálogo
  ("Ver Elemento") y el stepper compacto, no queda pegado. En Ver, las flechas navegan libres entre
  los 3 pasos (Elementos→Adjuntos→Inspecciones→Adjuntos, probado con clics sintéticos).
- **Opción C — flecha derecha con validación en Agregar/Editar (mobile)**: la flecha derecha llama
  `mobileNextStep()`; si `action !== 'show'` y `currentStep === 0`, invoca
  `itemInfoFormRef.value.validateForm()` (el mismo método expuesto por `ItemInfoForm.vue` que ya usa
  el submit de escritorio) en vez de avanzar directo; solo si el formulario es válido el hijo emite
  `nextStep` y el padre avanza. **Confirmado en vivo**: en Agregar con campos vacíos, la flecha
  NO avanza y aparecen 9 mensajes "Este campo es requerido"; en Editar (datos ya válidos) SÍ avanza a
  "Paso 2 de 2". La flecha izquierda siempre retrocede (sin validación), consistente en Ver/Agregar/
  Editar.
  - **Nota de metodología (no es bug de producto)**: en una primera pasada, haciendo clic en la
    flecha derecha muy rápido (~700 ms) después de abrir el diálogo de Agregar, la validación
    pasó incorrectamente (avanzó con campos vacíos, 0 mensajes de error) — se rastreó con
    instrumentación en vivo (parcheando `vnode.props.onNextStep` del componente hijo vía
    `__vueParentComponent`) hasta confirmar que `emit('nextStep', true)` se disparaba con
    `form.valid` en `true` en ese instante. Repitiendo la prueba con una espera de ~2.5 s tras abrir
    el diálogo (tiempo más realista para un usuario), el comportamiento fue el correcto en 2/2
    intentos limpios. Causa más probable: registro asíncrono de los `input`/reglas de Vuetify con su
    `VForm` padre aún no completado a los 700 ms — un artefacto de la velocidad del click sintético
    del test, no reproducible con timing humano normal. Se documenta por si en el futuro un usuario
    real logra un doble-tap/clic extremadamente rápido en un dispositivo lento; no se tocó código.
- **Truco usado para simular mobile sin `browser_resize`** (herramienta no disponible en este MCP;
  `window.resizeTo()` está bloqueado por el navegador real): `Object.defineProperty(window,
  'innerWidth', {value: 700, configurable:true})` + `window.dispatchEvent(new Event('resize'))`.
  Esto SÍ actualiza reactivamente `useDisplay()` de Vuetify en toda la app (confirmado: el
  `DataTable.vue` de Elementos cambió a su vista de tarjetas móvil), permitiendo probar ramas de
  código condicionadas por `mdAndDown` sin herramienta de resize — pero el layout CSS real (grid de
  columnas, media queries) NO cambia visualmente (sigue renderizando a 1920px reales), solo la
  reactividad JS. Válido para probar lógica condicional por breakpoint; no reemplaza una prueba
  visual completa de responsive design real.

## Quirks de entorno encontrados en esta sesión (ver `learnings.md` para el detalle completo)
- `browser_click` (Playwright real) sobre esta SPA disparaba, de forma consistente en esta
  sesión, una **recarga completa de la app** inmediatamente después (perdiendo el estado —
  paginación, diálogos abiertos), mientras que `browser_evaluate` con eventos sintéticos
  (`pointerdown/mousedown/pointerup/mouseup/click` con `dispatchEvent`) **no** causaba esa
  recarga. Todo lo anterior se hizo con clicks sintéticos vía `browser_evaluate` por esa razón.
- Para llegar a un item con muchas inspecciones sin recorrer 1168 páginas de UI, se usó
  `browser_evaluate` para localizar el componente `DataTable.vue` expuesto
  (`defineExpose({handlePaginationChange, options})`) recorriendo `__vueParentComponent` desde el
  `<table>` del DOM, y se llamó `handlePaginationChange({current_page: 1168, ...})` directamente.
