# AMI (móvil) → Green (Respel) → Visitas Clientes

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

- Ruta app (AMI): `/respel/client-contacts` (ejecución), `/respel/import-data` → "Visitas Clientes" (import), `/respel/send-data` (envío) | Ruta app (AIO web, config del form dinámico): `/settings/masters` (pestaña "dynamicFormMasters", subject `/settings/dynamic-form-masters`) | Backend módulo: `Settings/ClientVisits` + `Settings/DynamicFormMaster` (schema `public`) | Estado: `importado, sin verificar`| Actualizado: 2026-08-13

Repos: AMI `app-movil/src/views/pages/modules/respel/client-visits/**`, `services/app/modules/respel/commercial-advisor-visits/**`, `services/api/modules/respel/commercial-advisor-visits/**`. AIO web `aio-app/src/views/pages/settings/dynamic-form-masters/**`, `services/settings/dynamic-form-fields|dynamic-form-masters/**`. Backend `aio-backend/app/Http/Controllers/Modules/Settings/{ClientVisits,ClientVisitAttachments,ExtraDataClientVisit,DynamicFormMaster,DynamicFormField,DynamicFormMasterTypeVisit}/**`.

## Resumen de alcance (importante)
- `mobile.visit_types` / `App\Models\Modules\Mobile\VisitType` es un catálogo **NO relacionado** con este módulo
  (es de otro feature, "Mobile Visit"/inmuebles). El "Tipo de Visita" real de `client_visits.visit_type_id` es
  un `App\Models\Modules\Settings\DetailsMaster\DetailsMaster` (tabla `public.details_masters`), específicamente
  los detalles del **maestro global** `masters.code='MTGR-003'` ("Tipo de Visita", `company_id=-1`, `master_id=71`
  en esta BD). Toda la UI (AIO web `ClientVisitsForm.vue`/`FormMaster.vue`, AMI import) resuelve las opciones de
  "Tipo de visita" con `detailsMastersService.getDetailNameByCode('MTGR-003', -1)` — el `-1` fuerza el maestro
  GLOBAL, no uno de compañía (existe también un maestro `MTGR-003` propio de company_id=$AIO_COMPANY_ID "Tipo V", pero **no
  se usa** para esta funcionalidad, es un catálogo huérfano).
- El **formulario dinámico por tipo de visita es 1:1**: un `detail_master_id` (tipo de visita) solo puede estar
  asociado a UN `dynamic_form_master` (`UniqueVisitTypeByFormMasterRule`); un maestro puede tener 0, 1 o varios
  tipos de visita asociados (`dynamic_form_master_type_visits`, N:M real en BD pero 1:N efectivo por la regla).
- `capture_staff_information` (bool en `dynamic_form_masters`) determina si, al guardar la visita en AMI, se
  exige antes un paso adicional de **firma/testigo** (`ClientVisitSignatureForm.vue`) — variante de UX validada
  en vivo con 2 tipos de prueba (uno true, uno false).

## Permisos
| Subject (ruta) | Abilities | Dónde se exige |
|---|---|---|
| `/settings/client-visits` | READ/CREATE/UPDATE/DELETE | Backend: middleware `permission:/settings/client-visits,<accion>` en casi TODAS las rutas de `client_visits.php` (estándar y custom), `client_visit_attachments.php`, `extra_data_client_visits.php`. **Excepción**: `GET /client-visits/v0/mobile-check-availability` NO tiene middleware `permission:` (solo `auth:sanctum` global) — solo consulta disponibilidad de agenda, dato de solo lectura sin FK de escritura. |
| `/settings/dynamic-form-masters` | READ/CREATE/UPDATE/DELETE | Backend: middleware `permission:/settings/dynamic-form-masters,<accion>` en TODAS las rutas de `dynamic_form_masters.php`, `dynamic_form_fields.php`, `dynamic_form_master_type_visits.php` — incluidas `custom-get-all`/`get-all-fields` que usa AMI para el import (AMI no usa CASL, pero sigue atado al `permission:` del backend igual que VehicleControl). AIO web: `definePage({subject:'/settings/masters'})` en la página padre + tab `subject:'/settings/dynamic-form-masters'` (`src/pages/settings/masters/index.vue`) resuelto por CASL (`$can`) en frontend. |
| — (AMI) | — | AMI no tiene CASL; solo depende de que el `permission:` del backend no bloquee la llamada (usuario de prueba `$AIO_TEST_EMAIL` tiene acceso completo, confirmado en vivo). |

