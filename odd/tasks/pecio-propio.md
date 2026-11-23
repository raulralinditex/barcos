# Pecio propio y mando que no se pierde

Al hundirse un barco nuestro, la nave se va de la flota y deja un pecio en el agua que se cobra navegando encima. Se va el interruptor del naufragio: la regla es una sola. Y cuando cae la capitana, otra nave del grupo toma el mando.

## Specs

S169. **Una nave propia hundida deja un pecio, nunca un naufragio reflotable.** Pedido (verbatim): "barco nuestro hundido, no aparece en el astillero, quitamos la opcion de 'Un barco hundido queda como naufragio' y siempre queda como naufragio, y desaparece en el astillero".
- **S169-A, se va el interruptor.** El campo `sinking.keepWreck` desaparece de `SETTINGS_FIELDS` y con él el bloque «Naufragio» de la pantalla de Configuración. No queda ninguna forma de que un casco hundido espere en un astillero.
- **S169-B, el casco sale de la flota.** Al hundirse, la entrada se borra de `fleet.ships`. No hay etiqueta «Naufragio», no hay botón «Reflotar», no hay coste de reflotado. Un casco que ya no existe no cuenta en el valor de la flota ni en el mantenimiento.
- **S169-C, deja un pecio en el agua.** En el punto del hundimiento aparece una entrada `type: "wreck"` en `world.encounters`, con el oro que paga `wreckPrize` para ese casco y esa zona. Se cobra navegando encima, con la misma regla de recogida que un pecio enemigo (`pickupRadiusM`), y cualquier casco del escuadrón puede cobrarlo.
- **S169-D, el pecio es del viaje, no del casco.** El pecio vive en el guardado del mar. Volver al astillero y zarpar otra vez no lo resucita ni lo duplica: es una entrada más del mundo, con su id de `nextId`.
- **S169-E, un guardado viejo no trae un naufragio de vuelta.** Un guardado que ya tenía un casco con `wreck: true` en el astillero lo pierde al cargar. Decisión del jugador (verbatim): "Se descarta al cargar".

S170. **Si se hunde la capitana, otra nave del grupo toma el mando.** Pedido (verbatim): "si se nos hunde la capitana otra del grupo se hace capitana".
- **S170-A, el traspaso ya existe y se conserva.** `nextCommandShip` elige la primera nave aliada que sigue peleando; `handOverCommand` mueve el mando, la posición, el rumbo, la velocidad y el estado de combate a esa nave y la saca de la lista de escoltas. Nada de esto se reescribe.
- **S170-B, el traspaso se prueba de pantalla.** El smoke `smoke-command-handover.mjs` estaba rojo por un fixture que sembraba las dos naves en puerto (`yardId` de astillero), así que la escolta nunca entraba al escuadrón. Con `yardId: null` en las dos, el smoke da verde y prueba lo que dice probar.
- **S170-C, sin nadie a flote, se acaba.** Si se hunden todas las naves del escuadrón, no hay traspaso y aparece la pantalla de hundimiento. Esto no cambia.

## Tasks

- T80 — S169-A: quitar el campo `sinking.keepWreck` de `SETTINGS_FIELDS` y el grupo `sinking` de `SETTINGS_BRANCHES`; borrar las claves i18n del interruptor y del grupo. Ruta: inline.
- T81 — S169-B/C/D: `wreckHull` deja de devolver una ficha y pasa a describir el pecio; `loseHull` en `sea.js` borra el casco y encola el pecio; `world.js` gana la entrada en `encounters` con `nextId`. Ruta: inline.
- T82 — S169-B: limpiar `app.js` de la rama de naufragio (etiqueta, botón, reflotado) y retirar `floatsAgain`/`refloatCost`/`SINKING` del modelo. Ruta: inline.
- T83 — S169-E: descartar al cargar un casco con `wreck: true`; `isWreck` sobrevive sólo para eso. Ruta: inline.
- T84 — S169: tests nuevos en `test/own-wreck.test.js`; retirar `test/sinking.test.js` y `test/wreck-yard.test.js`; recortar la aserción del interruptor en `test/settings.test.js`. Ruta: inline, con OK explícito del jugador.
- T85 — S169/S170: actualizar `smoke-settings.mjs`, `smoke-yard-mooring.mjs` y `smoke-tabs.mjs`; arreglar el fixture de `smoke-command-handover.mjs`. Ruta: inline, con OK explícito del jugador.
- T86 — Verificación: `npm test` completo y los smokes tocados, con RED medido donde aplique. Ruta: inline.

## Log

L90 (pedido, verbatim): "barco nuestro hundido, no aparece en el astillero, quitamos la opcion de 'Un barco hundido queda como naufragio' y siempre queda como naufragio, y desaparece en el astillero".

