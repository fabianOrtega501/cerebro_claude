# Desarrollos con set de pruebas pendiente

Cola de lo que se cerró pero todavía no se ha probado en el ambiente de desarrollo. La escribe la
Fase 7 de `finish-development` cuando el set de pruebas se deja para después, y la consume
`gen-test-set` cuando toca generarlo.

**La sha de la base es la columna que importa.** Para cuando se ejecutan las pruebas —uno o dos días
más tarde— la rama ya se mezcló y la base se movió; con la sha el diff del desarrollo se reconstruye
igual (`collect-changes.mjs --base <sha>`), y sin ella el set se acaba armando de memoria.

Al generar el set, borrar la línea.

| Fecha | Proyecto | Ticket | Rama | Base | Sha de la base |
|---|---|---|---|---|---|