## Rutas / Endpoints
| Método | Endpoint | Controlador@método | Disparado por (AMI/AIO) |
|---|---|---|---|
| GET | `client-visits/v0/get-all-visits-to-mobile?filter={company_id,advisor_id,visit_date,confirmation_status,active}` | `CustomClientVisitsController@getAllVisitsToMobile` → `CustomClientVisitsService::getAllVisitsToMobile` | AMI `ImportData.vue::commercialAdvisorVisits` → `CommercialAdvisorVisitsApi.getAllVisits()`. El service fuerza `visit_date` = fecha actual del país de la compañía (`customCompanyService.getActuallyDateByCountryCompany`), ignorando lo que venga en el filtro del cliente. |
| GET | `dynamic-form-masters/v0/custom-get-all?filter={company_id,active,has_visit_types,has_fields,per_page:'all'}` | `CustomDynamicFormMasterController@customGetAll` → `CustomDynamicFormMasterService::customGetAll` | AMI `ImportData.vue` → `CommercialAdvisorVisitsApi.getAllForm()` — trae **TODOS** los maestros de la compañía que tengan ≥1 tipo de visita y ≥1 campo (no filtra por tipo específico; el filtrado por tipo ocurre luego, localmente en SQLite). AIO web `FormMaster.vue`/`DynamicFormMastersTable.vue` (config) usa lo mismo vía `DynamicFormMastersService.getAll`. |
| GET | `dynamic-form-fields/v0/get-all?filter={dynamic_form_master_id,active}` | `DynamicFormFieldController@index` | AMI `ImportData.vue` → `CommercialAdvisorVisitsApi.getAllFields(masterId)`, 1 llamada por cada maestro traído arriba. |
| **POST** | `client-visits/v0/store-visit/{id}` | `CustomClientVisitsController@generateClientVisitMobile` → `CustomClientVisitsService::generateClientVisitMobile` (usa `CustomMobileClientVisitsRequest`) | **Envío**: AMI `SendData.vue::sendClientVisits` → `CommercialAdvisorVisitsApi.sendVisit(payload, remoteId)`. Body: campos de la visita + `attachments[]` (fotos/firma en base64) + `extradata[]` (`dynamic_form_field_id, client_visit_id, value_field`). Transacción única: `updateFromMobile` + crea cada adjunto (`storeMobileAttachment`) + crea cada extradata (`extraDataClientVisitService.create`). |
| PUT | `client-visits/v0/custom-update-mobile/{id}` | `CustomClientVisitsController@customUpdateMobile` → `CustomClientVisitsService::updateFromMobile` (usa `CustomUpdateMobileClientVisitsRequest`) | AMI `ClientVisitFormComponent.vue::reprogramVisitOnServer` (ruta alterna, **NO** usada por `store-visit`; ver más abajo endpoint `update` estándar que sí usa reprogramación) — **también** expuesto/documentado por Swagger como variante sin adjuntos/extradata; en el flujo real de reprogramación AMI usa en cambio `PUT client-visits/v0/update/{id}` (estándar) seguido de `custom-store-attachment`/`extra-data-client-visits/v0/store` sueltos. |
| PUT | `client-visits/v0/update/{id}` (estándar) | `ClientVisitsController@update` | AMI `ClientVisitFormComponent.vue::reprogramVisitOnServer` — cuando la visita se reprograma (`confirmation_status:'Reprogramada'`), actualiza la visita ORIGINAL y el backend (`CustomClientVisitsService::customUpdate`, ver Servicios) crea automáticamente la visita "hija" reprogramada. **No se ejecutó en vivo en esta sesión** (foco en ejecución simple `Procesada`), documentado por código. |
| POST | `client-visit-attachments/v0/store-mobile-attachment` | `CustomClientVisitAttachmentsController@storeMobileAttachment` → `CustomClientVisitAttachmentsService::storeMobileAttachment` | Usado por `reprogramVisitOnServer` (adjunto suelto) y por el propio `store-visit` (embebido en `attachments[]`, mismo método de servicio). Aplica **watermark** (dirección/lat-lng/fecha) a fotos NO-firma (mismo `ImageWatermarkService` que VehicleControl); la firma (`signature:true`) NO se marca con agua. |
| POST | `client-visit-attachments/v0/custom-store` (multipart) | `CustomClientVisitAttachmentsController@customStore` | AMI `CommercialAdvisorVisitsApi.customStoreAttachment` — adjunto de reprogramación como archivo real (no base64 JSON). |
| POST | `extra-data-client-visits/v0/store` | `ExtraDataClientVisitController@store` (estándar) | AMI `CommercialAdvisorVisitsApi.createExtraData` — usado solo en el flujo de reprogramación (`store-visit` ya crea el extradata embebido, no llama este endpoint suelto). |
| GET | `client-visits/v0/mobile-check-availability?{company_id,advisor_id,client_id,visit_date,visit_time_start,visit_time_end}` | `CustomClientVisitsController@checkAvailability` → `CustomClientVisitAvailabilityService::checkAvailability` | AMI `ClientVisitFormComponent.vue::checkAvailability` — valida choque de horario al reprogramar (con debounce 450ms). |
| GET | `client-visit-attachments/v0/get-by-client-visit/{id}` | `CustomClientVisitAttachmentsController@getByClientVisit` | (AIO web, no usado por AMI en este flujo) |
| GET/POST/PUT/DELETE estándar `dynamic-form-masters/v0/{get-all,show,update,delete,duplicate,export-data}` | `DynamicFormMasterController` | AIO web `DynamicFormMastersService` (config) |
| POST `dynamic-form-masters/v0/upsert` / PUT `.../upsert/{id}` | `CustomDynamicFormMasterController@upsert` → `CustomDynamicFormMasterService::storeOrUpdate` | AIO web `FormMaster.vue::createFormOne/updateFormOne` — crea/actualiza el maestro Y sincroniza `visit_types[]` en la tabla intermedia (agrega/quita filas, `syncVisitTypes`) en una sola transacción. |
| PUT `dynamic-form-masters/v0/deactivate/{id}` | `CustomDynamicFormMasterController@deactivate` | AIO web (no ejercido en vivo; solo desactiva `active=false`) |
| GET/POST/PUT/DELETE estándar `dynamic-form-fields/v0/*` + `PUT deactivate/{id}` | `DynamicFormFieldController` / `CustomDynamicFormFieldController` | AIO web `FormMaster.vue` (paso 2 del wizard, tabla de campos por maestro, `fixed-filters:{dynamic_form_master_id}`) |

