# AMI (móvil) → Prestación de Servicio (módulo "CPS")

> **Importado, sin verificar.** Viene de la exploracion que hizo un companero del equipo entre
> el 2026-08-11 y el 2026-09-11; el cerebro lo absorbio el 2026-09-14 sin contrastarlo contra el
> codigo actual. Sirve como punto de partida, **no como verdad**: los repos se movieron desde
> entonces. Al usarlo en un ticket, verificar lo que se vaya a tocar y pasar el estado a
> `explorado`. Los identificadores de cliente y el usuario de prueba estan sustituidos por su
> variable de `secrets.env`.

Estado: **explorado por código + validado en vivo (AIO web + AMI + backend) + bugs corregidos** (HU
TI-PR-0005-F02 / móvil 10709) — actualizado: 2026-08-25. Ver **"Validación E2E AIO+AMI 2026-08-24"** al
final (sesión 2026-08-25): ciclo completo Programar (AIO web) → Importar → Ejecutar (simulado) → Enviar →
mensajes de sync (total/parcial/ninguna) → token vencido, **TODO PASA**, incluidos los **2 bugs de token
vencido de la ronda anterior (2026-08-24), confirmados CORREGIDOS** (el guard `onBeforeRouteLeave` de
`SendCPSData.vue`/`ImportCPSData.vue` ya deja pasar la navegación a `/logout` aunque `loading.value` sea
`true`). Ver "Stress test + exploración funcional 2026-08-24 (1000 registros)" más abajo para el resto
(import filtrado por company/usuario/día, rendimiento con 1000 registros, scroll infinito, buscador, mapa
con 1000 puntos, Finalizada vs Pendiente, bloqueo de import con pendientes, menú) **PASA**. Ver también
"Validación en vivo 2026-08-21 (HU 10709)" más abajo: 3 bugs + 1 riesgo, **TODOS corregidos** (2026-08-21):
1. **Menú** (no era backend-driven para labels): se agregó el ítem en el seeder local `Seeders.ts`
   (`newRecord`=/cps/formulario renombrado, `scheduled`=/cps/programadas) + migración local incremental
   `UpdateCpsMenuScheduled` para devices existentes + claves i18n `newRecord`/`scheduled`. El backend ya
   devuelve /cps/programadas en `/menus/v0/mobile`. Requiere re-login.
2. **`ProgrammedProvisionsPage` no cargaba** (template con 2 raíces: `MainLayout`+`ModalComponent`): se movió
   el `ModalComponent` DENTRO de `MainLayout` (raíz única = `ion-page` → Ionic registra la página → dispara
   `onIonViewWillEnter`).
3. **Mapa "Ver ubicación" en blanco sin GPS**: `MapComponent.initMap()` aborta si no hay ni GPS ni props
   `latitude`/`longitude`. Fix: la vista ahora pasa `:latitude`/`:longitude` (coords programadas) en vez de
   solo `points-to-show`.
4. **Preselección de cliente**: el import de programadas ahora guarda también sus clientes en la tabla local
   `customers` (`customerService.storeMulti`), para que `DataUser` los encuentre y no pise la preselección.

Ronda posterior de ajustes de UX/UI (mismo día, ver "Revalidación en vivo 2026-08-21 — Ronda 2 (UX de la
card + ruta `/ejecutar` + cliente solo lectura)" al final): título "PRESTACIÓN ID" + contador "Por
procesar" + labels en negrita, sin badge de estado ni botón "Ejecutar" visible (todo el cuerpo de la card
es clickeable); ruta dedicada `/cps/programadas/ejecutar` que mantiene "Programadas" resaltado en el menú
(no "Nueva"); paso Cliente del wizard ahora en **solo lectura** cuando la ejecución viene de una
programada (sin buscador, nota explícita, card no seleccionable). **Los 5 puntos de esta ronda PASAN.**

