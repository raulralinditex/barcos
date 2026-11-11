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
- Sólo se repara la nave que el jugador capitanea; las demás naves de la flota quedan como pendiente conocido. (Cerrado por S24.)

S24. En el puerto base también se reparan las naves de la flota que no son la capitana. Pedido: el usuario respondió "si a las dos" a "¿Querés poder reparar también las naves de la flota que no son la capitana?".
- Mismas reglas que S22: tarifa plana por nave (`REPAIR.fee`), instantáneo, sólo en el puerto base, con la misma bolsa de doblones; sin oro suficiente no cambia nada y se avisa; una nave sana no paga y no se ofrece.
- El panel de puerto del mar (`#port-panel`) lista cada nave dañada de la flota que no sea la capitana: nombre, casco en % y un botón "Reparar · {gold}". La capitana sigue con la tecla `R`.
- Reparar una nave no toca a las demás ni a la capitana, y el resultado se escribe en su ficha de la flota (S23), así que sobrevive a recargar.
- El panel y los botones salen en es y en en.

S23. La condición de combate vive en la ficha de la nave de la flota, no sólo en el autoguardado del mar: sobrevive a cambiar de capitana, a volver al astillero y a zarpar de nuevo. La ficha guarda `condition` (porcentajes de casco, aparejo, tripulación y moral) y `crewAlive` (la dotación superviviente por rol, para poder reponerla). Una nave sin `crewAlive` usa su dotación comprada: los guardados anteriores siguen abriendo.

## Tasks

- T27 — Tests primero de S22 y S23 (RED observado: el módulo `repair.js` no existía). `S22,S23` — inline — done — `10d0f3d`
- T28 — Modelo: `src/model/repair.js` puro (tarifa plana, veredicto, reparación) y condición por nave en `shipyard.js`, `fleet.js` y el autoguardado del mar. `S22,S23` — inline — done — `10d0f3d`
- T29 — Tests primero de S21 (RED observado: `damageDealt` no existía). `S21` — inline — done — `4468287`
- T30 — Modelo: `loadedShare`, `readyDamage`, `damageDealt` y `sidePieces` en `combat.js`; la andanada acumula lo que entra. `S21` — inline — done — `4468287`
- T31 — UI + i18n: barritas flotantes en espacio de pantalla, panel y tecla `R` de reparación en puerto, textos en es/en, ayuda en pantalla. `S21,S22,S11` — inline — done — `deadc8e`
- T32 — Smoke de navegador (`scripts/smoke-state.mjs`), regresión de la suite y de los smokes, documentación. `S21,S22` — inline — done — `deadc8e`
- T33 — Reparar naves de la flota que no son capitana: modelo, panel de puerto, i18n, smoke. `S24,S22,S23` — worker — done — (este commit)
- T34 — Arreglar el smoke de viento flaky (`scripts/smoke-wind.mjs`), con OK explícito del usuario. — inline — done — `efd1469`

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

L11 (verbatim): "las barras relacionadas con el lado del barco, ponmelas a cada lado, no todos juntas"

L12: S21 ajustada por pedido del usuario: las barras de daño y recarga de cada costado se dibujan a su banda (babor a babor, estribor a estribor), no apiladas con las de condición. Casco, aparejo y tripulación van en un bloque a popa, sobre la quilla. Los bloques giran con el casco (la banda es un lugar del barco, no de la pantalla) y cada uno se coloca a la distancia mínima que despeja el casco según el rumbo. Los dos costados se escalan contra el mismo máximo, así que se pueden comparar.

L13: Defecto propio hallado al mirar la captura, corregido: el panel de reparación (`#port-panel`) quedaba tapado por la rosa de los vientos, que ocupa el mismo centro inferior. Pasó a la izquierda, debajo del HUD del barco. El smoke no lo detectaba porque comprobaba visibilidad de DOM y no solapamiento; ahora además mide las tres zonas de barras (popa, babor, estribor) por separado.

