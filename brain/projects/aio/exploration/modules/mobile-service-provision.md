# Móvil → Operaciones → Prestación de Servicio

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

Estado: **explorado (parcial, validación dirigida de feature "Programar" — HU 10708)** —
actualizado: 2026-08-18.

Ruta front: `http://localhost:5173/mobile/provision-services` (subject `/mobile/provision-services`,
`action: 'read'` — `src/pages/mobile/provision-services/index.vue`). Módulo existente (listar/ver/
editar/pdf/enviar correo) al que esta sesión le agregó **una funcionalidad nueva**: el botón
**"Programar"** (crear una programación de Prestación de Servicio desde AIO, para que luego se
ejecute en AMI). No se re-exploró a fondo Exportar/Pdfs masivos (jobs en background, no ejercitados
a propósito) ni todas las variantes de Buscar; el foco fue la feature nueva + confirmar que no hay
regresión en Ver/Editar/Buscar sobre un registro creado por esa vía.

## Permisos
- Subject `/mobile/provision-services`. El botón **"Programar" solo es visible con
  `$can('create', props.subject)`** —
  `src/views/pages/mobile/provision-services/buttons/ProvisionServiceButtonsTable.vue` (bloque
  `<!-- BOTON PROGRAMAR PRESTACION -->`). Confirmado visible con el usuario de prueba (rol admin).
- El backend NO valida permisos en `StoreScheduleProvisionServiceRequest::authorize()` (devuelve
  `true` siempre) — el control de acceso a este endpoint es responsabilidad del middleware de ruta
  (`permission:/mobile/provision-services,create`, a confirmar en el grupo de rutas) + CASL en el
  frontend. No se auditó el middleware exacto de la ruta en esta sesión.

## Rutas / endpoints
- `POST /provision-services/v0/store-schedule` →
  `CustomProvisionServiceController@storeSchedule` (nuevo) →
  `CustomProvisionServiceService::storeSchedule()` — crea `ProvisionService` con `sync=false`,
  `active=true`, `created_by/updated_by` = usuario autenticado, y convierte el WKT
  `POINT(lng lat)` recibido del frontend a geometría real vía
  `ST_SetSRID(ST_MakePoint($longitude,$latitude),4326)` (parseo con regex en
  `parsePointWkt()`, cae a `[0,0]` si no matchea — sin excepción).
- Resto de endpoints del módulo (ya existentes, sin cambios): `GET provision-services/v0/company/{id}`
  (listar/refrescar tabla), `GET .../v0/generate-certification/{id}` (PDF), envío de correo vía
  `SendEmailDialog` genérico, y los de `customers/v0/custom-get-all` / `users/v0/select-users`
  reusados por los buscadores del nuevo formulario (ver abajo).

## Request / validación (backend)
`app/Http/Requests/Modules/Mobile/ProvisionService/StoreScheduleProvisionServiceRequest.php`:
- `company_id` required|integer|exists:companies,id
- `customer_id` required|numeric
- `user_id` required|integer|exists:users,id
- `scheduled_at` required|date + **regla closure**: compara contra
  `CustomCompanyService::getActuallyDateByCountryCompany($company_id)` (hora actual de la empresa
  según su zona horaria) con `Carbon::parse($value)->lt($companyNow)` → mensaje "La fecha y hora
  programada no puede ser inferior a la fecha y hora actual." (**no se pudo disparar este mensaje
  concreto por UI** — ver hallazgo en "Validaciones probadas").
- `address` required|string|max:150
- `scheduled_location` required|string
- `failedValidation()` devuelve `{status:'warning', errors}` en 422 (no se llegó a probar por no
  poder violar reglas de backend sin violar antes las de frontend — ver abajo).

## Frontend — artefactos técnicos de la feature
- **Vista/formulario nuevo**: `src/views/pages/mobile/provision-services/forms/
  ProvisionServiceScheduleForm.vue` (archivo `??` sin trackear en git al momento de la sesión).
  Campos y su mapeo a payload:
  - `customer` (objeto) → `customer_id` (sync en `syncCustomerSelected`).
  - `supervisor` (objeto) → `user_id` (sync en `syncSupervisorSelected`).
  - `scheduled_at` (string `Y-m-d H:i`) vía `AppDateTimePicker` + flatpickr
    (`config.enableTime:true, dateFormat:'Y-m-d H:i', minDate:'today'`).
  - `address` (string) vía componente `AddressInput` (dialogo propio de construcción de dirección).
  - `scheduled_location` (string WKT `POINT(lng lat)`) vía `PointGPSDialog` (mapa Leaflet).
  - Todos con `:rules="[requiredValidator]"`.
  - `validatedData()` (expuesto con `defineExpose`) valida el `VForm` y llama
    `provisionServiceService.storeSchedule(payload)`; emite `created` con `response.status==='success'`.
