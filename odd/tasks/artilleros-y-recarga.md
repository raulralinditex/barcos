# Juego de barcos — artilleros, cañones disponibles y recarga

Estado: cerrado y verificado. S53. Sin commitear. Reemplaza la regla de recarga por falta de artilleros de S4 (`juego-barcos.md`).

## Specs

S53. La dotación de artilleros decide cuántos cañones están disponibles y con qué rapidez recargan. Pedido (verbatim): "hagamos la regla flexible, mas artilleros menos tiempo de recarga hasta un limite configurable por defecto 1.3, 1 artillero por cada dos cañones, configurable por tipo de cañon, solo se cuentan los que se recargan a la hora de calcular tiempo y daño,"
- Decisiones del usuario (respuestas a preguntas): el límite 1.3 es **"Aceleración máxima ×1,3"**; el reparto es **"Solo los cañones que recargan"**; sobre el daño (verbatim, respuesta libre): "se calcula numero de cañones disponibles segun artilleros, y daño segun cañones disponibles"; cuando faltan artilleros: **"Sí, así: la falta quita cañones"**. Con consentimiento explícito se reescriben los tests y smokes existentes que fijan la regla vieja (falta de artilleros = recarga más lenta, hasta ×3).
- **Configuración** (pantalla de configuración, S33, con rango, valor por defecto y textos es/en): el tope de aceleración `maxBonus` (por defecto **1,3**, rango 1 a 3) y los **artilleros por cañón de cada tipo de pieza** (por defecto **0,5**, o sea 1 artillero cada dos cañones; rango 0,1 a 4). Un valor fuera de rango se recorta y uno roto cae al valor por defecto, como el resto de la configuración.
- **Cañones disponibles:** los artilleros vivos dotan cañones sumando lo que pide cada tipo hasta agotarse. Un cañón que no alcanza a dotarse **no está disponible**: no dispara, no cuenta en la andanada, ni en el daño potencial, ni en las barras de recarga. Se dota intercalando los costados (babor, estribor, giratorias) para repartir parejo. Con 0 artilleros no dispara nada. Las bajas de artilleros quitan cañones disponibles en pleno combate.
- **Recarga:** sólo cuentan los cañones que están recargando: los que ya tenían su reloj en marcha y los que acaban de disparar. `rho = artilleros vivos / artilleros que piden esos cañones` (siempre al menos 1, porque están dotados). El tiempo de recarga de cada uno es `reloadS / min(rho, maxBonus)`: con los artilleros justos y todos recargando, ×1; con artilleros de sobra, o con pocos cañones recargando a la vez, hasta ×`maxBonus` más rápido. **La falta de artilleros ya no enlentece la recarga**: quita cañones disponibles.
- **Daño:** el de una andanada es el de los cañones disponibles que disparan; el daño potencial y las barras de recarga de S21 cuentan sólo los disponibles. La IA de los enemigos usa la misma regla.
- **Compatibilidad y enemigos:** con 0,5 artilleros por cañón, la dotación justa y todos los cañones recargando a la vez, todo se comporta como antes. Pero como sólo cuentan los cañones que recargan, un barco que dispara **un solo costado** tiene más artilleros por cañón recargando y recarga hasta ×`maxBonus` más rápido. La regla vale para **todos los barcos, enemigos incluidos** (decisión del usuario: "A: la misma regla para todos"). El combate se vuelve algo más duro.
- Decisiones mías, sin pedido: el orden de dotación intercala los costados; la velocidad se calcula al disparar con el conjunto que recarga en ese instante y no se recalcula en cada tick; la advertencia del Astillero por pocos artilleros (`under-gunned-crew`) pasa a seguir esta regla.

## Tasks

- T69 — Reglas puras `src/model/gunnery.js` (configuración, dotación, cañones disponibles, bonus de recarga) y su integración en `src/model/combat.js`. Tests primero. `S53` — worker — done
- T70 — Configuración: campos de `maxBonus` y de artilleros por tipo en `src/model/settings.js`, textos es/en. `S53` — worker — done
- T71 — Smoke de navegador nuevo, reescritura de lo que fije la regla vieja y regresión completa. `S53` — worker — done

## Log

L1 (verbatim): "hagamos la regla flexible, mas artilleros menos tiempo de recarga hasta un limite configurable por defecto 1.3, 1 artillero por cada dos cañones, configurable por tipo de cañon, solo se cuentan los que se recargan a la hora de calcular tiempo y daño,"

