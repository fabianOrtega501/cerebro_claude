# Laminas de presentacion del cerebro

Para explicarle a alguien **que es el cerebro y como funciona**, en una sola diapositiva.

```bash
node ~/.claude/brain/presentation/render.mjs
```

Deja el PNG de 1920x1080 en `~/aio-shots/pres/`. Se inserta en Slides como imagen.

## Que se versiona y que no

El **HTML si**, porque es la lamina. El **PNG no**: se regenera en veinte segundos y pesa. Misma
regla que `brain/sprints/`.

## Al cambiar las piezas del cerebro

La lamina trae contados **13 skills, 5 hooks y 3 agentes**. Ese numero envejece. Antes de
presentarla:

```bash
ls -d ~/.claude/skills/*/ | wc -l && ls ~/.claude/hooks/*.mjs | wc -l && ls ~/.claude/agents/*.md | wc -l
```

## El tropiezo del navegador

Brave viene de snap y **no lee nada fuera de `$HOME`**: un HTML en `/tmp` le da
`ERR_FILE_NOT_FOUND` y el PNG sale en negro. `render.mjs` ya copia la lamina a `~/aio-shots/pres/`
antes de abrirlo, y avisa si el contenido midio menos de 1000px, que es la señal de que no cargo.
