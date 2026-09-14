# Green (Respel) → Operaciones → Prestación de Servicios

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

- Ruta app (URL): `/respel/service-provisions`   | Backend módulo: `Respel/ServiceProvision`   | Estado: `importado, sin verificar`| Actualizado: 2026-08-12 (sesión de seguimiento: ciclo completo crear→editar→anular validado vía `Recepción en Planta`)

## Resumen de alcance (importante)
Esta pantalla es **listar / ver / editar (solo cantidades) / anular / exportar / PDF / procesar liquidación
mensual**. **NO tiene acción de "Crear"** dentro de sí misma: el registro `wastes.service_provisions` se
crea desde OTRO módulo (`Green → Operaciones → Recepción en Planta`, `ReceptionPlantWizard.vue` →
`ServiceProvisionService.storeCustom()` → `POST service-provisions/v0/store-reception-plant`) o desde la
app móvil (`POST service-provisions/v0/mobile/store-data`, `CustomMobileServiceProvisionController`). El
wizard de este módulo (`ServiceProvisionWizard.vue`) soporta las acciones `show` (4 pasos: Información
General, Residuos/Servicios, Evidencias, Datos de Entrega), `update` (1 paso: solo Residuos/Servicios —
edita cantidades) y `search` (1 paso: filtro sobre Información General). Un 4º valor de `action` distinto
de estos tres (p. ej. `store`) activaría los 4 pasos completos (mismo componente), pero **no existe ningún
lugar del código que lo instancie con `action="store"`** para esta tabla.

## Bloqueo de datos encontrado y cómo se resolvió (para esta sesión de exploración)
`company_id=$AIO_COMPANY_ID` ($AIO_COMPANY_NAME, la empresa fija de todas las exploraciones) **no tenía NINGÚN
dato del dominio Respel/wastes** (0 filas en `business_lines`, `service_zones`, `waste_streams`, `wastes`,
`treatment_dispositions`, `quotations`, `service_requests`, `service_provisions` — confirmado por SQL y
por la UI: "No data available"). Para poder ejercitar el CRUD se **insertó directamente en BD** (no vía
UI) una cadena mínima de datos de prueba con prefijo `PRUEBA-EXPLORACION-20260812191905` (cliente,
línea de negocio, zona de servicio, corriente/residuo, tratamiento, grupo tarifario, cotización, solicitud
de servicio, prestación de servicio y su detalle) reutilizando catálogos GLOBALES ya existentes
(`frequencie_id=1`, `packaging_id=1` "BOLSA", `waste_process_id=1` "Almacenado", `waste_type_id=2`,
`risk_type_id=1`, `municipality_id=149` BOGOTA, `identification_type_id=2`) y el `business_unit_id=7`
("DISTRITO", company $AIO_COMPANY_ID) ya vinculado al usuario admin (`user_units.user_id=1`) para pasar el filtro de
visibilidad por unidad de negocio. **Todo fue borrado al final** (ver sección Limpieza) — la BD quedó
exactamente en el mismo estado (0 filas) que al empezar.

## Recepción en Planta (módulo hermano donde SÍ se crea la Prestación de Servicio)

- Ruta app: `/respel/reception-plant`. Vista: `ServiceRequestTable.vue` (lista `wastes.service_requests`
  con `delivery_type='Planta'`, vía `ServiceRequestService.getAll` — mismo servicio del módulo
  Zona de Clientes/Comercial). Acción "Procesar" (icono engranaje, visible si
  `item.active && item.status_service === 'Solicitada'`) abre `ReceptionPlantWizard.vue` (2 pasos, propios
  de este módulo, **no reutiliza** los forms de `provision-services/forms/`):
  1. **Residuos** (`forms/WastesInfoForm.vue`): tabla de `wastes.service_request_details` de esa solicitud
     (vía `ServiceRequestDetailService.getAllServiceRequestDetails(service_request_id)` →
     `GET /service-request-details/v0/get-all-details/{id}`, filtrando en frontend `service_id === null`
     — solo residuos, no servicios) con columnas Cantidad Declarada (solo lectura) y **Cantidad Recibida**
     (`received_quantity`, editable, obligatoria, `waste_process_id` fijo en `1` "Almacenado" desde el
     frontend). Botón "Siguiente" (`type=submit`).
  2. **Evidencias** (`forms/EvidencesForm.vue`): `photo` (`VFileInput`, obligatorio, jpg/jpeg/png),
     `observations` (opcional, máx 1000), `signature` (canvas `SignaturePad` con librería `signature_pad`,
     botón "Guardar" propio que guarda el `dataURL` en `localStorage.user_signature` y lo convierte a
     `File` en `base64ToFile()` antes de emitir). Botón final `type=submit` texto "Guardar" (`$t('store')`).
  3. Al completar ambos pasos, `ReceptionPlantWizard` emite `createNewServiceProvision(formData)` →
     `ServiceRequestTable.vue::createNewServiceProvision` → `ServiceProvisionService.storeCustom()` →
     **`POST /service-provisions/v0/store-reception-plant`** (multipart, `prepareData()` arma
     `wastes[i][waste_id|waste_process_id|treatment_disposition_id|packaging_id|received_quantity]`).
