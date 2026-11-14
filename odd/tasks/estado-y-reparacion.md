# Juego de barcos — barritas de estado y reparación en puerto

Estado: cerrado; la tarifa plana se reemplazó por una reparación proporcional (S40) y la falta de oro por una reparación parcial (S45).

Historial: completado y verificado. Cierra las dos peticiones que quedaron abiertas en `odd/tasks/pendientes.md` (T25 barritas, T26 reparar).

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
- Sin oro suficiente no se repara nada: la condición y el oro quedan intactos y se avisa por pantalla. Una nave sin daño no paga nada. **(Reemplazado por S45: con poco oro se repara una parte proporcional; sólo con 0 doblones no cambia nada.)**
- Sólo se repara la nave que el jugador capitanea; las demás naves de la flota quedan como pendiente conocido. (Cerrado por S24.)

S24. En el puerto base también se reparan las naves de la flota que no son la capitana. Pedido: el usuario respondió "si a las dos" a "¿Querés poder reparar también las naves de la flota que no son la capitana?".
- Mismas reglas que S22: tarifa plana por nave (`REPAIR.fee`), instantáneo, sólo en el puerto base, con la misma bolsa de doblones; sin oro suficiente no cambia nada y se avisa (reemplazado por S45: se repara una parte); una nave sana no paga y no se ofrece.
- El panel de puerto del mar (`#port-panel`) lista cada nave dañada de la flota que no sea la capitana: nombre, casco en % y un botón "Reparar · {gold}". La capitana sigue con la tecla `R`.
- Reparar una nave no toca a las demás ni a la capitana, y el resultado se escribe en su ficha de la flota (S23), así que sobrevive a recargar.
- El panel y los botones salen en es y en en.

S23. La condición de combate vive en la ficha de la nave de la flota, no sólo en el autoguardado del mar: sobrevive a cambiar de capitana, a volver al astillero y a zarpar de nuevo. La ficha guarda `condition` (porcentajes de casco, aparejo, tripulación y moral) y `crewAlive` (la dotación superviviente por rol, para poder reponerla). Una nave sin `crewAlive` usa su dotación comprada: los guardados anteriores siguen abriendo.

S25. Al llegar a puerto se pregunta si se quiere arreglar el barco y se muestra qué hay que arreglar. Pedido (verbatim): "cuando se llega al astillero se pregunta si se quiere areglar el barco, mostramos la informacion de que hay que areglar"
- Dónde: en los dos sitios (decisión del usuario: "En los dos sitios"): en el puerto base del mar, y en la pantalla del Astillero (`index.html`).
- Mar: el diálogo sale al entrar en el radio del puerto viniendo de fuera, y al abrir el mar ya dentro del puerto con algo dañado. Astillero: sale al abrir la pantalla si hay naves dañadas.
- Convive con lo anterior (decisión del usuario: "Conviven"): el panel de puerto, los botones de S24 y la tecla `R` siguen funcionando igual.
- Contenido: por cada nave dañada (la capitana y las demás): nombre, casco %, aparejo %, tripulación (vivos de la dotación comprada y %), y el precio de reparar (tarifa plana de S22). Sólo se listan los segmentos dañados o la nave entera dañada; una nave sana no aparece.
- Botones: "Reparar · {gold}" por nave y "Ahora no", que cierra. Sin oro suficiente el botón no repara, queda marcado y se dice cuánto falta. **(Reemplazado por S45: el botón repara una parte mientras haya algo de oro y dice cuánto se arregla.)** Reparar usa las mismas reglas de S22/S24 y se escribe en la ficha de la flota (S23).
- Una vez por llegada: tras "Ahora no" o tras reparar no vuelve a salir mientras siga en el puerto; vuelve a salir si sale y entra otra vez. No sale si nada está dañado ni en la pantalla de hundimiento.
- En el Astillero la reparación usa la bolsa del Astillero y actualiza la bolsa que se muestra; también puede reparar la capitana (ahí no navega).
- El diálogo y todos sus textos salen en es y en en.

## Tasks

