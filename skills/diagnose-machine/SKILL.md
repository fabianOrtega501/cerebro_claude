---
name: diagnose-machine
description: Usar cuando Fabian pida revisar su computador —por que esta lento, si esta al dia con las actualizaciones, como estan la bateria, el disco, la temperatura o la memoria, por que se congela, en que se fue el espacio— y quiera un diagnostico con lo que puede estar pasando y como manejarlo. Mide solo lectura y sin sudo, guarda cada medicion en un historial y la compara con la anterior. Nunca aplica una correccion sin permiso. Dispara con "por que esta lento el computador", "revisa mi maquina", "estado de actualizaciones", "como esta la bateria", "se me lleno el disco", "diagnostica el equipo". No confundir con `brain-doctor`, que revisa el cerebro, ni con `/doctor` de Claude Code.
---

# Diagnosticar el computador

El script mide y **esta skill interpreta**. El script no sabe si 129 % de CPU en el navegador es
normal; tu si, cruzandolo con lo demas.

```bash
node ~/.claude/brain/lib/machine-check.mjs                            # todo, ~15 s
node ~/.claude/brain/lib/machine-check.mjs --only performance,storage
node ~/.claude/brain/lib/machine-check.mjs --json                     # para procesarlo
```

Solo lee, sin sudo. Cada corrida queda en `brain/machine/history/` (ignorado por git) y al final
sale **que cambio frente a la medicion anterior** que midio lo mismo. `--no-save` no la guarda.

## Que modulo segun la pregunta

| Pregunta | Modulos | Que mide |
|---|---|---|
| Esta lento, se congela | `performance,system,storage` | Carga, CPU en una muestra de 5 s, RAM, swap, presion (PSI), procesos y contenedores que mas gastan; procesos matados por falta de memoria; disco lleno |
| Actualizaciones | `updates` | apt (y cuales son de seguridad), snap, flatpak, firmware, reinicio pendiente, kernels |
| Componentes, "como esta el equipo" | `hardware` | Bateria (desgaste y ciclos), temperatura del CPU, salud del disco NVMe/ATA por udisks, drivers sin instalar |
| Espacio | `storage` | Particiones, inodos, y lo recuperable: Docker, journal, caches, papelera, snaps viejos |
| Revision general | todos | — |

## Como interpretar

1. **Cruza los datos antes de concluir.** Un solo numero rara vez es la causa:
   - Carga alta + CPU ocupado → falta procesador; mira quien lo consume.
   - Carga alta + CPU **libre** + espera de disco o PSI de `io` → el disco es el cuello de botella.
   - Poca RAM disponible + swap moviendose o PSI de `memory` → falta memoria; eso lo vuelve todo lento.
   - CPU caliente (85 °C o mas) y bajo rendimiento → se esta frenando para no quemarse.
   - Nada alto en la muestra → la lentitud es intermitente: pide que lo corra **mientras** esta lento.
2. **Las comparaciones dicen la tendencia.** "El disco subio 20 GB en una semana" o "la bateria
   perdio 5 puntos en un mes" pesa mas que la foto de hoy. Una variacion de carga entre dos
   mediciones es ruido si no hay otro sintoma.
3. **Separa el ruido de lo real.** Los `ACPI Error` del journal son firmware del fabricante y casi
   nunca afectan; los mensajes de audio (`protocol-pulse`) tampoco. Los servicios de `blame` que
   corren despues del inicio (`fstrim`, `apt-daily-upgrade`) no retrasan el arranque.
4. **El RSS de las apps de varios procesos esta inflado** (navegador, VS Code): comparten memoria.
   Para saber cuanto pesa de verdad, mira la RAM disponible, no la suma.

## Como responder

En este orden y corto:

1. **Diagnostico en una o dos frases**: que pasa y la causa probable. Si no hay nada grave, dilo.
2. **Lo que sustenta el diagnostico**: los tres o cuatro datos que lo explican, no todo el listado.
3. **Que hacemos**, ordenado por impacto. Cada accion con su comando, que libera o arregla, y su
   riesgo si lo tiene. Lo que no necesita nada va al final en una linea.
4. Si hubo cambios frente a la medicion anterior que importen, una linea.

## Lo que nunca se hace sin permiso

- **Nada que cambie el sistema**: matar procesos, borrar caches, `prune`, desinstalar, actualizar,
  reiniciar servicios. Se propone con el comando y se espera el si, **accion por accion**.
- **Los comandos con `sudo` los corre Fabian** en su terminal: la sesion no tiene su contrasena.
  Se le da el comando listo para copiar.
- **`docker volume prune` jamas** sin revisar antes cada volumen: ahi viven las bases de los
  proyectos y no se recuperan.
- Para matar un proceso por nombre, la regla del `pkill` del `CLAUDE.md`: patron con corchete y
  un `pkill` por comando.

## Limites

- La muestra de CPU dura 5 s: ve lo que pasa ahora, no lo que paso hace una hora.
- Los ventiladores y las temperaturas por componente necesitan `lm-sensors`; el script los usa si
  esta instalado y, si no, lee la temperatura del CPU del kernel.
- La salud del disco sale de udisks, sin sudo. Si hace falta el informe SMART completo:
  `sudo smartctl -a /dev/nvme0n1` (paquete `smartmontools`) y que Fabian pegue la salida.