## Controladores
| Clase (archivo) | Métodos relevantes | Qué orquesta |
|---|---|---|
| `CustomClientVisitsController` (`ClientVisits/CustomClientVisitsController.php`) | `annul`, `getClientVisits`, `getDailyClientVisitsCount`, `customUpdateMobile`, `generateClientVisitMobile`, `reportVisitsDashboard`, `checkAvailability`, `getAllVisitsToMobile`, `generateClientVisitPdf`, `customIndex`, `generateMassivePdfs` | `generateClientVisitMobile` es el método clave del envío AMI: delega TODO a `CustomClientVisitsService::generateClientVisitMobile` dentro de `executeWithHandling` |
| `CustomClientVisitAttachmentsController` (`ClientVisitAttachments/CustomClientVisitAttachmentsController.php`) | `getAttachment`, `customStore`, `customUpdate`, `storeMobileAttachment`, `getByClientVisit` | `storeMobileAttachment` decodifica base64 + aplica watermark si no es firma |
| `CustomDynamicFormMasterController` (`DynamicFormMaster/CustomDynamicFormMasterController.php`) | `customGetAll`, `upsert`, `deactivate` | `upsert` es create-or-update según si `$id` es null; sincroniza pivote de tipos de visita en la misma transacción |
| `DynamicFormFieldController` / `CustomDynamicFormFieldController` | CRUD estándar + `customGetAll`, `deactivate` | Config de campos por maestro (texto/número/select/multiselect/switch/checkbox/radio/date) |
| `ExtraDataClientVisitController` | CRUD estándar | Solo usado suelto en reprogramación; el envío normal lo hace `generateClientVisitMobile` |

## Servicios
| Clase (archivo) | Métodos | Responsabilidad técnica |
|---|---|---|
| `CustomClientVisitsService` (`Services/Modules/Settings/ClientVisits/CustomClientVisitsService.php`) | `updateFromMobile`, `generateClientVisitMobile`, `customUpdate`, `getAllVisitsToMobile`, `customGetAll`, `annul`, `generateMassivePdfs` | `updateFromMobile`: whitelist de campos permitidos desde móvil (`outcome_details, follow_up_actions, visit_location, confirmation_status, next_visit_date, next_visit_start_time, next_visit_end_time, execution_date, data_policy, witness_*`), formatea `visit_location` a WKT/PostGIS vía `GpsPointFormatService`. `generateClientVisitMobile`: `DB::transaction` → `updateFromMobile` + loop `attachments[]`→`customClientVisitAttachmentsService.storeMobileAttachment` + loop `extradata[]`→`extraDataClientVisitService.create`; lanza `CustomException` si cualquier paso falla (rollback completo). `customUpdate` (usado por `update` estándar en reprogramación): si `confirmation_status==='Reprogramada'` Y viene `next_visit_date`, crea automáticamente una VISITA HIJA (`createRescheduledVisit`, copia campos, limpia `outcome_details`/`execution_date`/etc., valida choque de horario con `validateScheduleOverlap`) — devuelve `{updated_visit, new_visit}`. |
| `CustomClientVisitAttachmentsService` (`ClientVisitAttachments/CustomClientVisitAttachmentsService.php`) | `storeMobileAttachment`, `customStore`, `customUpdate`, `getAttachment`, `getByClientVisit` | `storeMobileAttachment`: resuelve dirección por reverse-geocoding (`osmService.getAddress` con lat/lng de la visita) SOLO si no es firma, aplica watermark (`ImageWatermarkService`), decodifica a binario y crea `ClientVisitAttachments` |
| `CustomClientVisitAvailabilityService` | `checkAvailability` | Consulta si hay OTRA visita activa del mismo cliente que se cruce en horario con el rango propuesto |
| `CustomDynamicFormMasterService` (`DynamicFormMaster/CustomDynamicFormMasterService.php`) | `customGetAll`, `storeOrUpdate`, `syncVisitTypes` (privado) | `storeOrUpdate`: crea/actualiza el maestro y sincroniza el pivote `dynamic_form_master_type_visits` con diff (agrega los `visit_types` nuevos, elimina los que ya no vienen) — todo en una transacción |
| `ApplyFilterDynamicFormMasterService` | `applyCustomFilters` | Traduce filtros custom del listado: `visit_types` (`whereHas('visitTypes', whereIn id)`), `has_visit_types` (`whereHas('visitTypes')`), `has_fields` (`whereHas('fields')`) — estos 2 últimos son los que usa AMI en el import (`getAllForm`) |