- T27 — Tests primero de S22 y S23 (RED observado: el módulo `repair.js` no existía). `S22,S23` — inline — done — `10d0f3d`
- T28 — Modelo: `src/model/repair.js` puro (tarifa plana, veredicto, reparación) y condición por nave en `shipyard.js`, `fleet.js` y el autoguardado del mar. `S22,S23` — inline — done — `10d0f3d`
- T29 — Tests primero de S21 (RED observado: `damageDealt` no existía). `S21` — inline — done — `4468287`
- T30 — Modelo: `loadedShare`, `readyDamage`, `damageDealt` y `sidePieces` en `combat.js`; la andanada acumula lo que entra. `S21` — inline — done — `4468287`
- T31 — UI + i18n: barritas flotantes en espacio de pantalla, panel y tecla `R` de reparación en puerto, textos en es/en, ayuda en pantalla. `S21,S22,S11` — inline — done — `deadc8e`
- T32 — Smoke de navegador (`scripts/smoke-state.mjs`), regresión de la suite y de los smokes, documentación. `S21,S22` — inline — done — `deadc8e`
- T33 — Reparar naves de la flota que no son capitana: modelo, panel de puerto, i18n, smoke. `S24,S22,S23` — worker — done — (este commit)
- T35 — Diálogo de reparación al llegar a puerto (mar y Astillero), con el detalle de lo dañado. `S25,S22,S23,S24` — worker — done — (este commit)
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

L23 (verbatim): "cuando se llega al astillero se pregunta si se quiere areglar el barco, mostramos la informacion de que hay que areglar"

L24: Decisiones del usuario sobre L23: dónde = "En los dos sitios"; qué pasa con el panel y la tecla R = "Conviven". Se agrega S25 y T35.

L25: T35 (S25). RED observado dos veces: primero en `node --test test/repair.test.js`, que falló con `SyntaxError: ... does not provide an export named 'damagedShips'` (217 tests escritos, 5 nuevos, ninguno podía correr); después en el navegador, con `scripts/smoke-dock.mjs` contra el código base servido en un directorio temporal aparte (`http://localhost:8766`): el smoke murió esperando `#dock-later`, porque el diálogo no existía. GREEN: `npm test` 217/217 y el mismo smoke en exit 0.

L26: Modelo — `repairReport(ship)` devuelve `{hull, rigging, crew, morale, crewAlive, crewBought, damaged, cost}` con `conditionOf`/`crewAliveOf` (los vivos y la dotación comprada contados como hombres, no como porcentaje) y `damagedShips(fleet)` lista las dañadas incluyendo a la capitana; `damagedFleetShips` queda igual para el panel de S24. `repairFleetShip` toma un cuarto argumento `{ allowCaptain = false }`: el mar no lo pasa (S24 intacto, la capitana sigue yendo por `repairShip`), el Astillero sí.

L27: Trampa del guardado, resuelta — `barcos:game:v1` puede traer `combat.player` del último viaje y el mar lo prefiere al abrir (`boot()`), así que reparar la capitana en el Astillero también reescribe `condition` y `crew` de ese registro, conservando `world`, `pieces` y `gold`. El smoke lo comprueba abriendo `sea.html` después y leyendo el HUD: casco 100 %.

L28: Un detalle que sólo se veía en el navegador: el diálogo se abre con `show()` y no con `showModal()`. Modal de verdad, el `::backdrop` se come los clics del `#port-panel` y de los botones de S24 que quedan detrás, y el smoke existente `smoke-state` falló por eso (`<dialog ...> intercepts pointer events`). Con `show()` conviven, que es lo que pidió el usuario. Escape se maneja a mano porque un `dialog` no modal no se cierra solo; mientras está abierto el diálogo se queda con el teclado (WASD, Q/E) salvo `R`, y al cerrarlo el juego sigue andando.

L29: Evidencia — `npm test` 217/217. `node --check src/ui/sea.js src/ui/app.js` sin errores. Smokes con exit 0, uno por vez y con `sleep 1` entre ellos: i18n, fleet, sea, combat, ui, swivel, state, wind y el nuevo dock. `smoke-combat` falló una vez en una corrida larga (la máquina se quedó sin procesos: `fork: Resource temporarily unavailable` en el bucle); corrido solo, exit 0 dos veces.

## S40 — reparación proporcional (reemplaza la tarifa plana de S22)

L24 (verbatim): "el coste de reparacion sera un valor en tanto % del valor del buque, por defecto el 20% para el 100% de reparacion, siendo este valor proporcional al daño"

S40. El coste de reparar una nave es una parte del valor del buque, proporcional al daño:
- La parte por defecto es el **20 %** del valor del buque para una reparación completa.
- El coste real es `valor × parte × daño`, donde el daño va de 0 (casco intacto) a 1 (destruido). Un barco a media condición paga la mitad de la parte.
- El **segmento peor** decide el daño: casco, aparejo, tripulación o moral, el que esté más bajo. Un casco sano con el aparejo destrozado necesita la carena entera.
- El valor del buque es lo que el jugador pagó por él (`paidGold`); si un guardado viejo no lo trae, cae al precio de catálogo del casco.
- El coste se redondea a doblones enteros y nunca es negativo.
- La parte es ajustable desde la pantalla de configuración (`repair.shareOfPrice`, 0-100 %).

