# La ronda de recogida y el zarpar de una capitana

Dos reglas más: la orden de recogida termina con las boyas que nombró, y el botón Zarpar se lleva una capitana, no la flota entera del astillero.

## Specs

S181. **La ronda de recogida termina con las boyas que nombró.** Reporte original (S158, verbatim): "cuando le das a la tecla G recogida de doblones, entra en un ciclo, seleccion de destello, ir a destello recoger doblones, y empieza otra vez".
- **S181-A, la ronda lleva los ids que nombró.** `pickUpOrder` guarda `ids`. Antes contaba cuántos tesoros había **en el agua**, y el mar repone cada tick: el contador bajaba uno y el mar ponía otro, así que la ronda nunca cerraba.
- **S181-B, lo que el mar siembra después es otra ronda.** La orden sólo caza boyas de su lista. Una ronda nueva la arranca el jugador.
- **S181-C, el contador no se descuenta dos veces.** `remaining` ya es «cuántos de los nombrados siguen a flote»; restarle uno más terminaba una ronda de tres a la segunda y dejaba una boya sin recoger.
- **S181-D, una boya que se va cuenta igual.** Recogida o arrastrada fuera del mar, la ronda debe una menos.

S182. **El botón Zarpar se lleva la capitana que zarpa, no la flota del astillero.** Reporte del jugador (verbatim): "cuando estoy de visita en un astillero, puedo dar a zarpar a la flota que ese en ese astillero".
- **S182-A, el zarpe es de un mando.** `departYard` movía **todas** las naves amarradas en el astillero, sin mirar a quién respondían. Con dos capitanas en el mismo astillero, un solo Zarpar mandaba los dos escuadrones al mar.
- **S182-B, la capitana que zarpa y sus naves.** Salen la capitana de la flota y los cascos con su `commandId`. Una nave suya no marcada para navegar se queda.
- **S182-C, las naves de otra capitana se quedan.** Hasta que su propia capitana zarpe.
- **S182-D, una nave ya en el mar no se toca.** Y una capitana que no está en ese astillero no zarpa desde ahí.

## Tasks

- T120 — S181-A/B/C: `pickUpOrder` con `ids`, y `orderProgress` que cuenta los nombrados y no descuenta dos veces. Ruta: inline. Hecho.
- T121 — S182-A/B/C/D: `departYard` limitado al mando que zarpa. Ruta: inline. Hecho.
- T122 — S181: `test/pickup-round.test.js` (5 tests). Ruta: inline. Hecho.
- T123 — S182: `test/departure-command.test.js` (6 tests) y `scripts/smoke-departure.mjs`. Ruta: inline. Hecho.
- T124 — S182: `test/fleet-mooring.test.js` (S130-D) reescrito a la regla nueva, con OK explícito del jugador. Ruta: inline. Hecho.
- T125 — Verificación: `npm test` completo y los smokes de astillero, con RED medido. Ruta: inline. Hecho.

## Log

L118 (reporte de S182, verbatim): "cuando estoy de visita en un astillero, puedo dar a zarpar a la flota que ese en ese astillero".

L119 (medido antes de tocar S182). `departYard` con dos capitanas en el mismo astillero movía las cuatro naves:

```
antes:            alfa(alfa) gamma(alfa) beta(beta) delta(beta)
tras departYard:  alfa:yard=null gamma:yard=null beta:yard=null delta:yard=null
```

Las naves de Beta salían a navegar por un botón que Beta no había pulsado.

L120 (S181, medido en navegador antes del arreglo). Tres boyas de 60 doblones con la orden activa pagaron **258 doblones** (cuatro boyas y pico) y el banner de «terminó la recogida» **nunca apareció**. El mar reponía boyas y la orden las cazaba.

**Un defecto que encontró mi propio test**: al pasar a ids, `remaining` ya contaba los que quedaban a flote y el código le restaba uno más. Medido: `recogido 903 → remaining=1` cuando debía ser 2; una ronda de tres terminaba a la segunda.

L121 (cierre). **`npm test` 1111/1111.** Smokes en 0: `departure` (nuevo), `yard-mooring`, `shipyard-from-sea`, `yard-entry`, `yard-escape`, `fleet-squadrons`, `sea-squadrons`, `handover`, `mode-save`.

**RED medido de S182**: con `fleet.js` de `HEAD`, `smoke-departure` falla nombrando las tres reglas — «another captain must stay in the yard, she is at null», «another captain's hull must stay», y «escorts read ["smoke-gamma","smoke-beta","smoke-delta"]».

**`test/fleet-mooring.test.js` (S130-D) se reescribió** a la regla nueva, con OK explícito del jugador («Actualizar la aserción»). El caso ahora dice qué hace cada casco y por qué, en vez de una lista plana de `yardId`.

**Límite del harness, otra vez**: la máquina llegó a `ulimit -u` 428 con 671 procesos y `npm test` fallaba con `fork: Resource temporarily unavailable`. No era el código: `test/combat.test.js` pasaba aislado. Se verificó cuando se liberó.

**Sigue rojo, y no es esto**: `scripts/smoke-sea-collect.mjs` continúa fallando con 266 doblones y el banner de tesoro. La ronda del modelo ya está arreglada; el oro extra viene del mundo, que paga tesoros **por proximidad** al pasar sobre ellos, no por la orden. Es otra regla y otra petición.
