# Juego de barcos — la flota zarpa en formación

Estado: cerrado y verificado. T41-T44.

## Specs

S35. El jugador elige con qué naves zarpa. Pedido (verbatim): "en el astillero, en el paner de la flota, cada barco tiene un check, zarpan todos los barcos con el check activado"
- Cada nave de la flota tiene un check en el panel de la flota del Astillero. Zarpa la capitana y toda nave con el check activo.
- La capitana no se puede desmarcar: es la nave que el jugador lleva. Su check está activo y bloqueado.
- Con la flota vacía no hay nada que marcar. Al comprar una nave nueva, se marca sola.
- La selección se guarda con la flota, no en una clave aparte: una nave nueva nace marcada, así que un guardado viejo (sin el campo) sigue zarpando con todo, que es lo que hacía antes.

S36. Las demás naves **siguen a la capitana en formación** y combaten de verdad. Pedido (verbatim): "las demás te siguen en formación (y entonces combaten y pueden hundirse), puedes seleccionar cual es la capitana"
- Cada nave marcada navega en una posición de la formación relativa a la capitana: la primera a la popa de la capitana, la segunda a su costado de babor, la tercera a estribor, y de ahí en dos columnas. La formación gira con el rumbo de la capitana.
- La nave sigue su puesto con su propia velocidad: acelera y vira hacia el punto de formación, nunca se teletransporta. Si se queda atrás, queda atrás.
- Las naves de la flota disparan sus andanadas cuando el enemigo entra en su arco y su alcance, con sus propias recargas. No disparan solas de la nada: necesitan blanco.
- Los enemigos eligen como blanco la nave aliada **más cercana**, capitana o no. El daño va a la nave que recibe el disparo.
- Una nave de la flota que se hunde **sale de la flota** y se avisa en pantalla. La capitana hundida termina la partida, como hasta ahora.
- El estado (casco, aparejo, tripulación) de cada nave escolta vive en su ficha de la flota y sobrevive al autoguardado, igual que la de la capitana (S23).

S37. La capitana se elige en el panel de la flota (ya existe: la lista marca la capitana y otra nave se capitanea con un clic). Con la elección de S36, cambiar de capitana cambia qué nave lleva el mando de la formación y cuál termina la partida si se hunde.

S38. Idioma: los textos nuevos (check, aviso de nave hundida, formación) existen en es y en.

S39. Compatibilidad: un guardado anterior a esta feature abre y navega con una sola nave, la capitana, sin perder nada.

## Tasks

- T41 — Modelo de formación: `formationOffset`, `stepEscort` y `escorts` en el mundo con serialización. `S36,S39` — inline — done
- T42 — Escoltas en el mar: combatientes propios, disparo, blanco más cercano y nave hundida fuera de la flota. `S36` — inline — done
- T43 — Check de zarpe en el panel de la flota del Astillero. `S35,S37` — inline — done
- T44 — i18n, smoke de navegador y documentación. `S35,S36,S38` — inline — done

## Log

L1 (verbatim): "en el astillero, en el paner de la flota, cada barco tiene un check, zarpan todos los barcos con el check activado"

L2: Ante la pregunta de qué cambia en el mar con varias naves, el usuario eligió (verbatim): "las demás te siguen en formación (y entonces combaten y pueden hundirse), puedes seleccionar cual es la capitana".

L3: Alcance fijado. Hoy el mar simula **una** nave (`world.ship`) y la capitana es la única que existe como combatiente (`createPlayerCombatant`). La feature agrega una lista de escoltas al mundo, cada una con su combatiente, y cambia el blanco del enemigo de "la capitana" a "la nave aliada más cercana". No se toca el combate por costados: las escoltas usan `fireBroadside` tal cual.

L4: Implementación. `src/model/formation.js` (nuevo): `formationOffset` (la primera escolta a popa, después dos columnas alternas), `escortStation` (rota con el rumbo de la capitana), `stepEscort` (vira y acelera hacia su puesto, nunca salta) y `createEscort` (nace ya en su puesto). `src/model/squadron.js` (nuevo): `closestTarget`, `escortFire`, `pruneAllies`, `squadronStatus`. `world.escorts` se mueve dentro de `updateWorld` y se serializa; un guardado sin el campo abre con la lista vacía (S39).

L5: Decisiones de implementación que el pedido no fijaba: la formación son dos columnas que caen hacia atrás, no una fila ancha, para no tapar las andanadas de la capitana; el escolta iguala la velocidad de la capitana más un margen (`closingShare`) para cerrar el hueco, porque apuntar a una fracción de su propia velocidad lo dejaba siempre atrás; un escolta rendido se pierde igual que uno hundido, porque deja de obedecer.

L6: Tres bugs propios que encontraron los tests y el smoke, todos reales:
1. Un escolta nuevo nacía encima de la capitana (`createEscort` no usaba su puesto).
2. Un escolta restaurado de un guardado con el casco a 0 seguía con `status: "fighting"` y navegaba como si estuviera sano; se agregó `refreshStatus` en combat.js.
3. Reparar un escolta en el puerto actualizaba su ficha de flota pero no su combatiente vivo, y el guardado del mar (que es el que gana al recargar, S23) devolvía el daño viejo. Se agregó `healEscortFromFleet`.

L7: Evidencia. 310/310 tests (`npm test`), incluidos `formation.test.js` (17) y `squadron.test.js` (14). Smokes con exit 0: i18n, fleet, sea, combat, ui, swivel, state, dock, time, wind, country, purse, settings, images y formation. `scripts/smoke-formation.mjs` prueba las cuatro reglas de punta a punta en el navegador: sólo zarpa lo marcado, el escolta mantiene formación a entre 20 y 400 m de la capitana, su daño se escribe en el guardado, y un escolta hundido sale de la flota sin terminar la partida.

L8 (verbatim, usuario): "cuando tenemos dos barcos con el check activo,y salimos a la mar,  no cosigo ver los dos barcos en el mar"

L9: Corrección de L7. La evidencia de L7 era engañosa: las escoltas **no se dibujaban ni se movían**, y los smokes pasaban igual. Causas: (1) `drawSea` sólo dibujaba la capitana; (2) el bucle de `frame` reescribía `world.escorts` con las posiciones viejas antes de copiar las nuevas, así que `stepEscort` corría pero su resultado se descartaba; (3) `smoke-formation.mjs` comprobaba "a más de 50 m del origen", y la escolta nacía a 120 m, así que pasaba sin moverse. Además T44 había dado por hechos los textos de S38, pero `sea.banner.escortFire` y `sea.banner.escortLost` no estaban en ningún catálogo y se veían como clave cruda.

L10: Arreglo (sin commitear todavía): `drawEscortShip` en `src/ui/sea.js`, la sincronización reordenada (copiar posiciones, combatir, y recién entonces rearmar `world.escorts`), las dos claves en es y en, y `scripts/smoke-visible-escorts.mjs` (la escolta marcada se ve y sigue a la capitana; la desmarcada se queda en puerto). Con OK explícito del usuario se ajustaron dos aserciones de `smoke-formation.mjs`: el seguimiento se mide como "se alejó de su puesto inicial" y el enemigo del escenario 3 pasó de `galeon-guerra` a `patache`, porque ahora la escolta combate de verdad y un galeón de guerra la hundía por azar dentro de la ventana del smoke.

L11: Las barritas de estado y el minimapa de las escoltas, que quedaron fuera de S36, se hicieron en S42 (`odd/tasks/estado-flota-y-reparacion-parcial.md`).