L14 (verbatim): "el tamaño de las barras de los barcos deben de tener la misma escala para poder compararlos"

L15: S21 ajustada. Antes cada barco normalizaba sus barras de daño contra su propio costado más fuerte, así que una patache con tres piezas ligeras se veía tan llena como un galeón con medias culebrinas. Ahora hay **una escala común por fotograma**: el daño esperado de la batería entera (`sideCapacity`, en `combat.js`) del costado más fuerte entre todos los barcos dibujados. Cada barra es una fracción de esa escala. Para las barras de condición ya valía: son porcentajes del mismo ancho en todos los barcos.
- `sideCapacity` no baja a cero al recargar (a diferencia de `readyDamage`), para que las barras de un barco no salten cuando otro dispara. Cuenta sólo piezas con munición y con alcance.
- Las piezas del jugador se leen a la distancia del blanco más cercano en el radio de enganche (sin blanco, a quemarropa), para que los dos lados de un duelo estén en igual condición.
- El fondo "daño ya causado" se mide en andanadas de esa escala; cuatro andanadas llenan la barra (lo que `COMBAT.damageScale` calibra para hundir un casco de referencia).

L16: Evidencia — 206/206 tests (5 nuevos de `sideCapacity`: ignora la recarga, respeta el alcance, munición agotada, artilleros a cero, y que un galeón de guerra supera a una patache con la misma semilla). `smoke-state` compara la barra de un patache contra la de un jugador con medias culebrinas: 7 px contra 52 (0,135; el modelo da 4,4 / 29,8 = 0,148). Contra el dibujo anterior el mismo smoke falla (26 px), así que detecta el problema. Los otros 6 smokes con exit 0.

L17: Dos tropiezos de medición propios, corregidos en el smoke: contar píxeles amarillos cuenta también las trazadoras y los destellos de oro (mismo color), así que ahora se mide la corrida horizontal más larga; y la ventana del enemigo incluía la barra llena del propio jugador. El enemigo se siembra con las piezas cargadas para no depender de sus relojes aleatorios.

L18 (verbatim): "si a las dos"

L19: El usuario autoriza las dos propuestas abiertas: arreglar `scripts/smoke-wind.mjs` (T34) y reparar las naves de la flota que no son capitana (T33, S24). El OK para editar el smoke existente es explícito.

L20: T34 — `scripts/smoke-wind.mjs` ya no es flaky: 10 de 10 corridas pasan (antes 5 de 10 fallaban en el commit base). Había dos causas, no una: el rumbo se elegía con el viento de t=2 s pero se navegaba más tarde (el viento cambia cada ~12 s), y la posición final se leía de un autoguardado de hasta 3 s de antigüedad. Ahora el rumbo viaja en el mundo sembrado (sin timón), la semilla 99 da viento fuerte y estable en la ventana de navegación, y el estado final se guarda a demanda antes de leerlo. `efd1469`.

L21: T33 — el worker `gentle-ai-worker` (tarea `mwcoxkyd-1-y69m`) terminó con error del asistente antes de devolver su informe, pero dejó el trabajo hecho en el árbol. No di por bueno su informe (no hubo): revisé el diff completo y lo verifiqué yo. Modelo `damagedFleetShips` y `repairFleetShip` en `repair.js` (reusan `repairShip`, escriben en la ficha de la nave con `withShipCondition`, no tocan a la capitana ni a las demás); 6 tests nuevos; lista en `#port-panel` con un botón por nave que sólo se reconstruye cuando cambia (si no, se pierde el clic); claves `sea.port.fleet*` en es y en; checks 9, 10 y 11 en `smoke-state` (reparar una nave de la flota, una nave sana no se ofrece, sin oro no cambia nada, y la reparación sobrevive a recargar). No observé el RED del worker: sus tests existen y pasan, y fallarían sin las funciones (import inexistente).

L22: Evidencia — 212/212 tests; ocho smokes con exit 0: i18n, fleet, sea, combat, ui, swivel, state y wind.