L25: Implementación. `REPAIR.fee` (tarifa plana) se reemplaza por `REPAIR.shareOfPrice` = 0.2; `repairFee()` desaparece y en su lugar están `damageShare(ship)`, `shipValue(ship)` y `repairCost(ship)`. El recibo del puerto (`repairReport`) ahora lleva también `damage` y `value`, y el panel muestra la parte como ayuda. Tests y smokes que fijaban la tarifa plana se reescribieron al contrato nuevo: es un cambio de contrato pedido por el usuario, no un test aflojado.

## S45 — reparación parcial (reemplaza "sin oro no se repara nada" de S22, S24 y S25)

L30 (verbatim): "en reparacion, si el valor de reparacion es mayor al valor que tenemos, la reparacion sera el valor que tenemos, y la reparacion sera proporcional al precio"

S45. Si el coste de reparar (S40) supera el oro, se gasta **todo el oro** y se repara la fracción `oro / coste` de lo que falta en cada segmento (casco, aparejo, tripulación y moral).
- Es proporcional al precio: con la mitad del coste se repara la mitad del daño. La tripulación repuesta se redondea a hombres enteros y nunca supera la dotación comprada.
- Con 0 doblones no se repara ni se gasta nada, y la bolsa nunca queda negativa (S32). Con oro suficiente todo sigue como en S40.
- Aplica a la capitana (tecla `R`), a las demás naves del puerto (S24) y al diálogo de llegada (S25), en el mar y en el Astillero. El panel y el diálogo dicen que la reparación será parcial y cuánto se arregla; el botón sólo se bloquea con la bolsa en 0.
- El resultado se escribe en la ficha de la flota (S23) y en el guardado del mar.
- **El precio que muestra cada oferta nunca supera el oro que hay** (L35): con una bolsa corta el botón dice cuánto se va a cobrar de verdad (todo el oro), no el coste completo.

L31: Implementación: `repairShip` en `src/model/repair.js` devuelve `partial`, `fraction`, `spent` y `missing`. Tests y smokes que fijaban "sin oro no cambia nada" se reescribieron con el consentimiento explícito del usuario: tres tests de `test/repair.test.js` (S22, S24, S25) y las aserciones del banner corto de `smoke-state.mjs` y del botón `is-short` de `smoke-dock.mjs`; después, otras aserciones del mismo tipo en `smoke-state.mjs` (l.512-513). El fixture de `smoke-state.mjs` (l.404-405) decía tripulación 70 % con 21 de 70 hombres (30 % real) y se corrigió a 49 de 70, sin tocar ninguna aserción de precio.

L32: Dos defectos que la implementación destapó, ambos corregidos: (1) la cotización y la reparación del mar usaban el casco y la tripulación de la última ficha de la flota en lugar del daño vivo de `playerCombat` o de la escolta (el smoke vio "642 doblones" donde correspondían 865); (2) al arrancar, `sea.js` recalculaba la condición de la tripulación desde los hombres y la redondeaba, así que 57,4971 volvía como 57. Ahora se conserva el valor guardado si es coherente con los hombres a bordo.

L33: Hallazgo propio al revisar la entrega: `savePurse` de `src/ui/app.js` sólo parchaba `combat.player`, así que una escolta reparada en el Astillero volvía al mar con el daño viejo (el guardado del mar gana al arrancar, S23). RED observado con `scripts/smoke-escort-dock.mjs` (casco 40 y aparejo 55 al zarpar) y arreglado: ahora parchea también `combat.escorts[id]`.

L34: Evidencia. `npm test` 325/325. Smokes con exit 0: dock, state, purse, fleet, sea, ui, combat, time, i18n, images, swivel, country, settings, wind, formation, visible-escorts, escort-hud y escort-dock.

L35 (verbatim): "en el panel Shall we repair the fleet, el precio de la reparacion no puede exceder el total de doblones que hay, reparando el %acorde a los doblones que haya"

L36: Lo que se reparaba ya era proporcional (S45); lo que estaba mal era lo que se **mostraba**: con 37 doblones el botón del diálogo decía "Reparar · 1124" (RED observado con `scripts/smoke-repair-price.mjs` contra el código anterior), aunque lo cobrado fuera 37. Nueva regla pura `priceWithPurse(cost, gold)` en `src/model/repair.js` (`test/repair-price.test.js`, 7 tests, RED por exportación inexistente): el precio mostrado es `min(coste, oro)`, 0 con la bolsa vacía o rota, y coincide exactamente con lo que cobra `repairShip`. Se aplica en los cuatro sitios que cotizan: el botón del diálogo del Astillero ("¿Reparamos la flota?"), el del diálogo del mar, los botones de la flota del puerto y la cotización de la capitana (`R`). El texto "Reparación parcial: N doblones arreglan el X % del daño" ya decía el porcentaje. No se editó ningún test existente: sus aserciones de precio usan oro suficiente.