- **Prerequisito de datos para que la solicitud aparezca aquí**: `wastes.service_requests` con
  `company_id`, `delivery_type='Planta'`, `status_service='Solicitada'`, `active=true`, más su cadena
  completa `quotation→(business_line, client, municipality, service_zone, frequencie, tariff_group,
  advisor_id)`; y al menos un `wastes.service_request_details` (residuo declarado, `service_id IS NULL`).
  Para que `createReceptionPlant` calcule el precio correctamente también hace falta un
  `wastes.tariff_details` (por `tariff_group_id` + `treatment_disposition_id`) — si falta, el precio
  resuelve a `null`/0 sin error fatal (PHP8 solo emite warning al indexar un array nulo).

## Validación de punta a punta (sesión de seguimiento) — crear → editar → anular, vía endpoints reales

Se insertó la cadena mínima de prerequisitos en BD (idéntica lógica a la sesión anterior, con
`status_service='Solicitada'` en vez de `'Procesada'`, + 1 fila en `service_request_details` + 1 fila en
`tariff_details`), y se confirmó en vivo que la `ServiceRequest` aparece en `Recepción en Planta` con el
botón "Procesar" visible. El wizard se abrió correctamente (paso 1 con los datos reales de residuo
declarado) pero **no se pudo completar el submit vía clics/tipeo en el navegador de pruebas** (ver
"Bloqueos"): cada intento de avanzar de paso o de enviar el formulario, tras 1-2 interacciones más,
terminaba con el `VDialog` cerrado y, en varios casos, la SPA recargada por completo (splash "FS Logo").
Se confirmó por red y BD que **ningún intento fallido llegó a tocar el backend** (0 filas en
`service_provisions` para company $AIO_COMPANY_ID antes de la siguiente fase).

**Dado el bloqueo de UI reproducible, se ejecutó el ciclo completo invocando DIRECTAMENTE los mismos
endpoints REST que dispara la UI**, autenticando por `POST /api/login` (credenciales de
`.claude/settings.local.json`, uso explícitamente autorizado para verificación) y usando el token real
para:

1. **Crear** — `POST /service-provisions/v0/store-reception-plant` (multipart real: `company_id=$AIO_COMPANY_ID`,
   `service_request_id`, `wastes[0][waste_id|waste_process_id=1|treatment_disposition_id|packaging_id=1|
   received_quantity=10]`, `photo`/`signature` como archivos PNG reales, `observations`,
   `delivery_user`/`delivery_user_identification`). Respuesta `200`, `service_provision.id=121368`,
   `gross_value=100000` (10×10.000 de `tariff_details`), `tax_amount=19000` (19%), `total_amount=119000`.
   Verificado en BD: fila en `service_provisions`, 1 `service_provision_details` con los mismos importes,
   **2 `service_provision_attachments`** (foto + firma, `bytea` con tamaño distinto al original — confirma
   que `saveAttachment()` recomprimió con GD), y `service_requests.status_service` pasó a `'Procesada'`.
   Confirmado en la UI (`/respel/service-provisions`, navegación real): la fila aparece con
   `Estado=Activa`, `Valor Total=119.000,00`, `Fecha Registro` correcta (a diferencia del insert SQL crudo
   de la sesión anterior, que dejaba `created_at` nulo → "1970-01-01").
2. **Editar** — `POST /service-provisions/v0/update-custom/121368` (`justificacion`,
   `wastes[0][id=<detail_id>|quantity=15|unit_price=10000|tax=19]`). Respuesta `200`: `gross_value=150000`,
   `tax_amount=28500`, `total_amount=178500` — coincide exactamente con lo documentado en
   `updateServiceProvision()` (recalcula con los valores que manda el cliente, no vuelve a consultar
   tarifa). Verificado en BD (`service_provisions`+`service_provision_details`) y en la UI (Valor Total
   actualizado a `178.500,00`).
3. **Anular** — `PUT /service-provisions/v0/annular/121368` (`{"justificacion": "..."}`). Respuesta `200`,
   `active=false`. Verificado en BD: `service_provisions.active=false` con la `justification` enviada,
   **todos** los `service_provision_details` de esa prestación con `active=false`, y
   `service_requests.status_service` **revertido a `'Solicitada'`** (por ser `delivery_type='Planta'`) —
   coincide exactamente con `annularServiceProvision()`. Verificado en la UI: `Estado=Anulada`, y los
   íconos Editar/Anular/PDF desaparecen de la fila (solo queda "Ver"), tal como exige la condición
   `item.activo` en `ServiceProvisionTable.vue`.

