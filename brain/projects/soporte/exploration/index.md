# Mapa del repo soporte

> Repo `devops/soporte` (GitLab interno), clonado en `/datos/proyectos/soporte`. Rama base `main`.
> Explorado el 2026-11-10, a nivel de carpeta: dice dónde está cada cosa, no qué hace cada script.

No es un aplicativo. Guarda los **objetos de base y scripts que no viven en el repo de ningún
aplicativo** porque se aplican a mano, ambiente por ambiente. Lo más importante para el trabajo
diario es que aquí está la versión vigente de los procedimientos del ETL de SGH de AIO.

## Lo que se usa en los tickets

| Archivo | Qué es | Dónde corre |
|---|---|---|
| `AIO/prc_staff_insert.sql` | ETL de SGH: personal desde `corporativo`, gerencias al maestro `MTFX-001` y gerencia de cada persona desde su contrato vigente | Base `aio` de cada ambiente |
| `AIO/prc_users_idle.sql` | Inactiva a los retirados de SGH y llama a `prc_staff_insert` (disparador de las 06:00) | Base `aio` de cada ambiente |
| `STATUS/prc_users_idle.sql` | Equivalente para Status | Base de Status |
| `AIO/crontab_db/` | Scripts de crontab de la base (`aio_bash_unidicado.sh`, `status_unificado.sh`, carga de vehículos) | Servidor de base |
| `postgres/` | Particiones y permisos de PostgreSQL | Servidor de base |

Por qué no están en `aio-backend`: `ObjectsSeeder` instala todo `database/DBObjects/` en cada base
que despliega, también en clientes sin SGH. Ver `docs/modules/settings/sgh-staff-etl.md` de aio-backend.

## Carpetas

| Carpeta | Archivos | Contenido |
|---|---|---|
| `AIO/` | 43 | ETL de SGH, gestor documental (migraciones de SOAT, pólizas, tecnomecánica, propietarios), llantas, censo, catastro, respel, bloques anónimos, crontab de base |
| `AIDA/` | 6 | Consultas de AIDA: báscula, GPS, eventos, salida de vehículos |
| `ARQ/` | 26 | Soporte de ARQ: catastro, cartera, PQR, legalización, upfiles |
| `STATUS/` | 10 | Variables técnicas, formatos, `prc_users_idle` de Status |
| `SIPA/` | 10 | Cargues de liquidaciones y toneladas, reliquidaciones |
| `EPSILON/` | 2 | Importación de funciones a la base, cálculo de Chiquinquirá |
| `SGH/` | 1 | `Ofuscar_data.sql` |
| `Mantis/` | 8 | Indicadores y resumen de sprint sobre la base de Mantis |
| `Balance_Comercial/` | 187 | Scripts y PowerBI del balance comercial |
| `indica720/` | 491 | Integración Indica 720: PHP, librería OCI, CSV, XLS y logs |
| `IA/` | 8 | Pruebas por código (`XXX001`…) |
| `SiesaEE/`, `SIREDE/`, `Utilidades/` | 8 | Maestros y movimiento contable de Siesa, correos de SIREDE, utilidades de PostgreSQL (tamaño, secuencias, permisos, bytea) |

## Cuidado

- **Hay credenciales escritas en varios archivos**, entre ellos `AIO/gestor_documental/`,
  `AIO/crontab_db/aio_prc_load_temp_vehicle_data.sh`, `EPSILON/importar_funciones_DB.sh`,
  `indica720/lib/db/oci.php` y `SIREDE/update_correos.sql`. No se copian al cerebro ni se citan sus
  valores.
- **Sin flujo de ramas definido.** Hoy se trabaja con ramas `feature/` desde `main`; el MR va a `main`.