L2: Pregunta previa del usuario (verbatim): "esta implementado una relacion entre el tiempo de recarga y el numero de artilleros con el numero de cañones disparados?". Respuesta: sí, de forma gruesa. `reloadFactor` (`src/model/combat.js`) pedía `ceil(cañones totales / 2)` artilleros, daba un factor `necesarios / vivos` acotado entre 1 y 3 y dejaba mudos los cañones con 0 artilleros. No dependía de cuántos cañones disparaban, contaba ambos costados y las giratorias juntos, no premiaba la sobra y trataba igual a todas las piezas.

L3: Lo que fija hoy la regla vieja y cambia: `test/combat.test.js` "S4: fewer gunners than needed slow the reload; none silence the guns" (líneas 191-197: 2 de 5 artilleros daban factor 2,5). **Corrección (L4):** esta frase decía que el test de la línea 163 seguía valiendo, y era falso.

L4: Corrección de dos afirmaciones mías de la spec que el worker detectó al leerla, antes de tocar código. (1) `test/combat.test.js:157-164` ("a broadside spends one round per gun and starts its reload clock") dispara cinco cañones con diez artilleros y espera la recarga sin acelerar; con S53 los artilleros de sobra la aceleran hasta ×1,3, así que cambia. (2) Los enemigos **sí** cambian: al disparar un solo costado, sus cañones que recargan tienen el doble de artilleros cada uno. Además hay un segundo test existente afectado, `test/side-state.test.js:62-73`, que fija cuántos cañones están listos en un instante dado.

L5: Decisión del usuario: **"A: la misma regla para todos"**, con consentimiento explícito para reescribir esos dos tests al contrato nuevo. Se agrega `test/side-state.test.js` a las superficies de edición, sólo para esa aserción.

L6: Implementación (worker, con revisión mía). `src/model/gunnery.js`: `GUNNERY` (`maxBonus` 1,3 y artilleros por cañón por tipo, 0,5 cada uno), `crewedPieces` (dota intercalando babor, estribor y giratorias hasta agotar los artilleros vivos), `gunnersRequired` y `reloadBonus` (`min(maxBonus, max(1, artilleros / artilleros que piden los cañones que recargan))`). `src/model/combat.js`: `firingPieces` y `sidePieces` sólo consideran los cañones dotados, así que el daño de una andanada, el daño potencial y las barras de recarga cuentan sólo los disponibles; `reloadFactor(combatant, justFired)` toma los cañones dotados que ya recargaban más los que acaban de disparar. Sin artilleros no dispara nada. `src/model/ship-model.js`: la advertencia del Astillero por pocos artilleros usa la regla por tipo. `src/model/settings.js` y los catálogos: `maxBonus` (1 a 3) y un campo por tipo de pieza (0,1 a 4) en el grupo "combate" de la pantalla de configuración, que arma sus grupos sola desde `SETTINGS_FIELDS`.

L7: Verificación. `test/gunnery.test.js` (RED por módulo inexistente) y `scripts/smoke-gunnery.mjs` (RED por el campo inexistente). El smoke comprueba en el navegador: tope 1,3 por defecto, una tripulación corta dispara sólo 2 cañones del costado, los artilleros de sobra acortan la recarga más de un 10 % frente a los justos, y un valor cambiado en la pantalla de configuración llega al mar. Mi regresión: `npm test` 392/392 y los 29 smokes con exit 0 (leí las 29 líneas del log), entre 2 s y 37 s cada uno. `git diff --check` limpio.

L8: Lo que salió mal en el camino, para no repetirlo. (1) Mi spec tenía dos afirmaciones falsas ("los enemigos no cambian" y "el test de la línea 163 sigue valiendo"); el worker las detectó y se detuvo antes de tocar código. (2) Dos reintentos míos fallaron por formato: la lista de superficies de edición tiene que ser una lista de rutas sin prosa. (3) El worker reescribió `test/side-state.test.js` cambiando `2/5` por `1`, y con eso el test dejó de probar que los falconetes recargan antes que los minions (el tick que eligió era mayor que la recarga de todos). Lo corregí yo: el tick usa el bonus (80/1,3/20 s para los falconetes, 90/1,3/20 s para los minions), la aserción vuelve a ser `2/5` y se agrega un segundo paso hasta que el costado queda cargado.