Esta validación (aunque hecha por HTTP directo en vez de clics reales) ejercitó **exactamente los mismos
controladores/servicios/modelos** que la UI dispara (mismo `Request`, misma validación, mismo
`CustomServiceProvisionService`), confirmando de punta a punta: cálculo de tarifa en la creación, no
recálculo de tarifa en la edición, cascada de anulación (detalle + reversión de estado de la solicitud),
generación real de PDF (`storage/app/public/pdfs/serviceProvision/121368_*` + el PDF mismo, confirmados en
disco y luego borrados), y encolado real de 3 `App\Jobs\SendMailAttachmentJob` (uno por acción; no se
enviaron correos reales — no hay `queue:work` corriendo — y se borraron de la tabla `jobs` en la limpieza).

## Permisos
| Subject (ruta) | Abilities (create/read/update/delete/…) | Dónde se exige (router front / middleware backend) |
|---|---|---|
| `/respel/service-provisions` | `read` (meta de la página `src/pages/respel/service-provisions/index.vue`) | Router front (`definePage` meta) |
| `/respel/service-provisions` | `update` (botón Editar), `delete` (botón Anular, icono "eliminar") | `$can('update'/'delete', props.subject)` en `ServiceProvisionTable.vue` (CASL, solo frontend) |
| `/respel/generate-monthly-settlement` | `read` (habilita el botón "Procesar") | `$can('read', ...)` en `ServiceProvisionButtonsTable.vue` (solo frontend) |
| — | — | **Backend**: solo las rutas "estándar" (`/v0/get-all`, `/v0/store`, `/v0/update/{id}`, `/v0/delete/{id}`, `/v0/duplicate/{id}`, `/v0/export-data`) llevan middleware `permission:/respel/service-provisions,<ability>`. **Las rutas "custom" que la UI realmente usa** (`get-all-custom`, `update-custom`, `annular`, `generate-pdf`, `send-service-provision`, `store-reception-plant`, `mobile/store-data`, `generate-monthly-settlement`, `generate-massive-exports`, `report-*`) **NO tienen middleware de permiso** — solo exigen sesión autenticada (Sanctum global) y el control de acceso queda enteramente en el frontend (CASL). |

## Rutas / Endpoints (`routes/api/v0/Modules/Respel/service_provisions.php`)
| Método | Endpoint | Controlador@método | Acción de UI que lo dispara | Auth/permiso |
|---|---|---|---|---|
| GET | `/service-provisions/v0/get-all-custom` | `CustomServiceProvisionController@index` | Cargar tabla / paginar / filtrar (Buscar) | Sanctum, sin `permission:` |
| GET | `/service-provisions/v0/get-all-details/{service_provision_id}` | `CustomServiceProvisionController@getAllDetails` | Paso "Residuos/Servicios" (Ver y Editar) | Sanctum |
| POST | `/service-provisions/v0/update-custom/{id}` | `CustomServiceProvisionController@updateServiceProvision` | Botón "Editar" (submit del wizard, 1 paso) | Sanctum |
| GET | `/service-provisions/v0/get-evidences` | `CustomServiceProvisionController@getEvidenceServiceProvision` | Pasos "Evidencias" (foto) y "Datos de Entrega" (firma) del Ver | Sanctum |
| PUT | `/service-provisions/v0/annular/{id}` | `CustomServiceProvisionController@annularServiceProvision` | Botón "Anular" (icono papelera = "eliminar" lógico) | Sanctum |
| POST | `/service-provisions/v0/store-reception-plant` | `CustomServiceProvisionController@storeReceptionPlant` | (Otro módulo) `Recepción en Planta` — crea el registro | Sanctum |
| GET | `/service-provisions/v0/generate-pdf/{id}` | `CustomServiceProvisionController@generatePdf` | Botón PDF de la fila | Sanctum |
| POST | `/service-provisions/v0/send-service-provision/{id}` | `CustomServiceProvisionController@sendServiceProvision` | (no usado en esta tabla; existe endpoint) | Sanctum |
| POST | `/service-provisions/v0/generate-monthly-settlement` | `CustomServiceProvisionController@postGenerateMonthlySettlement` | Botón "Procesar" → confirmar periodo | Sanctum |
| POST | `/service-provisions/v0/generate-massive-exports` | `CustomServiceProvisionController@generateMassiveExports` | Botón "Pdfs" (descarga masiva por rango de fechas) | Sanctum |
| POST | `/service-provisions/v0/export-data` (estándar) | `ServiceProvisionController@exportData` | Botón "Exportar" (`ExportItem`) | Sanctum + `permission:.../read` |
| POST | `/service-provisions/v0/report-billing-dashboard` / `report-wastes-dashboard` | `CustomServiceProvisionController@reportBillingDashboard`/`reportWastesDashboard` | (Reportes, no en esta pantalla) | Sanctum |
| DELETE | `/service-provisions/v0/delete/{id}` (estándar) | `ServiceProvisionController@destroy` | No usado por esta tabla (usa `annular` en su lugar) | Sanctum + `permission:.../delete` |

