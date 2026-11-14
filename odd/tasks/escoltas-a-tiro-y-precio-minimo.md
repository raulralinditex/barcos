# Juego de barcos — barras de escolta a tiro y precio mínimo de reparación

Estado: cerrado y verificado. S54-S55. Sin commitear (ver `pendientes.md`). Cierra los dos pendientes abiertos 1 y 4 de `pendientes.md`.

## Specs

S54. Las barras de una escolta sólo se muestran cuando la escolta está a tiro. Pedido (verbatim): "1-> muestraslas solo con la escolta a tiro"
- "A tiro" para una escolta es lo mismo que para un enemigo (S21): un enemigo **en combate** a menos de `COMBAT.engageRadiusM` (620 m) **de la escolta**, no de la capitana. Decisión del usuario: "Tiene un enemigo en combate dentro de 620 m".
- Sin enemigo a tiro de la escolta, sus barritas no se dibujan; la capitana y los enemigos a tiro siguen mostrando las suyas igual que antes (S21).
- La regla es pura y vive en `src/model/sea-hud.js` (`hasEnemyInGunshot`), para poder probarla sin navegador. Una posición o un radio roto nunca cuenta como "a tiro".
- La escala compartida de S21/S44 no cambia: mientras una escolta se muestra, entra en el cálculo de la escala como cualquier otra nave en pantalla.

S55. Un casco dañado cuesta siempre al menos un doblón de reparación. Pedido (verbatim): "4-> areglolo" (arreglar la raíz del pendiente de `repairFleetShip`).
- `repairCost` devuelve como mínimo `REPAIR.minCost` (1 doblón) cuando hay daño, y 0 sólo cuando el casco está sano. Un daño mínimo ya no redondea a 0.
- Consecuencia: `repairShip`/`repairFleetShip` ya no dicen "sin daño" ante un casco dañado, así que el parche de `src/model/auto-repair.js` (S49) se elimina y la reparación automática del ancla cobra ese doblón.
- Un casco sano sigue costando 0 y sigue sin aparecer en los diálogos de reparación (S25).
- Consentimiento explícito del usuario para reescribir el test de S49 que fijaba "reparado gratis": "Sí: reescribir ese test y quitar el parche".

## Tasks

- T56 — Tests primero de S54: `test/sea-hud.test.js`, RED por exportación inexistente. `S54` — inline — done
- T57 — Tests primero de S55: `test/repair-price.test.js` y `test/auto-repair.test.js`, RED observado. `S55` — inline — done
- T58 — Modelo y UI: `hasEnemyInGunshot` en `sea-hud.js` y filtro de escoltas en `drawShipBars`; `REPAIR.minCost` en `repair.js` y quitar el parche de `auto-repair.js`. `S54,S55` — inline — done
- T59 — Smokes: sección nueva de S54 en `scripts/smoke-escort-hud.mjs` y corrida completa. `S54,S55` — inline — done
- T60 — Documentación y cierre: este documento, `pendientes.md` y el espejo en Engram. `S54,S55` — inline — done

## Log

L1 (verbatim): "1-> muestraslas solo con la escolta a tiro, 4-> areglolo"

L2: Decisiones del usuario (respuestas a preguntas): "la escolta a tiro" = "Tiene un enemigo en combate dentro de 620 m" (de la escolta); y sobre el test de S49 que fijaba la reparación gratuita: "Sí: reescribir ese test y quitar el parche".

L3: Evidencia de S54. `test/sea-hud.test.js` (5 tests nuevos, RED por `hasEnemyInGunshot` inexistente): sin enemigo a tiro no hay barras; con enemigo dentro de 620 m sí; el borde exacto cuenta como a tiro; el enemigo más cercano decide en cualquier dirección; una posición o un radio roto nunca engancha. `scripts/smoke-escort-hud.mjs` mide en el canvas las tres naves: con la escolta a 330 m al sur y un enemigo suyo a 400/400 m, las barras son 108, 93 y 38 px según valor (S44) y la escolta aparece en el minimapa; con el único enemigo al norte de la capitana, la escolta (780 m de él) no dibuja ninguna barra y la capitana conserva las suyas. RED observado antes del cambio (la escolta mostraba barras sin enemigo propio).

L4: Evidencia de S55. `test/repair-price.test.js` (3 tests nuevos) y `test/auto-repair.test.js` (1 test nuevo): el daño mínimo cuesta 1 doblón, nunca 0, y un casco sano sigue costando 0. RED observado: `repairCost` devolvía 0 con `paidGold: 1` y casco al 99 %. El test de S49 que fijaba "reparado gratis" se reescribió con consentimiento (L2) a "reparado por 1 doblón" (bolsa 101 para reparar 1 + 100). Se eliminó la compensación de `auto-repair.js` (S49, `estado-y-reparacion.md` L40) porque la causa ya no existe.

L5: Verificación. `npm test` 401/401 (antes 392) y `git diff --check` limpio. Los 30 smokes con exit 0, corridos en dos tandas y leyendo cada log. Un primer intento de S54 en el smoke puso al enemigo de la escolta a 300 m al oeste, que se solapaba con el bloque del patache; se movió a 400/400 m.

L6: Riesgo declarado: `Risk: item 3` en S55, porque `repairCost` es código compartido por el Astillero, el mar, el puerto y la reparación automática: el cambio altera el precio de cascos con daño mínimo en todos ellos. Se revisó el comportamiento de cada llamador y los 30 smokes siguen en verde. `Risk: none` en S54, que sólo decide si se dibujan unas barras.