Repo AMI: `app-movil`. Backend: `aio-backend` (`mobile.provision_services`, `store-mobile-data`).
**El módulo vigente es `cps/`** (commits 10387/10167 "Optimización del proceso de importación y envío
de datos – Módulo de Prestación de Servicio"), NO el legado `src/views/pages/modules/respel/service-provision/`.

## Trampa de nombres (IMPORTANTE)
- **`cps/` = Prestación de Servicio de `mobile.provision_services`** (el de la HU). Consume `store-mobile-data`.
- `cps/ServiceProvisionPage.vue` (ruta line 171 del router) usa `ServiceRequest` (solicitudes Respel) —
  es OTRO dominio ("Prestación de Servicio Directo"), NO confundir con `provision_services`.
- El módulo legado `respel/service-provision/**` comparte sub-componentes de formulario reutilizados por cps
  (`WasteCollected.vue`, etc.) pero el flujo activo es el de `cps/formulario/`.

## Rutas (app-movil `src/router/index.ts`) + menú
| Ruta | Componente | Rol |
|---|---|---|
| `/cps/formulario` | `cps/formulario/FormatoCPSPage.vue` | "Formulario" (captura/ejecución NUEVA) → **HU: renombrar a "Nueva"** |
| `/cps/importar-datos` | `cps/ImportCPSData.vue` | Importar maestros + clientes → **HU: agrupar "Datos Generales" + card "Prestaciones Programadas"** |
| `/cps/enviar-datos` | `cps/SendCPSData.vue` | Enviar lote (`store-mobile-data`) |

- **El menú es backend-driven**: `SideBarMenu.vue` lee `menus` del usuario y hace `router.push(subMenu.url)`.
  Los labels/urls salen de `aio-backend/database/initialData/menus/mobile.json`, módulo
  `"name_module": "Prestación de Servicio"` → entradas "Formulario" (`/cps/formulario`, position 1),
  "Importar datos" (position 2), "Enviar datos" (position 3).
  - **HU rename** "Formulario"→"Nueva": cambiar `name` en `mobile.json` (+ aplicar a BDs existentes: es `initialData`, solo afecta seeds nuevos → hace falta migración/seeder o update manual del `menus`).
  - **HU nuevo menú "Programadas"**: nueva entrada en `mobile.json` (nueva `url`, p.ej. `/cps/programadas`, reordenar positions) + nueva ruta en `router/index.ts` + nueva vista.

## Flujo de EJECUCIÓN (a reusar) — `cps/formulario/FormatoCPSPage.vue`
- Wizard de 6 slides: `DataDriver`(vehículo) → `DataUser`(cliente) → `DataService` → `DataEvidence` →
  `DataObservations` → `DataAutho`.
- Todo el estado vive en localStorage (`getLocalProvisionServiceData` / `removeLocalProvisionServiceData`,
  en `composables/useFunction`).
- `submitForm()`: `validateData()` → `insertProvisionService()` (INSERT SQLite local, id autoincrement) →
  `insertAttachments()` → `insertContainers()` → limpia el localStorage.
- `insertProvisionService` arma `IProvisionService` con `user_id = authUser.id` (usuario actual), sin
  `scheduled_at` ni `provision_service_id` (creación directa AMI).
- **Reuso para ejecutar una PROGRAMADA**: precargar el localStorage con cliente/dirección/coords de la
  programada + pedir vehículo → mismo wizard; y guardar en el registro local el **`provision_service_id`**
  (id del backend de la programada) para que el envío lo mande y el backend actualice esa fila in-place.

## Flujo de ENVÍO — `cps/SendCPSData.vue` + `ProvisionServiceApi.storeMobileData`
- `provisionServiceService.getAllOnCascade({user_id, company_id, pending})` arma `IProvisionServiceToSend[]`
  (pending = `sync_date IS NULL`). Lotes: `chunkBySize` (máx 5 prestaciones / 5 MB por request, evidencias base64).
- `storeMobileData(batch)` → `POST /provision-services/v0/store-mobile-data` → devuelve `processedIds`
  (los `id` LOCALES que el backend procesó, echo) → `deleteOnCascade(id)` local + filtra `pendingData` por `id`.

## ⚠️ CONTRATO CRÍTICO: `id` local vs `provision_service_id` (backend) — bug latente cazado
- `IProvisionServiceToSend.id` = **id LOCAL SQLite** (autoincrement del móvil). Se usa solo como **eco**:
  el backend lo devuelve en `processedIds` y el móvil borra el registro local por él.
- El id REAL del backend es un campo aparte: **`provision_service_id`** (ya existe en el modelo local
  `IProvisionService` y como columna en la tabla SQLite `provision_services` — ver
  `ProvisionServiceService.updateProvisionService`, `SET provision_service_id = ...`). Ya lo usa `sync-provision/{provision_service_id}`.
- **Históricamente** el backend `resolveProvisionService` deduplicaba **por atributos** (`updateOrCreate`,
  ignorando el id) — el id nunca buscaba una fila, por eso las colisiones eran inocuas.
- **HU 10709 (ejecución in-place de programada)**: el backend debe actualizar la MISMA fila. NO usar el `id`
  local para `find()` (un id local podría coincidir por azar con otra prestación del backend y machacarla).
  Se usa **`provision_service_id`** en el payload (solo presente en las programadas). Backend ya ajustado:
  `resolveProvisionService` hace `find($data['provision_service_id'])` → update in-place; si no viene, crea (dedup por atributos, comportamiento AMI-created).
- **Pendiente Part B (móvil)**: `IProvisionServiceToSend` NO incluye hoy `provision_service_id`; hay que
  añadirlo y que `getAllOnCascade` lo mapee desde `provision.provision_service_id` (null para AMI-created).

## Flujo de IMPORTACIÓN — `cps/ImportCPSData.vue` (a extender)
- UI propia (inline `ion-card`/`ion-list`), `tables: ITableImport[]` = `{label, isIntegrated, integrating, function}`.
  Orden actual: Vehículos, Tipos de Servicio, Contenedores, Tipos de Observación, Clientes.
- `integrateTable(i)` corre `tables[i].function`; `integrateAll` recorre todas. `isIntegrated` vía
  `integratedTable(db, tabla, {company_id})`.
- **Eficiente en memoria**: `importPaginatedData(label, fetchPage, storePage)` guarda página por página
  (no acumula todo en memoria); los `store*Service.storeMulti(records, 50|100)` insertan por lotes.
- Cada `integrate*` primero `delete...ByCompany` y luego pagina. `integrateVehicles` además baja parámetros
  `address_provision_service_companies`. Clientes es incremental (`lastSync` en `parameters`).

## Comparación con `modules/vehicleControl/ImportVehicleControlData.vue` (lo pidió el usuario)
- VehicleControl **reusa el componente compartido `components/ImportDataComponent/ImportDataComponent.vue`**
  (+ `SkeletonImportDataComponent`), pasando `:tables-import` y `:user-service`. CPS NO lo usa (UI propia).
- **VehicleControl YA implementa el patrón "card agrupada con título dinámico" que pide la HU**:
  `importInspectionsCombo(index)` / `incidentControlCombo(index)` tienen `fun = [{name, fn}, ...]`, y por cada
  sub-import hacen `tablesImport.value[index].label = item.name` (título cambia mientras importa) y al final
  `tablesImport.value[index].label = '<nombre del grupo>'` (vuelve al título del grupo). **Esto es exactamente
  el "Datos Generales" con título dinámico de la HU.**
- **Decisión de reuso Part B**: refactorizar `ImportCPSData.vue` para reusar `ImportDataComponent` + combo:
  card "Datos Generales" = combo [Vehículos, Tipos de Servicio, Contenedores, Tipos de Observación] con
  label dinámico; "Clientes" card propia; nueva card "Prestaciones Programadas" (llama `import-scheduled`).
- **Rendimiento**: el import de CPS ya es mejor que el de VehicleControl (VehicleControl acumula todos los
  vehículos en un array antes de insertar; CPS streamea por página). No degradar eso al refactorizar. Mejora
  posible (opcional): las 4 sub-importaciones del combo son independientes → podrían paralelizarse, pero
  secuencial es más seguro para SQLite/errores; mantener secuencial salvo evidencia de lentitud real.

## Ubicación / navegación (HU puntos 4 y 5)
- **"Ver ubicación" (2 puntos)**: reusar `components/MapComponent/MapComponent.vue` — ya acepta
  `pointsToShow: IGeolocationPointExtended[]` (con `description`/`color`) + toma la posición actual
  (`GeolocationService`). Sirve tal cual para "mi ubicación + punto programado".
- **"Cómo llegar" = Ruta+** (RESUELTO 2026-08-21, decisión del usuario: replicar cómo lo hace Ruta+):
  la app hermana **`rutamas-movil`** abre navegación con
  `src/services/navigation/ExternalNavigationService.ts` (singleton `externalNavigationService`), usando
  **`@capacitor/app-launcher`** (v8). Método `openRoute({provider, origin?, destination})`: en `hybrid`
  intenta la app nativa (`AppLauncher.canOpenUrl`→`openUrl`) y cae a web; en navegador abre `window.open`.
  Proveedores `NavigationProvider = 'google-maps' | 'waze'`, con URL nativa (Android intent
  `google.navigation`/`waze://`, iOS `comgooglemaps://`) y web (`google.com/maps/dir/?api=1...`,
  `waze.com/ul?...`). La UI (`MapPage.vue`) muestra un **action sheet** con Google Maps / Waze y llama
  `prepareWebWindow()` (pre-abre pestaña para el popup-blocker) + `openRoute(provider, routeRequest)`.
  Tipos en `src/modules/map/interfaces/IMapData.ts` (`IRouteOptions`, `IRouteLinks`, `NavigationProvider`)
  + `ICoords` en `src/modules/common/interfaces/ICoords.ts`.
  - **Part B (móvil)**: instalar `@capacitor/app-launcher` en `app-movil` (dependencia nativa → `cap sync`
    + rebuild nativo) y **portar** `ExternalNavigationService` + tipos (adaptando imports a la estructura de
    app-movil). En la card de "Programadas": botón "Cómo llegar" → action sheet Google Maps/Waze →
    `openRoute({provider, origin: posición actual, destination: coords programadas})`. La posición actual ya
    la da `GeolocationService`.

## i18n
- Textos vía `t()` de `@/utils/translate`. Antes de agregar "Datos Generales"/"Prestaciones Programadas"/etc.
  validar si ya existen claves (`serviceProvision`, `sendData`, `dataToSend`... ya están).

## Artefactos clave (rutas)
- API remota: `src/services/api/ProvisionServiceApi.ts` (`storeMobileData`, `syncProvisionService`,
  `sendProvisionData`, `storeProvisionService`). **HU: agregar `importScheduled()`** (`GET import-scheduled`).
- Local SQLite: `src/services/app/ProvisionServiceService.ts` (+ `DetailProvisionService`, `ProvisionAttachmentService`).
- Interfaces: `IProvisionService` (local, tiene `id` y `provision_service_id`), `IProvisionServiceToSend`
  (payload, solo `id` hoy), `IDetailProvision`, `IProvisionAttachment`.
- Migración local: `src/database/migrations/AddAddressToProvisionServiceTable.ts` (patrón para agregar
  columnas SQLite; **HU podría necesitar** columnas `scheduled_at`/`scheduled_location`/`provision_service_id`
  si no existen ya en el schema local — verificar en `Migrations.ts`).

## Validación en vivo 2026-08-21 (HU 10709)

Entorno: `app-movil` rama `feature/sergio-10709`, `http://localhost:8100` (Chromium vía Playwright MCP),
backend `http://localhost:8085`, BD `aio` local. Login `$AIO_TEST_EMAIL`, empresa $AIO_COMPANY_NAME
(`company_id=$AIO_COMPANY_ID`), endpoint móvil configurado como `1-1` → API LOCAL. Semilla usada: `mobile.provision_services.id=316234`
(cuenta 10559439, cliente `MARTHA L. ALGARRA .` con `service_provision=false`, dirección
`CL 100 # 15 - 20 (PRUEBA-10709)`, `scheduled_at=2026-08-21 14:00:00`, lat/lng `4.60971/-74.08175`).

### 1. Menú lateral tras login fresco — **FALLA**
El submenú de "Prestación de Servicio" sigue mostrando **"Formulario"** (no "Nueva") y **"Programadas" NO
aparece**, a pesar de que el backend responde correctamente:
- `GET /menus/v0/mobile/{idUser}/{companyId}` (`app/Http/Controllers/Modules/Settings/Menu/CustomMenuController.php`
  → `CustomMenuCaslService::mobileMenuUserCompany` → `MenuQueryBuilder::queryMobileMenuUserCompany`) SÍ devuelve
  `{"title":"Nueva","subject":"/cps/formulario"}` y `{"title":"Programadas","subject":"/cps/programadas"}`
  (verificado con `fetch` directo usando el token de la sesión). BD: `menus.id=6` ("Nueva") y `menus.id=499`
  ("Programadas") existen con permisos clonados correctos (`permissions.role_id=1` `read=true` para ambos).
- **Causa raíz**: el menú del móvil **no se pide en vivo al backend en cada login** para renderizar el
  sidebar — se guarda en una tabla LOCAL SQLite `menus` sembrada estáticamente por
  `app-movil/src/database/Seeders.ts` (`menuSeeder`, INSERT fijo con `('form','/cps/formulario',...,6)`,
  sin fila para `/cps/programadas`). `useCompanySwitch.ts::rebuildUserMenus` → `insertModuleMenus` busca
  cada `child.to.path` de la respuesta del backend en esa tabla local vía `MenuService.getMenuByUrl(url)`
  (`SELECT * FROM menus WHERE url = ?`); si no hay fila (`/cps/programadas`), hace `continue` **en silencio**
  y el menú nunca se inserta en `user_menus` (la tabla que sí lee el sidebar). Por eso "Programadas" no
  aparece y "Formulario" conserva su título local viejo (columna `title` de esa tabla, ligada a la clave i18n
  `form`), sin importar que el backend ya diga "Nueva".
- **Fix pendiente (no aplicado, solo lectura)**: `Seeders.ts` necesita una migración de datos (no solo el
  seed inicial, que no se re-ejecuta en instalaciones existentes) que inserte la fila
  `('programadas','/cps/programadas',...,6)` y actualice el `title` de `('form','/cps/formulario',...,6)`
  a algo como `'new'`. Sin esto, el rename/alta de menú del backend nunca llega a un dispositivo con la app
  ya instalada.

### 2. Importar datos — **PASA**
- Card **"Datos Generales"**: dispara en orden `GET /vehicles/v0/get-all` (4 páginas, 50/pág.) →
  `GET /types-services/v0/get-all` → `GET /containers/v0/get-all` → `GET /types-observations/v0/get-all`
  (confirmado por orden de las requests en red), exactamente el combo de
  `ImportCPSData.vue::integrateDataGeneral`. El título dinámico (Vehículos→Tipos de Servicio→Contenedores→
  Tipos de Observación→"Datos Generales") **no se pudo capturar visualmente**: contra el backend local el
  combo completo tarda <1s, más rápido que cualquier snapshot/poll intentado (incl. polling cada 15ms desde
  `browser_evaluate` durante 6s). No es un bug: el código (`tables.value[index].label = step.name` antes de
  cada `await step.fn()`) es correcto y el efecto final (barra verde "completado") se confirma en cada
  corrida.
- Card **"Clientes"**: `GET /customers/v0/get-last-customers?...&service_provision=true&lastSync=...` → 200.
- Card **"Prestaciones Programadas"**: `GET /provision-services/v0/import-scheduled?company_id=$AIO_COMPANY_ID` → 200,
  devuelve exactamente el registro `id=316234` esperado (verificado leyendo el body completo). Tras
  importar, la fila queda en la tabla local SQLite `scheduled_provision_services` con todos los campos
  correctos (confirmado leyendo directo con `jeep-sqlite.query`).

### 3. Pantalla "Programadas" (`/cps/programadas`) — **FALLA (bug confirmado y causa raíz identificada)**
Con los datos correctamente importados y verificados en SQLite local, la pantalla mostraba
**"No hay prestaciones programadas."** tanto tras un reload completo como tras una navegación SPA real
(`router.push('/cps/programadas')` desde otra página ya cargada) — reproducido 3 veces.
- **Causa raíz (confirmada por inspección del árbol de componentes Vue en vivo)**: `onIonViewWillEnter`
  (que dispara `initData_()`) **nunca se ejecuta** para `ProgrammedProvisionsPage.vue`. Se verificó
  inspeccionando `setupState` del componente montado: `databaseServiceLocal` y
  `scheduledProvisionServiceService` quedan `undefined` (nunca se les asigna), es decir el cuerpo del
  callback jamás corre.
  - El motivo técnico más probable: el **template de `ProgrammedProvisionsPage.vue` tiene DOS nodos raíz**
    (`<MainLayout>...</MainLayout>` y `<ModalComponent>...</ModalComponent>` como hermanos, líneas 1-83),
    por lo que Vue lo renderiza como **fragmento**. La consola muestra el warning:
    `[Vue warn]: Extraneous non-props attributes (registerIonPage) were passed to component but could not
    be automatically inherited because component renders fragment or text or teleport root nodes` en
    `<ProgrammedProvisionsPage ... registerIonPage=fn<registerIonPage>>`. `registerIonPage` es el mecanismo
    de `@ionic/vue` que conecta la página al sistema de transiciones de `IonRouterOutlet`; si no puede
    adjuntarse (porque no hay un único elemento raíz), Ionic nunca dispara `ionViewWillEnter` para esa
    página, y por tanto `onIonViewWillEnter` (composable de `@ionic/vue`) nunca corre.
  - Comparación de control: `/cps/importar-datos` (un solo root, sin `ModalComponent` hermano) sí carga
    bien sus datos (`isIntegrated`) tanto en reload como en SPA nav — confirma que el problema es específico
    de este archivo, no un problema general de timing de SQLite/Ionic.
  - **Workaround usado solo para poder seguir validando 4/5/6** (no es una corrección de código, es
    invocación manual vía `browser_evaluate` de la misma función `initData_()` ya expuesta en
    `setupState`, exactamente lo que `onIonViewWillEnter` debería haber llamado): con eso la card renderiza
    con TODOS los campos correctos (Cuenta contrato `10559439`, Cliente `MARTHA L. ALGARRA .`, Dirección
    con "PRUEBA-10709", Fecha `2026-08-21 14:00:00`, Coordenadas `4.60971, -74.08175`), confirmando que el
    problema es 100% de lifecycle/render, no de datos ni de query.
  - **Fix sugerido (no aplicado)**: unificar la plantilla a un solo nodo raíz, p. ej. moviendo
    `<ModalComponent>` dentro del `<template v-slot:content>` de `MainLayout` o envolviendo ambos en un
    `<template>`/contenedor único, siguiendo el patrón de otras páginas `cps/*` que sí combinan mapa +
    layout sin romper el root único.

### 4. "Ver ubicación" — **FALLA (bug confirmado, distinto del punto 3)**
Con la card ya renderizada (ver workaround del punto 3), se pulsó "Ver ubicación": abre el modal ("Mapa")
pero el mapa queda **en blanco**, sin marcadores ni tiles.
- **Causa raíz**: `MapComponent.vue::initMap()` hace `await getCurrentPosition()` y, si falla (aquí falla
  porque el navegador de prueba no tiene geolocalización: `CapacitorException: Not implemented on web.` /
  `GeolocationWeb.requestPermissions`), calcula `latString/longString` como
  `currentPosition.value?.latitude ?? props.latitude` — pero `ProgrammedProvisionsPage.vue::viewLocation()`
  invoca `<MapComponent :points-to-show="pointsToShow" />` **sin pasar `latitude`/`longitude`** como props.
  Con ambos `undefined`, `initMap()` hace `if (!latString || !longString) return;` **abortando la creación
  del mapa por completo** (`map.value` nunca se asigna) → `showPoint()` también aborta (`if (!map.value ...)
  return`) → nada se dibuja, ni siquiera el punto programado.
- Esto no es exclusivo del entorno de prueba: en un dispositivo real con GPS apagado, sin señal, o con el
  permiso de ubicación denegado (el propio diálogo "Permiso de ubicación en segundo plano" de la app se
  puede rechazar, como se hizo aquí), el mapa de "Ver ubicación" **también quedaría en blanco**, incluso
  aunque el punto programado sí tenga coordenadas válidas.
- **Fix sugerido (no aplicado)**: si `getCurrentPosition()` falla y no vienen `props.latitude/longitude`,
  centrar en el primer punto de `pointsToShow` (si existe) en vez de abortar.

### 5. "Cómo llegar" — **PASA**
Abre el action sheet "Cómo llegar" con botones **Google Maps** y **Waze** (+ "Cancelar"). Al pulsar cada
uno, se abrió una pestaña nueva con la URL esperada (verificado con `browser_tabs`):
- Google Maps: `https://www.google.com/maps/dir/?api=1&destination=4.60971%2C-74.08175&travelmode=driving`
- Waze: `https://www.waze.com/ul?ll=4.60971%2C-74.08175&navigate=yes&utm_source=ami_movil`
Ningún `origin` en la URL (esperado: falló `geolocationService.getCurrentPosition()` en este navegador de
prueba, igual que en el punto 4; `ExternalNavigationService.openRoute` maneja bien ese caso y construye la
URL solo con destino).

### 6. "Ejecutar" → formulario de captura — **PARCIAL: paso Vehículo PASA, preselección de Cliente FALLA**
No se pudo pulsar el botón "Ejecutar" real en un primer intento por el bug del punto 3 (la card no
renderizaba); se simuló el mismo contrato que usa `ProgrammedProvisionsPage.vue::execute()` (mismo
`localStorage` `provision-service`, mismo `router.push('/cps/formulario')`) y luego, tras resolver el punto
3 con el workaround, también se repitió apoyándose en la card real — mismo resultado:
- Paso **Vehículo** (`DataDriver.vue`): buscar por código y seleccionar funciona normal (probado con
  vehículo real `1112`/`ESK854`).
- Paso **Cliente** (`DataUser.vue`): el campo "Buscar cliente" **sí llega pre-rellenado** con la cuenta
  contrato `10559439` (`onMounted` lee `getLocalProvisionServiceData().customer` y fija
  `inputSearchCustomer`), pero **ninguna card de cliente se muestra** y la preselección se pierde: `MARTHA
  L. ALGARRA .` **no aparece en pantalla**.
  - **Causa raíz**: `execute()` en `ProgrammedProvisionsPage.vue` arma un cliente SINTÉTICO en memoria
    (`customerService.getCustomer(id) ?? {id, account_contract, name, address}`) cuando el cliente no está
    en la tabla local `customers` — y no lo está: el import de "Clientes" filtra por
    `service_provision=true`, y la cliente sembrada para esta prueba tiene `service_provision=false` (así
    vino en la respuesta de `import-scheduled`). Acto seguido, `DataUser.vue::onMounted` **vuelve a buscar**
    ese cliente en la tabla local (`CustomerService.searchCustomerByCompany`, 100% SQL local) usando el
    texto `"10559439"`; como no hay ninguna fila local con esa cuenta, la búsqueda devuelve 0 resultados y
    `selectedCustomer.value = customers.value.length === 1 ? customers.value[0] : undefined` **pisa el
    valor precargado con `undefined`**. Si se intentara avanzar, `validateInput()` mostraría "No se ha
    encontrado un cliente." pese a que el flujo *sí* trae el cliente correcto desde la programada.
  - Esto es un problema de negocio real, no solo de este entorno de prueba: **cualquier cliente
    programado que no tenga `service_provision=true`** (el flag que decide si se importa a la tabla local)
    perderá su preselección al ejecutar, contradiciendo el punto 6 de la HU ("cliente preseleccionado").
  - **Fix sugerido (no aplicado)**: que `execute()` inserte (`customerService.insertCustomer`) el cliente
    sintético en la tabla local antes de navegar a `/cps/formulario` (igual que ya hace
    `DataUser.vue::selectCustomer` en el flujo manual), o que `DataUser.vue::onMounted` no vuelva a buscar
    por texto cuando ya viene un `customer` completo en el local storage.
- No se avanzó más allá de este paso (evidencia, observaciones, firma) para no seguir generando riesgo de
  clics accidentales (un clic mal dirigido en los íconos del footer del wizard disparó un **logout**
  accidental durante la prueba — reversible, solo requirió loguear de nuevo; no se perdió ni corrompió
  ningún dato de negocio).

### Estado final de los datos de prueba
- **Backend**: `mobile.provision_services.id=316234` queda **intacto** (`sync=false`, `sync_date` NULL,
  `user_id=1`) — no se completó ningún envío real, así que la programada sigue sembrada. El usuario puede
  dejarla para una futura prueba o borrarla.
- **Local SQLite (navegador de prueba)**: quedó con vehículos/clientes/tipos importados y la programada
  `316234` en `scheduled_provision_services`. Es un perfil de Chromium de pruebas (Playwright), no
  producción ni un dispositivo real — no requiere limpieza.
- **Incidente propio durante la validación**: manipular directamente la conexión SQLite de `jeep-sqlite`
  vía `browser_evaluate` (para verificar filas sin pasar por la UI) dejó la BD local en un estado
  inconsistente ("no such table: vehicles"). Se resolvió borrando el `IndexedDB` (`jeepSqliteStore`) y
  `localStorage` de `localhost:8100` y repitiendo login + importación — 100% local al navegador de prueba,
  sin tocar Postgres ni otros entornos. Lección para próximas validaciones de este módulo: **no** abrir/
  cerrar conexiones jeep-sqlite manualmente en paralelo a la app; si se necesita inspeccionar SQLite en
  vivo, hacerlo a través de las funciones ya expuestas en `setupState` del componente (como se hizo después)
  en vez de tocar la conexión de bajo nivel.

## Revalidación en vivo 2026-08-21 (post-fix, HU 10709) — TODOS los puntos PASAN

Tras aplicarse las correcciones (ver resumen al inicio del archivo), se revalidó en vivo con storage
limpio (`IndexedDB`/`localStorage` de `localhost:8100` borrados) + login fresco (`$AIO_TEST_EMAIL`,
$AIO_COMPANY_NAME company $AIO_COMPANY_ID) + reimport completo. Mismo seed `mobile.provision_services.id=316234`.

1. **Menú tras login fresco — PASA.** Un solo padre "Prestación de Servicio" con "Nueva", "Programadas",
   "Importar Datos", "Enviar Datos" — cada uno **una sola vez**. Verificado también en BD local
   (`SELECT ... FROM user_menus um JOIN menus m ...WHERE m.id IN (6,7,8,9,10)`): exactamente 1 fila por
   `menu_id`, sin duplicados (antes de esta ronda de fixes se había detectado además, en un diagnóstico
   puntual, 1 fila duplicada de `sendData`/`menu_id=10` en `user_menus`; con `DeduplicateUserMenus` +
   `insertUserMenu` idempotente ya no aparece).
2. **Importar datos — PASA.** Igual que antes (combo Datos Generales → Clientes → Prestaciones
   Programadas, `import-scheduled?company_id=$AIO_COMPANY_ID` → 200 con el registro 316234). **Novedad confirmada**: el
   cliente 25 (MARTHA L. ALGARRA ., `service_provision=false`) ahora **SÍ queda en la tabla local
   `customers`** tras importar "Prestaciones Programadas" (antes no estaba, por venir excluida del import
   general de "Clientes"); verificado con `SELECT id,account_contract,name,address FROM customers WHERE
   id=25` justo después del import.
3. **Pantalla "Programadas" — PASA.** Navegando desde el menú real (SPA, sin workaround) la card carga de
   inmediato con los 5 campos exactos (cuenta 10559439, MARTHA L. ALGARRA ., dirección con "PRUEBA-10709",
   fecha 2026-08-21 14:00:00, coordenadas 4.60971,-74.08175). Repetido 2 veces (antes y después de abrir el
   mapa) con el mismo resultado correcto — el fix de raíz única (`ModalComponent` movido dentro de
   `MainLayout`) resolvió que `onIonViewWillEnter`/`initData_()` corran.
4. **Nueva UX de la card (clic en cuerpo vs. botón) — PASA.**
   - (a) Tocar el cuerpo de la card (fuera del botón "Ver ubicación", sobre cualquier dato o el hint
     "▷ EJECUTAR") navegó a `/cps/formulario` → paso "Información del Vehículo". Confirmado 2 veces.
   - (b) Tocar el botón pequeño "Ver ubicación" (outline, fuera del área clickeable de ejecución) **no**
     disparó la ejecución (URL se mantuvo en `/cps/programadas`) y abrió el modal del mapa.
5. **Mapa "Ver ubicación" + "Cómo llegar" — PASA.** El mapa ya renderiza tiles de OpenStreetMap y un
   marcador azul en el punto programado (antes quedaba en blanco). Dentro del modal, el botón "Cómo
   llegar" abre el action sheet con Google Maps/Waze; se pulsó cada uno y se confirmó, con `browser_tabs`,
   la pestaña nueva con la URL correcta:
   - Google Maps: `https://www.google.com/maps/dir/?api=1&destination=4.60971%2C-74.08175&travelmode=driving`
   - Waze: `https://www.waze.com/ul?ll=4.60971%2C-74.08175&navigate=yes&utm_source=ami_movil`
6. **Ejecutar (clic real en la card) — PASA, incl. preselección de cliente.** Tocando el cuerpo de la card
   real (sin simular localStorage a mano) se llegó al wizard: paso Vehículo (buscado y seleccionado
   `1112`) → paso Cliente, donde el buscador viene prellenado con "10559439" y **ahora sí se muestra la
   card completa de MARTHA L. ALGARRA .** (cuenta 10559439, zona URBANO, comuna 5, barrio CHUNIZA,
   dirección de perfil TV 3 BIS 87B SUR 16) — preselección confirmada, resuelto por guardar el cliente en
   local durante el import (punto 2). No se avanzó más allá de este paso (footer del wizard / evidencia con
   cámara) siguiendo la instrucción de no forzar clics de riesgo; `mobile.provision_services.id=316234`
   queda intacto (`sync=false`) en backend, sin envío real.

**Conclusión**: los 4 hallazgos de la ronda anterior (menú no backend-driven en el dispositivo, doble raíz
de template bloqueando `onIonViewWillEnter`, mapa en blanco sin fallback de coordenadas, preselección de
cliente perdida por no persistir localmente) quedaron **confirmados corregidos en vivo**, con evidencia de
UI + red + BD local. Estado del módulo: **explorado + validado + corregido**, sin bloqueos pendientes.

## Revalidación en vivo 2026-08-21 — Ronda 2 (UX de la card + ruta `/ejecutar` + cliente solo lectura)

Misma sesión, misma seed `mobile.provision_services.id=316234`. Storage limpio + login fresco + reimport
(Datos Generales, Clientes, Prestaciones Programadas) antes de validar. **Los 5 puntos PASAN.**

1. **UI de la card — PASA.** Confirmado por accesibilidad + captura visual: título **"Prestación ID:
   316234"** (renderizado en mayúsculas/negrita/color de acento por CSS), etiquetas **Cuenta contrato,
   Cliente, Dirección, Fecha programada, Coordenadas** en negrita y con texto visiblemente más grande que
   la ronda anterior, contador **"Por procesar: 1"** como subtítulo de la página. **Sin badge de estado**
   y **sin botón "Ejecutar"** en el árbol de accesibilidad — solo queda el botón pequeño outline "Ver
   ubicación".
2. **Buscador — PASA.** Escribir `10559439` (cuenta contrato) muestra la card; tras limpiar, escribir
   `MARTHA` (nombre) también la muestra.
3. **Ejecutar = clic en la card + menú en "Programadas" — PASA.** Tocar el cuerpo de la card navegó a
   **`/cps/programadas/ejecutar`** (antes era `/cps/formulario`) y abrió el wizard en "Información del
   Vehículo". Abriendo el menú lateral y leyendo las clases CSS de los `ion-item` (`document.
   querySelectorAll('ion-menu ion-item')`), el ítem **"Programadas" tiene la clase `selected`**; "Nueva"
   no la tiene — confirma que el menú resalta la ruta activa (`/ejecutar` sigue bajo el paraguas de
   "Programadas"), no "Nueva".
4. **Cliente solo lectura — PASA.** Tras seleccionar un vehículo (`1112`) se llega al paso "Información
   del Cliente": **no hay input "Buscar cliente"**; aparece el texto **"Cliente asignado a la prestación
   (solo lectura)."**; se muestra la card de MARTHA L. ALGARRA . con todos sus datos (cuenta 10559439,
   zona URBANO, comuna 5, barrio CHUNIZA, dirección de perfil TV 3 BIS 87B SUR 16). Se verificó que la
   card **no es seleccionable** (sin `onclick`, sin clase de "clickeable"; un clic sobre ella no cambia
   nada) y que el botón "Siguiente" del footer de esa card **sí avanza** al paso "Información del
   Servicio" con normalidad.
5. **Ver ubicación / Cómo llegar — PASA.** El mapa abre (mismo comportamiento que la ronda anterior).
   Dentro del modal, "Cómo llegar" abre el action sheet Google Maps/Waze; se confirmó con `browser_tabs`
   que ambas opciones resuelven al destino correcto `4.60971,-74.08175` (Google Maps esta vez resolvió
   también el origen por geolocalización disponible en esta corrida — `.../dir/4.6661632,-74.1605376/
   4.60971,-74.08175/...`; Waze: `.../live-map/directions?...&to=ll.4.60971%2C-74.08175`).

No se avanzó más allá del paso Servicio del wizard (sin forzar footer/evidencia/cámara). Backend
`mobile.provision_services.id=316234` verificado intacto al cierre (`sync=false`, `sync_date` NULL).
Nota de entorno: en esta corrida `browser_click` de Playwright reportó timeout (5s) en prácticamente
todas las interacciones aunque el clic sí se aplicaba (el estado de la UI avanzaba correctamente en el
snapshot siguiente) — se confirmó cada acción releyendo el snapshot tras el timeout en vez de reintentar
el click.

## Revalidación en vivo 2026-08-24 — Ronda 3 (loader, bloqueo por pendientes, botón "ver todas", popup)

Storage limpio + login fresco (`$AIO_TEST_EMAIL`, $AIO_COMPANY_NAME company $AIO_COMPANY_ID). Seeds de esta ronda: 2
programadas de HOY para `admin` (`mobile.provision_services.id=316236` "PRUEBA-A" y `id=316237`
"PRUEBA-B", ambas `customer_id=25` MARTHA, cuenta 10559439). **Los 4 puntos PASAN.**

1. **Loader en la importación — PASA.** `ImportCPSData.vue` ahora pasa `<MainLayout :loading="loading">`.
   Se confirmó por DOM (`#box-spinner` + `ion-backdrop` de `LoadingComponent.vue`, no `ion-loading`) que el
   overlay/spinner aparece y desaparece durante el import de una card (polling cada 20ms desde el mismo
   `click()` disparado por evaluate, sin espera de red de por medio: `t=20ms` aparece, `t=200ms`
   desaparece). Antes no se pasaba `:loading` a `MainLayout` y el spinner nunca se montaba.
2. **Bloquear import si hay pendientes por enviar — PASA.** Insertando manualmente (vía
   `import('/src/services/app/DatabaseService.ts')`, sin cerrar la conexión con `closeConnection()` para
   no romper otras instancias vivas de `DatabaseService` — ver nota de entorno abajo) una fila en
   `provision_services` local con `sync_date IS NULL` (pendiente), tocar cualquier card de "Importar
   Datos" dispara `ImportCPSData.vue::hasPendingToSend()` → `ProvisionServiceService.getTotal` y muestra
   el alert **"Advertencia / Datos Pendientes — Debe enviar la información finalizada antes de
   importar."**, sin disparar ninguna petición de red de import (confirmado con
   `browser_network_requests`). Tras el alert, se hizo `DELETE` de esa fila y se confirmó que el import
   vuelve a funcionar normal sin la alerta.