L9: Consecuencias de juego a vigilar. Con artilleros de sobra, una capitana recarga hasta un 30 % más rápido que antes; con los justos, igual. Los enemigos, que nacen con la dotación justa, también ganan hasta ×1,3 cuando disparan un solo costado, porque los cañones que recargan quedan con más artilleros cada uno: el combate es algo más duro. Una falta de artilleros ya no enlentece (hasta ×3 antes): quita cañones, que dejan de disparar y de contar en las barras. Los valores están en la pantalla de configuración.

L10: Lo que no se revisó a fondo: la apariencia de los 12 campos nuevos en la pantalla de configuración (sólo se sabe que `smoke-settings` y `smoke-gunnery` pasan) y que el tope de aceleración se aplique igual a las giratorias.

## S56 — el bonus de recarga se mide contra la batería dotada, no contra los cañones que recargan

L11 (verbatim): "ahora me cuesta mucho hundir un barco que antes no me costaba"

L12: Diagnóstico medido, no supuesto. Con el modelo aislado comparé el commit base `3da5b9d` contra el árbol actual, disparando un solo costado como hace la IA:

| Enemigo (dotación justa) | daño de casco / 60 s antes | ahora | factor |
| --- | --- | --- | --- |
| patache / abierto | 352 | 452 | 1,28× |
| zabra / abierto | 414 | 566 | 1,37× |
| fluyt / abismo | 3500 | 4517 | 1,29× |
| nao-armada / abismo | 3371 | 4512 | 1,34× |
| galeon-guerra / abismo | 3517 | 4586 | 1,30× |

Causa: S53 medía el bonus como `artilleros / artilleros que piden los cañones que están recargando`. La IA dispara **un solo costado por tick**, así que en ese instante sólo ese costado recarga, el denominador se parte a la mitad y el barco cobra el tope ×1,3 **sin un solo artillero de sobra**. El jugador que dispara los dos costados no lo cobra; el enemigo sí, siempre. La nota L9 lo anticipó como "algo más duro", pero el número real es mayor.

Segundo factor, también medido y **descartado como causa**: el giro por tonelaje (S48) no cambia el tiempo en arco (99 % antes y ahora, incluso con el gran galeón a ×0,35). Y con pocos artilleros el barco pierde cañones en vez de recargar más lento (20 cañones con 3 artilleros: 543 de daño contra 791 antes, −31 %), que es la regla aprobada en S53 y **se queda** por decisión del usuario.

L13: Decisiones del usuario (respuestas a preguntas): "Corregir: denominador = batería dotada completa" y "Se queda: la falta quita cañones".

S56. El bonus de recarga de S53 se mide contra toda la batería dotada, no contra los cañones que recargan en ese instante.
- `reloadFactor` calcula `1 / reloadBonus(crewedPieces(pieces, gunners), gunners)`: el denominador es lo que pide la batería entera que los artilleros alcanzan a dotar.
- Con la dotación justa el bonus es 1, dispare el barco un costado o los dos. Con artilleros de sobra sigue llegando al tope `maxBonus` (por defecto 1,3, configurable).
- La falta de artilleros sigue **quitando cañones** (S53, sin cambios): no enlentece la recarga.
- Un artillero por debajo de lo que pide la batería dotada no recibe premio: el denominador nunca supera la batería que de verdad se dota.
- `justFired` se conserva en la firma para no romper llamadores, pero ya no estrecha el denominador.

L14: Evidencia. `test/gunnery.test.js` gana 4 tests de S56 (RED observado con la regla vieja) y 3 tests de S53 se reescribieron al contrato nuevo con consentimiento explícito del usuario: "bonus counts only available running clocks…" (ahora "measured against the crewed battery"), "one firing side reloads faster…" (ahora "does not earn a faster reload") y "enemy and player combatants use the same reload rule" (el enemigo costero ya no cobra bonus). En `test/combat.test.js` se reescribió, también con consentimiento, la aserción de la línea 198 y la de la 193 del mismo test ("fewer gunners remove guns rather than slow them"): con artilleros justos el factor es 1, y con artilleros de sobra el tope aplica aunque no haya relojes corriendo.

L15: Verificación. `npm test` 405/405 (antes 401) y los 30 smokes con exit 0. Medición diferencial contra `/tmp/base` (copia del commit `3da5b9d`) con el arnés `/tmp/oneside2.mjs`: los 15 casos enemigo/zona vuelven exactamente a 1,00× de daño y de disparos. Un barco con artilleros de sobra sigue cobrando hasta ×1,3: con 14 artilleros para 20 cañones, 2591 de daño contra 1878 antes (1,38×), que es el premio que la feature promete.

