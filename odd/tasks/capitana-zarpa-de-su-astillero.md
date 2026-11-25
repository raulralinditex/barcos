# La capitana zarpa de su astillero

Con varias capitanas, la del astillero que el jugador tiene en pantalla no podía zarpar desde ahí y no aparecía en el mar junto a su propio muelle. Además, el jugador decide si el enemigo puede disparar al astillero.

## Specs

S183. **Zarpa la capitana del astillero en pantalla, y aparece junto a su muelle.** Reporte del jugador (verbatim, en inglés en la ficha de la prueba): "with a captain bought in ensenada-abierta (renamed "aguas costeras") and another in cala-del-abismo ("mar abierto"), buying a second hull in the first yard must show her as that yard's capitana, and setting sail with her must take her out of that yard and leave her next to its quay — not next to the other ships".
- **S183-A, el astillero del hash se dibuja antes que la lista.** Entrar a un astillero por hash (`index.html#flota:<astillero>`, lo que escribe el mar) pintaba la flota con el astillero de casa todavía puesto, así que la lista mostraba los cascos de otro sitio o ninguno.
- **S183-B, la etiqueta «capitana» lee el mando, no la capitana de la flota.** Una nave que se manda a sí misma (`commandId === id`) es capitana de su mando aunque no sea la capitana que el jugador navega; antes se dibujaba como casco llano y se le ofrecía un ascenso que ya tenía.
- **S183-C, zarpa la capitana de este astillero.** `departYard` zarpaba `fleet.captainId`, así que una capitana que no fuera la de la flota nunca podía salir de su astillero. Ahora zarpa la capitana del astillero en pantalla (la que el jugador eligió), y sin elección zarpa la de la flota, que es la regla de S182.
- **S183-D, la escuadra aparece en el ancla de su astillero.** Un mando que el mar nunca tuvo se colocaba en un anillo a 420 m de la capitana de la flota. Ahora se coloca en el ancla del astillero del que zarpó (`stationYardId`), y una escuadra que el mar ya tiene conserva su estación.
- **S183-E, la marca de zarpe se gasta.** `stationYardId` lo pone el zarpe y lo consume la colocación; `mergeSeaFleet` lo descarta al volver a la hoja de flota, para que un guardado viejo no teletransporte la escuadra en cada arranque.
- **S183-F, un casco que no manda en ese astillero no zarpa.** Una capitana nombrada que no es capitana de ese astillero se rechaza; la elección se ignora y no mueve nada.

S184. **El enemigo dispara al astillero si el jugador lo enciende.** Decisión del jugador (verbatim): "el enemigo dispara al astillero o no, si dispara, lo hace por area exactamente como si fuera un barco nuestro". Y sobre el valor inicial (verbatim): "valor por defecto apagado".
- **S184-A, hay un interruptor y es del jugador.** `combat.enemyFiresAtYard` en el bloque de combate de Configuración, como casilla, con su texto y su ayuda en es y en.
- **S184-B, viene apagado.** Hasta que el jugador lo encienda, ningún enemigo apunta al astillero: el mar se juega como siempre.
- **S184-C, encendido el astillero es un blanco más.** Entra en la misma elección de blanco más cercano que un casco nuestro, con la misma puntería y las mismas andanadas, y su daño va por su propia regla (`damageFort`).
- **S184-D, el mar lee el interruptor, no una rama fija.** El valor se consulta en vivo; un valor roto cae en apagado, nunca en un lado al azar.
- **S184-E, un astillero bombardeado no maniobra.** La escuadra que la bombardea dispara desde donde está: las murallas no son una amura que se presenta. Esa rama es del astillero, no una regla de puntería aparte.

## Tasks