- **Botón**: en `ProvisionServiceButtonsTable.vue`, mismo patrón que "Agregar" estándar
  (`tabler-circle-plus` en desktop / `tabler-plus` + `icon` en mobile vía `useDisplay().xs`),
  envuelto en `ProvisionServiceDialog` (`service-action="store"`, `dialog-max-width="1000"`).
  `validateScheduleForm(value)` dispara `scheduleFormRef.value?.validatedData()`; al éxito
  (`handleScheduleCreated`) cierra el diálogo y emite `provisionServiceCreated`, que en
  `ProvisionServicesTable.vue` está conectado a `searchProvisionServices` (refresca la tabla).
- **Servicio**: `src/services/mobile/provision-services/ProvisionServiceService.ts` — método nuevo
  `storeSchedule(schedule)`: `POST provision-services/v0/store-schedule` con
  `{company_id: dataCurrentUserCompany.id, ...schedule}`; envuelto en try/catch +
  `handleResponseErrors`.
- **Cliente (Cuenta Contrato / Nombre) — buscador unificado**:
  - Interfaz `ICustomer.client_search?: string` (nuevo campo).
  - Backend, `app/Models/Modules/Mobile/Customer/Customer.php`: accessor nuevo
    `getClientSearchAttribute()` = `"{account_contract_product} - {name}"` (formato final
    `"cuenta[- producto] - nombre"`), agregado a `$appends`.
  - Filtro backend nuevo `app/Services/Modules/Mobile/Customer/FiltersCustomerService.php::
    applyClientSearchFilter()`: `WHERE CAST(account_contract AS TEXT) ILIKE %v% OR
    CAST(product_code AS TEXT) ILIKE %v% OR name ILIKE %v%` (busca por **cualquiera** de los tres
    desde el mismo término, coincidencia por substring, no solo prefijo).
  - El componente `AioDataFetcherSelect` usa `name-value="client_search"` tanto para la key del
    filtro enviado (`{client_search: <texto escrito>}`) como para `item-title`/`item-value` (usa el
    mismo string ya formateado como opción visible).
  - Endpoint real observado: `GET customers/v0/custom-get-all?filter={"company_id":9,
    "client_search":"<texto>","active":true}` (paginado, `per_page:10`).
- **Supervisor Responsable — buscador**: reusa `UserService.getSelectSearchable()` (ya existía) →
  `GET users/v0/select-users?filter={company_id,active:true,label:<texto>}` →
  `CustomUserService::getSelectUsers()`: busca `CONCAT(first_name,' ',last_name) ILIKE '<texto>%'
  OR document ILIKE '<texto>%'` (**por prefijo**, no substring — diferencia con el buscador de
  Cliente que sí es por substring) y devuelve `label = document + ' - ' + name` (o solo `name` si
  no hay documento). `AioDataFetcherSelect` usa `name-value="label"` para filtro y display.
- **Ubicación**: `PointGPSDialog.vue` (ya existente, reusado) — mapa Leaflet; un clic coloca/quita
  un marcador (toggle); "Aceptar" deshabilitado solo si `action` es `search`/`show` (aquí es
  `store`, habilitado); emite `POINT(lng lat)` con lng/lat truncados a 10/8 caracteres.
- **Dirección**: `AddressInput.vue` (ya existente, reusado) — abre un `DialogComponent` anidado
  propio con Tipo de Vía (autocomplete cargado desde `parameters/v0/get-all?filter={key:type_via}`),
  Número Vía, Eje, Segunda Vía, Número Predio, Información Adicional; al guardar construye el
  string final (`applyAddress()`) y lo asigna al v-model del padre.

## Validaciones probadas en vivo
- **Campos vacíos + Guardar**: los 5 campos (Cliente, Supervisor, Fecha, Dirección, Ubicación)
  muestran "Este campo es requerido" (i18n `required`), el modal permanece abierto, no se dispara
  ningún POST (confirmado por red).
