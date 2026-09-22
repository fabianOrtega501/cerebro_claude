---
name: reglas-al-escribir-un-form-request
description: "Antes de fijar las reglas de un Form Request: mirar las columnas NOT NULL de la tabla y cuidado con boolean cuando el front envia FormData."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a89ba80-4bff-4132-ac32-32c94eb282b2
  modified: 2026-09-22T17:07:37.599Z
---

Al migrar un endpoint de `status-api` a Form Request, las reglas no se sacan del controlador
viejo: casi nunca validaba nada. Se sacan **de la tabla**, y con dos cuidados que ya costaron
tiempo el 2026-09-22.

## 1. `boolean` rompe lo que llega por FormData

El front manda muchos formularios dentro de un `FormData`. `dataform.append("aplica", false)`
convierte el booleano al **texto `"false"`**, y la regla `boolean` de Laravel acepta
`true, false, 1, 0, "1", "0"` pero **no** `"true"` ni `"false"`: la peticion se rechaza con 422
y la pantalla deja de guardar.

Paso con `aplica` de `dt_serviciosactividades` y `contratope` de
`dt_serviciosactividadesmunicipios`, las dos columnas `boolean` en PostgreSQL. Funcionaban
porque el controlador viejo no validaba y PostgreSQL si acepta el texto `'true'`/`'false'`.

**Que hacer:** si el consumidor usa `FormData`, dejar el campo con `['required']` y sin regla
de tipo, y anotar por que en el docblock del Request. Si de verdad hace falta validar, una
lista explicita —`in:true,false,1,0`— pero ojo: un `false` booleano real se convierte a cadena
vacia y no pasaria `in`.

**Como saberlo antes:** buscar la llamada en la vista. Si aparece `new FormData()` y
`.append(...)`, todo llega como texto.

## 2. Lo obligatorio lo dice la base, no el controlador

Antes de escribir las reglas, listar las columnas que no admiten nulos:

```sql
select column_name from information_schema.columns
where table_schema = 'gestor_transaccional' and table_name = ? and is_nullable = 'NO';
```

En el ticket 7433 aparecieron cuatro campos que nadie validaba y cuya ausencia producia un
**500 de PostgreSQL en vez de un 422**: `identificacion` en los cinco maestros de informacion
administrativa, e `idclase` e `idorden` en `dt_naturalezajuridicas`. Marcarlos `required` no
rompe nada —el caso sin ellos ya fallaba— y convierte un error de servidor en un mensaje util.

Lo mismo con el tipo: `numerocontrato` y `numerolegalidad` de `dt_actividadesccus` son
`bigint`, no texto.

## 3. Comprobarlo ejercitando el endpoint, no la regla sola

La prueba tiene que llamar a la ruta, no instanciar el validador: solo asi se ve el conjunto
de reglas que de verdad corre, con su tipo y su conversion. Ahi es donde salieron los tres
casos de arriba.

Ver [[swagger-en-controlador-tocado]] y [[buscar-consumidores-de-un-endpoint]].
