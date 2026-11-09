# Indice de exploracion — SGH

Una linea por modulo. El **estado** dice cuanto se puede confiar en lo que hay:

| Estado | Que significa |
|---|---|
| `explorado` | Verificado contra el codigo actual. Se puede usar sin releer el modulo |
| `importado, sin verificar` | Viene de la exploracion de un companero y **no** se ha contrastado. Punto de partida, no verdad |
| `parcial` | Se explorio una parte; lo que falta esta dicho al final del archivo |

Formato: `- [Ruta del modulo](modules/<slug>.md) — estado — actualizado: AAAA-MM-DD`

- [SGH → App → Parámetros generales](modules/app-general-parameters.md) — parcial — actualizado: 2026-11-09
- [SGH → Presupuesto → Plantas de presupuesto](modules/budget-staff-plans.md) — parcial — actualizado: 2026-11-09
- [SGH → Reportes → Presupuesto (800 a 807)](modules/reports-budget.md) — explorado — actualizado: 2026-11-09