- **Buscador Cliente**: probado por **nombre** ("UAESP" → 11 resultados con formato
  `"cuenta[- producto] - nombre"`) y por **cuenta/producto** ("123", 3 caracteres exactos, coincide
  vía `product_code` ILIKE — ej. `"9865321 - 123654 - Urbanos 114"`). Ambos casos disparan
  `GET customers/v0/custom-get-all` con `client_search` como único filtro; formato de opción
  confirmado.
- **Buscador Supervisor**: probado por **nombre** ("Joh" → 12 resultados, ej. `"1 - John Sotfware"`,
  `"80874951 - JOHN ALEXANDER CUESTA CASTRO"`) y por **documento** ("808" → 11 resultados, ej.
  `"80822023 - Angelo Castro"`). Formato `"documento - nombre"` confirmado en ambos casos.
- **Fecha pasada — hallazgo de UX**: el frontend (`AppDateTimePicker`/flatpickr con
  `minDate:'today'`) **bloquea la fecha pasada antes de llegar al backend**: al forzar
  `flatpickr.setDate(<fecha pasada>)` el propio picker **deja el input vacío** (no rechaza con un
  mensaje específico), y al pulsar Guardar el campo cae en la regla `required` genérica
  ("Este campo es requerido"), NO en el mensaje específico de fecha inválida. Por diseño del picker,
  **no fue posible en esta sesión hacer que el POST llegara al backend con una fecha pasada** para
  confirmar el mensaje `scheduledDateMustBeFuture`/la regla de `StoreScheduleProvisionServiceRequest`
  contra la hora de la empresa — solo se confirmó por código (ver arriba). Las claves i18n
  `scheduledDateMustBeFuture` (es/en) están declaradas pero **no se referencian en ningún `.vue`**
  (`grep` sin resultados) — quedan huérfanas mientras el flujo real de UI no llegue nunca a mostrar
  ese mensaje.
- **Fecha futura + resto de campos válidos + Guardar → ÉXITO**: toast
  `"Programación de prestación de servicio creada correctamente."`, modal se cierra
  (`dialogStillOpen:false`), tabla se refresca sola (`GET provision-services/v0/company/9` se
  repite automáticamente tras el `POST store-schedule`) y el registro nuevo aparece como **primera
  fila** de la tabla (sin Placa/Código Vehículo/Fecha Sincronización, como corresponde a un registro
  aún no ejecutado en AMI).

## Registro de prueba creado (evidencia BD)
`mobile.provision_services.id = 316233` — `customer_id=1543024` ("Urbanos 114", cuenta 9865321),
`user_id=63` ("Angelo Castro", doc 80822023), `scheduled_at='2026-08-20 09:00:00'`,
`address='CL 9 # 5 - 10'`, `scheduled_location=POINT(-74.300537 4.583613)`, `sync=false` (RN-11/12/14
confirmada: el backend fuerza `sync=false`, el cliente no puede mandarlo), `sync_date=NULL`,
`active=true`, `created_by=1`. Sin filas hijas (`detail_service_provisions`/`provision_attachments`
en 0 para este id).

**No se eliminó**: el módulo NO ofrece acción "Eliminar" para Prestación de Servicio (confirmado por
código: la columna Acciones de `ProvisionServicesTable.vue` solo tiene Ver/Editar (si `update`)/PDF/
Enviar correo; no existe `destroy` en `ProvisionServiceService.ts`). Tarea explícitamente autorizó
dejarlo si el módulo no ofrece esa acción — **id 316233 queda en BD local**, reportado aquí para que
el usuario decida si lo borra manualmente.

## Regresión / acciones existentes verificadas sobre el registro nuevo
- **Ver** (ojo, `ProvisionServiceFormWizard`): abre con 4 pasos (Información Prestación de Servicio /
  Información del servicio / Evidencias / Ubicación); paso 1 muestra correctamente Cuenta Contrato,
  Nombre del Cliente, ID, Dirección (`CL 9 # 5 - 10`, la de la programación, no la del cliente),
  Activo=true; Tipos Servicios/Observaciones/Placa/Código Vehículo/fechas vacíos (esperado, sin
  ejecutar aún). Sin errores de consola.
- **Buscar**: el diálogo de filtros abre normalmente con todos sus campos (Cuenta Contrato, Nombre,
  ID, Tipos, Observaciones, Placa, Código Vehículo, fechas, Dirección…) — sin regresión.
- **Tabla**: columna "Dirección" muestra `customer.address` (dirección del cliente), NO
  `provision_service.address` (la de la programación) — diseño existente de la tabla, no es un bug
  de la feature nueva, pero puede confundir (la dirección que el usuario acaba de escribir en
  "Programar" no es la que ve en esa columna de la tabla).