## Query builders / Requests / Rules
| Artefacto | Archivo | Qué valida/construye |
|---|---|---|
| `CustomMobileClientVisitsRequest` | `Http/Requests/Modules/Respel/ClientContacts/CustomMobileClientVisitsRequest.php` | Valida el body de `store-visit`: campos de la visita + `attachments.*.{client_visit_id(FK),file_name,file,type,active,signature}` + `extradata.*.{dynamic_form_field_id(FK dynamic_form_fields),client_visit_id(FK client_visits),value_field,active}` |
| `CustomUpdateMobileClientVisitsRequest` | mismo dir | Igual que arriba SIN `attachments`/`extradata` (usado por `custom-update-mobile`, ruta no usada por el flujo real de `store-visit`) |
| `CheckClientVisitAvailabilityRequest` | `Modules/Settings/ClientVisits/CheckClientVisitAvailabilityRequest.php` | Valida query params de `mobile-check-availability` |
| `StoreClientVisitAttachmentsRequest` | `Modules/Settings/ClientVisitAttachments/StoreClientVisitAttachmentsRequest.php` | Valida `store-mobile-attachment`/`custom-store` (`client_visit_id` FK, `file_name`, `file_path`/`file`, `mime_type`, `active`, `signature`) |
| `StoreDynamicFormMasterRequest` | `Modules/Settings/DynamicFormMaster/StoreDynamicFormMasterRequest.php` | Valida `upsert`: `company_id`(FK), `module`, `code` (+ regla `DynamicFormMasterValidate`: evita 2 maestros "sin tipos de visita" con mismo código), `name`, `description`, `capture_staff_information`, `visit_types[]` (+ regla `UniqueVisitTypeByFormMasterRule` por cada id: un tipo de visita NO puede repetirse en otro maestro) |
| `DynamicFormMasterValidate` (Rule) | `Rules/Modules/Settings/DynamicFormMaster/DynamicFormMasterValidate.php` | Si `visit_types` viene vacío, verifica que no exista YA otro maestro de la misma compañía con el mismo `code` y SIN tipos de visita asociados |
| `UniqueVisitTypeByFormMasterRule` (Rule) | mismo dir | Por cada `detail_master_id` en `visit_types[]`, falla si ya está asignado (en `dynamic_form_master_type_visits`) a un maestro DISTINTO al actual — **confirmado en vivo indirectamente**: se pudo asignar 1710→master 5 y 1711→master 6 sin choque porque cada tipo era nuevo/único |
| `ApplyClientVisitFilterService::applyBusinessUnitScope` | `Services/Modules/Settings/ClientVisits/ApplyClientVisitFilterService.php` | Restringe `customGetAll` (listado web, NO el de `get-all-visits-to-mobile`) por unidades de negocio del usuario |