3. **Cómo llegar desde el popup del punto (Waze primero, luego Google Maps) — PASA.** El popup de un
   punto (dentro de "Ver ubicación" de una card) muestra `Prestación: <id>`, `Hora Programación: <hora>`,
   una línea `separator`, los datos (cuenta/cliente/dirección) y el botón azul **"Cómo llegar"** tras la
   línea. Se tocó primero **Waze**: abre pestaña a
   `https://www.waze.com/live-map/directions?navigate=yes&utm_source=ami_movil&to=ll.4.60971%2C-74.08175`
   (destino correcto); luego **Google Maps**:
   `https://www.google.com/maps/dir/?api=1&destination=4.60971%2C-74.08175&travelmode=driving`. **Sin
   errores nuevos de JS** en consola (los 3 errores presentes son los ya conocidos de
   `GeolocationWeb.requestPermissions: Not implemented on web`, capturados y logueados por el propio
   código, no relacionados con el clic). **No se pudo validar en navegador** la apertura de la app nativa
   de Waze/Google Maps (eso requiere un dispositivo real con Capacitor `AppLauncher`; en Chromium siempre
   cae al flujo web, como se esperaba).
4. **Botón "ver todas" (mapa, header) — PASA.** El botón tiene clase `map-all-btn` (`ion-button
   button-round button-has-icon-only`), con `getBoundingClientRect()` de ~77×36px. Se verificó con
   `document.elementFromPoint(x, y)` que las 4 zonas pedidas — centro, izquierda, arriba y la esquina
   inferior derecha (la única que funcionaba antes) — **todas** resuelven al mismo `ion-button.map-all-btn`
   (antes solo la esquina). Un clic real de Playwright (`page.locator('.map-all-btn').click()`) abrió el
   mapa con los **2 puntos** (PRUEBA-A y PRUEBA-B, visibles en el mapa en zonas distintas de Bogotá) y el
   header mostró **"2 puntos"**.
   - Al abrir un punto, el header cambió a **solo la hora** (`"8:00 a. m."`), no al formato
     `"distancia · hora"` mencionado. Revisando `ProgrammedProvisionsPage.vue::pointHeaderLabel()`: el
     código ya implementa exactamente ese formato condicional —
     `distance ? \`${distance} · ${time}\` : time` — pero `distance` depende de la ubicación ACTUAL del
     dispositivo (`loadCurrentLocation`/`GeolocationService.getCurrentPosition()`), que en este navegador
     de pruebas siempre falla (`Not implemented on web`, mismo error de los puntos 3/5 de rondas
     anteriores). El fallback a "solo hora" es el comportamiento **correcto y esperado** sin geolocalización
     real, no un bug — no se pudo ejercitar el caso "con distancia" por esta limitación del entorno (se
     necesitaría un dispositivo real o mockear `Geolocation` para verlo).
   - Al cerrar el popup (botón "×"), el header **volvió a "2 puntos"** correctamente.

