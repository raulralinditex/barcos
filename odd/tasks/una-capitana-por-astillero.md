# Una capitana por astillero

Comprar una nave robaba el mando de toda la flota, así que sólo podía haber una capitana. La regla pasa a ser una capitana por astillero, y el botón «pasar a» deja de ofrecer traspasos que el modelo rechaza.

## Specs

S178. **El control «pasar a» sólo ofrece traspasos que van a funcionar.** Reporte del jugador (verbatim): "en flota, el boton que tengo en cada name 'pasar a' no funciona".
- **S178-A, el modelo tenía razón.** `withShipCommand` rechaza mover un casco a una capitana que no está en el mismo sitio (S155-B): un casco no cruza el mar sola. La regla no cambia.
- **S178-B, la pantalla ofrecía lo que el modelo rechazaba.** El `<select>` listaba **todas** las capitanas; al elegir una en el mar, el modelo rechazaba y el handler devolvía el control a su placeholder **sin decir nada**. Medido: con la capitana destino en el mar, el botón aparecía, se podía elegir, y la nave no se movía.
- **S178-C, la lista se filtra con la misma regla.** `handoverTargets` responde en el modelo, con el mismo criterio que aplica el traspaso: mismo sitio, no su propia capitana, nunca ella misma.
- **S178-D, la invariante se prueba en los dos sentidos.** Todo lo que la lista ofrece, el modelo lo acepta. Es lo que impide que la pantalla vuelva a mentir.

S179. **Una capitana por astillero.** Reporte del jugador (verbatim): "ahora solo puedo tener una capitana, se supone que puedo tener una capitana por cada astillero". Decisión suya sobre la capitana visitante (verbatim): "Cualquier capitana cuenta".
- **S179-A, comprar donde ya hay capitana la suma a ella.** La nave nueva recibe `commandId` de la capitana de ese astillero. La capitana anterior no pierde nada.
- **S179-B, comprar donde no hay capitana toma ese astillero.** La nave nueva es capitana de su astillero, y el mando de la flota no se mueve.
- **S179-C, una capitana visitante cuenta como la capitana de ese astillero.** Mientras está allí, una compra se le suma.
- **S179-D, `addShip` conserva su forma.** Es el alta cruda que usan los tests y el camino de los premios: no gana la regla de mando, o un casco capturado se uniría a un escuadrón al que no pertenece.

## Tasks

- T110 — S178-C: `handoverTargets` en `src/model/fleet.js`, con el mismo criterio que `withShipCommand`. Ruta: inline. Hecho.
- T111 — S178-C: la fila de flota de `app.js` usa `handoverTargets` en vez de listar todas las capitanas. Ruta: inline. Hecho.
- T112 — S179-A/B/C: `addCaptain` reescrito para una capitana por astillero, y `app.js` lo usa en la compra en vez de `addShip`. Ruta: inline. Hecho.
- T113 — S178/S179: `test/handover-targets.test.js` (6), `test/one-captain-per-yard.test.js` (6), `scripts/smoke-handover.mjs`. Ruta: inline. Hecho.
- T114 — S179: `smoke-yard-mooring.mjs` actualizado a la regla nueva (S130-C), con OK explícito del jugador. Ruta: inline. Hecho.
- T115 — Verificación: `npm test` completo y los smokes de flota, escuadrones y astillero, con RED medido. Ruta: inline. Hecho.

## Log

L109 (reporte de S178, verbatim): "en flota, el boton que tengo en cada name 'pasar a' no funciona".

L110 (medido antes de tocar nada). El traspaso **sí funcionaba** cuando las dos capitanas estaban en el mismo astillero, y **también** persistía tras recargar. Fallaba sólo con la capitana destino en el mar: el `<select>` la ofrecía, el jugador la elegía, `withShipCommand` rechazaba por `yardOf(ship) !== yardOf(target)`, y el handler reseteaba el control en silencio. Con la capitana en **otro** astillero el botón ni aparecía — de ahí la inconsistencia que el jugador describió como «no funciona».

L111 (reporte de S179, verbatim): "ahora solo puedo tener una capitana, se supone que puedo tener una capitana por cada astillero".

L112 (medido). Dos compras en el mismo astillero dejaban **una sola** capitana y la pantalla dibujaba **cero** bloques de capitana. La causa: `addShip` escribía `captainId: ship.id` sin `commandId`, así que la última comprada tomaba el mando y la anterior dejaba de ser capitana para `captains()`, que reconoce capitana por `commandId === id`. **`addCaptain` existía con la regla correcta y no la llamaba nadie**: la compra usaba `addShip`.

L113 (conflicto con un smoke previo, resuelto con el jugador). `smoke-yard-mooring` (S130-C) compra en el abismo esperando que la nave nueva sea capitana. Con la regla nueva, en el abismo ya hay una capitana —la visitante—, así que la compra se le suma. El jugador eligió «Cualquier capitana cuenta» y autorizó actualizar la aserción: el `yardId` sigue probando S130-C (la nave nace donde estás), y una aserción nueva prueba S179.

L114 (cierre). **`npm test` 1096/1096** (1090 más 6 de S179; los 6 de S178 ya estaban). Smokes en 0: `handover` (nuevo), `yard-mooring`, `fleet-squadrons`, `sea-squadrons`, `fleet-panels`, `dock`, `shipyard-from-sea`, `yard-entry`.

**Medido en el navegador real**: dos compras en el puerto de casa dejan la primera como capitana (`cmd` propio) y la segunda como su escolta (`cmd` = la primera), con el `captainId` intacto.

**Una trampa del arnés que costó tiempo**: `addCaptain` estaba bien escrita y sin usar. Buscar quién llama a la función correcta es más rápido que reescribirla — el defecto era el cableado, no la regla.