## S49 — pasar por el ancla repara la flota sola (reemplaza el diálogo de llegada del mar, S25)

L37 (verbatim): "en la pantalla de mar, si pasas por el ancla del astillero, se repara automaticamente sin tener que dar al boton del dialogo"

L38: Decisiones del usuario (respuestas a preguntas): coste: "Cobra, como ahora"; qué repara: "Toda la flota, capitana primero"; el diálogo: "Reemplazarlo por un aviso". Con consentimiento explícito del usuario se reescriben las secciones de `scripts/smoke-dock.mjs` que prueban el diálogo del mar (1, 2, 3, 4, 5, 7 y 9); las del Astillero (6 y 8) no cambian.

S49. En la pantalla del mar, al entrar en el radio del puerto base desde fuera, la flota se repara sola.
- **Cuándo:** al pasar de fuera a dentro del radio del puerto (110 m), una vez por llegada: salir y volver a entrar la rearma. Abrir el mar ya dentro del puerto **no** repara por sí solo y no muestra ningún diálogo (decisión mía: "pasar" es moverse; la tecla `R` y el panel del puerto siguen ahí).
- **A quién:** a toda la flota dañada, la capitana primero y después las demás en el orden de la flota, estén navegando o no.
- **Cuánto cuesta:** lo de siempre (S40), con el oro de la bolsa. Cada nave se repara por completo mientras alcance el oro; la que no alcanza se repara en la parte proporcional gastando todo lo que queda (S45); las siguientes quedan sin tocar. Con 0 doblones no se repara nada.
- **Con qué daño:** con el vivo (S45): el de `playerCombat` para la capitana y el de cada escolta en el mar; el resultado se escribe en su ficha de la flota (S23), en su combatiente vivo y en el guardado.
- **Aviso:** un mensaje (es y en) dice cuántas naves se repararon y cuánto costó, y avisa si alguna quedó dañada por falta de oro. Si nada estaba dañado no pasa nada y no hay aviso.
- **El diálogo del mar desaparece** (marcado de `sea.html`, código de `sea.js`, claves `sea.dock.*`). El diálogo del Astillero (S25) no cambia.
- `R` y los botones del panel del puerto siguen funcionando para lo que haya quedado.

L39: Implementación de S49 (worker, con revisión mía). Función pura `autoRepairFleet` en `src/model/auto-repair.js` (`test/auto-repair.test.js`, 5 tests; RED por módulo inexistente), construida sobre `repairFleetShip` con la capitana primero y las demás en el orden de la flota. `src/ui/sea.js` la aplica al entrar al radio del puerto con la flota viva (daño de `playerCombat` y de cada escolta) y escribe el resultado en las fichas (S23), los combatientes y el guardado. El diálogo del mar se quitó del todo: el marcado de `sea.html`, su código y las claves `sea.dock.*`. El diálogo del Astillero (S25) no cambió.

L40: Un detalle que el worker destapó: `repairFleetShip` trata un precio que redondea a 0 como "sin daño", así que una nave con un daño mínimo (precio de 0 doblones) no se reparaba. El worker lo compensó en `auto-repair.js` sin tocar el código compartido; queda anotado por si se quiere arreglar de raíz.

L41: Verificación. Las secciones 1, 2, 3, 4, 5, 7 y 9 de `scripts/smoke-dock.mjs` se reescribieron al flujo nuevo, con el consentimiento del usuario; las del Astillero (6 y 8) no cambiaron. La última corrida de `npm test` del worker falló por `EAGAIN` al lanzar procesos (cuatro archivos no llegaron a ejecutarse) y sus smokes finales corrieron antes de su último cambio al modelo, así que la verificación se rehízo por separado: `npm test` 361/361 y los 23 smokes con exit 0, leyendo el log completo. El `EAGAIN` no se explicó; no volvió a aparecer.

L42: Hueco que encontré al revisar: ningún smoke cubría la regla "una vez por llegada". Se agregó `scripts/smoke-auto-repair-reentry.mjs`, un recorrido real con timón que corrige el rumbo: abrir el mar dentro del puerto no repara ni cobra; salir navegando tampoco; volver a entrar repara y cobra una sola vez (714 doblones) y no vuelve a cobrar mientras se queda dentro. Dos corridas seguidas con exit 0.