## Controladores
| Clase (archivo) | Métodos relevantes | Qué orquesta técnicamente |
|---|---|---|
| `CustomServiceProvisionController` (`app/Http/Controllers/Modules/Respel/ServiceProvision/CustomServiceProvisionController.php`) | `index`, `getAllDetails`, `updateServiceProvision`, `getEvidenceServiceProvision`, `annularServiceProvision`, `storeReceptionPlant`, `generatePdf`, `sendServiceProvision`, `postGenerateMonthlySettlement`, `generateMassiveExports`, `reportBillingDashboard`, `reportWastesDashboard` | Delegan a `CustomServiceProvisionService` / `ServiceProvisionReportService` / `WasteReportService`; envuelven todo en `executeWithHandling` (try/catch estándar del `BaseController`) |
| `ServiceProvisionController` (estándar, mismo namespace) | `index`, `store`, `show`, `update`, `destroy`, `duplicate`, `exportData`, `getSelect` | CRUD genérico heredado de `BaseController`/`BaseService` (no usado por esta UI salvo `show` puntual y potencialmente `exportData`) |

## Servicios
| Clase (archivo) | Métodos | Responsabilidad técnica |
|---|---|---|
| `CustomServiceProvisionService` (`app/Services/Modules/Respel/ServiceProvision/CustomServiceProvisionService.php`) | `createReceptionPlant`, `saveAttachment`, `generatePdf`, `sendServiceProvision`, `getServiceProvisionEmailData`, `getAllServiceProvisions`, `getServiceProvisionDetails`, `updateServiceProvision`, `getEvidenceServiceProvision`, `annularServiceProvision`, `getAllForEvacuations`, `getAllForReceptionCertificates`, `generateMassiveExports`, `getServiceProvision`, `createNotification` | Ver detalle por método abajo |
| `CustomServiceProvisionPDFService` | `generateServiceProvisionPdf($id)` | Arma datos vía `ServiceProvisionQueryBuilder::queryServiceProvisionPdfData/queryServiceProvisionDetailsPdfData`, adjuntos (`getAttachmentProvisionService`) y renderiza `resources/views/pdfs/Modules/Respel/ServiceProvision/serviceProvision.blade.php` a PDF en `storage/app/public/pdfs/serviceProvision` |
| `MailService` (`app/Services/Modules/Settings/Mail/MailService.php`) | `generateEmailData`, `sendEmailAttachment` | `sendEmailAttachment` solo hace `SendMailAttachmentJob::dispatch(...)` (encola; **no envía nada si no hay un worker de queue corriendo** — `QUEUE_CONNECTION=database` en este entorno, sin `queue:work` activo) |

### Detalle técnico de métodos clave de `CustomServiceProvisionService`
- **`createReceptionPlant(array $data)`** (usado por `storeReceptionPlant`, el "crear" real del dominio,
  en el módulo Recepción en Planta): `ServiceProvision::create($data)` con `execution_date=now()`; por cada
  waste en `$data['wastes']` busca `TariffDetail` (join `tariff_details`→`quotations`→`service_requests`
  por `service_request_id` + `treatment_disposition_id`) para fijar `unit_price`/`vat_percentage`, crea un
  `ServiceProvisionDetail`, acumula `gross_value`/`tax_amount`; guarda adjuntos (`saveAttachment`, foto +
  firma) como `bytea` (`decode(hex,'hex')` de la imagen recomprimida con GD); marca la `ServiceRequest`
  asociada como `status_service='Procesada'`; actualiza totales; genera PDF y **envía email** (encolado).
- **`updateServiceProvision`**: solo actualiza `justification` de la cabecera y, por cada
  `wastes[].id` (un `ServiceProvisionDetail`), recalcula `quantity`/`total_price`/`tax_amount`/
  `total_amount` (usa `unit_price`/`tax` que ya vienen del front, **no los recalcula contra tarifa** — el
  front los trae de solo-lectura de `getAllDetails`); regenera PDF y envía email tipo `modificacion`.
- **`annularServiceProvision`**: `active=false` + `justification` en la cabecera, `active=false` en TODOS
  los `ServiceProvisionDetail` de esa prestación; si la `ServiceRequest` es `delivery_type='Planta'`, la
  regresa a `status_service='Solicitada'`; regenera PDF y envía email tipo `anulacion`.