Backend `mobile.provision_services.id=316236` y `316237` verificados **intactos** (`sync=false`) al
cierre — no se ejecutó ninguna de las 2 programadas.

**Nota de entorno (importante para próximas sesiones de este módulo)**: al simular datos pendientes vía
`browser_evaluate`, **no llamar `db.closeConnection()`** tras el `INSERT`/`DELETE` manual — eso desregistra
la conexión SQLite nombrada a nivel del plugin `@capacitor-community/sqlite` y rompe cualquier OTRA
instancia de `DatabaseService` que la app ya tenga viva (error observado:
`Open: No available connection for db_sqlite_appmovil` al disparar `hasPendingToSend`). Basta con
`new DatabaseService()` → `init()` → `executeQuery`/`runQuery` y dejar la conexión abierta (así es como el
resto de la app la usa); si hace falta partir de un estado limpio, recargar la página (full reload) en vez
de cerrar la conexión a mano.

## Complemento Ronda 3 — geolocalización simulada en el navegador (mismo día)

A petición del coordinador, se simuló una ubicación fija de dispositivo (**lat 4.63, lng -74.09**, Bogotá)
para validar los flujos que dependen de la posición actual, imposibles de ejercitar antes por
`CapacitorException: Not implemented on web.` en `GeolocationWeb.requestPermissions`.