## Bug encontrado (no bloqueante) — "undefined" literal en Editar
Al abrir **Editar** (`ServiceEditForm.vue`) sobre el registro programado (sin `type_service_id` aún),
el título del bloque muestra literalmente **"Información del servicio - undefined"**. Causa exacta:
```
{{ `${$t('serviceInformation')} - ${props.provisionService?.type_service?.name?.toUpperCase()}` }}
```
(`ServiceEditForm.vue:449`, mismo patrón en `ServiceForm.vue:93`) — cuando `type_service` es `null`,
el optional chaining devuelve `undefined` y el template literal lo interpola como el string
`"undefined"` (falta un `?? ''`). Antes de esta feature, todo `provision_services` se creaba desde
AMI con `type_service_id` ya resuelto, por lo que esta rama nunca se alcanzaba; "Programar" es el
**primer flujo que crea un registro sin ese dato**, dejando el bug expuesto. Tabla de detalle
(Contenedor/Descripción/Dimensiones/Equivalencia/Cantidad/Justificación) se muestra vacía
correctamente (sin filas, ya que no hay `detail_service_provisions`), eso sí es correcto.

## Otros hallazgos menores (código, no bloqueantes)
- `ProvisionServiceScheduleForm.vue` inicializa `schedule.address` en `null`, pero `AddressInput`
  declara `modelValue: string` (no nullable) → warning de consola en cada apertura del modal:
  `[Vue warn]: Invalid prop: type check failed for prop "modelValue". Expected String with value
  "null", got Null`. No rompe nada, solo ruido en consola.
- Warning de consola preexistente (no de esta feature): `Failed to resolve component:
  VSkeletonLoader` en `ProvisionServiceButtonsTable.vue` (formulario de filtros del botón Pdfs) —
  no investigado a fondo, no relacionado con "Programar".

## No ejercitado a propósito
- **Exportar** y **Pdfs** (exportación/generación masiva, jobs en background): no se ejecutaron
  envíos reales, solo se confirmó que el diálogo de filtros de "Buscar" (mismo patrón) abre sin
  errores. Efecto amplio/asíncrono, fuera del foco de esta validación.
- No se probó adjuntar evidencias/fotos a la programación (el formulario "Programar" no tiene ese
  campo — solo aplica al flujo de ejecución en AMI).
- No se disparó el mensaje específico de "fecha pasada" del backend (bloqueado antes por el
  `minDate:'today'` del picker — ver arriba).

## Notas de entorno (esta sesión)
- La SPA sufrió **recargas/cierres de diálogo muy frecuentes** (el modal "Programar" se cerraba solo
  entre casi cada 1-2 llamadas de herramienta `browser_evaluate`/`browser_click`/`browser_take_screenshot`
  independientes). Mitigación que funcionó: consolidar TODO el flujo (reabrir si es necesario +
  rellenar cada campo solo si está vacío + guardar) en un ÚNICO `browser_evaluate` asíncrono
  autocontenido y "idempotente" (revisa el estado actual antes de cada paso), repitiéndolo tantas
  veces como se cerrara el diálogo, hasta completar Cliente/Supervisor/Fecha/Dirección/Ubicación/
  Guardar de una sola pasada exitosa. Consistente con el patrón ya documentado en `learnings.md`.
- Confirmado por red que la SPA recarga por completo (mismo patrón de requests `menus/v0/menu/1/9`
  + `mailboxes` + `notifications` + `users/v0/select-user-company` + `provision-services/v0/company/9`
  + `applications/1/9`) cada pocos cientos de requests — no es culpa de la feature, es inestabilidad
  ambiental ya documentada en sesiones previas.

## Validación funcional 2026-08-19 (Ver/Editar/PDF/Enviar correo sobre registro AMI existente)
Tarea dirigida (rama `feature/sergio-10708`): ejercitar Ver/Editar/PDF/Enviar-correo sobre registros
**ya sincronizados desde AMI** (con `type_service_id` resuelto), a diferencia de la validación anterior
que usó el registro 316233 creado por "Programar" (sin tipo de servicio). Empresa $AIO_COMPANY_ID ($AIO_COMPANY_NAME), registro usado: `provision_services.id = 316227` (CAZA-REGUEROS, 1 detalle: contenedor
"Bolsa"/Industrial/70x120cm).