- **`getAllServiceProvisions`**: pagina vía `ServiceProvisionQueryBuilder::getAllServiceProvisions`, y por
  cada fila calcula en memoria `allow_update` (existe algún detalle con `waste_process_id=1` o con
  `service_id` no nulo) y `allow_annular` (NO existe ningún detalle con `waste_process_id!=1`) — estos dos
  flags son los que la tabla usa junto con `activo`/`numero_conciliacion===null` para mostrar/ocultar los
  íconos Editar/Anular.
- **`generateMassiveExports`**: valida que existan registros en el rango, crea una `Notification` y
  encola `GenerateMassiveExportsJob` (proceso en background, no bloqueante) — **NO se ejecutó en vivo**
  (efecto de generación masiva de archivos, no autorizado a ciegas).
- **`postGenerateMonthlySettlement`** (controlador): valida `GenerateMonthlySettlementRequest`
  (`year`,`month`,`company_id`) y encola `GenerateMonthlySettlementJob` — **acción de efecto amplio /
  irreversible sobre TODO un periodo de la compañía; NO se ejecutó en vivo** (solo se abrió el modal
  "Procesar" y se documentó por código; no se pulsó "Procesar" para no disparar una liquidación real).

## Query builders / Requests / Rules
| Artefacto | Archivo | Qué construye/valida |
|---|---|---|
| `ServiceProvisionQueryBuilder::getAllServiceProvisions` | `app/Queries/Modules/Respel/ServiceProvision/ServiceProvisionQueryBuilder.php` | Query principal de la tabla: `wastes.service_provisions` `JOIN companies/countries`, `LEFT JOIN` `service_requests` (directo o vía `programming_details`), `LEFT JOIN quotations` (por `COALESCE(sr.quotation_id, sr_from_pd.quotation_id)`), **`JOIN clients`** (obliga a que exista cotización→cliente, si no la fila NO aparece), `LEFT JOIN branches/service_deliveries/programmings/staff/vehicles`. Filtros soportados: `cliente_id`, `tipo_entrega`, `numero_solicitud_servicio`, `numero_programacion`, `execution_date`, `business_line_id` (aplicado al join de `quotations`). Aplica `applyUserVisibilityFilter`: restringe por `user_units`/`business_units` del usuario/empresa vía `whereHas('serviceRequests.quotation'/'programmingDetails.serviceRequests.quotation', ...)`; si el usuario no tiene unidades de negocio en esa compañía, fuerza `1=0` (0 filas). |
| `ServiceProvisionQueryBuilder::queryServiceProvisionPdfData` / `queryServiceProvisionDetailsPdfData` | mismo archivo | Datos consolidados (cliente, sucursal, cotización, programación, vehículo, conductor, empresa/país) para el PDF, y el detalle de residuos con nombres resueltos (estado, corriente) |
| `ServiceProvisionQueryBuilder::getAllForEvacuations` / `getAllForReceptionCertificates` | mismo archivo | Usadas por otras pantallas (Evacuaciones, Certificados de Recepción), no por esta tabla directamente |
| `CustomStoreServiceProvisionRequest` | `app/Http/Requests/Modules/Respel/ServiceProvision/CustomStoreServiceProvisionRequest.php` | Valida `store-reception-plant`: `company_id` (FK), `service_request_id` (FK nullable), `wastes` (array requerido), `photo`/`signature` (archivo requerido, jpg/jpeg/png ≤20MB), `observations`, `delivery_user`, `delivery_user_identification` |
| `GenerateMonthlySettlementRequest` | mismo dir | `year` (2000..año+1), `month` (1..12), `company_id` (FK) — para el botón "Procesar" |
| `GenerateMassiveExportsRequest` | mismo dir | Rango de fechas + `company_id`/`client_id`/`branch_id` — para el botón "Pdfs" |
| `StoreServiceProvisionRequest` | mismo dir | Validación del `store` ESTÁNDAR (no usado por esta UI) |