L16: Riesgo declarado: `Risk: item 3` en `src/model/combat.js`, porque `reloadFactor` es compartido por jugador, enemigos y escoltas, y el cambio altera el ritmo de fuego de los tres. La verificación cubre los tres: tests unitarios de jugador y enemigo, y los 30 smokes, incluidos `smoke-combat`, `smoke-gunnery`, `smoke-escort-hud` y `smoke-autofire`.

## S57 — las reglas del enemigo son las del jugador

L17 (verbatim): "las reglas para los barcos enemigos tienen que ser las mismas que para los barcos propios"

L18: Auditoría regla por regla, medida con el modelo aislado. **Ya estaban iguales**: giro por tonelaje (S48, 1,00× en patache/galeón de guerra/gran galeón), aceleración (1,00×), artilleros y recarga (S53/S56), daño, precisión, surtido, condición y umbrales de hundimiento y rendición. **Divergían cuatro**:

| # | Regla | Jugador | Enemigo (antes) |
| --- | --- | --- | --- |
| 1 | Viento | `speedFactor` ±20 % y deriva lateral 0,119 | ninguno: `aiStep` no recibía el viento |
| 2 | Velocidad máxima | modelo de masas (casco + cañones + tripulación + carga) | `referenceSpeedKn` del casco vacío: 1,20× a 1,35× más lento que el mismo casco cargado como jugador |
| 3 | Timón con pocos marinos | `maneuverFactor` → la mitad de giro | no se aplicaba nunca |
| 4 | Límite del mundo | se recorta a `WORLD.radiusM` | sin límite: podía salirse del mapa |

L19: Decisiones del usuario. Marcó las cuatro para igualar, y a la vez "No tocar la velocidad"; ante la contradicción eligió **"No tocar la velocidad: hago 1, 3 y 4"**. La velocidad del enemigo sigue siendo `referenceSpeedKn` del casco vacío (nº 2 queda abierto, ver `pendientes.md`).

S57. El casco enemigo obedece la misma física que el casco del jugador.
- Se extrae **una sola** función pura, `stepHull` en `src/model/world.js`, con el giro (`WORLD.maxTurnRate` × el factor del casco), la aceleración (`WORLD.accelerationRate`), el viento (`speedFactor` y deriva lateral) y el recorte a `WORLD.radiusM`. `stepShip` (el jugador) y `aiStep` (el enemigo) la llaman; ya no hay dos copias de la física que puedan divergir.
- `aiStep(enemy, playerPos, dt, rnd, { wind })` recibe el viento; `src/ui/sea.js` le pasa `windAt(world.seed, world.timeS)`, el mismo que siente la capitana.
- El timón del enemigo se multiplica por `maneuverFactor(combat)`: con marino por debajo de `crewMin` gira la mitad, igual que el jugador.
- El enemigo no puede salir de `WORLD.radiusM`.
- **No cambia** la velocidad máxima del enemigo (decisión del usuario), ni su IA, ni el daño, ni la artillería: sólo la física del casco.

L20: Evidencia. `test/turning.test.js` gana 6 tests de S57. RED observado en los 4 que cubren las divergencias y verde desde el principio en los 2 que fijan giro y aceleración (confirman que ésas ya estaban iguales). Dos correcciones mías durante el trabajo: el test de viento usaba `dt=1`, donde la aceleración (1,5 kn/s) tapaba la diferencia, y comparaba mal la dirección (con `direction` igual a `heading` el viento es de popa, no de proa); ahora los dos casos de viento navegan 400 ticks de 0,1 s hasta régimen.

L21: Medición del efecto en juego. Persecución de un enemigo que huye con el casco al 20 %: con viento a favor del jugador se hunde en 12,0 s; con viento en contra, en 16,7 s. Antes el enemigo ignoraba el viento y el resultado era el mismo en los dos casos.

L22: Verificación. `npm test` 411/411 (antes 405) y los 30 smokes con exit 0. Dos incidentes de entorno, no de código: un `Target crashed` de Chromium en `smoke-escort-hud` (dos corridas limpias seguidas después) y varios `EAGAIN` al lanzar procesos, resueltos espaciando las corridas en tandas cortas.

L23: Riesgo declarado: `Risk: item 3` en `src/model/world.js` y `src/model/combat.js`. `stepShip` es el movimiento de todo barco del juego y `aiStep` el de todos los enemigos; el refactor a `stepHull` toca ambos. La verificación cubre el camino del jugador (`smoke-sea`, `smoke-wind`, `smoke-turning`, `smoke-formation`, `smoke-time`), el del enemigo (`smoke-combat`, `smoke-gunnery`) y la persecución medida arriba. La velocidad del enemigo se dejó intacta a propósito.