- T125 — S183-A/B: el astillero del hash antes del primer dibujo y la etiqueta por `commandId` en `src/ui/app.js`. Ruta: inline. Hecho.
- T126 — S183-C/F: `departYard(fleet, yardId, captainId)` en `src/model/fleet.js` y `sailingCaptainId()` en `src/ui/app.js`. Ruta: inline. Hecho.
- T127 — S183-D/E: `withAfloatSquadrons` y las anclas en `src/model/world.js`, el cableado en `boot()` de `src/ui/sea.js` y el descarte en `mergeSeaFleet`. Ruta: inline. Hecho.
- T128 — S184-A/B/C/D/E: `YARD_FIRE`/`enemyFiresAtYard()` en `src/model/settings.js`, el interruptor en `SETTINGS_FIELDS`, la elección de blanco en `src/ui/sea.js`, i18n es/en. Ruta: inline. Hecho.
- T129 — S183: `test/yard-captains.test.js` (11 tests) y `scripts/smoke-yard-captains.mjs`. Ruta: inline. Hecho.
- T130 — S184: `test/enemy-yard-fire.test.js` (6 tests) y `scripts/smoke-enemy-yard-fire.mjs`. Ruta: inline. Hecho.
- T131 — Verificación: `npm test` completo y los smokes de la tanda, con RED medido. Ruta: inline. Pendiente.

## Log

L121 (pedido de S183, verbatim de la ficha de la prueba): "with a captain bought in ensenada-abierta (renamed "aguas costeras") and another in cala-del-abismo ("mar abierto"), buying a second hull in the first yard must show her as that yard's capitana, and setting sail with her must take her out of that yard and leave her next to its quay — not next to the other ships".

L122 (pedido de S184, verbatim): "el enemigo dispara al astillero o no, si dispara, lo hace por area exactamente como si fuera un barco nuestro". Valor inicial, verbatim: "valor por defecto apagado". Se actualizaron dos pruebas existentes con OK explícito del jugador ("Actualizar ambas pruebas"): la cuenta de casillas de Configuración y el asedio de `smoke-fort-combat`, que ahora enciende el interruptor para poder medir el bombardeo.

L123 (estado al retomar, medido): `npm test` **1136/1136** en verde. `smoke-enemy-yard-fire` y `smoke-fort-combat` en 0. `smoke-yard-captains` **en rojo** en su regla D: «the sea must show the captain who just sailed, it holds []» — la capitana que zarpó no aparece en `world.squadrons` del mar. Las reglas A, B y C del mismo smoke pasan.

L124 (causa de la regla D, medida): **el defecto era de la prueba, no del producto.** El mar publica su mundo en un autoguardado cada 3000 ms (`setInterval(saveGame, 3000)`, `src/ui/sea.js:4057`) y no escribe nada durante `boot()`. El fixture del smoke ya sembraba un registro `barcos:game:v1` con un `world` propio, así que la espera «¿hay un world?» era cierta **antes** de que el mar escribiera nada y el smoke leía el mundo del fixture, que no tiene `squadrons`. Eso explica la asimetría exacta: la regla C lee `barcos:fleet:v1`, que el astillero escribe de forma síncrona antes de navegar, y pasa; la D lee la clave del mar, todavía 3 s vieja, y falla. La cadena del modelo era correcta de punta a punta: `departYard` pone `stationYardId`, `deserializeFleet` lo conserva, `captains()` acepta a la capitana por `commandId` y `harbourAnchor` devuelve el ancla. Ahora el smoke espera la escuadra **en el registro del mar** (`world.squadrons` con el id que zarpó) en vez de un tiempo fijo.

**RED y GREEN medidos**: con el arreglo de la prueba el smoke pasa a 0. Reintroduciendo el defecto del modelo en una copia (`withAfloatSquadrons` como passthrough, sha del original `46104f1`), el smoke revienta con `TimeoutError` esperando la escuadra: la prueba mide de verdad la colocación y no un tiempo.

L125 (cierre de S183). `npm test` **1136/1136**. Smokes en 0: `yard-captains` (nuevo), `departure`, `fleet-squadrons`, `sea-squadrons`, `dock`, `yard-entry`, `yard-mooring`, `sea-fleet-yard`, `handover`, `yard-switch`, `shipyard-from-sea`.

**Un smoke rojo que NO es de S183**, comprobado con `git stash push -u` y `HEAD` limpio: `smoke-fleet` falla igual sin este cambio, con «the new hull should be captain, got Golden Hind», «expected to re-promote Golden Hind, got Avispa» y «sailing must not lose the fleet, got 1 nave». Es la regla que cambió S179 (una capitana por astillero, la compra se suma a la capitana existente), no S183; el smoke fija la regla anterior. No se tocó: la regla global pide OK explícito del jugador por artefacto. Queda como punto abierto en `pendientes.md`.