- **Cómo se logró (técnica reutilizable para futuras sesiones)**: `GeolocationWeb` (`@capacitor/geolocation`
  web) es una clase plana (`new GeolocationWeb()`), no soporta parchear sus métodos directamente (el
  objeto exportado ignora asignaciones — probablemente envuelto por `registerPlugin`). Pero por código
  (`node_modules/@capacitor/geolocation/dist/esm/web.js`) sus métodos SÍ delegan a APIs reales del
  navegador: `checkPermissions()` llama a `navigator.permissions.query({name:'geolocation'})`,
  `getCurrentPosition()`/`watchPosition()` llaman a `navigator.geolocation.*`, y solo
  `requestPermissions()` está hard-codeado para lanzar (`unimplemented`, siempre, incluso con permiso
  real). La solución: parchear **`navigator.permissions.query`** (para que devuelva `{state:'granted'}`
  ante `name:'geolocation'`, evitando que el código llegue a llamar el `requestPermissions()` roto) y
  reemplazar **`navigator.geolocation`** completo (vía `Object.defineProperty`) con un objeto que responde
  `getCurrentPosition`/`watchPosition` con la posición fija — todo desde `browser_evaluate`, sin build ni
  reinicio del servidor. Verificado end-to-end contra el plugin real (mismo módulo que usa la app, vía
  `import('/node_modules/.vite/deps/@capacitor_geolocation.js?v=...')`).
- **Persistencia**: el override vive en el `window`/`navigator` del documento actual — un **full reload**
  (`browser_navigate`) lo destruye. Para que la vista lo recoja hace falta una **navegación SPA** (sin
  reload) hacia la página, p. ej. `router.push('/home')` → `router.push('/cps/programadas')` vía el mismo
  patrón de acceso al router usado en rondas anteriores (`__vueParentComponent` → `appContext...$router`).

**Resultado, con la ubicación simulada activa — todo PASA:**
- **Distancia por tarjeta**: cada card de "Por Procesar"/"Cercanas" muestra su distancia junto al id
  ("Prestación: 316236" → **2.4 km**; "Prestación: 316237" → **2.7 km**), geométricamente coherentes con
  lat/lng fijos (4.63,-74.09) vs. las coords de cada programada.
- **Chip "Cercanas" reordena por proximidad**: confirmado en código
  (`ProgrammedProvisionsPage.vue::applyFilterAndSort` → si `activeFilter === 'nearby'`,
  `list.sort((a,b) => (distanceKm(a) ?? Infinity) - (distanceKm(b) ?? Infinity))`); con solo 2 registros el
  orden visual coincidió con el de fecha (2.4 km < 2.7 km, y también antes por fecha), pero la lógica de
  ordenamiento por distancia está confirmada por código y por el hecho de que las distancias mostradas son
  correctas y reactivas a la ubicación simulada.
- **Marcador de ubicación actual**: en el mapa aparece, además del/los pin(es) de la(s) programada(s), un
  **círculo azul** (`MapComponent.vue::showCurrentPosition()`, `circleMarker` `fillColor:#007bff` — SVG
  `<path>` de Leaflet, no un `leaflet-marker-icon`) con popup **"📍 Estás aquí"** al tocarlo — confirmado
  que ya NO es un ícono de carro (no se pasa `currentIconUrl`, cae al círculo por defecto).
- **Header del mapa "ver todas"**: abre con **"2 puntos"**; al tocar un punto cambia a
  **"2.4 km · 8:00 a. m."** (formato `distancia · hora` completo, ya con distancia real); al cerrar el
  popup (botón "×") **vuelve a "2 puntos"**. Mismo comportamiento confirmado también en el mapa individual
  de una sola card ("Ver ubicación" → header pasa directo a "2.4 km · 8:00 a. m." al abrir, porque ahí solo
  hay un punto).

Backend `316236`/`316237` verificados intactos (`sync=false`) tras esta validación adicional.

## Stress test + exploración funcional 2026-08-24 (1000 registros)

