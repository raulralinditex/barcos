# Soldados

Los soldados dejan de ser lastre: abordaje, fuego de cubierta y guarnición, y la captura pasa a exigir soldados a bordo.

## Specs

S160. **Los soldados tienen mecánica propia: abordaje, fuego de cubierta y guarnición.** Pedido (verbatim): "vamos a darles una mecanica a los soldados", y ante las tres opciones propuestas: "las tres". Decisión sobre la captura (verbatim): "Sí: la captura pasa a exigir soldados".
- **S160-A, medido antes de tocar nada**: hoy el soldado sólo pesa (80 kg), cobra (1,5 doblones/día), absorbe bajas proporcionalmente y dispara un WARN si no hay ninguno. `applyCasualties` reparte las bajas entre todos los roles, así que su única contribución real es diluir el daño de tripulación. No hay abordaje en el juego: cero código.
- **S160-B, la captura exige soldados a bordo.** Una presa se toma sólo si el casco que la toma lleva soldados suficientes contra lo que queda de la guarnición enemiga. La regla vive en un módulo puro y la pantalla sólo la lee. Sin soldados, una vela rendida se saquea pero no se toma.
- **S160-C, fuego de cubierta.** Los soldados a bordo disparan armas ligeras a corta distancia y suman un daño propio de tripulación, separado del de las piezas. El alcance y la cadencia son valores declarados, no constantes repartidas.
- **S160-D, guarnición.** Los soldados a bordo vuelven el casco más difícil de rendir: el umbral de rendición baja con ellos, y esa es la defensa contra el abordaje enemigo. Es la mecánica pasiva de las tres, y se lee en el panel.
- **S160-E, las tres comparten un solo número.** Los soldados que llevás son los que abordan, los que disparan y los que defienden; no se declaran tres veces.
- **S160-F, se dice en pantalla.** El jugador tiene que poder ver cuántos soldados lleva, qué aportan y por qué una presa se tomó o se perdió. Un aviso por casco sin números no alcanza.
- **S160-G, nada de lo que ya funciona cambia.** Un casco sin soldados se comporta como hoy en todo salvo en lo que S160-B le quite: saquea la presa y no la toma.

## Tasks

- T47 — S160-A: medir cuántas capturas ocurren por partida y con cuánta tripulación, para que el umbral de S160-B no deje la captura inalcanzable. Ruta: inline.
- T48 — S160-B: el módulo puro del abordaje (`src/model/boarding.js`) con su umbral y `test/boarding.test.js`. Ruta: inline.
- T49 — S160-C/D: fuego de cubierta y guarnición en `src/model/combat.js`, con sus valores declarados y tests. Ruta: inline.
- T50 — S160-B/C/D: el cableado en `src/ui/sea.js` y el indicador en el panel. Ruta: inline.
- T51 — S160-F: i18n es/en y el aviso de captura ganada o perdida. Ruta: inline.
- T52 — el smoke de soldados y la verificación completa. Ruta: inline.

## Log

L53 (pedido, verbatim): "vamos a darles una mecanica a los soldados". Oferta de tres opciones (abordaje, fuego de cubierta, guarnición) y respuesta del jugador (verbatim): "las tres". Sobre la captura, que hoy no exige nada: "Sí: la captura pasa a exigir soldados".

L54 (medición previa, S160-A): los soldados no tienen efecto mecánico propio. `applyCasualties` (`combat.js:727`) reparte las bajas proporcionalmente entre los cuatro roles, así que el soldado sólo diluye. `accuracyModifier` y el umbral `surrenderCrewPct` (40 %) leen `condition.crew`, que es el total vivo sobre el inicial, no los soldados. `maneuverFactor` mira `marino`. `reloadFactor` mira `artillero`. El abordaje no existe: no hay código. En el fuerte sí son reales: la guarnición es `soldado + artillero` y es lo que hay que romper para retomarlo.

L56 (cierre parcial de S160, commits `3898109` y `b66204d`). `npm test` **971/971**.

**Lo que está implementado y probado** (`src/model/boarding.js`, 11 tests):

| Mecánica | Regla | Dónde |
|---|---|---|
| **Fuego de cubierta** | ≤120 m, sólo daño de tripulación, techo de 12 puntos | `deckFire` |
| **Guarnición** | cada soldado baja el umbral de rendición 0,2 puntos (40 → 34,8 con 26) | `garrisonSurrenderPct` |
| **Abordaje** | la captura exige soldados; sin ellos se saquea y no se toma | `canBoard` |
| Equivalencias | remero = 50 % de soldado, soldado = 30 % de remero, ambas en Configuración | `OARS`, `soldiersWorth`, `rowersWorth` |

**La medición que abrió la ficha (T47)** fue decisiva y conviene no perderla: con bala de hierro **100 % de los enemigos se hunden y ninguno se rinde** (40 combates, 120 duelos), así que la captura no ocurría nunca. Con metralla **79 % se rinden y 79 % son capturables**. La regla de captura funcionaba; lo que faltaba era un motivo para usar la munición correcta. El umbral de rendición se dejó en 40 % por eso: subirlo no era el problema.

**DOS DEFECTOS ABIERTOS, con su evidencia:**

**(1) El fuego de cubierta no llega al enemigo en pantalla.** Traza medida en el navegador:

```
DBG-DECK hull=Con soldados dist=51 fire={"hull":0,"rigging":0,"crew":12}   ← dispara bien
DBG-IDS  501:fighting:c100,500:-:c?,502:-:c?                               ← ¡crew sigue en 100!
DBG-IDS  500:-:c?,502:-:c?,510:-:c?                                        ← 501 desapareció
```

`applyDamage` está verificado en aislamiento (100 → 90 → 80 → 65 en cuatro impactos), así que el daño se aplica a **otro objeto**: algo reemplaza el combatiente del enemigo entre el disparo y la resolución. No identificado todavía.

**(2) La captura de punta a punta no se puede verificar** mientras (1) siga abierto, porque el enemigo nunca llega a `surrendered` en la pantalla y el bloque de abordaje no se ejecuta. El smoke `scripts/smoke-soldiers.mjs` fija los dos casos: **sin** soldados ya pasa (aparece el aviso y la presa no se toma); **con** soldados falla por el defecto (1).

**Lo que sí quedó probado en el modelo**: `canBoard` con 40 soldados contra 9 hombres da `{allowed: true, mine: 40, theirs: 9, needed: 9}`, y el fuego de cubierta rinde a un barco con la tripulación a 33 %.

**Siguiente paso para retomar**: instrumentar `applyDamage` en la pantalla para ver a qué objeto llega el daño, o comparar la identidad del `combat` del enemigo entre `deckFireVolley` y `resolveDefeatedEnemies`. La sospecha es que `processCombat` reemplaza el `combat` del encuentro en algún paso del bucle.