## Modelos / Tablas / Migraciones
| Modelo | Tabla | Relaciones | Notas técnicas |
|---|---|---|---|
| `ServiceProvision` | `wastes.service_provisions` | `belongsTo ServiceRequest` (`service_request_id`), `belongsTo ProgrammingDetail` (`programming_detail_id`), `belongsTo User` (`created_by`→`users`, `concilied_by`→`conciliationUser`), `belongsTo Company`, `hasMany ServiceProvisionDetail` | `appends`: `creator_name`, `nombre_usuario_conciliacion`, `company_name`. Hook `booted()::created`: si trae `latitude`/`longitude`, actualiza la `geolocation` (PostGIS `ST_MakePoint`) del cliente o de la sucursal asociada (solo si aún es null) |
| `ServiceProvisionDetail` | `wastes.service_provision_details` | `belongsTo Wastes/Service/Packaging/TreatmentDisposition/WasteStreams(vía waste)/ServiceProvision` (FKs: `waste_id`,`waste_process_id`,`treatment_disposition_id`,`service_id`,`packaging_id`) | `ON DELETE CASCADE` desde `service_provisions` |
| `ServiceProvisionAttachment` | `wastes.service_provision_attachments` | `belongsTo ServiceProvision` | Columna `file` es `bytea` (imagen binaria comprimida con GD); `signature bool` distingue foto de firma; `ON DELETE CASCADE` desde `service_provisions` |
| (relacionadas, no propias) `ServiceRequest` (`wastes.service_requests`), `Quotation` (`wastes.quotations`), `Client` (`public.clients`), `Wastes`/`TreatmentDisposition`/`WasteStreams`/`BusinessLine`/`ServiceZone` (`wastes.*`, todas **company-scoped**, `company_id NOT NULL`) | — | — | `client_companies` (pivot) vincula `clients` con `company_id` (clients NO tiene `company_id` propio) |

## Frontend (técnico)
| Vista (.vue) | Servicio TS | Composables / stores | Notas técnicas |
|---|---|---|---|
| `src/pages/respel/service-provisions/index.vue` | — | `Tabs` (1 sola pestaña) | `definePage({ meta: { subject: '/respel/service-provisions', action: 'read' } })` |
| `ServiceProvisionTable.vue` | `ServiceProvisionService` | — | Headers de tabla incluyen `activo` (chip Activa/Anulada), `valor_total` formateado; botones por fila: Ver (`show`), Editar (visible si `$can('update')` && `activo` && `numero_conciliacion===null` && `allow_update`), Anular=trash icon (visible si `$can('delete')` && `activo` && `numero_conciliacion===null` && `allow_annular`), PDF (visible si `activo`) |
| `ServiceProvisionButtonsTable.vue` | `ServiceProvisionService`, `ClientService`, `BranchService` | — | Botones: **Pdfs** (`generateMassiveExports`, dialog con cliente/sucursal/rango fechas), **Exportar** (`ExportItem` genérico → `export-data`), **Buscar** (abre `ServiceProvisionWizard action="search"`), **Procesar** (visible si `$can('read', '/respel/generate-monthly-settlement')`; abre `ProcessServiceProvisionModal`) |
| `ProcessServiceProvisionModal.vue` | `ServiceProvisionService`, `NotificationService` | `useBroadcastChannel('notification-channel')` | Selector de periodo (`PeriodSelector`) → `generateMonthlySettlement(period)` → notifica éxito y refresca notificaciones/broadcast a otras pestañas |
| `ServiceProvisionWizard.vue` | — | `AppStepper` | Arma `numberedSteps` según `action` (`update`→solo paso 2; `search`→solo paso 1; cualquier otro valor→los 4 pasos). `handleData` acumula `formData` entre pasos y en el último paso emite `searchServiceProvision` (si `action==='search'`) o `updateServiceProvision` (si `action==='update'`, exige `wastes.length>=1`) |
| `forms/GeneralInfoForm.vue` | `ClientService`, `BranchService`, `QuotationService`, `BusinessLinesService` | — | Paso 1. En `show`, cliente/sucursal/cotización llegan de solo-lectura (`clientService.show(id)`); en `search` son autocompletes editables (`AioDataFetcherSelect`) |
| `forms/WastesServicesInfoForm.vue` | `ServiceProvisionService.getAllServiceProvisionDetails` | — | Paso 2 (Editar/Ver). Tabla editable de detalle: `quantity` es editable SOLO si `!fieldDisabled` y `waste_process_id===1` (Almacenado); en `update`, `justificacion` es obligatoria (`requiredValidator`) |
| `forms/EvidencesForm.vue` | `ServiceProvisionService.getEvidences({signature:false})` | — | Paso 3 (solo Ver). Muestra foto (swiper) + mapa (`LocationMap`) si hay lat/lng |
| `forms/DeliveryDataForm.vue` | `ServiceProvisionService.getEvidences({signature:true})` | — | Paso 4 (solo Ver). Muestra firma + `usuario_que_entrega`/`identificacion_usuario_que_entrega` (solo lectura) |
| `ServiceProvisionService.ts` (`src/services/respel/service-provisions/`) | — | — | Ver tabla de endpoints arriba; `prepareData()` arma `FormData` (usado por `storeCustom`/`update`, incluye adjuntos `photo`/`signature` y array `wastes[i][campo]`) |

## Acciones ejercitadas en vivo (con el registro de prueba)
- **Ver** (`show`): abre wizard 4 pasos; Paso 1 confirmado con datos reales (cliente
  `PRUEBA-EXPLORACION-20260812191905 CLIENTE`, cotización `9999901 - BOGOTA - Eventual`, tipo entrega
  Planta, solicitud 13122, observaciones). Red confirmada: `clients/v0/show-custom/{id}`,
  `branches/v0/get-select-data-custom`, `quotations/v0/get-select-custom-data`.
