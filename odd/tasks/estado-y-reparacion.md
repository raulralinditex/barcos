# Juego de barcos — barritas de estado y reparación en puerto

Estado: en curso. Cierra las dos peticiones que quedaron abiertas en `odd/tasks/pendientes.md` (T25 barritas, T26 reparar).

## Specs

S21. Barritas de estado que siguen a cada barco en el canvas del mar, dibujadas sobre su posición y sin cambiar de tamaño con el zoom de la cámara. Pedido (verbatim): "vamos a añadir al barco informacion sobre el estado con barritas, una el daño que hace en cada lado, y otra el tiempo de recarga, asi como el daño del casco y de la tripulacion, esas barritas seguiran a cada barco, los barcos enemigos solo mostraran esa informacion cuando este a tiro"
- Familias: casco, aparejo y tripulación (condición de la nave); daño por costado (babor y estribor); recarga por costado.
- "El daño que hace en cada lado" muestra **las dos cosas** en la misma barra: el potencial de la próxima andanada de ese costado (segmento vivo) y el daño ya causado por ese costado (segmento apagado). Decisión del usuario: "Las dos cosas".
- La barra de recarga mide la **fracción de piezas cargadas** de ese costado. Decisión del usuario: "Fracción de piezas cargadas".
- "A tiro" es `COMBAT.engageRadiusM` (620 m), el mismo radio con el que ya se engancha el combate. Decisión del usuario: "Radio de enganche 620 m".
- El jugador ve sus barritas siempre; un enemigo las muestra al entrar en ese radio y con **todas** las familias, igual que el jugador. Decisión del usuario: "Todo, igual que el jugador".
- El aparejo lleva barrita además de casco y tripulación. Decisión del usuario: "Incluir aparejo".
- El panel de objetivo (`#target-panel`) sigue existiendo: las barritas se suman, no lo reemplazan. Decisión del usuario: "Convivir con el panel".

S22. Reparación de la nave en el puerto base del mar (la isla del origen, radio 110 m). Pedido (verbatim): "nos falta la opcion de reparar el barco"
- Se repara en el puerto base, no en el astillero. Decisión del usuario: "Puerto base del mar".
- Se repara la condición: casco, aparejo y tripulación vuelven a 100. La munición gastada no se repone. Decisión del usuario: "Condición: casco, aparejo, tripulación".
- Coste de **tarifa plana**: un precio fijo por reparar completo, sin importar cuánto daño tenga la nave. Decisión del usuario: "Tarifa plana".
- Instantáneo al pagar. Decisión del usuario: "Instantáneo al pagar".
- Sin oro suficiente no se repara nada: la condición y el oro quedan intactos y se avisa por pantalla. Una nave sin daño no paga nada.
- Sólo se repara la nave que el jugador capitanea; las demás naves de la flota quedan como pendiente conocido.

S23. La condición de combate vive en la ficha de la nave de la flota, no sólo en el autoguardado del mar: sobrevive a cambiar de capitana, a volver al astillero y a zarpar de nuevo. La ficha guarda `condition` (porcentajes de casco, aparejo, tripulación y moral) y `crewAlive` (la dotación superviviente por rol, para poder reponerla). Una nave sin `crewAlive` usa su dotación comprada: los guardados anteriores siguen abriendo.

## Tasks

- T27 — Tests primero de S22 y S23 (RED observado). `S22,S23` — inline — pending
- T28 — Modelo: `src/model/repair.js` puro (tarifa plana, veredicto, reparación) y condición por nave en `shipyard.js`, `fleet.js` y el autoguardado del mar. `S22,S23` — inline — pending
- T29 — Tests primero de S21 (RED observado). `S21` — inline — pending
- T30 — Modelo: `loadedShare`, `readyDamage` y `damageDealt` por costado en `combat.js`. `S21` — inline — pending
- T31 — UI + i18n: barritas flotantes sobre cada barco, panel y tecla de reparación en puerto, textos en es/en, ayuda en pantalla. `S21,S22,S11` — inline — pending
- T32 — Smoke de navegador, regresión de la suite y de los smokes, documentación. `S21,S22` — inline — pending

## Log

L1 (verbatim): "seguimos donde estabamos"

L2: Al reabrir, el estado era: rama `feat/t7-combate-costados` limpia en `55c6ea5`, 182/182 tests, y dos peticiones registradas sin empezar en `odd/tasks/pendientes.md` (T25 barritas de estado, T26 reparar el barco). El usuario pidió encararlas "uno detras del otro" (custom, textual).

L3: Decisiones cerradas por el usuario para T25 (barritas): daño por lado = "Las dos cosas" (potencial listo y daño acumulado); "a tiro" = "Radio de enganche 620 m"; el panel de objetivo "Convivir con el panel"; recarga = "Fracción de piezas cargadas"; el enemigo muestra "Todo, igual que el jugador"; el aparejo "Incluir aparejo".

L4: Decisiones cerradas por el usuario para T26 (reparar): dónde = "Puerto base del mar"; qué = "Condición: casco, aparejo, tripulación"; coste = "Tarifa plana"; tiempo = "Instantáneo al pagar".

L5: Hallazgo que ordena el trabajo (verificado en el código): la condición no persiste por nave. `toRuntimeShip` fija `condition: {hull:100,...}` (`src/model/shipyard.js:154`) y `saveGame()` sólo escribe el daño en `barcos:game → combat.player` (`src/ui/sea.js:166`), así que al volver al astillero o cambiar de capitana se pierde. Reparar exige primero S23, y el campo `condition` ya existe en la ficha: el cambio es aditivo (`crewAlive`), sin subir la versión del formato.