## S58 — un enemigo en combate no se borra: se desengancha

L24 (verbatim): "los enemigos se olvidan de mi despues de un tiempo"

L25: Diagnóstico medido, no supuesto. La regla de `src/model/world.js` era sólo de distancia: `encounters.filter(distancia <= WORLD.despawnRadiusM)` (3400 m), sin mirar si el enemigo estaba en combate. Persecución real (jugador huyendo a toda vela de un patache enganchado):

| t | distancia | jugador | enemigo |
| --- | --- | --- | --- |
| 20 s | 369 m | 8,27 kn | 4,76 kn |
| 60 s | 2126 m | 9,33 kn | 4,76 kn |
| 100 s | 3174 m | 11,00 kn | 4,76 kn |
| 105,8 s | > 3400 m | — | **borrado del mundo** |

Dos causas sumadas: (1) la regla de borrado ignoraba el combate, así que un enemigo que te persigue se borraba igual que una vela que pasaba; (2) el enemigo nunca alcanza al jugador, porque su velocidad máxima es `referenceSpeedKn` del casco vacío (4,76 kn) y el jugador llega a 11 kn. Lo segundo es la regla que en S57 se dejó intacta por decisión del usuario.

L26: Decisiones del usuario (respuestas a preguntas): sobre el borrado, **"Deja de perseguir, pero no desaparece"**; sobre la velocidad, respuesta libre: **"la velocidad es menor, con lo que cuando aumenta la distancia se desengancha"**. O sea: el desenganche es consecuencia de que el enemigo es más lento, no una regla nueva de velocidad.

S58. Un enemigo en combate no se borra por distancia: se desengancha.
- `WORLD.disengageRadiusM` (4600 m) y `WORLD.disengagedDespawnRadiusM` (10200 m) en `src/model/world.js`. El de desenganche es mayor que `COMBAT.engageRadiusM` (620 m), así que un combate no puede parpadear en el borde.
- **En combate** (`encounter.engaged`), el enemigo nunca se borra por la regla de distancia, por lejos que esté.
- Pasado `disengageRadiusM`, el enemigo **se desengancha**: `engaged: false`, se marca `wasEngaged: true`, se le libera el `combat` y vuelve a su deriva. Sigue en el mundo como una vela que te perdió.
- Un enemigo que se desenganchó se olvida a `disengagedDespawnRadiusM` (10200 m), no a 3400 m: así no desaparece en el mismo tick en que se desengancha, que era exactamente lo que se leía como "el enemigo se olvidó de mí".
- Las velas que nunca entraron en combate se siguen borrando a 3400 m, como siempre.
- Un enemigo hundido o rendido conserva su `combat` para que la regla del pecio lo resuelva.
- La UI (`src/ui/sea.js`) aplica el desenganche en `dropDisengagedTargets()` antes de `processCombat`, para que el panel de objetivo, las barras y el disparo automático dejen de leer un combate terminado.

L27: Evidencia. `test/world.test.js` gana 7 tests de S58 (RED observado). Un test destapó un fallo de mi propio diseño: con el desenganche a 4600 m y el borrado a 3400 m, el enemigo se desenganchaba y desaparecía en el mismo tick; de ahí `disengagedDespawnRadiusM`.

L28: Comportamiento verificado de punta a punta con el modelo real (mundo ampliado para que el borde no interrumpa): el enemigo se desengancha a los 143,7 s a **4600 m**, libera su combate, **sigue en el mar a los 400 s** y ya no desaparece. Antes se borraba a los 105,8 s.

L29: Verificación. `npm test` 418/418 (antes 411) y los 29 smokes con exit 0 (`smoke-i18n` corrido aparte tras un timeout de shell, también verde). Incidentes de entorno, no de código: varios `Target crashed` de Chromium y `EAGAIN` de fork, resueltos repitiendo o espaciando las corridas.

L30: Riesgo declarado: `Risk: item 3` en `src/model/world.js` y `src/ui/sea.js`. La regla de borrado es compartida por todos los encuentros y la de desenganche cambia el ciclo de vida de todos los enemigos; un error deja enemigos pegados en el guardado o los borra antes de tiempo. La verificación cubre los dos extremos (vela que pasa, enemigo en combate), el guardado (`smoke-state`) y el combate (`smoke-combat`, `smoke-autofire`, `smoke-sea`).