- **Editar**: abre wizard 1 paso (Residuos/Servicios); confirmado que carga el detalle real vía
  `get-all-details/{id}` (residuo `PRUEBA-EXPLORACION-...-RESIDUO`, tratamiento, cantidad 10, precio
  10.000, corriente, embalaje "BOLSA", estado proceso "Almacenado").
- **Buscar**: abre el formulario de filtro (paso único de `GeneralInfoForm` en modo `search`).
- **Anular**: el diálogo de confirmación (Justificación + Confirmar) se abrió correctamente y se
  verificó su estructura, pero **no se pudo completar el submit en vivo** por inestabilidad del
  navegador de pruebas (ver "Bloqueos" más abajo) — no llegó ninguna petición `PUT annular` al backend
  (confirmado con `browser_network_requests` y con el estado en BD, que siguió `active=true`).
- **Procesar** (liquidación mensual): **NO se ejecutó** a propósito (acción de efecto amplio/irreversible
  sobre todo un periodo de la compañía — se documentó solo por código, siguiendo la instrucción de no
  ejecutar a ciegas acciones de efecto terminal).
- **Pdfs (exportación masiva)** y **generatePdf** individual: **no se ejecutaron** (generan archivos/jobs
  en background; documentados por código).

## Bloqueos (solo bugs/impedimentos que impidieron continuar)
| # | Pantalla | Pasos repro | Qué quedó bloqueado | Evidencia |
|---|---|---|---|---|
| 1 | Diálogos de este módulo (Ver/Editar/Anular) y de `Recepción en Planta` (Procesar), dentro de la sesión de pruebas MCP | Abrir cualquiera de estos diálogos (persistentes, `VDialog persistent`) y luego intentar 2-3 interacciones más (avanzar de paso, escribir, click en Confirmar/Siguiente) | No se pudo completar en vivo NINGÚN submit multi-paso por clics/tipeo reales: ni "Ver" (4 pasos), ni "Editar" (guardar cantidad), ni "Anular" (confirmar), ni el wizard de 2 pasos de "Recepción en Planta" (llegar a adjuntar foto/firma). En la sesión de seguimiento se confirmó que en varios intentos la SPA se recarga por COMPLETO (splash "FS Logo" visible en la propia respuesta de la herramienta que ejecutó la acción), no solo se cierra el diálogo — descartando que sea un problema de selector/ref y confirmando que es una recarga real del entorno. **No es un bug de la app** (el componente es `persistent`, no debería cerrarse por click-fuera/Esc). Se hicieron ~8 variantes de mitigación (selectores CSS en vez de `ref`, `type` con `submit:true`/Enter, `browser_evaluate` con polling de hasta 4s, `browser_wait_for` por texto, click directo al botón `type=submit`) sin conseguir sobrevivir más de ~2 interacciones reales tras abrir el diálogo. | Múltiples secuencias en ambas sesiones; `browser_network_requests` y el estado en BD confirman que NINGÚN intento fallido llegó a disparar `update-custom`/`annular`/`store-reception-plant` contra el backend. |

### Aprendizaje adicional sobre `browser_evaluate` vs `browser_click`/`browser_type` en esta sesión
`browser_evaluate` (con `document.querySelector`, incluso con polling `await setTimeout` de hasta 4s)
**NUNCA** logró ver un `VDialog` recién abierto como 2ª acción tras el `browser_click` que lo abre (siempre
devuelve "dialog never appeared"/`null`), mientras que `browser_click`/`browser_type` con locators reales
de Playwright (`page.locator(...)`) **sí** lo ven de forma consistente como 2ª acción (y a veces como 3ª).
Confirmado que `browser_evaluate` corre en la pestaña/URL correcta (`location.href` coincide), así que no
es un problema de pestaña equivocada — es una diferencia real entre cómo cada tipo de acción resuelve el
DOM vivo en este entorno. **Recomendación**: para verificar/editar contenido dentro de diálogos en esta
app, preferir SIEMPRE `browser_click`/`browser_type`/`browser_fill_form` (con selectores CSS, no `ref`) y
evitar `browser_evaluate` para esa verificación; si de todos modos hace falta `evaluate` (p. ej. para
inputs de tipo archivo, que no tienen herramienta dedicada), asumir que probablemente reportará el diálogo
como inexistente aunque esté abierto, y no tratar eso como confirmación de cierre real.

## Comparación con el manual
- No se ejecutó el paso de manual en esta sesión (fuera de alcance de la tarea solicitada, que pidió
  exploración técnica + BD).

## Limpieza (verificado)