## Modelos / Tablas / Migraciones
| Modelo | Tabla | Relaciones | Notas técnicas |
|---|---|---|---|
| `ClientVisits` | `public.client_visits` | `belongsTo User`(advisor_id), `Branch`, `Client`, `Company`, `SubdetailsMaster`, `belongsTo DetailsMaster`(visit_purpose_id **y** visit_type_id — mismo modelo, distinta FK/columna), `hasOne ClientVisitAttachments` | `visit_location` es `geometry(POINT,4326)` (PostGIS, agregado por `DB::statement`, no por `$table->` fluent). `contact_ids` cast a `array` (JSON). Campos capturados en la ejecución móvil: `outcome_details, follow_up_actions, visit_location, confirmation_status, next_visit_date, next_visit_start_time, next_visit_end_time, execution_date, data_policy, witness_type/identification/name/phone_number/email`. `visit_type_id`/`visit_purpose_id`/`subdetails_master_id` son NOT NULL (FK obligatorias). |
| `ClientVisitAttachments` | `public.client_visit_attachments` | `belongsTo ClientVisits`, `onDelete('cascade')` desde `client_visits` | `file` es `binary`/bytea; `signature bool` distingue foto normal (con watermark) de firma (sin watermark) |
| `ExtraDataClientVisit` | `public.extra_data_client_visits` | `belongsTo DynamicFormField`, `belongsTo ClientVisits`, `belongsTo User`(created_by/updated_by) | `value_field` es `text` (todos los tipos de campo, incl. `switch`/`multiselect`, se serializan a string: `"true"`/`"false"`, o JSON stringificado para arrays) |
| `DynamicFormMaster` | `public.dynamic_form_masters` | `belongsTo Company`, `belongsToMany DetailsMaster` (pivote `dynamic_form_master_type_visits`, alias `visitTypes`), `hasMany DynamicFormField` (alias `fields`) | `code` + `company_id` semi-único (ver `DynamicFormMasterValidate`); `capture_staff_information` bool clave para el paso de firma en AMI |
| `DynamicFormField` | `public.dynamic_form_fields` | `belongsTo DynamicFormMaster` | `field_type` ∈ {text, number, select, multiselect, switch, checkbox, radio, date} (enum solo por convención de frontend, columna es `string`); `value_options` es `text` JSON `[{"value":"...","key":"..."}]` para select/multiselect/checkbox/radio; `default_value` string libre (interpretado según `field_type` en frontend) |
| `DynamicFormMasterTypeVisit` | `public.dynamic_form_master_type_visits` | `belongsTo DynamicFormMaster`, `belongsTo DetailsMaster`(detail_master_id) | Tabla pivote; en la práctica 1 tipo de visita → máx 1 maestro (por la Rule), aunque el esquema permite N:M |
| `DetailsMaster` (`public.details_masters`) | — | `belongsTo Master`(master_id) | El maestro global `code='MTGR-003'` (`master_id` visto en esta BD = 71, `company_id=-1`) es el catálogo real de "Tipo de Visita"; NO confundir con `mobile.visit_types` (otro dominio) |

Tablas locales SQLite (AMI, mismo nombre que backend salvo `client_visits` que en AMI tiene columnas extra
`remote_id`, `sent`, `*_name` desnormalizados, `identification_number`, `contract_account`, `client_commune_name`):
`client_visits`, `client_visit_attachments`, `extra_data_client_visits`, `dynamic_form_masters`,
`dynamic_form_fields`, `dynamic_form_master_type_visits`. Todas se pueblan en el import (`ImportData.vue`,
función `commercialAdvisorVisits`) y se vacían (las relacionadas a la visita puntual) tras un envío exitoso
(`SendData.vue::cleanupLocalVisit`) — **excepto** el catálogo `dynamic_form_masters/_fields/_master_type_visits`,
que NO se limpia automáticamente en cada import (`INSERT OR REPLACE` por id, sin `DELETE` previo) → si un
maestro se elimina en AIO, su copia local queda huérfana hasta que otro maestro reutilice el mismo id (no
observado como bug bloqueante, solo dead cache local).

## Frontend

### AIO web (config del formulario dinámico por tipo de visita)
| Vista (.vue) | Servicio TS | Notas técnicas |
|---|---|---|
| `src/pages/settings/masters/index.vue` | — | `definePage({subject:'/settings/masters'})`; tab `dynamicFormMasters` con `subject:'/settings/dynamic-form-masters'` |
| `DynamicFormMastersTable.vue` (`views/pages/settings/dynamic-form-masters/`) | `DynamicFormMastersService` | Tabla estándar `DataTable` sobre `custom-get-all` |
| `FormMaster.vue` (wizard 2 pasos) | `DynamicFormMastersService`, `DynamicFormFieldsService`, `DetailsMastersService` | Paso 1: datos del maestro + `visit_types` (multiselect, opciones = `detailsMastersService.getDetailNameByCode('MTGR-003', -1, includeIds)` — recarga incluyendo los ids ya seleccionados para edición). Paso 2: tabla anidada de `DynamicFormField` (`fixed-filters:{dynamic_form_master_id:idUse}`) — permite "field_type" (select con 8 opciones), `value_options` (textarea JSON validado con `ruleValueOptions`, exige array de `{value,key}`), `default_value` (validado según `field_type` con `ruleDefaultValue`). Solo muestra `value_options` (`hidden=false`) si `field_type` ∈ {select, multiselect, checkbox, radio}. |
| `DynamicFormMastersService.ts` / `DynamicFormFieldsService.ts` | — | `getAll` usa `custom-get-all` (soporta filtro `visit_types`); `store`/`update` usan `upsert`/`upsert/{id}` (no el `store`/`update` estándar) |

