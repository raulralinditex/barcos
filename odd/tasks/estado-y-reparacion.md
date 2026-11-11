# Juego de barcos — barritas de estado y reparación en puerto

Estado: completado y verificado. Cierra las dos peticiones que quedaron abiertas en `odd/tasks/pendientes.md` (T25 barritas, T26 reparar).

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

- T27 — Tests primero de S22 y S23 (RED observado: el módulo `repair.js` no existía). `S22,S23` — inline — done — `10d0f3d`
- T28 — Modelo: `src/model/repair.js` puro (tarifa plana, veredicto, reparación) y condición por nave en `shipyard.js`, `fleet.js` y el autoguardado del mar. `S22,S23` — inline — done — `10d0f3d`
- T29 — Tests primero de S21 (RED observado: `damageDealt` no existía). `S21` — inline — done — `4468287`
- T30 — Modelo: `loadedShare`, `readyDamage`, `damageDealt` y `sidePieces` en `combat.js`; la andanada acumula lo que entra. `S21` — inline — done — `4468287`
- T31 — UI + i18n: barritas flotantes en espacio de pantalla, panel y tecla `R` de reparación en puerto, textos en es/en, ayuda en pantalla. `S21,S22,S11` — inline — done — `deadc8e`
- T32 — Smoke de navegador (`scripts/smoke-state.mjs`), regresión de la suite y de los smokes, documentación. `S21,S22` — inline — done — `deadc8e`

## Log

L1 (verbatim): "seguimos donde estabamos"

L2: Al reabrir, el estado era: rama `feat/t7-combate-costados` limpia en `55c6ea5`, 182/182 tests, y dos peticiones registradas sin empezar en `odd/tasks/pendientes.md` (T25 barritas de estado, T26 reparar el barco). El usuario pidió encararlas "uno detras del otro" (custom, textual).

L3: Decisiones cerradas por el usuario para T25 (barritas): daño por lado = "Las dos cosas" (potencial listo y daño acumulado); "a tiro" = "Radio de enganche 620 m"; el panel de objetivo "Convivir con el panel"; recarga = "Fracción de piezas cargadas"; el enemigo muestra "Todo, igual que el jugador"; el aparejo "Incluir aparejo".

L4: Decisiones cerradas por el usuario para T26 (reparar): dónde = "Puerto base del mar"; qué = "Condición: casco, aparejo, tripulación"; coste = "Tarifa plana"; tiempo = "Instantáneo al pagar".

L5: Hallazgo que ordena el trabajo (verificado en el código): la condición no persiste por nave. `toRuntimeShip` fija `condition: {hull:100,...}` (`src/model/shipyard.js:154`) y `saveGame()` sólo escribe el daño en `barcos:game → combat.player` (`src/ui/sea.js:166`), así que al volver al astillero o cambiar de capitana se pierde. Reparar exige primero S23, y el campo `condition` ya existe en la ficha: el cambio es aditivo (`crewAlive`), sin subir la versión del formato.

L6: Dos aserciones mías estaban mal en el primer RED de S21 y las corregí antes de dar el modelo por bueno: el `falcon` recarga a 4 s y el `minion` a 4,5 s (había escrito lo contrario), y la semilla 3 no acertaba con la giratoria (usé la 8). Son tests nuevos, no tests existentes.

L7: El smoke destapó un bug real que la suite no podía ver: `fleet` se declaraba `const` en `sea.js` y la reparación lo reasignaba (`Assignment to constant variable`). Pasó a `let`. También se corrigió el arranque: `createPlayerCombatant` ahora lee la condición y la dotación superviviente de la ficha de la flota, en vez de asumir 100.

L8: Evidencia — 201/201 tests node (`npm test`). Smokes con exit 0: i18n, fleet, sea, combat, ui, swivel y state (el nuevo, 4 corridas seguidas verdes).

L9: Aviso para el usuario, sin tocar nada: `scripts/smoke-wind.mjs` es **flaky desde antes de esta feature**. Corriendo el mismo script 10 veces contra el commit base `55c6ea5` en un worktree aparte (`/tmp/barcos-base`), falló 5 de 10 con "downwind should cover more ground" / "downwind should be faster". Causa: el bucle de timón del smoke lee el rumbo desde `localStorage`, que sólo se guarda cada 3 s, así que corrige con datos viejos y a veces no llega al rumbo pedido. No lo edité: la regla vigente pide confirmación explícita antes de tocar un test existente.

L10: Pendiente conocido de S22, no implementado: sólo se repara la nave capitana. Las otras naves de la flota siguen sin reparación porque el puerto no tiene interfaz de flota. Queda anotado, no se pidió.

## Estado

- Rama `feat/t7-combate-costados`, tres commits nuevos sobre `55c6ea5`: `10d0f3d`, `4468287`, `deadc8e`.
- Merge y PR los hace el usuario, como pidió.
- Para jugar: `python3 -m http.server 8765` en la raíz y `http://localhost:8765/index.html`.
- La reparación se paga con doblones del mar: al botar una nave el astillero reinicia la bolsa, así que el precio de 400 se paga con lo que se rescató.
