# SIPA — inventario de lo reutilizable

Qué pieza ya resuelve cada necesidad común en `sipa` (front Vue 2 sobre la plantilla Vuexy, con
bootstrap-vue, vuex 3, vee-validate 3 y axios; el backend vive aparte). Se lee **antes de armar el
plan**. Las rutas son relativas al repo; Doctor avisa si una deja de existir.

El repo **no documenta un estándar**: no tiene `CLAUDE.md`, memorias ni `docs/`, y el README es el de
la plantilla. La referencia es el patrón del código existente. La documentación técnica del producto
está fuera del repo, en `manual-tecnico/docs/Sipa/`.

## No se hace

- Comentarios sueltos dentro del código (regla del cerebro, aplicada por `code-standards-guard`).
- Credenciales o rutas absolutas en lo que se commitea.
- Leer el usuario, la empresa o el menú del `localStorage` sin descifrar: siempre `leerCifrado`.
- Ojo, no es regla: el patrón de servicios hace `console.error` y relanza el error (222 usos). Es el estándar de hecho del repo.

## API, errores y avisos
- Cliente HTTP con `baseURL` y redirección a `/auth` ante un 401: `axiosIns` (`src/libs/axios.js`).
- Servicio por recurso (métodos async que capturan, registran y relanzan): como `src/services/Suscriptores/SuscriptoresService.js`.
- Aviso estándar a partir de la respuesta, incluidos los errores 422: `fnNotificar` (`src/@core/utils/general/fnNotificar.js`), llamado con `fnNotificar.call(this, resp)`; mensaje legible de una excepción: `mensajeDeError` (mismo archivo).
- Constantes de estado de respuesta y de tipo de cargue: `TIPO_MENSAJE` (`src/@core/utils/general/tiposMensaje.js`) y `TIPO_CARGUE` (`src/@core/utils/general/tipoCargue.js`).

## Sesión y permisos
- Leer del `localStorage` cifrado: `leerCifrado` (`src/@core/utils/general/sesionCifrada.js`); las claves están en `src/global-components.js`.
- Datos de sesión y permisos IMEC por ruta, como componente que se extiende: `DatosSesion` (`src/views/Estandar/DatosSesion.vue`); botonera según IMEC: `Botones` (`src/views/Estandar/Botones.vue`).
- Protección de rutas y ACL: `canNavigate` y `ability` (`src/libs/acl/routeProtection.js`, `src/libs/acl/ability.js`).

## Formatos, archivos y validación
- Periodo YYYYMMDD a "Mes año" y fecha larga: `formatoFecha`, `formatoFechaLargo` (`src/@core/utils/general/formatearFecha.js`).
- Números, porcentajes y archivos en base64: `formatNumber`, `formateoPorcentaje`, `descargarArchivo`, `convertirABase64` (`src/composables/useFunction.js`).
- Reglas de vee-validate registradas: `src/@core/utils/validations/validations.js`; validadores puros: `src/@core/utils/validations/validators.js`.
- Exportar a Excel: no hay helper; el único uso está en `src/@core/components/reliquidacion/toneladas-aprobadas/DiferenciaToneladasTable.vue`.

## Componentes
- Tabla con slots, paginado y orden: `TablaComponente` (`src/components/standard/tablas/TablaComponente.vue`).
- Modal estándar con sus botones: `ModalComponent` (`src/components/modal/ModalComponent.vue`) y `ButtonsAction` (`src/components/standard/buttons/ButtonsAction.vue`).
- Card con pestañas: `CardTabsComponente` (`src/components/standard/card/CardTabsComponente/CardTabsComponente.vue`).
- Firma: `FirmaComponente` (`src/components/firma/FirmaComponente.vue`) y `FirmaArchivo` (`src/components/firma/FirmaArchivo.vue`).
- Selector de APS: `SelectAps` (`src/@core/components/empresa/SelectAps.vue`); cargue de toneladas y recaudo: `src/@core/components/cargue-toneladas/`.
- Gráficos: `src/components/charts/` (Chart.js) y `src/@core/components/charts/echart/` (ECharts).
