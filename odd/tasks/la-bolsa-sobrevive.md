# La bolsa sobrevive al hundimiento

Al hundirse la última nave, volver al astillero borraba el registro del juego entero. El oro vive en ese registro, así que 50.000 doblones volvían como los 12.000 de una partida nueva.

## Specs

S180. **Perder la última nave cuesta las naves, no la bolsa.** Reporte del jugador (verbatim): "despues de que se hunde la capitana, los doblones desaparecen".
- **S180-A, el oro sobrevive.** Volver al astillero conserva la bolsa que la partida tenía al hundirse. Medido: 50.000 antes, 12.000 después; ahora 50.000 antes y después.
- **S180-B, lo que muere es el mar, no el registro.** `gameoverBack` borraba `barcos:game:v1` entero. Ahora borra los campos del viaje —`world`, `combat`, `supplyByHull`, `ship`— y conserva el resto.
- **S180-C, lo del astillero se queda.** El fuerte en el que el jugador invirtió (`fort`) y los mercados que comerció (`markets`) son del astillero, no del mar: sobreviven al hundimiento.
- **S180-D, una bolsa rota no se vuelve deuda.** Un registro corrupto resuelve a bolsa cero, nunca a `NaN` ni a un número negativo (S32).
- **S180-E, cero se queda en cero.** Un jugador que gastó todo conserva su cero: la regla es «la bolsa sobrevive», no «te regalamos la bolsa inicial».
- **S180-F, la lista de lo que muere está declarada.** `PURSE_KEYS` es la regla, y un test afirma que `gold` nunca puede entrar en ella por descuido.

## Tasks

- T116 — S180-A/B/C/D: `src/model/loss.js` con `PURSE_KEYS` y `purseAfterLoss`, puro y sin almacenamiento. Ruta: inline. Hecho.
- T117 — S180-B: `gameoverBack` en `sea.js` reescribe el registro con `purseAfterLoss` en vez de borrarlo, y `readGameRecord` lee el registro sin romperse. Ruta: inline. Hecho.
- T118 — S180: `test/purse-survives-loss.test.js` (4 tests) y la aserción de `smoke-gameover-return` actualizada a la regla nueva. Ruta: inline. Hecho.
- T119 — Verificación: `npm test` completo y los smokes de hundimiento y astillero, con RED medido. Ruta: inline. Hecho.

## Log

L115 (reporte, verbatim): "despues de que se hunde la capitana, los doblones desaparecen".

L116 (medido antes de tocar nada). Con 50.000 doblones y la última nave hundida:

```
ANTES de volver:  gameGold 50000, overlay visible
DESPUES:          url index.html#comprar
                  game: null          ← el registro borrado
                  HUD: 12.000         ← la bolsa inicial
```

La causa: `gameoverBack` hacía `localStorage.removeItem(GAME_KEY)`, y `gold` vive en ese mismo registro (`savePurse` lo escribe ahí). El borrado era deliberado desde S175 —había que matar la partida muerta— pero se llevaba por delante algo que no es del viaje.

L117 (cierre). **`npm test` 1100/1100** (1096 más 4 nuevos). Siete smokes en 0, incluido `gameover-return`, cuya aserción hubo que actualizar: afirmaba que el registro quedaba en `null`, que es exactamente lo que S180 corrige. La prueba de S175 (el mar muerto no se reescribe) se conserva, ahora sobre `world` y `combat` en vez de sobre el registro entero.

**Medido después**: 50.000 antes, 50.000 después, y el registro conserva `gold` sin `world` ni `combat`.

**La distinción que importa**: el registro de `barcos:game:v1` mezcla dos dueños. El mar escribe `world`, `combat`, `supplyByHull`; el astillero escribe `gold`, `fort`, `markets`. Borrar «la partida» borraba a los dos. La lista `PURSE_KEYS` es ahora el contrato de quién es qué.
