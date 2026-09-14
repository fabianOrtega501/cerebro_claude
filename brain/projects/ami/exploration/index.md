# Indice de exploracion — AMI (movil)

Una linea por modulo. El **estado** dice cuanto se puede confiar en lo que hay:

| Estado | Que significa |
|---|---|
| `explorado` | Verificado contra el codigo actual. Se puede usar sin releer el modulo |
| `importado, sin verificar` | Viene de la exploracion de un companero y **no** se ha contrastado. Punto de partida, no verdad |
| `parcial` | Se explorio una parte; lo que falta esta dicho al final del archivo |

Formato: `- [Ruta del modulo](modules/<slug>.md) — estado — actualizado: AAAA-MM-DD`

- [AMI (móvil) → Green (Respel) → Visitas Clientes](modules/respel-client-visits.md) — importado, sin verificar — actualizado: 2026-08-13
- [AMI (móvil) → Prestación de Servicio (módulo "CPS")](modules/service-provision.md) — importado, sin verificar — actualizado: sin fecha
- [AMI (móvil) → Supervisión](modules/supervision.md) — importado, sin verificar — actualizado: 2026-09-03
- [AMI (móvil) → VehicleControl (Control Vehicular)](modules/vehicle-control.md) — importado, sin verificar — actualizado: 2026-08-12
- [AMI (móvil) → Operaciones → Órdenes de Trabajo (ejecución de campo)](modules/work-orders.md) — importado, sin verificar — actualizado: 2026-08-26
