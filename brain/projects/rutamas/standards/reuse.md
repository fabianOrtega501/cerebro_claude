# Ruta+ (rutamas-movil) — inventario de lo reutilizable

Qué pieza ya resuelve cada necesidad común en `rutamas-movil` (Ionic 8 + Vue 3 con `<script setup>`
y TypeScript, Capacitor 8, Pinia, vue-i18n; HTTP con `fetch` nativo). Se lee **antes de armar el
plan**. Las rutas son relativas al repo; Doctor avisa si una deja de existir.

El repo **no documenta un estándar**: no tiene `CLAUDE.md`, memorias ni `docs/`, y el README solo
trata la publicación del APK. La referencia es el patrón del código existente, que es consistente:
`fetch` solo en `src/utils/api.ts`, alertas solo en `NotificationService`, `Preferences` solo en los
stores de sesión y biometría.

## No se hace

- Comentarios sueltos dentro del código (regla del cerebro, aplicada por `code-standards-guard`).
- Credenciales o rutas absolutas en lo que se commitea.
- Por patrón, no por regla escrita: `fetch` fuera de `src/utils/api.ts`, alertas fuera de `NotificationService` y `localStorage` (todo va en `@capacitor/preferences`).

## API y errores
- Petición autenticada con token, timeout y manejo del 401: `HttpService.request<T>()` (`src/services/http/HttpService.ts`); de bajo nivel: `$api.fetchApi()` (`src/utils/api.ts`).
- Tipo de la respuesta del backend: `IApiResponse<T>` (`src/modules/common/interfaces/IApiResponse.ts`); armar query params: `toQueryParams()` (`src/utils/helpers.ts`).
- Clientes de API por módulo, en `src/modules/<modulo>/api/` (por ejemplo `src/modules/agreements/api/AgreementApi.ts`).
- Alertas que además registran el error: `notificationService.notify()` (`src/modules/common/services/NotificationService.ts`); manejador central de los `catch`: `handleError()` (`src/helpers/handleError.ts`).
- Errores tipados: `src/modules/common/errors/TypeError.ts` y `src/modules/common/errors/UnauthenticatedError.ts`.
- Loader global: `useLoadingStore` (`src/modules/common/store/LoadingStore.ts`) con `AppLoading` (`src/components/AppLoading/AppLoading.vue`).

## Sesión, almacenamiento y dispositivo
- Sesión, usuario y empresa persistidos: `useAuthStore` (`src/modules/auth/store/AuthStore.ts`); rutas protegidas con `meta.requiresAuth` en `src/router/index.ts`. No hay roles ni permisos por funcionalidad.
- Biometría: `biometricService` (`src/services/biometric/BiometricService.ts`); ubicación: `geolocationService` (`src/services/geolocation/GeolocationService.ts`).
- Abrir una ruta en Google Maps o Waze: `externalNavigationService.openRoute()` (`src/services/navigation/ExternalNavigationService.ts`).

## Validación, componentes y utilidades
- Reglas sobre un campo: `validateRules()` (`src/modules/common/composables/useFormValidation.ts`) con `requiredValidator`, `doubleValidator`, `maxLengthValidator` (`src/modules/common/composables/validator.ts`).
- Campos: `TextInputComponent` (`src/components/standard/input/TextInputComponent.vue`), `NumberInputComponent` (`src/components/standard/input/NumberInputComponent.vue`), `SelectComponent` (`src/components/standard/select/SelectComponent.vue`), con búsqueda remota: `SearchSelectComponent` (`src/components/standard/select/SearchSelectComponent.vue`).
- Dirección DANE: `src/components/AddressComponent/`; mapa: `MapComponent` (`src/components/MapComponent/MapComponent.vue`); estado vacío: `EmptyStateComponent` (`src/modules/common/components/EmptyStateComponent.vue`).
- Utilidades (`debounce`, `buildFileUrl`, `toCapitalize`, `parseWkbPoint`, vacíos): `src/utils/helpers.ts`. No hay utilidad compartida de fechas ni de moneda.
- Traducir fuera de componentes: `t()` (`src/utils/translate.ts`); textos en `src/plugins/i18n/locales/es.json` y `en.json`.
