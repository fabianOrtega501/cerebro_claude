# Ticket 11180 — Pruebas manuales del paso 2 (validaciones del mes sin idioma)

Todo en **local**: status-api en `http://localhost:8087`, base `status` del contenedor
`postgres_postgis_17`. No toca desa.

Por que no desde la pantalla de SIPA: SIPA sube el archivo por SFTP a 172.17.10.14 con nombre
aleatorio, y `procesar` lo busca en `/var/sftp/uploads` del Postgres local, donde nunca llega.
Aqui se pone el archivo a mano en esa carpeta y se llama al endpoint como lo haria SIPA.

Datos de la base local usados: APS 1 (CUNDINAMARCA / GIRARDOT), empresa 1, usuario 1.

## 1. Crear las liquidaciones de prueba

Una por caso y **cada una con su periodo**: el sistema no permite dos liquidaciones del mismo
periodo para la misma empresa y APS (`Liquidaciones::validarPeriodo`). Periodos de 2030 para no
chocar con datos reales.

```bash
docker exec postgres_postgis_17 psql -U postgres -d status -c "
INSERT INTO aprovechamiento.liquidaciones (periodo, idempresa, estado, aprobado, usuario_aprobacion, aps)
VALUES ('20300301',1,true,false,1,1), ('20300401',1,true,false,1,1),
       ('20300501',1,true,false,1,1), ('20300101',1,true,false,1,1)
RETURNING id, periodo;"
```

Anotar los cuatro id: A (20300301), B (20300401), C (20300501) y D (20300101).

## 2. Crear los archivos csv dentro de la carpeta que lee Postgres

Fechas con dia <= 12 a proposito: el Postgres local esta en `DateStyle MDY` y rechazaria
`24-10-2019` (otra diferencia con los servidores, anotada para el MR).

```bash
E='ID EMPRESA;EMPRESA;AÑO;PERIODO;DEPARTAMENTO;MUNICIPIO;NUESCA;ORIGEN;TONELADAS;FECHA;FECHA APROBACION;MECANISMO CARGUE'
F() { echo "45876;Prestador de prueba;$1;$2;CUNDINAMARCA;GIRARDOT;1410125430;NA;1.5;05-03-2030;10-10-2019;APP"; }

printf '%s\n%s\n%s\n' "$E" "$(F 2029 OCTUBRE)" "$(F 2030 FEBRERO)" | docker exec -i postgres_postgis_17 sh -c 'cat > /var/sftp/uploads/caso_a.csv'
printf '%s\n%s\n'     "$E" "$(F 2029 OCTUBRE)"                      | docker exec -i postgres_postgis_17 sh -c 'cat > /var/sftp/uploads/caso_b.csv'
printf '%s\n%s\n%s\n' "$E" "$(F 2030 ENERO)" "$(F 2030 FEBRERO)"   | docker exec -i postgres_postgis_17 sh -c 'cat > /var/sftp/uploads/caso_c.csv'
printf '%s\n%s\n'     "$E" "$(F 2029 DICIEMBRE)"                    | docker exec -i postgres_postgis_17 sh -c 'cat > /var/sftp/uploads/caso_d.csv'
```

## 3. Sacar un token del usuario 1

```bash
docker exec status-api-laravel.test-1 php artisan tinker --execute="echo App\ModelConfiguracion\usuarios::find(1)->createToken('prueba-11180')->plainTextToken;"
```

Si responde 403 en el paso 4, el usuario 1 tiene la clave vencida: usar otro usuario activo.

## 4. Llamar al endpoint, un caso a la vez

```bash
TOKEN='<el token del paso 3>'
P() { curl -s -X POST http://localhost:8087/api/rest/v1/post/procesar-archivo-csv \
  -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d "{\"id\":$1,\"periodo\":\"$2\",\"idempresa\":1,\"idEstructura\":1,\"nombreArchivo\":\"$3\",\"usuario\":1,\"tipocargue\":\"dt_cargue_toneladas\",\"tipoDeCargue\":\"dt_cargue_toneladas\",\"aps\":1}"; echo; }

P 1025 20300301 caso_a.csv
P 1029 20300401 caso_b.csv
P 1027 20300201 caso_c.csv
P 1026 20300101 caso_d.csv
```

## 5. Que debe pasar

| Caso | Archivo | Respuesta esperada | Filas en `dt_cargue_toneladas` |
|---|---|---|---|
| A (20300301) | Octubre 2029 + febrero 2030 (trae el mes procesado) | `success: true`, "Se proceso el archivo correctamente." | 2 |
| B (20300401) | Solo octubre 2029 (caso Melgar: falta marzo) | `success: false`, "…no cuenta con toneladas cargadas al mes anterior…" (aun no cambia: es el paso 3) | 0 |
| C (20300201) | Enero + febrero 2030 (trae el mes del periodo) | `success: false`, "…tiene toneladas reportadas a la fecha 20300201" | 0 |
| D (20300101) | Diciembre 2029, liquidacion de enero 2030 | `success: true` | 1 |

Contar filas:

```bash
docker exec postgres_postgis_17 psql -U postgres -d status -c "
SELECT l.id, l.periodo, count(t.idliquidacion) AS filas
FROM aprovechamiento.liquidaciones l
LEFT JOIN aprovechamiento.dt_cargue_toneladas t ON t.idliquidacion = l.id
WHERE l.periodo LIKE '2030%' AND l.aps = 1 GROUP BY l.id, l.periodo ORDER BY l.id;"
```

Contraste opcional "antes": borrar las filas cargadas de A y D
(`DELETE FROM aprovechamiento.dt_cargue_toneladas WHERE idliquidacion IN (1025, 1026);`),
`git stash` en status-api, repetir A y D con las mismas liquidaciones (con el codigo viejo, en
este Postgres en ingles, los dos se rechazan por el mes) y `git stash pop`.

## 6. Limpiar

```bash
docker exec postgres_postgis_17 psql -U postgres -d status -c "
DELETE FROM aprovechamiento.dt_cargue_toneladas WHERE idliquidacion IN (1025, 1026, 1027, 1028, 1029);
DELETE FROM aprovechamiento.liquidaciones WHERE id IN (1025, 1026, 1027, 1028, 1029);
DELETE FROM personal_access_tokens WHERE name = 'prueba-11180';"
docker exec postgres_postgis_17 sh -c 'rm -f /var/sftp/uploads/caso_*.csv'
```

`procesar` no borra estos archivos: intenta borrarlos del SFTP remoto, no de la carpeta local.
