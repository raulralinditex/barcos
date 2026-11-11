# Juego de barcos — pendientes para la próxima sesión

Estado: ninguno empezado. Dos peticiones del usuario con **decisiones de diseño abiertas**; no se escribió código.

## T25 — Barritas de estado que siguen a cada barco

Pedido (verbatim): "vamos a añadir al barco informacion sobre el estado con barritas, una el daño que hace en cada lado, y otra el tiempo de recarga, asi como el daño del casco y de la tripulacion, esas barritas seguiran a cada barco, los barcos enemigos solo mostraran esa informacion cuando este a tiro"

Specs a escribir (borrador, a confirmar):
- Barritas flotantes sobre cada barco en el canvas del mar, que lo siguen al moverse.
- Cuatro familias: daño por costado, recarga por costado, casco, tripulación.
- El jugador las ve siempre; un enemigo solo cuando está "a tiro".

Preguntas abiertas (hacerlas antes de escribir código):
1. **"El daño que hace en cada lado"**: ¿es el daño potencial de la próxima andanada de ese costado (suma de piezas listas, según munición y distancia) o el daño causado hasta ahora? Lo más probable es lo primero.
2. **Recarga**: ¿una barra por costado con la fracción de piezas cargadas, o el progreso de la pieza más lenta?
3. **"A tiro"**: ¿dentro del alcance de las piezas del jugador (hoy 180 a 460 m según pieza) o dentro de `COMBAT.engageRadiusM` (620 m, el radio de enganche)? Hoy el panel de objetivo usa 620 m.
4. **Panel de objetivo actual** (`#target-panel`, casco/aparejo/tripulación del enemigo más cercano): ¿se reemplaza por las barritas o conviven?
5. ¿Las barritas de un enemigo también muestran su daño y recarga por costado, o solo casco y tripulación? (Mostrarlas es información táctica gratis para el jugador.)
6. **Aparejo**: el pedido nombra casco y tripulación, no aparejo, que hoy existe en el modelo y en el HUD. ¿Se omite?

Puntos del código a tocar: `src/ui/sea.js` (`drawEncounters`, `drawPlayerShip`, `updateTargetPanel`, `drawFx`), `src/model/combat.js` (reloadTimer por pieza en `pieces[]`, `firingPieces`, `damageRoll`, `hitProbability`). Hay datos de sobra: cada pieza guarda `reloadTimer`, `shotsLeft`, `side` y `ammoId`.

## T26 — Reparar el barco

Pedido (verbatim): "nos falta la opcion de reparar el barco"

Preguntas abiertas:
1. **Dónde**: ¿en el astillero, en el puerto base del mar (la isla en el origen, radio 110 m) o en ambos?
2. **Qué se repara**: ¿casco, aparejo, tripulación (reponer bajas contratando), munición gastada? ¿Todo o por separado?
3. **Coste**: ¿oro por punto de condición, proporcional al precio del casco? Hay que equilibrarlo contra el botín: una zabra hundida paga ~180 doblones, una nave de partida cuesta unos 8.000.
4. **Tiempo**: ¿instantáneo al pagar o requiere estar fondeado un rato?
5. ¿Se pueden reparar las naves de la flota que no son capitana?

**Hallazgo que condiciona el diseño (verificado en el código):** la condición real de la nave **no persiste por nave**.
- `toRuntimeShip` crea `condition: { hull:100, rigging:100, crew:100, morale:100 }` (`src/model/shipyard.js:154`) y ese valor queda fijo dentro de la flota.
- El daño real vive solo en `playerCombat.condition`, que `saveGame()` escribe en `barcos:game → combat.player` (`src/ui/sea.js:166`), y solo para la capitana.
- Al botar una nave, `launch()` sobrescribe `barcos:game` con `{ gold }` y se pierde ese combate guardado.
- Si se cambia de capitana, el daño de la anterior no se guarda en su ficha.

Para reparar hace falta primero decidir que **la condición se guarde en la nave de la flota** (y que el astillero la muestre). Es cambio de contrato sobre los datos guardados: pide migración y tests, y encaja en la regla de riesgo "item 1".

## Estado del repositorio al cerrar la sesión

- Rama `feat/t7-combate-costados`, sobre `master`. Merge y PR los hace el usuario (lo pidió así).
- 182/182 tests (`npm test`), 7 smokes con exit 0.
- Para jugar: `python3 -m http.server 8765` en la raíz y abrir `http://localhost:8765/index.html`.
- Los smokes necesitan ese servidor y `npx playwright install chromium` la primera vez.
- `git` pasa por un wrapper que falla con 401: usar `/usr/bin/git`.
- Regla global vigente: no editar tests existentes sin confirmación explícita del usuario.