### AMI (ejecución de la visita)
| Vista (.vue) | Servicio TS | Notas técnicas |
|---|---|---|
| `ClientVisitsPage.vue` (ruta `/respel/client-contacts`) | — | Wrapper simple con `MainLayout`, delega todo a `ClientVisitFormComponent` |
| `ClientVisitFormComponent.vue` | `CommercialAdvisorVisitsService` (local), `CommercialAdvisorVisitsApi` (remoto), `ClientVisitAttachmentsService`, `ExtraDataClientVisitsService` | Lista tarjetas de visitas locales (`loadLocalVisits`) con buscador; al abrir una (`openVisit`) precarga `form` + adjuntos existentes + fotos (para reintentos); `save()` valida `outcome_details` obligatorio, resuelve geolocalización (Capacitor → browser fallback → vacío), y si NO requiere reprogramar hace `commercialAdvisorVisitsService.updateVisit(...)` (LOCAL) + `handleAttachments` (LOCAL) + `extraDataClientVisitsService.storeCustom(...)` (LOCAL) — el registro queda `confirmation_status='Procesada'` en SQLite, **NO se envía al backend aún** (eso lo hace `SendData.vue` en un paso posterior). Si SÍ requiere reprogramar, en cambio llama de una vez al backend real (`reprogramVisitOnServer`) y borra el local inmediatamente. |
| `FormDynamicComponent.vue` | `DynamicFormMastersService` (local), `DynamicFormFieldsService` (local), `ExtraDataClientVisitsService` (local) | **Mecanismo de resolución del form dinámico**: `initForm()` toma `props.visit.visit_type_id` → `dynamicFormMastersService.loadLocal(companyId, visitTypeId)` (JOIN local `dynamic_form_masters` × `dynamic_form_master_type_visits` por `detail_master_id=visitTypeId`) → si hay 1 resultado, `dynamicFormFieldsService.loadLocal(master.id)` trae sus campos → si la visita YA tenía `extra_data_client_visits` local (reintento), los precarga por `dynamic_form_field_id`; si no, aplica `default_value` por `field_type`. Renderiza switch/case por `field_type` (text/number/date/select/multiselect/switch/checkbox/radio) con componentes estándar Ionic. Expone `formDta()` (mapa `{[fieldId]: {value, id}}`, serializando switch/multiselect/checkbox a JSON string) y `captureStaffInformation` (computed de `form.capture_staff_information`) al padre. |
| `ClientVisitSignatureForm.vue` | — (usa `useFunctionClientVisit` localStorage) | Solo se muestra si `captureStaffInformation===true`. Checkbox "Autoriza tratamiento de datos" (si NO se marca, pide confirmación "¿continuar sin autorización?" y permite guardar SIN testigo/firma); si se marca, exige tipo de testigo + identificación + nombre + teléfono + email + **firma** (canvas `SignaturePadComponent`, obligatoria solo en esa rama). |
| `SendData.vue` (ruta `/respel/send-data`) | `CommercialAdvisorVisitsService`, `ClientVisitAttachmentsService`, `ExtraDataClientVisitsService`, `CommercialAdvisorVisitsApi` | Card "Visitas Comerciales" lista pendientes (`getToSend`: `sent IS NULL OR 0` + `confirmation_status IN ('Procesada','Reprogramada')`). `sendClientVisits()`: por cada visita, arma `attachments[]` (adjuntos locales en data-URL) + `extradata[]` (extra_data local) y hace **1 POST** `store-visit/{remote_id}` (padre+adjuntos+extradata en el mismo body/transacción del backend) → si `success`, `cleanupLocalVisit` (borra adjuntos, visita y extradata locales, en ese orden). |
| `useFunctionClientVisit.ts` | — | `getCurrentClientVisitData`/`setCurrentClientVisitData` (localStorage, estado compartido entre `ClientVisitFormComponent` y `ClientVisitSignatureForm`/`FormDynamicComponent` sin prop-drilling); `getClientVisitPhotos`/`deleteClientVisitPhotos` (evidencias fotográficas en filesystem+localStorage) |
| `ImportData.vue::commercialAdvisorVisits` | `CommercialAdvisorVisitsApi`, `CommercialAdvisorVisitsService`, `DynamicFormMastersService`, `DynamicFormFieldsService`, `DynamicFormMasterTypeVisitsService` | Import: bloquea si hay pendientes sin enviar; borra local de la compañía; trae visitas del día (`get-all-visits-to-mobile`) + **TODOS** los maestros/campos de la compañía con `has_visit_types&&has_fields` (`getAllForm`+`getAllFields` por maestro) — el filtrado por tipo específico ocurre solo al ABRIR una visita (`FormDynamicComponent`), no en el import. |

