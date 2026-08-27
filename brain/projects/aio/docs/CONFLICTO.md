# Conflicto: dos arboles de documentacion en aio-backend

> Inventario levantado el 2026-08-27. **No se ha tocado nada**: unificar toca archivos de
> Neiron y Sergio y es una conversacion con ellos, no una decision propia.

## Que pasa

El estandar del propio repo (`docs/README.md` §2.3) dice que los modulos van en
`docs/modulos/`. Existe ademas un arbol paralelo `docs/modules/` en ingles que lo contradice.

| Arbol | Archivos | Idioma | Ultimo cambio |
|---|---|---|---|
| `docs/modulos/` | 7 | espanol | 2026-08-27 por neiron.osorio |
| `docs/modules/` | 5 | ingles | 2026-08-26 por sergio.cifuentes |

## Lo grave: AVL esta documentado dos veces

`docs/modulos/AVL/gps-history/README.md` y `docs/modules/avl/gps-history/README.md` describen
lo mismo con **contenido y fechas distintas**. Es justo el caso que el propio estandar advierte
en §2.7: *documentacion equivocada es peor que no tener documentacion*.

## Inventario

### En `docs/modulos/` (lo que manda el estandar)
```
  AVL/gps-history/README.md
  maintenance/movimientos-de-suministros.md
  mobile/marca-de-agua-censo.md
  mobile/README.md
  operation/impresion-qr-elementos.md
  operation/pdf-novedades.md
  operation/README.md
```

### En `docs/modules/` (arbol paralelo)
```
  avl/gps-history/README.md
  mobile/work-order/README.md
  operation/dispatches/README.md
  operation/movement-types/README.md
  settings/dynamic-form/README.md
```

## Otra divergencia menor

El estandar (§2.3) define `modulos/<modulo>/<flujo>.md` plano. Los dos arboles usan ademas un
nivel de entidad: `<modulo>/<entidad>/README.md`. No es grave, pero conviene decidirlo.

Tambien hay inconsistencia de mayusculas: `docs/modulos/AVL/` frente a `operation`, `mobile`,
`maintenance` en minuscula.

## Que hace la skill mientras tanto

`update-tech-docs` escribe **siempre en `docs/modulos/`**, que es lo que manda el estandar y el
arbol con mas contenido. El mapeo de nombres de carpeta esta en `profile.json`, respetando las
grafias que hoy existen en el repo.

## Propuesta para el equipo

1. Mover los 5 archivos de `docs/modules/` a `docs/modulos/`, traduciendo los nombres de carpeta.
2. Resolver el duplicado de AVL: quedarse con uno y borrar el otro.
3. Normalizar `AVL` a minuscula.
4. Decidir si el nivel de entidad se queda, y actualizar §2.3 si asi es.