- **Ver (ojo, `ProvisionServiceFormWizard`)**: **funciona**. Confirmados pasos 1 (Información
  Prestación de Servicio — Cuenta Contrato, Nombre Cliente, Tipos Servicios, Observaciones, Placa,
  Código Vehículo, fechas, dirección, Política de datos, Activo), 2 (Información del servicio —
  título correcto `"Información del servicio - CAZA-REGUEROS"`, tabla de detalle con Contenedor/
  Descripción/Dimensiones/Equivalencia/Cantidad/Justificación) y 3 (Evidencias — carrusel de fotos
  con overlay de dirección/fecha/coordenadas/empresa + miniaturas). **Paso 4 (ícono de ubicación) no
  se pudo verificar** por los resets de la SPA descritos abajo — no confirmado, no reportar como bug.
  Sin "undefined" en ningún título, sin errores de consola.
- **Editar (lápiz, `ServiceEditForm.vue`)**: **funciona**. Título correcto `"Editar Prestación de
  Servicio - id : 316227"` + `"Información del servicio - CAZA-REGUEROS"` (con `type_service`
  resuelto, **no reproduce** el bug de "undefined" documentado arriba — consistente, ese bug es
  específico de registros creados por "Programar" sin tipo de servicio). Se cambió `amount` de 1→2 y
  se agregó `justification="PRUEBA-EXPLORACION cambio de cantidad"` en el detalle `id=331721`. Guardar
  dispara `PUT detail-service-provisions/v0/custom-update` → 200, payload
  `{"details":[{"id":331721,"provision_service_id":316227,"container_id":66,"amount":2,
  "justification":"PRUEBA-EXPLORACION cambio de cantidad","active":true}]}`, toast "Detalles de
  prestación de servicio actualizados exitosamente.", diálogo se cierra y tabla se refresca sola.
  **Cambio NO revertido** (autorizado explícitamente por la tarea: "es dato local, no es necesario
  revertir") — el detalle 331721 del registro 316227 queda con `amount=2` y esa justificación.
- **PDF (ícono, `downloadProvisionServiceCertificate`)**: **funciona**. `GET
  provision-services/v0/generate-certification/316227` → 200, abre
  `storage/pdfs/ProvisionService/acta_123_316227.pdf` en pestaña nueva — acta de 2 páginas con todos
  los campos, tabla "LABORES REALIZADAS" mostrando la cantidad ya actualizada (2) y sección de
  evidencia fotográfica. Confirma que el PDF se regenera con datos frescos (no cacheado).
- **Enviar correo (sobre, `SendEmailDialog` genérico)**: **funciona**. Título correcto `"Enviar
  acta # 316227 por correo"`. `POST provision-services/v0/send-certification/316227` → 200 (payload
  `{"emails":"$AIO_TEST_EMAIL"}`), toast "Acta enviada correctamente". **Enviado 2 veces** al correo
  de prueba `$AIO_TEST_EMAIL` (el mismo usuario de login, ver `settings.local.json`) por reintentos
  durante el diagnóstico de un falso negativo (ver nota de entorno abajo) — ambos envíos reales,
  ninguno a terceros.
- **Botones superiores**: **Buscar**, **Exportar** y **Pdfs** (masivo) abren sus diálogos
  correctamente (`"Buscar Prestación de Servicio..."`, `"Exportar Prestacion_Servicio..."`,
  `"Descarga Masiva de Prestación de Servicio..."`), sin "undefined" y sin errores de consola (solo
  el warning preexistente `Failed to resolve component: VSkeletonLoader`, ya documentado arriba). No
  se ejecutó ninguna exportación/descarga masiva real (fuera de foco, efecto amplio).

### Nota de entorno — falso negativo en "Enviar correo" por selector incorrecto
Al automatizar el llenado del campo de correo con un selector genérico (`document.querySelector(
'.v-text-field input')` o el primer `input` del documento) se escribe en un campo **equivocado**
(otro `.v-text-field` de la página, fuera del diálogo), y el envío falla con toast "Correo
electrónico no válido" aunque el flujo real funciona. La causa NO es un bug del módulo: hay que
**acotar el selector al diálogo activo** (`document.querySelector('[role="dialog"]').querySelector(
'input')`) antes de escribir. Además, `Toastify` **apila** toasts sin limpiar los viejos; leer
`document.querySelector('.Toastify__toast')` después de una acción puede devolver un toast **viejo**
todavía en pantalla, no el de la última acción — hay que mirar el snapshot completo (lista de
`alert`s) o filtrar por texto esperado, no fiarse del primer toast en el DOM.