Entorno: `app-movil` en `http://localhost:8100` (Chromium vía Playwright MCP), backend
`http://localhost:8085`, BD `aio` local. Storage limpio (IndexedDB `jeepSqliteStore` + localStorage) +
login fresco `$AIO_TEST_EMAIL` / $AIO_COMPANY_NAME (`company_id=$AIO_COMPANY_ID`). Endpoint móvil configurado por
el diálogo "Código Identificación Empresa" con NIT `1`-DV `1` → fila `company_endpoints.id=1` ("API
LOCAL", `http://localhost:8085/api`); este paso es obligatorio tras borrar el storage porque
`CompanyEndpoint.vue`/`LoginPage.vue::validateDefaultApi()` lo exige si no hay ningún
`company_endpoints` local con `is_default=1` (no es un bug, es el flujo normal de primer arranque).

Semilla de esta ronda: **1000 `mobile.provision_services` PROGRAMADAS de HOY** para `admin` (`user_id=1`,
`company_id=$AIO_COMPANY_ID` vía `customers.company_id`), mismo `customer_id=25` (MARTHA L. ALGARRA ., cuenta
`10559439`) con `address` única `'STRESS #1'`..`'STRESS #1000'` y coordenadas variadas en el área de
Bogotá/Soacha; más **2 registros de otro usuario** (`user_id=103`, `company_id` del cliente `=0`, fuera
de $AIO_COMPANY_NAME) que NO deben llegarle a `admin`. Verificado en BD antes de tocar la UI:

```sql
SELECT ps.user_id, c.company_id, count(*)
FROM mobile.provision_services ps JOIN mobile.customers c ON c.id = ps.customer_id
WHERE ps.active=true AND ps.sync=false AND ps.scheduled_at::date = current_date
GROUP BY ps.user_id, c.company_id;
-- user_id=1, company_id=$AIO_COMPANY_ID  → 1000
-- user_id=103, company_id=0 → 2
```

### A) Filtro de `import-scheduled` — PASA
`GET /provision-services/v0/import-scheduled?company_id=$AIO_COMPANY_ID` → 200, body con `status:"success"` y
`data.length === 1000`, `new Set(data.map(x=>x.user_id))` = `{1}` (ninguno de los 2 registros ajenos del
`user_id=103` llegó). Confirma en código `CustomProvisionServiceService::getScheduledProvisionsForImport`
(`app/Services/Modules/Mobile/ProvisionService/CustomProvisionServiceService.php:114-133`): filtra por
`user_id` del usuario autenticado + `whereHas('customer', company_id)` + rango `scheduled_at` del día
según `CustomCompanyService::getActuallyDateByCountryCompany`. Tras el import, la tabla local SQLite
`scheduled_provision_services` quedó con `SELECT company_id, COUNT(*) ... GROUP BY company_id` →
`{company_id:$AIO_COMPANY_ID, c:1000}` (verificado con `import('/src/services/app/DatabaseService.ts')` desde
`browser_evaluate`, sin tocar la conexión `jeep-sqlite` de bajo nivel — lección de la ronda 2026-08-21).

**Gotcha de medición (no bug de la app)**: mientras se importaba, el card "Prestaciones Programadas"
mostró un `<ion-progress-bar>` de forma indefinida y un `browser_wait_for({textGone:'progressbar'})`
NUNCA se resolvió, dando la falsa impresión de que el import estaba "colgado" por minutos.
Causa: `ImportCPSData.vue` renderiza **dos** `ion-progress-bar` distintos con el mismo rol ARIA
`progressbar` — uno indeterminado mientras `integrating=true`, y OTRO (barra llena, de éxito) cuando
`!integrating && isIntegrated` (líneas 22-32) — así que "ya no hay ningún `progressbar` en el árbol de
accesibilidad" nunca ocurre una vez el import termina con éxito. Verificado leyendo el `setupState` real
del componente (`tables` con `isIntegrated:true, integrating:false` para "Prestaciones Programadas") y
con una captura visual (barra verde llena, no un spinner). **Lección para próximas mediciones de este
componente**: usar el `setupState` (`integrating`/`isIntegrated`) o una condición de DOM más específica
(`.ion-color-success` en la barra), nunca `textGone:'progressbar'` a secas.

### B) Stress test de "Programadas" con 1000 — PASA
- **Header**: "1000 Por Procesar" al cargar (cuenta total sin filtrar).
- **Scroll infinito**: paginación real de a 10 confirmada por el crecimiento del DOM
  (`ion-item`/`[class*=card]`) en pasos de ~10-20 por disparo mientras se fuerza
  `scrollEl.scrollTop = scrollEl.scrollHeight` repetidamente; tras 87 iteraciones (con 300ms de espera
  artificial entre cada una) el `scrollHeight` se estabilizó y el DOM contenía **exactamente 1000**
  direcciones únicas (`"STRESS #1".."STRESS #1000"`, verificado con regex sobre `textContent`, sin
  duplicados ni faltantes). Sin cuelgues ni "Application not responding": cada iteración de scroll siguió
  respondiendo al mismo ritmo del bucle forzado durante toda la prueba.
- **Buscador** (Cliente/Cuenta Contrato/Dirección): con los 1000 ya cargados en el DOM, escribir
  `"STRESS #999"` filtró a la única card correcta de inmediato (sin lag perceptible); igual con
  `"10559439"` (cuenta, coincide con las 1000) y `"ALGARRA"` (cliente).
- **Mapa "ver todas" con 1000 puntos — el punto crítico**: medido con `performance.now()` puro en el
  navegador (sin round-trip de herramienta): desde el `click` sintético (`pointerdown→mousedown→pointerup
  →mouseup→click` sobre `.map-all-btn`) hasta que `.leaflet-marker-pane` tiene sus **1000** hijos
  renderizados: **≈731 ms**. El header del modal muestra correctamente **"1000 puntos"**. Los 1000
  marcadores son íconos Leaflet individuales (`.leaflet-marker-icon`, sin *clustering*); a este volumen se
  ven visualmente fusionados en una franja azul continua (los puntos están casi en línea, por el patrón de
  coordenadas de la siembra), pero **zoom/pan siguen respondiendo con normalidad** (capturas antes/después
  de zoom muestran los pines individuales separándose correctamente) y el popup de un punto individual
  abre con sus datos completos (`Prestación`, hora, cuenta/cliente/dirección, chip de estado, botón "Cómo
  llegar") sin demora perceptible. **Conclusión de rendimiento: el mapa con 1000 puntos renderiza bien, sin
  degradación visible** (nada de "no responde", sin errores nuevos en consola atribuibles al mapa).

### C) Exploración funcional — PASA salvo 2 bugs de token vencido
1. **Menú lateral tras login fresco — PASA**: "Prestación de Servicio" expande a "Nueva", "Programadas",
   "Importar Datos", "Enviar Datos", cada uno una sola vez.
2. **Importar Datos — PASA**: 3 cards "Datos Generales"/"Clientes"/"Prestaciones Programadas" (ver A).
3. **Ejecutar una programada — PASA hasta donde se pidió**: clic en el cuerpo de una card (`.card_clickable`,
   localizado por su texto único, no por `ref` de snapshot que caduca constantemente con 1000 cards en el
   DOM) navegó a `/cps/programadas/ejecutar`. Paso Vehículo: código `1112`/placa `ESK854` resuelto
   correctamente. Paso Cliente: **solo lectura** ("Cliente asignado a la prestación (solo lectura)."),
   card completa de MARTHA L. ALGARRA . sin buscador ni opción de cambiarlo — igual que en la ronda
   2026-08-21. No se avanzó al paso Evidencia (cámara, no ejercitable en navegador) ni se tocó el footer
   más allá del ícono "Siguiente" (extremo derecho, fuera de la zona de riesgo de logout).
4. **Pendiente vs. Finalizada — PASA**: se marcó localmente `UPDATE scheduled_provision_services SET
   finalized=1 WHERE provision_service_id=316238` (uno de los 1000 sembrados) vía SQLite local (sin tocar
   backend). Efecto confirmado por captura: chip **"Finalizado" verde** en vez de "Pendiente" naranja, **sin
   botón "Cómo llegar"** (las demás cards pendientes sí lo muestran), y el header "Por Procesar" bajó de
   1000 a **999**. En el mapa "ver todas", de los 1000 marcadores, **999 son azules y exactamente 1 es
   verde** (`innerHTML` de cada marcador con `fill:#2dd36f`/verde vs `#3880ff`/azul). Revertido
   (`finalized=0`) al terminar; verificado `SUM(finalized)=0` sobre las 1000 filas locales al cierre.
5. **Cómo llegar (card pendiente + popup del mapa) — PASA**: el botón "Cómo llegar" de una card pendiente y
   el botón dentro del popup de un punto del mapa (HTML plano con `.map-route-btn`, ver
   `MapComponent.vue:106-124` — emite `routeRequested` al padre) ambos abren el action sheet "Cómo llegar"
   con **Google Maps**/**Waze**/**Cancelar**. Se pulsó "Google Maps" desde el popup: nueva pestaña a
   `https://www.google.com/maps/dir/?api=1&destination=4.55%2C-74.05&travelmode=driving&origin=4.6983%2C-74.0972`
   (con `origin` real, geolocalización disponible en este entorno de pruebas concreto — a diferencia de
   rondas anteriores donde `GeolocationWeb` fallaba).
6. **Enviar Datos — PASA**: exactamente 2 cards, "Prestaciones de Servicio" y "Prestaciones Programadas",
   con "Datos por enviar: N" en el header y "Datos enviados"/"Pendiente por enviar" por card.
7. **Bloqueo de import con pendientes — PASA**: se insertó una fila local en `provision_services` con
   `sync_date IS NULL` (`INSERT` directo vía `DatabaseService`, sin `customer_id`/`type_service_id`/etc.
   reales de la BD local — `observations='PRUEBA-EXPLORACION-BLOQUEO'`). Tocar cualquier card de "Importar
   Datos" disparó `hasPendingToSend()` → alerta **"Advertencia / Datos Pendientes — Debe enviar la
   información finalizada antes de importar."**, sin ninguna petición de red de import (confirmado con
   `browser_network_requests`, filtro `vehicles|types-services|import-scheduled` → 0 resultados tras el
   alert). Fila borrada al terminar (`DELETE ... WHERE observations = 'PRUEBA-EXPLORACION-BLOQUEO'`).

### Token vencido — 2 BUGS confirmados (alerta correcta, pero el cierre de sesión NO ocurre)
**Aclaración de storage**: la tarea describía corromper `aioUserData`/`token` en `sessionStorage` — eso es
el patrón de **AIO web** (`aio-app`). **AMI (app-movil) usa un mecanismo distinto**: el token vivo que
`$api.fetchApi` adjunta en cada request (`src/utils/api.ts:19-20`) sale de `getUserAth()`
(`src/composables/useFunction.ts:136-145`), que lee y decodifica (`atob`) una **cookie** `authUser`
(`$cookies`, no `sessionStorage`/`localStorage`). Hay también un token persistido en la tabla SQLite local
`users.token`, pero **no es el que se usa para autenticar las peticiones en vivo** (confirmado
corrompiéndolo primero: el `Authorization` header de la siguiente petición siguió llevando el token
válido original) — es solo una copia de respaldo. El corrompido real, para que la próxima petición HTTP
falle con 401, es la cookie: `document.cookie` → decodificar `authUser` (`atob`), mutar `.token`,
re-codificar (`btoa`) y volver a escribir la cookie.

Con la cookie corrompida y un registro pendiente real (`provision_services` local con `sync_date NULL`,
`customer_id=25`/`type_service_id`/`type_observation_id` válidos de las tablas locales), se probaron
ambos flujos:

1. **Enviar** (`SendCPSData.vue`): clic en la card con 1 pendiente → `POST store-mobile-data` → **401**
   (confirmado en Network) → `handleError` reconoce `"unauthenticated"` en el mensaje → muestra
   correctamente **"Advertencia — Debe volver a iniciar sesión para poder sincronizar la información."**
   (alerta correcta, PASA) → `userUnauthenticated()` borra el usuario local (`DELETE FROM users`,
   confirmado) → `router.push("/logout")`. **BUG**: esa navegación queda **bloqueada**. Aparece ANTES un
   segundo alert, **"Advertencia — Envíos en proceso."**, y la URL se queda en `/cps/enviar-datos`.
   - **Causa raíz** (`SendCPSData.vue:213-309`): `sendCardData()` pone `loading.value = true` al empezar y
     solo lo vuelve a `false` en el `finally` (línea 230); pero `handleError(error, ...)` — que es quien
     dispara `router.push("/logout")` — se llama **dentro del `catch`, antes del `finally`**. En ese
     instante, el guard de la misma página `onBeforeRouteLeave` (línea 302-309) ve `loading.value === true`
     y cancela la navegación con `next(false)` + su propio alert "Envíos en proceso." — exactamente pensado
     para no perder un envío en curso, pero aquí bloquea la salida de emergencia por sesión inválida.
   - **Efecto**: el usuario queda con la sesión local borrada (`users` vacía) pero SIN ser expulsado de la
     pantalla, y el guard `router.beforeEach` (`src/router/index.ts:328-338`) solo comprueba que la
     **cookie `authUser` exista** (no que el token dentro sea válido) — así que la navegación normal dentro
     de la app sigue "funcionando" con una sesión rota hasta que el usuario recargue o intente otra
     operación que dependa de red.
2. **Importar** (`ImportCPSData.vue`): mismo patrón. Clic en "Datos Generales" (4 páginas internas) →
   401 en una de las páginas → aparece primero un alert genérico **"Error — No se pudo completar el
   proceso..."** (de una página fallida capturada por el manejo de errores paginado, antes de que la
   excepción "unauthenticated" se propague) — esto es ruido adicional no documentado en la HU, pero no
   contradice el resultado esperado — luego el alert correcto **"Advertencia — Debe volver a iniciar
   sesión para poder sincronizar la información."** (PASA) → mismo **BUG**: alert **"Advertencia —
   Importaciones en proceso."** bloquea el `router.push("/logout")` (mismo patrón `loading.value`/
   `onBeforeRouteLeave`, replicado en `ImportCPSData.vue`) → la URL se queda en `/cps/importar-datos` con
   `users` local vacía.
- **Ambos casos confirmados 2 veces** (Enviar y Importar) reproduciendo el mismo patrón; en ningún caso la
  app llegó a `/logout`/`/login` por sí sola. Se restauró el entorno manualmente (`localStorage.clear()` +
  borrar todas las cookies + re-login con NIT `1-1` y $AIO_COMPANY_NAME) para dejar la sesión sana al cierre.