## Cadena TIPO DE VISITA → FORMULARIO DINÁMICO → CAMPOS → EXTRADATA (mapa técnico, confirmado en vivo)
1. **AIO (config)**: en `/settings/masters` → tab "dynamicFormMasters" se crea un `DynamicFormMaster`
   (`company_id`, `module`, `code`, `name`, `capture_staff_information`) y se le asocian 1+ `visit_types`
   (`detail_master_id` del catálogo global MTGR-003) → `POST/PUT dynamic-form-masters/v0/upsert[/{id}]`
   (`CustomDynamicFormMasterService::storeOrUpdate` + `syncVisitTypes`). Luego, en el paso 2 del mismo wizard,
   se agregan `DynamicFormField` (texto/número/fecha/select/multiselect/switch/checkbox/radio, con
   `value_options` JSON para los de opciones) → `POST dynamic-form-fields/v0/store`.
2. **AMI (import)**: al importar "Visitas Clientes", se descargan TODAS las visitas pendientes del asesor
   para hoy (`get-all-visits-to-mobile`, cada fila trae su `visit_type_id`) y, por separado, TODOS los
   `dynamic_form_masters` de la compañía con tipos+campos (`custom-get-all` con `has_visit_types`,
   `has_fields`) junto a sus campos (`dynamic-form-fields/v0/get-all` por maestro) — todo cacheado en SQLite.
3. **AMI (apertura de la visita)**: `FormDynamicComponent.initForm()` hace el JOIN LOCAL
   `dynamic_form_masters ⨝ dynamic_form_master_type_visits WHERE detail_master_id = visit.visit_type_id` →
   resuelve el (a lo sumo 1) maestro aplicable → carga sus campos → renderiza el formulario específico de
   ESE tipo de visita (validado en vivo: Tipo A → 3 campos text/number/select + paso de firma; Tipo B → 3
   campos text/switch/date, sin firma).
4. **AMI (guardado local)**: los valores capturados se acumulan en `extra_data_client_visits` LOCAL
   (`dynamic_form_field_id`, `client_visit_id`, `value_field` serializado según tipo).
5. **AMI (envío)**: `SendData.vue` empaqueta esa extradata local en el array `extradata[]` del POST
   `store-visit/{id}`, que el backend inserta 1:1 en `public.extra_data_client_visits` (confirmado en BD:
   5 filas para 2 visitas de prueba, con los `dynamic_form_field_id` correctos por tipo).

## Ciclo real ejecutado en vivo (con 2 tipos de visita distintos, autorización estándar de esta skill)

**Prerequisitos sembrados en Postgres** (company_id=$AIO_COMPANY_ID, todo con prefijo/nombre `PRUEBA-EXPLORACION-20260813`,
reutilizando SOLO catálogos/registros preexistentes de forma READ-ONLY: cliente `374285` "MARTHA L. ALGARRA .",
`visit_purpose_id=1053` "Actualización de datos", `subdetails_master_id=227` "Información validada"):
- 2 `details_masters` NUEVOS bajo el maestro global `MTGR-003` (`master_id=71`): id=1710
  "PRUEBA-EXPLORACION-TIPO-A", id=1711 "PRUEBA-EXPLORACION-TIPO-B".
- 2 `dynamic_form_masters` NUEVOS (company $AIO_COMPANY_ID): id=5 "PRUEBA-EXPLORACION Formulario A"
  (`capture_staff_information=true`), id=6 "...Formulario B" (`capture_staff_information=false`).
- 6 `dynamic_form_fields`: maestro 5 → `Observacion tecnica PRUEBA-A`(text), `Numero de equipos
  revisados`(number), `Estado del equipo`(select, opciones Bueno/Regular/Malo); maestro 6 → `Comentario
  comercial PRUEBA-B`(text), `Interesado en renovar contrato`(switch), `Fecha estimada de cierre`(date).
- 2 `dynamic_form_master_type_visits`: 5↔1710, 6↔1711 (confirmó la regla de unicidad sin conflicto, al ser
  tipos nuevos).
- 2 `client_visits` NUEVOS (ids 5771/5772), `advisor_id=1` (usuario de prueba), `visit_date=hoy`,
  `confirmation_status='Pendiente'`, uno por cada tipo/maestro de prueba.