L91 (decisiones del jugador, verbatim). Qué pasa con la nave: "Queda un pecio en el mar". Qué pasa con los guardados que ya tienen un naufragio: "Se descarta al cargar".

L92 (pedido nuevo, verbatim): "si se nos hunde la capitana otra del grupo se hace capitana". Diagnóstico: el traspaso ya está implementado (`nextCommandShip` + `handOverCommand` en `sea.js`), y el smoke que lo prueba estaba rojo por un fixture que sembraba las dos naves con `yardId` de puerto. Medido con un `console.log` inyectado por `page.route`: `allies()` devolvía una sola entrada, así que `nextCommandShip` no tenía a quién pasar el mando. Con `yardId: null` en las dos naves, el smoke da GREEN y conserva los dos caminos de siempre.

L93 (OK explícito del jugador para artefactos existentes). A retirar `test/sinking.test.js` y `test/wreck-yard.test.js` y sustituirlos por uno nuevo («Retirarlos y sustituirlos»), y a actualizar los tres smokes más el fixture del traspaso («Actualizar los tres»).

L94 (cierre, con los recortes que hicieron falta). Al correr la suite aparecieron **cinco** tests más que fijaban la regla retirada, dos de ellos fuera de la lista autorizada en L93. El jugador dio OK explícito a recortarlos («Recortar los dos casos»): `test/trading-ship.test.js` (el caso del naufragio que no comercia) y `test/sea-squadrons.test.js` (el casco `wreck: true` del fixture). Además, dentro de los dos ya autorizados: `test/captain-mooring.test.js` perdió el subcaso del capitán-naufragio — sin naufragios en la flota no hay nada que afirmar — y `test/fleet-mooring.test.js` perdió el casco `wreck` de su fixture. `test/settings.test.js` cambió la aserción del interruptor por la lista exacta sin `sinking.keepWreck`.

**Verificado**: `npm test` **1044/1044**. `test/own-wreck.test.js` son 10 tests nuevos; RED medido contra `HEAD` en un directorio aparte (`git archive`): el módulo ni siquiera exporta `ownWreck`. Smokes en 0: `smoke-settings`, `smoke-tabs`, `smoke-yard-mooring`, `smoke-command-handover`, `smoke-own-wreck` (nuevo), `smoke-fog`, `smoke-shipyard-layout`.

**RED honesto del smoke nuevo** (no el del export): revirtiendo **sólo** el filtro de `fleet.js` a `HEAD` y restaurando con `cmp` verificado, `smoke-own-wreck` falla nombrando la regla: «S169-E: a wreck left in a yard by an old save is still listed in the fleet».

**S170-B, medido**: el traspaso de mando ya funcionaba. El smoke estaba rojo porque `toRuntimeShip` deja `yardId` sin definir y `yardOf` lo resuelve al puerto de casa, así que la escolta nunca entraba al escuadrón y `nextCommandShip` no tenía a quién pasar el mando. Lo confirmé inyectando un `console.log` con `page.route` sobre `sea.js` sin tocar el fichero: `allies()` devolvía una sola entrada. Con `yardId: null` en las dos naves el smoke da GREEN y conserva los dos caminos de siempre (capitana que pelea conserva el mando; todo hundido muestra el hundimiento).

L95 (pregunta del jugador, verbatim): "si la capitana se hunde tambien desaparece". **Medido en navegador real antes de tocar nada**: sí, ya funcionaba. Con la capitana en `hull: 0` y una escolta sana, al abrir el mar el HUD pasa a la escolta, `fleet.ships` queda con una sola nave, `captainId` es la escolta, `world.ship.id` es la escolta y hay un `type: "wreck"` de 242 doblones en el agua. `handOverCommand` llama a `loseHull` con `playerCombat.status`, que `refreshStatus` ya puso en `"sunk"` al cargar.

**El hueco real no era el comportamiento, era la prueba**: ni un test ni un smoke cubrían el hundimiento de la **capitana**. `smoke-own-wreck` cubría el pecio de una escolta y `smoke-command-handover` el traspaso, pero nadie ataba las dos mitades. Se agregó el caso al final de `smoke-own-wreck`: capitanía hundida ⇒ fuera de la flota, mando a la escolta, HUD con el nombre nuevo, y pecio con oro en el agua.

**RED honesto**: excluyendo a la capitana de `leaveWreck` (`entry.id !== runtimeShip?.id`), el smoke falla nombrando la regla: "S169: the sunk flagship must leave a wreck in the water". Restaurado con `cmp`.

**Trampa anotada**: `buildShip` con `crew: { marino: 20 }` sobre un galeón pequeño es **infeasible** (`crew-below-minimum`, necesita 25). El smoke nuevo naufragó en el setup hasta sembrar `{ marino: 25, artillero: 4, soldado: 6 }`.