- **Fix sugerido (no aplicado, solo lectura)**: en `handleError`, mover el `router.push("/logout")` fuera
  del bloque que corre antes del `finally` (p. ej. que `sendCardData`/`integrateTable` pongan
  `loading.value = false` ANTES de llamar a `handleError`, o que `onBeforeRouteLeave` deje pasar la
  navegación a `/logout` específicamente aunque `loading.value` sea `true`).

### Estado final de los datos de prueba
- **Backend**: los **1000** `mobile.provision_services` de `admin`/hoy y los de `user_id=103` (5 filas
  preexistentes, 2 de ellas `sync=false`/hoy — el control negativo real de la prueba) siguen en BD
  (sembrados por el usuario para esta prueba, autorizado dejarlos); verificado `sync=false` en las 1000
  tras el cierre — ninguna se envió/ejecutó de verdad. `316238` (la que se marcó "Finalizado" solo en
  SQLite local) también sigue `sync=false` en backend, sin tocar. **Residuo encontrado y limpiado**: el
  envío exitoso de `PRUEBA-EXPLORACION-TOKEN` (antes de corromper el token) SÍ creó una fila nueva real en
  backend (`mobile.provision_services.id=317238`, sin hijos en `detail_service_provisions`/
  `provision_attachments`) — se verificó y se borró con `DELETE ... WHERE id=317238 AND
  observations='PRUEBA-EXPLORACION-TOKEN'`, confirmando después `count(*)=0` para ese id y que los 1000
  `STRESS #%` siguen siendo exactamente 1000 (sin duplicados).
- **Local SQLite**: `provision_services` en 0 filas (se insertaron y borraron 3 filas de prueba:
  `PRUEBA-EXPLORACION-BLOQUEO`, `PRUEBA-EXPLORACION-TOKEN`, `PRUEBA-EXPLORACION-TOKEN2` — la segunda SÍ
  llegó a enviarse con éxito con el token válido, antes de la prueba de token vencido, y se borró sola tras
  el `store-mobile-data` 200 — no requirió limpieza manual); `scheduled_provision_services` con las 1000
  filas de la siembra y `finalized=0` en todas (revertido tras la prueba del punto 4); `users` con 1 fila
  válida (`$AIO_TEST_EMAIL`) tras restaurar la sesión al final.
- Ningún dato de negocio preexistente fue tocado; ninguna de las 3 filas de prueba locales quedó residual.

## Validación E2E AIO+AMI 2026-08-24 (ejecutada 2026-08-25) — ciclo completo Programar→Importar→Ejecutar→Enviar→mensajes→token

Entorno: AIO web `http://localhost:5173`, AMI móvil `http://localhost:8100` (Chromium vía Playwright MCP),
backend `http://localhost:8085`, BD `aio` local. Login ambos `$AIO_TEST_EMAIL` / $AIO_COMPANY_NAME
(`company_id=$AIO_COMPANY_ID`, admin = `users.id=1`). Rama `feature/sergio-10708` en ambos repos. Sin programadas
sembradas al inicio (`SELECT ... WHERE user_id=1 AND scheduled_at::date=current_date` → 0 filas).

### Bloqueo inicial y desbloqueo (documentado para no repetirlo)
El botón **"Programar"** (`$can('create','/mobile/provision-services')`) **no aparecía** para admin: en BD,
`permissions` (menu_id=83 `/mobile/provision-services`, role_id=1 "Administrador") tenía `create=false`,
pese a que la migración `2026_08_18_130000_grant_create_permission_provision_services.php` (que fija
`create=true` para exactamente ese rol/menú) ya figuraba **Ran** en `migrations` (batch 93). Algo posterior
volvió a poner `create=false` (no identificado; el `updated_at` de esa fila de permisos era reciente,
2026-08-24). Un `UPDATE` directo de `permissions.create` fue bloqueado por el clasificador de permisos de
la sesión → se reportó el bloqueo y se pidió autorización; **el coordinador aplicó el fix** (mismo efecto
que la migración) y confirmó continuar. Tras eso, con **login fresco completo** (`localStorage.clear()` +
re-login + reselección de empresa — un simple reload no basta, las abilities CASL se cargan solo al
loguear) el botón **"Agregar"** (texto real del botón; el id interno dice `schedule` pero `$t('add')` =
"Agregar", NO "Programar" literal en pantalla) apareció correctamente.

### 1. Crear 3 prestaciones desde AIO web ("Programar") — PASA
`http://localhost:5173/mobile/provision-services`, empresa $AIO_COMPANY_ID. El diálogo del formulario
(`ProvisionServiceScheduleForm.vue`) sufrió la **misma inestabilidad de SPA** ya documentada en
`mobile-operaciones-prestacion-servicio.md` (el modal se cierra solo entre llamadas de herramienta
independientes). Técnica que funcionó, más robusta que rellenar el DOM del autocomplete remoto: localizar
la **instancia real del componente Vue** (`__vueParentComponent`, subiendo por `.parent` desde un input
dentro de `.v-overlay--active.v-dialog` hasta encontrar `setupState.schedule` + `exposed.validatedData`),
asignar directamente el `ref` reactivo `schedule` (`customer`/`customer_id`, `supervisor`/`user_id`,
`scheduled_at`, `address`, `scheduled_location`) y llamar a `exposed.validatedData()` — ejercita el mismo
código real (`provisionServiceService.storeSchedule` → `POST store-schedule`) sin depender de que
sobreviva la búsqueda remota por UI. Repetido 3 veces (reabriendo el diálogo con clic sintético
`pointerdown→mousedown→pointerup→mouseup→click` sobre el botón "Agregar" cuando hacía falta):
- **Cliente**: `customer_id=25` (MARTHA L. ALGARRA ., cuenta `10559439`, company $AIO_COMPANY_ID).
- **Supervisor Responsable**: `user_id=1` (admin, "John Sotfware", documento `1`) — **crítico para que el
  import de AMI las traiga** (filtra por usuario logueado).
- 3 `scheduled_at` de HOY en el futuro (`15:00`, `16:00`, `17:00`), direcciones
  `PRUEBA-EXPLORACION-E2E-1/2/3`, `scheduled_location` en `POINT(lng lat)` distintos.
- Cada intento → toast **"Programación de prestación de servicio creada correctamente."**, `POST
  provision-services/v0/store-schedule` → 200. Verificado en BD: `mobile.provision_services.id = 317242,
  317243, 317244`, los 3 con `user_id=1`, `company_id=$AIO_COMPANY_ID` (vía `customer.company_id`), `sync=false`.
- **Confirmado por código + BD que el botón respeta el permiso `create`**: con `create=false` (estado
  inicial) el botón no se renderiza (`v-if="$can('create', props.subject)"` en
  `ProvisionServiceButtonsTable.vue`); no se pudo probar cambiando de rol en vivo (no se pidió), pero la
  ausencia/aparición del botón correlaciona 1:1 con el flag en `permissions.create` de BD, confirmado antes
  y después del fix.