### Sesión 1 (registro creado por SQL directo, `PRUEBA-EXPLORACION-20260812191905`... primer batch)
Se insertaron y luego se **borraron completamente** (en una transacción cada operación, orden inverso de
FKs) los siguientes registros de prueba:

| Tabla | id | Estado final |
|---|---|---|
| `wastes.service_provision_details` | 399234 | Borrado |
| `wastes.service_provisions` | 121367 | Borrado |
| `wastes.service_requests` | 13122 | Borrado |
| `wastes.quotations` | 9300 | Borrado |
| `wastes.tariff_groups` | 396 | Borrado |
| `wastes.treatment_dispositions` | 223 | Borrado |
| `wastes.service_zones` | 104 | Borrado |
| `wastes.business_lines` | 39 | Borrado |
| `wastes.wastes` | 774 | Borrado |
| `wastes.waste_streams` | 723 | Borrado |
| `public.client_companies` | 1084266 | Borrado |
| `public.clients` | 1078571 | Borrado |

### Sesión 2 de seguimiento (prerequisitos + prestación creada vía endpoint real `store-reception-plant`)

| Tabla | id | Origen | Estado final |
|---|---|---|---|
| `wastes.service_provision_attachments` | 47, 48 (foto+firma) | Creados por el endpoint real | Borrados (+ archivos en disco `storage/app/public/pdfs/serviceProvision/121368_*` y el PDF `Prestación de Servicio No. 121368.pdf`) |
| `wastes.service_provision_details` | 399235 | Creado por el endpoint real | Borrado |
| `wastes.service_provisions` | 121368 | Creado por el endpoint real (`store-reception-plant`) | Borrado |
| `wastes.service_request_details` | 24318 | Insertado (prerequisito, residuo declarado) | Borrado |
| `wastes.service_requests` | 13123 | Insertado (prerequisito, `status_service` real pasó Solicitada→Procesada→Solicitada) | Borrado |
| `wastes.quotations` | 9301 | Insertado (prerequisito) | Borrado |
| `wastes.tariff_details` | 874 | Insertado (prerequisito, precio 10.000 + IVA 19%) | Borrado |
| `wastes.tariff_groups` | 397 | Insertado (prerequisito) | Borrado |
| `wastes.treatment_dispositions` | 224 | Insertado (prerequisito) | Borrado |
| `wastes.service_zones` | 105 | Insertado (prerequisito) | Borrado |
| `wastes.business_lines` | 40 | Insertado (prerequisito) | Borrado |
| `wastes.wastes` | 775 | Insertado (prerequisito) | Borrado |
| `wastes.waste_streams` | 724 | Insertado (prerequisito) | Borrado |
| `public.client_companies` | 1084267 | Insertado (prerequisito) | Borrado |
| `public.clients` | 1078572 | Insertado (prerequisito) | Borrado |
| `jobs` (cola) | 3 filas `App\Jobs\SendMailAttachmentJob` (creación/edición/anulación) | Encolados por el flujo real | Borrados (nunca se procesaron — no hay `queue:work` corriendo; se dejaron intactos otros `jobs` preexistentes no relacionados, p. ej. `App\Events\Standard\MailBoxEvent`) |

Verificado por SQL tras ambos borrados: **0 filas** en TODAS las tablas del dominio Respel/wastes para
`company_id=$AIO_COMPANY_ID` (`service_provisions`, `service_provision_details`, `service_requests`, `quotations`,
`business_lines`, `service_zones`, `treatment_dispositions`, `wastes`, `waste_streams`) — mismo estado que
al inicio de ambas sesiones. Confirmado también en la UI (`/respel/service-provisions`,
`/respel/reception-plant`): "No data available". No se enviaron correos reales en ningún momento (sin
`queue:work`).

## Estado / próximos pasos
- Documentación técnica completa (permisos, endpoints, controladores, servicios, query builder, requests,
  modelos, frontend, wizard de `Recepción en Planta`).
- **Ciclo completo crear→editar→anular validado de punta a punta** contra los endpoints reales
  (`store-reception-plant`→`update-custom`→`annular`), confirmando en BD y en la UI cada efecto de
  negocio documentado (cálculo de tarifa al crear, recálculo simple al editar, cascada de anulación).
- **Pendiente real** (no se pudo, por inestabilidad del navegador de pruebas, no por falta de intento):
  ejecutar ese mismo ciclo mediante clics/tipeo reales en el wizard (en vez de por HTTP directo). Si se
  quiere cerrar ese pendiente, se necesitaría una sesión de navegador MCP más estable (ver Bloqueos) o una
  herramienta de subida de archivos (no disponible en el set de herramientas de esta sesión, necesaria
  para el campo "Foto" obligatorio de `Recepción en Planta`).
- "Procesar" (liquidación mensual) y "Pdfs" (exportación masiva) siguen sin ejecutarse (efecto amplio,
  fuera de alcance autorizado).
