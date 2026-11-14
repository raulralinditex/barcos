# Juego de barcos — reformar un barco de la flota

Estado: cerrado y verificado. S50. Sin commitear.

## Specs

S50. Reformar un barco ya comprado, en el constructor del Astillero. Pedido (verbatim): "si selecciono un barco de mi flota, necesito poder añadir cosas al aparejo"
- Decisiones del usuario (respuestas a preguntas): qué se añade: **"Equipo: artillería, tripulación, carga..."**; cómo se cobra: **"Permitir quitar con reembolso parcial"**; cómo se entra: **"Cargarlo en el constructor"**. Con consentimiento explícito se reescribe el paso de `scripts/smoke-fleet.mjs:88` que usa el clic de hoy (hacer capitana).
- **Entrar:** al elegir un barco de "Tu flota" (clic en su nombre) se carga en el constructor con su casco y su equipo actual: artillería por costado y munición, tripulación por rol, días de provisiones, carga, lastre, equipo y reserva, más su nombre. El constructor avisa que se está reformando ("Reformando: {nombre}") y ofrece "Nuevo barco" para salir de ese modo y volver al constructor de siempre. La fila de la flota que se está reformando se marca.
- **El casco no cambia:** es el mismo barco. Se puede cambiar todo lo demás.
- **Capitana:** el clic de hoy (hacerla capitana) pasa a un botón aparte, "Capitana" / "Captain", en la fila de cada nave que no lo es. El check de zarpar no cambia.
- **Botón:** en modo reforma, `#launch-btn` dice "Guardar reforma" / "Save refit" en lugar de "Añadir a la flota", y el bloque de precio muestra el coste neto de la reforma (o el reembolso) en lugar del total.
- **Cuánto cuesta:** se compara el precio por líneas (artillería, munición, tripulación, provisiones, carga y lastre; el casco no cambia) entre el equipo actual y el nuevo. Lo que **sube** se paga entero al precio de catálogo. Lo que **baja** se reembolsa al **50 %** (`REFIT.refundShare`, decisión mía, declarada en el modelo). El coste neto es lo pagado menos lo reembolsado; debe caber en la bolsa y puede ser negativo (el jugador recibe oro). **Siempre en doblones enteros y redondeado en contra del jugador:** lo que se añade se redondea hacia arriba y lo que se reembolsa hacia abajo (L7).
- **Validez:** las mismas reglas de un barco nuevo (peso máximo, marineros mínimos, piezas por costado, giratorias). Con una reforma inválida el botón se bloquea y se dice por qué. El chequeo de "no alcanza el oro" usa el coste neto, no el total.
- **Qué se conserva:** el id, el nombre (editable), el check de zarpar, si es capitana, el país y el **daño** (casco, aparejo, moral). La tripulación viva sigue la reforma: los hombres añadidos llegan vivos y los quitados salen de los vivos, sin bajar de 0 ni pasar de los comprados. El valor del barco (`paidGold`, que usa el precio de la reparación de S40) pasa a ser el anterior más lo añadido menos lo quitado, a precio entero y sin bajar del precio del casco (decisión mía).
- **Guardado del mar:** `barcos:game:v1` guarda la munición de la última travesía por pieza y el mar lo prefiere al arrancar. Tras reformar la capitana se descarta ese estado de piezas (la artillería nueva se arma desde la ficha) y se conserva su daño; el de una escolta sólo guarda daño y tripulación, que se actualizan con la reforma. La bolsa se guarda con el neto cobrado.
- Textos en es y en. La reforma se guarda en la ficha de la flota como cualquier otro cambio (`saveFleet`).

## Tasks

- T61 — Modelo puro `src/model/refit.js`: recuperar la configuración de una nave, cotizar la reforma (neto, pagado, reembolsado) y aplicarla conservando lo que S50 dice. Tests primero. `S50` — worker — done
- T62 — Interfaz del Astillero: cargar la nave en el constructor, modo reforma, botón "Guardar reforma", "Nuevo barco", botón "Capitana", guardado del mar, textos es/en. `S50` — worker — done
- T63 — Smoke de navegador nuevo y reescritura del paso de `smoke-fleet.mjs:88`. `S50` — worker — done

## Log

L1 (verbatim): "si selecciono un barco de mi flota, necesito poder añadir cosas al aparejo"

L2: "Aparejo" sólo existía en el juego como la barra de condición del aparejo y el Astillero sólo construye barcos nuevos, así que se preguntó qué se quería añadir. Respuesta: equipo (artillería, tripulación, carga...), con la posibilidad de quitar y reembolso parcial, cargando el barco en el constructor. Mejoras nuevas de velas y mástiles (un catálogo nuevo) quedaron fuera.

L3: Decisiones mías sin pedido, anotadas en cada spec: reembolso del 50 %, el valor del barco como el anterior más lo añadido menos lo quitado, y descartar el estado de piezas guardado de la capitana al reformar.

L4: Implementación (worker, con revisión mía). `src/model/refit.js` (`configFromShip`, `quoteRefit`, `applyRefit`, `REFIT.refundShare = 0.5`) con `test/refit.test.js`; interfaz en `src/ui/app.js`, `index.html` y `src/ui/styles.css` (modo "Reformando", "Guardar reforma", "Nuevo barco", botón "Capitana"); textos es/en; `scripts/smoke-refit.mjs`. Con el consentimiento del usuario se cambió el paso de `scripts/smoke-fleet.mjs:88` al botón "Capitana"; ninguna otra aserción existente cambió. El informe del worker llegó como "parcial": 7 smokes sin correr y dos riesgos.

L5: Riesgo 1, confirmado y arreglado. Una reforma de la capitana descarta su estado de piezas guardado pero conserva su daño, y `src/ui/sea.js` sólo restauraba el daño guardado si existía el arreglo `pieces`, así que el mar abría con el casco de la ficha (más viejo). RED observado con `scripts/smoke-refit-restart.mjs` (casco 100 % en lugar de 40 %); ahora el arranque restaura daño y tripulación siempre que haya guardado, y las piezas sólo si hay estado de piezas.

L6: Riesgo 2, confirmado y arreglado. Los precios del catálogo tienen decimales y el neto de una reforma daba cosas como 31,75 o −5,25, que dejaban la bolsa con fracciones. RED observado con dos tests nuevos en `test/refit.test.js`.

L7: Contrato resultante: el neto es un número entero de doblones; lo añadido se paga redondeando hacia arriba y lo quitado se reembolsa al 50 % redondeando hacia abajo, así que una reforma nunca puede ser una forma de ganar oro con fracciones de precio. Consecuencia: un cambio mínimo (por ejemplo 3 kg de lastre, 0,03 doblones) cuesta 1 doblón. Los tests y el smoke del propio S50 se alinearon a este contrato (`checkQuote` y `price()`).

L8: Evidencia. `npm test` 369/369. Los 26 smokes con exit 0 (leí el log completo): refit, refit-restart, fleet, ui, i18n, dock, sea, combat, wind, country, purse, shipyard-buttons, formation, escort-dock, autofire, repair-price, auto-repair, auto-repair-reentry, state, images, settings, swivel, turning, time, escort-hud y visible-escorts. `smoke-refit` había fallado en esa corrida porque su `price()` esperaba el neto fraccionario del contrato anterior, y pasó tras alinearlo. `git diff --check` limpio.