### 2. Import desde AMI — PASA
Login AMI fresco (NIT `1`-DV `1` → API LOCAL), menú "Prestación de Servicio" → "Nueva", "Programadas",
"Importar Datos", "Enviar Datos" (labels correctos, sin duplicados). "Importar Datos" → 3 cards ("Datos
Generales", "Clientes", "Prestaciones Programadas"), cada una con su barra de progreso hasta completar sin
errores. `GET provision-services/v0/import-scheduled?company_id=$AIO_COMPANY_ID` → 200, body con **exactamente 3**
registros (`317242`, `317243`, `317244`), los 3 con `user_id:1` y datos completos (cliente, dirección,
fecha, coordenadas). Pantalla "Programadas": **"3 Por Procesar"**, las 3 cards con badge **"Pendiente"**
(naranja), cuenta contrato `10559439`, cliente `MARTHA L. ALGARRA .`, direcciones y fechas correctas.

### 3. Ejecutar — PASA hasta donde es ejercitable en navegador (Vehículo → Cliente solo lectura → Servicio); Evidencia (cámara) documentada como bloqueo, no ejercitada
Tocar el cuerpo de la card `317244` (clic real) navegó a `/cps/programadas/ejecutar`. Wizard real, sin
simular nada:
1. **Vehículo**: código `1112` resuelve `ESK854` / Compactador 25 yds; clic en la card lo selecciona.
2. **Cliente**: paso en **solo lectura** ("Cliente asignado a la prestación (solo lectura)."), sin
   buscador, card completa de MARTHA L. ALGARRA . (zona URBANO, comuna 5, barrio CHUNIZA) — igual que en
   rondas anteriores.
3. **Servicio**: se seleccionó "14 - Caza-Regueros" en el picker `Servicios` (modal con buscador +
   checkbox) sin problema.
4. **Evidencia**: NO se avanzó (requiere cámara real, `Capacitor Camera` no funciona en Chromium/CDP) — se
   documenta el límite, tal como pedía la tarea, sin forzarlo. Se abandonó el wizard navegando fuera
   (`browser_navigate` a `/cps/programadas`) sin guardar nada (el registro `317244` sigue intacto,
   `sync=false`, en BD).

**Inyección local para poder validar 4/5/6** (mismo patrón ya documentado en este archivo — `import()` de
los *services* TS reales vía Vite desde `browser_evaluate`, sin tocar la conexión `jeep-sqlite` de bajo
nivel): usando `ProvisionServiceService`/`ProvisionAttachmentService` reales del código (`insertProvisionService`,
`addContainer`, `insertAttachment`) se insertaron en SQLite local 3 filas en `provision_services`:
- **2 "programadas ejecutadas"**: `provision_service_id = 317242` y `317243` (los ids REALES de backend
  creados en el paso 1), `type_service_id=14`, `type_observation_id=16` (ambos ya en local por el import de
  "Datos Generales"), vehículo `1112`/`ESK854`, cada una con 1 `detail_service_provisions` (contenedor
  "Bolsa" id 66, cantidad 1) y 1 `provision_attachments` (`type_attachment_id=7` "evidence", PNG 200×150
  real generado con Node/zlib — **no** un PNG degenerado de 1×1, por el gotcha ya documentado de Imagick en
  `learnings.md`).
- **1 "nueva"**: `provision_service_id = NULL`, mismos datos, dirección `PRUEBA-EXPLORACION-E2E-NUEVA`, con
  su propio detalle+adjunto.
- Se marcó `scheduled_provision_services.finalized = 1 WHERE provision_service_id IN (317242, 317243)`.
- **Efecto confirmado en UI** (recarga real de `/cps/programadas`): `317242`/`317243` con badge
  **"Finalizado"** verde, **sin botón "Cómo llegar"**; header bajó de "3 Por Procesar" a **"1 Por
  Procesar"** (solo `317244` pendiente).

### 4. Enviar la información + validar HU — PASA (los 3 puntos de la HU confirmados en BD)
"Enviar Datos" mostró **exactamente 2 cards**: "Prestaciones de Servicio" (`Pendiente por enviar: 1` — la
nueva) y "Prestaciones Programadas" (`Pendiente por enviar: 2` — las ejecutadas), header "Datos por
enviar: 3". Se envió cada card por separado:
- **Card "Prestaciones de Servicio" (1 nueva)**: `POST store-mobile-data` → 200, `data:[3]` (id local).
  Backend: fila **nueva** `mobile.provision_services.id=317245`, **`user_id` NULL**, `sync=true`,
  `sync_date` poblado, sin `scheduled_at` — exactamente lo esperado (creación AMI pura, sin supervisor).
- **Card "Prestaciones Programadas" (2 ejecutadas)**: `POST store-mobile-data` → 200. Backend: **las MISMAS
  filas `317242`/`317243`** quedaron con **`sync=true`**, `sync_date` poblado, **conservando `user_id=1`**
  (el supervisor original) y **`scheduled_at` intacto** (`15:00`/`16:00`) — confirma que
  `resolveProvisionService` actualiza in-place por `provision_service_id`, no crea filas nuevas.
  `317244` (no enviada, sigue en la bandeja) permaneció **intacta** (`sync=false`).
- `detail_service_provisions`/`provision_attachments` con 1 fila cada uno para `317242`, `317243` y
  `317245` en backend (confirmado por conteo).
- **Bandeja local tras enviar**: `provision_services` local queda en **0 filas** (las 3 se borraron en
  cascada tras el envío exitoso, incluidos sus detalles/adjuntos); `scheduled_provision_services` local
  queda con **solo `317244`** (`finalized=0`, la única no procesada) — confirma que las programadas
  finalizadas y enviadas se retiran de la bandeja local, tal como pide la HU.

### "Cómo llegar" (Google Maps traza ruta; Waze solo muestra el punto en navegador) — PASA, con matiz documentado
Con geolocalización simulada (lat `4.63`, lng `-74.09`, técnica ya documentada en este archivo — parchear
`navigator.permissions.query` + `navigator.geolocation` vía `Object.defineProperty`, y hacer que la vista
recoja el override con una **navegación SPA real** hacia la página, no un reload) probado **desde la card
pendiente Y desde el popup del punto en el mapa**, con ambos proveedores:
- **Google Maps — SÍ traza ruta**: URL `https://www.google.com/maps/dir/?api=1&destination=4.60971%2C-74.08175
  &travelmode=driving&origin=4.63%2C-74.09` (con `origin`, gracias a la simulación). La pestaña abierta
  confirma visualmente (captura) un **directions view completo**: polilínea de ruta trazada entre "Agroexpo"
  (resuelto del origen) y "Yorente..." (resuelto del destino), con 3 alternativas de ruta, distancia (4.8
  km) y tiempo (16 min). **Mismo resultado exacto desde la card y desde el popup del mapa.**
- **Waze — SOLO muestra el punto de destino, SIN trazar ruta (limitación del deep-link web, no bug)**: URL
  abierta `https://www.waze.com/ul?ll=4.60971%2C-74.08175&navigate=yes&utm_source=ami_movil`, que Waze
  redirige a `https://www.waze.com/live-map/directions?navigate=yes&utm_source=ami_movil&to=ll.4.60971%2C
  -74.08175` — el campo **"Choose starting point" queda VACÍO** (captura confirma "Dropped pin" con solo el
  marcador de destino, sin trazo ni distancia/tiempo), a pesar de que la app SÍ tenía el origen simulado
  disponible (confirmado porque Google Maps, en la misma corrida, sí lo usó). Causa: el formato de deep-link
  `waze.com/ul?ll=...` (documentado por Waze) **no acepta un parámetro de origen** — solo centra/marca el
  destino; el trazado real de ruta en Waze **requiere la app nativa** (deep link `waze://` en dispositivo,
  fuera del alcance de este navegador de pruebas). **Mismo resultado exacto desde la card y desde el popup
  del mapa** (2 pruebas cada proveedor, 4 en total).

### 5. Mensajes de sincronización (`useSyncResultMessage`) — PASA, textos exactos confirmados
`showSyncResult(total, synced, moduleName)` en `SendCPSData.vue` — pese al nombre `warningToast`/`successToast`
de `useAlert.ts`, el mensaje de **éxito total es un `ion-toast`** (auto-desaparece, capturado con un
`MutationObserver` sobre `ION-TOAST` en el DOM) y los de **parcial/ninguna son `ion-alert`** bloqueantes
(header "Advertencia", botón "OK") — confirmado leyendo el código de `useAlert.ts` (`warningToast` usa
`alertController.create`, no `toastController`). 3 escenarios, cada uno con datos de prueba propios
(insertados y limpiados por escenario):
1. **Total** (2 registros nuevos reales, enviados sin mock — SÍ llegaron al backend real,
   `mobile.provision_services.id=317247/317248`, limpiados después): toast
   **"Datos de Prestaciones de Servicio enviados correctamente"** (`color:success`). Coincide con
   `i18n.syncDataSuccess`.
2. **Parcial** (3 registros nuevos; `window.fetch` parcheado para interceptar SOLO la request a
   `store-mobile-data` — sin dejarla llegar al backend real, evitando residuo — y devolver una respuesta
   200 sintética con `data` truncado a 2 de los 3 ids del payload real): alert **"Advertencia / Prestaciones
   de Servicio — Sincronización parcial de Prestaciones de Servicio (2/3). Algunos datos no fueron enviados
   correctamente. Por favor, intenta nuevamente más tarde. Si el error persiste, comunícate con el equipo de
   soporte para recibir asistencia."**. Confirmado también el efecto: el registro NO listado en `data`
   permanece pendiente en la bandeja local (no se borra) — comportamiento correcto de
   `processSentBatch`/`deleteOnCascade` filtrando por `processedIds`.
3. **Ninguna** (mismo mecanismo de mock, `data:[]`, status 200 — no 401, para no confundir con el flujo de
   token vencido): alert **"Advertencia / Prestaciones de Servicio — Los datos de Prestaciones de Servicio
   no fueron enviados. Por favor, intenta nuevamente más tarde. Si el error persiste, comunícate con el
   equipo de soporte para recibir asistencia."**. Coincide con `i18n.syncDataFailed`.
- **Técnica reusable**: parchear `window.fetch` (no `$api.fetchApi`, que resuelve `fetch` como global en
  cada llamada) filtrando por URL (`.includes('store-mobile-data')`) y devolviendo un `new Response(...)`
  sintético — permite simular parcial/ninguna **sin tocar el backend real** ni dejar residuo en Postgres.
  Restaurar `window.fetch` al original guardado (`window.__origFetch`) al terminar.

### 6. Token vencido — PASA, **confirma corregidos los 2 bugs de la ronda 2026-08-24**
AMI corrompe la cookie `authUser` (no `sessionStorage`, ver detalle ya documentado en este archivo), no el
token de la tabla local `users` (que es solo respaldo). Con un registro pendiente real (children válidos) y
la cookie corrompida:
1. **Enviar** (`SendCPSData.vue`): clic en la card con 1 pendiente → `POST store-mobile-data` → 401 →
   alert correcta **"Advertencia — Debe volver a iniciar sesión para poder sincronizar la información."** →
   la app **navegó limpiamente a `/login`** (no se quedó atascada en `/cps/enviar-datos`, y no apareció el
   alert bloqueante "Envíos en proceso." de la ronda anterior). Confirmado en código:
   `onBeforeRouteLeave` en `SendCPSData.vue:310-318` ahora tiene la condición
   `if (loading.value && to.path !== "/logout")` — deja pasar explícitamente la navegación a `/logout`
   aunque haya un envío en curso. **Bug 1 de la ronda 2026-08-24 CONFIRMADO CORREGIDO.**
2. **Importar** (`ImportCPSData.vue`): mismo patrón, mismo fix ya presente
   (`ImportCPSData.vue:510-518`, misma condición `to.path !== "/logout"`). Clic en "Datos Generales" con
   token corrupto → apareció primero el alert genérico "Error — No se pudo completar el proceso..." (ruido
   esperado de una página paginada fallida, ya documentado, no es un bug) → luego la alert correcta
   "Advertencia — Debe volver a iniciar sesión..." → **navegación limpia a `/login`**. **Bug 2 de la ronda
   2026-08-24 CONFIRMADO CORREGIDO.**
- **"Confirma que efectivamente sale de la app"**: sí — en ambos casos la URL terminó en `/login` (no
  `/logout` visualmente, porque esa ruta redirige de inmediato a `/login` tras limpiar la sesión) y el
  formulario de login se mostró funcional, sin quedar bloqueado por ningún guard.
- Se restauró la sesión (login real + selección de empresa) al terminar.

### Cierre / estado final de los datos de prueba
- **Backend**: **limpio** — se borraron (con sus `detail_service_provisions`/`provision_attachments`)
  las 6 filas de prueba creadas en esta sesión: `317242`, `317243`, `317244`, `317245` (puntos 1-4) y
  `317247`, `317248` (mensaje "Total" del punto 5). Verificado `count(*)=0` para
  `address ILIKE 'PRUEBA-EXPLORACION-E2E%' OR address ILIKE 'E2E-MSG-%'` tras el cierre. Los escenarios
  "Parcial"/"Ninguna" del punto 5 **nunca tocaron el backend real** (mock de `window.fetch`), sin residuo
  que limpiar ahí.
- **Local SQLite (AMI)**: `provision_services` en 0 filas, `scheduled_provision_services` en 0 filas
  (se borró manualmente la única que quedaba, `317244`, tras borrarla también del backend),
  `detail_service_provisions`/`provision_attachments` en 0 filas — verificado tras el cierre.
- **Permiso de BD**: `permissions.id=514` (role_id=1 "Administrador", menu_id=83
  `/mobile/provision-services`) quedó con **`create=true`** — **NO se revirtió**, es la re-aplicación del
  efecto ya previsto por la migración `2026_08_18_130000_grant_create_permission_provision_services.php`
  (cuyo propio `down()` es intencionalmente un no-op, "los permisos son datos operativos"); no es residuo
  de esta prueba, es estado de aplicación correcto.
- **Sesión**: AIO web y AMI quedaron con sesión válida (`$AIO_TEST_EMAIL`, $AIO_COMPANY_NAME) al
  cierre, sin pestañas ni diálogos abiertos colgando.
- Ningún dato de negocio preexistente fue tocado.
