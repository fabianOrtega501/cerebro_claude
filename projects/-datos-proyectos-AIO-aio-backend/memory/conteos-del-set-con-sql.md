---
name: conteos-del-set-con-sql
description: "Si un caso del set de pruebas obliga a contar datos repartidos en varias pantallas, se entrega la sentencia SQL para tomar la evidencia de la base"
metadata:
  node_type: memory
  type: feedback
  originSessionId: df811c99-3ccb-4226-996f-01a8e2ee0efd
  modified: 2026-10-29T13:04:25.416Z
---

Cuando un caso del set de pruebas (`gen-test-set`) compara un total contra datos que hay que contar o sumar en varias pantallas (toneladas de varios despachos, kilómetros por desplazamiento, personas sin repetir), el anexo trae la sentencia SQL que calcula ese valor con el mismo criterio del código. Fabian la corre en la base y toma la evidencia de ahí. La pantalla sigue siendo la prueba de lo que ve el usuario.

**Why:** en el ticket 11467 el caso de toneladas obligaba a recorrer 21 despachos y la exportación de Despachos no traía el pesaje. Fabian lo pidió el 2026-10-29: «generame la sentencia de SQL, para consultarla por BD y tomar la evidencia de ahí».

**How to apply:**
- La sentencia va solo con `SELECT` y lleva los mismos filtros de la regla: empresa, fecha, estados, `active` y centros del usuario.
- Se corre antes en el ambiente donde se va a probar, para dejar el valor esperado escrito en el caso.
- Si la consulta une tablas hijas, se revisa que no multiplique filas: en el 11467 unir la tripulación infló las toneladas.
- Los valores esperados del set salen siempre de una consulta, nunca calculados de memoria.