**Ejecutado en AMI (navegador, sesión real, empresa $AIO_COMPANY_NAME)**:
1. Login + selección de empresa (flujo documentado en `learnings.md`, sin novedades).
2. `Green → Importar Datos → Visitas Clientes`: import exitoso ("Visitas comerciales importadas
   correctamente"); red confirmada: `get-all-visits-to-mobile` (2 filas), `dynamic-form-masters/custom-get-all`
   (2 maestros, filtro `has_visit_types&&has_fields`), `dynamic-form-fields/get-all` ×2 (uno por maestro).
3. `Green → client-contacts` (Visitas Clientes): 2 tarjetas visibles con Tipo A/B correctos. Se abrió cada
   una y se confirmó render dinámico DISTINTO:
   - **Tipo A** (id 5771): 3 campos (text/number/select) + descripción del maestro visible + botón
     "Siguiente" (en vez de "Guardar", porque `capture_staff_information=true`) → abrió modal de Firma
     (checkbox de autorización de datos + campos de testigo condicionales + canvas de firma). Se guardó
     SIN marcar la autorización (rama simplificada: alert de confirmación "¿continuar sin autorización?" →
     "SÍ" → guarda sin testigo/firma, validado por código en `ClientVisitSignatureForm.vue::onSave`).
   - **Tipo B** (id 5772): 3 campos DIFERENTES (text/switch/date) + botón "Guardar" directo (sin paso de
     firma, `capture_staff_information=false`).
   - Ambas visitas quedaron LOCALMENTE en `confirmation_status='Procesada'`.
4. `Green → Enviar Datos → Visitas Comerciales` (2 pendientes): 1 click → **2 POST reales**
   `client-visits/v0/store-visit/5771` y `/5772`, ambos `200 {"status":"success"}`. Confirmado en BD backend:
   `client_visits.confirmation_status='Procesada'` + `outcome_details`/`execution_date`/`visit_location`
   (POINT capturado por geolocalización del navegador) correctos; **5 filas en
   `extra_data_client_visits`** con el `dynamic_form_field_id` y `value_field` correctos por tipo (ej.
   `value_field='bueno'` para el select, `'true'` para el switch). 0 `client_visit_attachments` (no se
   adjuntó archivo/foto en esta prueba, por no disponer de herramienta de upload de archivos en el set MCP;
   el mecanismo de adjuntos+watermark quedó documentado por código, no re-validado en vivo — ya se validó
   igual en `ami-vehiclecontrol.md` con el mismo `ImageWatermarkService`).
   Confirmado por `browser_evaluate` (import de `DatabaseService.ts` real) que la tabla local
   `client_visits` quedó en `[]` tras el envío (borrado correcto por `cleanupLocalVisit`).

**Limpieza ejecutada y verificada** (0 residuos):
| Tabla | ids | Estado |
|---|---|---|
| `public.extra_data_client_visits` | 7890–7894 | Borrados |
| `public.client_visit_attachments` | (ninguno creado) | — |
| `public.client_visits` | 5771, 5772 | Borrados |
| `public.dynamic_form_master_type_visits` | (pivote 5↔1710, 6↔1711) | Borrados |
| `public.dynamic_form_fields` | 55–60 | Borrados |
| `public.dynamic_form_masters` | 5, 6 | Borrados |
| `public.details_masters` | 1710, 1711 | Borrados |
| SQLite local AMI | `dynamic_form_masters`/`_fields`/`_master_type_visits` ids 5/6 (cache huérfana que dejó el import) | Borrados manualmente vía `browser_evaluate` (no se limpian solos, ver nota en "Modelos/Tablas") |

Verificado por SQL: `client_visits` de company $AIO_COMPANY_ID volvió a **4781** filas (mismo conteo que antes de la
prueba); 0 filas en las 7 tablas de prueba. El cliente real `374285` (usado como FK, solo lectura) no fue
modificado.

## Bloqueos (bugs que impidieron continuar)
Ninguno. El único límite fue de HERRAMIENTA (no de la app): no había una herramienta MCP dedicada de
"subir archivo" en el set disponible en esta sesión, por lo que no se ejercitó el adjunto de documento
(`SingleAttachmentComponent`) ni las evidencias fotográficas (`MultiEvidencesComponent`, requieren cámara) —
ambos mecanismos ya están documentados por código y su patrón (watermark, base64, `bytea`) coincide 1:1 con
lo ya validado EN VIVO en `ami-vehiclecontrol.md`.

## Comparación con el manual
No se ejecutó (la tarea pidió solo exploración técnica; no se indicó pipeline de manual/backend-logic-doc).

## Estado / próximos pasos
Módulo explorado y validado en vivo de punta a punta con **2 tipos de visita distintos** (confirmando la
cadena AIO↔AMI del formulario dinámico), incluyendo import → ejecución (2 variantes de UX según
`capture_staff_information`) → envío real → verificación en BD → limpieza total. Pendiente opcional (no
bloqueante): repetir con adjunto/evidencia real si en una futura sesión se dispone de herramienta de subida
de archivos en el MCP.
