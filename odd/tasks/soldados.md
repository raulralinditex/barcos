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

L59 (cierre de S160, commit `fad9f84`). `npm test` **992/992**; `scripts/smoke-soldiers.mjs` en 0 con **los dos casos**, en tres corridas seguidas.

**El defecto (1) de L56 no era del fuego de cubierta.** El fuego de cubierta funcionaba desde `b66204d`: con 40 soldados a 51 m da `crew: 12` por andanada, seis andanadas rinden al patache y `canBoard` la autoriza (`{allowed: true, mine: 40, theirs: 6, needed: 6}`). Lo que estaba roto era **el smoke que lo vigilaba**, y detrás de él, dos defectos reales que la cacería destapó.

**La cadena medida, en orden:**

1. **El fixture del smoke no le daba velocidad al enemigo.** `combat.maxSpeedKn` ausente → `aiStep` calculaba `maxSpeedKn * speedFactor` = `NaN` → `encounter.x/y` = `NaN` → el filtro de despawn de `updateWorld` compara `Math.hypot(NaN - x, NaN - y) <= 3400`, que es `false` para NaN → **el casco desaparece del mar**. La presa se borraba antes de poder rendirse. Medido en el navegador con instrumentación real sobre el archivo: `DBG-NAN id=501 result.enemy.x=NaN`.
2. **El mar no clampeaba `dt` por abajo.** `const dt = Math.min(0.1, (now - lastTime) / 1000)`: si `requestAnimationFrame` entrega un timestamp anterior a `lastTime` —cosa que pasa al cargar el módulo y al volver de una pestaña en segundo plano— el paso es **negativo** y el mar entero corre hacia atrás. Medido: `dt=-0.013` en el primer frame.
3. **El smoke abría la segunda página sobre el `localStorage` de la primera.** `localStorage` se comparte por origen, así que el caso «con soldados» heredaba la flota del caso «sin soldados»: el casco que disparaba desde la cubierta era el que no tenía soldados. Medido: `DBG-DECK hull=Sin soldados ... crew=0` mientras el fixture decía 40.
4. **El smoke leía la flota después de que la captura ya había ocurrido.** La presa está a 51 m y ya rendida, así que la captura cae en el primer segundo; `fleetCount(page)` después de 1200 ms medía el resultado, no el punto de partida.

**Los arreglos:**

| Pieza | Cambio |
|---|---|
| `src/model/combat.js` | `aiStep` resuelve la velocidad (`combat.maxSpeedKn` → `enemy.speedKn` → 5) y pasa **ese** valor a `stepHull`, no el campo crudo |
| `src/ui/sea.js` | `dt` acotado a `[0, 0.1]` |
| `scripts/smoke-soldiers.mjs` | `maxSpeedKn: 5` y `crewDamagePool: 0` en el enemigo; `level`/`levelEnemies`/`order`/`squadrons` en el mundo; `browser.newContext` por caso; `FLEET_AT_OPEN` como línea base |
| `test/enemy-restore.test.js` | 4 tests nuevos |

**Evidencia de RED, medida:** el smoke sobre el fixture viejo reporta «fleet went 1 → 1» sin anuncio de captura; la suite sin los arreglos del modelo da **991/992** (el test de `aiStep` en rojo). Verde con ellos: 992/992 y smoke en 0.

**Lo que esto significa para el punto (2) de L56** —«la captura de punta a punta no se puede verificar»—: **queda cerrado**. La captura se verifica de punta a punta en el navegador real: el banner dice «¡Patache capturada! Se suma a tu flota» y la flota pasa de `["Con soldados"]` a `["Con soldados","Patache"]`.

**Smokes en 0**: soldiers, combat, oars, sea, levels.

L60 (revisión del delta de S160). Sin revisión nativa por la misma razón que L58: RDD fija como candidato la rama entera (`base-ref 7ace33b`, 52 paths) y eso ya falló dos veces con `lens_context_budget_exceeded` sin crear autoridad. Revisión normal sobre el delta `7452078..HEAD` (186 líneas, 5 archivos).

**El delta verificado, medido contra la base real (`7452078`) y no contra el árbol de trabajo:**

| Caso | Base | Con el cambio |
|---|---|---|
| Enemigo normal (`maxSpeedKn: 5`) | 2,500 kn | **2,500 kn** — sin cambio |
| Enemigo sin `maxSpeedKn` | **NaN**, posición NaN | **2,500 kn**, posición real |

Eso es lo que el commit afirma, y sólo eso: el fallback no toca a nadie que ya declaraba su velocidad.

**Un defecto PREEXISTENTE encontrado, no introducido acá, y no arreglado:** el aparejo se aplica **dos veces** a la velocidad del enemigo. `aiStep` calcula `maxSpeed = maxSpeedKn * speedFactor(combat)` y después `stepHull` vuelve a aplicar `riggingSpeedFactor(input.rigging)`, que es la misma curva. Medido con aparejo al 50 %: el enemigo hace **1,06 kn** donde le tocaría ~1,63 — el factor 0,65 entra al cuadrado (0,42). Con aparejo al 100 % no se nota, que es por qué nadie lo había visto. Comprobado idéntico en `7452078` y en `HEAD`: **no es de este cambio**. Queda reportado como follow-up; arreglarlo cambia el equilibrio del combate (un enemigo desarbolado sería un 54 % más rápido) y eso es decisión del jugador, no de una revisión.

**Una nota de método que casi me hace concluir lo contrario:** `git stash` sobre un archivo ya commiteado no guarda nada, así que la primera comparación «base contra cambio» fue en realidad el cambio contra sí mismo y dio idéntico. La comparación válida se hace con `git show <commit>:<archivo>`. Ya me pasó algo parecido en L59 con `git checkout`; conviene comprobar con `grep` que el árbol tiene el cambio que se cree estar midiendo.

**Verificación**: `npm test` **992/992**; `smoke-soldiers` en 0. Cero líneas eliminadas en `test/` desde `7452078`: no se relajó ninguna aserción.

L61 (cierre del doble castigo del aparejo, commit `1adb61a`). `npm test` **1013/1013** (1009 + 4 en `test/enemy-rigging.test.js`).

**El defecto, confirmado y medido.** `speedFactor` (`combat.js`) y `riggingSpeedFactor` (`world.js`) son **exactamente la misma curva** — comprobado punto por punto en el test: `0.3 + 0.7·rigging/100` en las dos. Y se aplicaban las dos al enemigo: `aiStep` la metía en `maxSpeed`, y después `stepHull` —la física que comparten todos los cascos (S57)— la volvía a aplicar desde `input.rigging`. El casco del jugador la siente **una vez**; el del enemigo, dos.

| Aparejo | Antes | Después |
|---|---|---|
| 100 % | 2,500 kn | 2,500 kn |
| 50 % | **1,056 kn** | **1,625 kn** |
| 10 % | **0,342 kn** | **0,925 kn** |

**Por qué importaba.** Un enemigo desarbolado no podía mantener la estación, y eso es justo lo que hacía tan difícil abordarlo: medido con el arreglo, cerrar de 2000 m a 600 m tarda 47 s con aparejo entero, 71 s a la mitad y 123 s a un décimo. Sigue siendo más lento que uno intacto —de eso se trata desarbolarlo— pero deja de ser un blanco fijo. Con el defecto, a la mitad del aparejo tardaba cerca del doble de lo que la curva pide.

**El arreglo es de una línea de concepto**: `aiStep` declara la velocidad del casco **con aparejo entero** y deja el castigo a `stepHull`, que es donde el jugador y las escoltas ya lo sentían. El *fallback* de S160 para un combatiente restaurado sin `maxSpeedKn` se conserva, y también queda escalado una sola vez.

**Evidencia de RED**: sin el arreglo, la suite reporta «at 50% the enemy must make 1.625 kn (the curve applied once), she made 1.056».

**Dos smokes que parecían regresiones y no lo eran**: `smoke-safe-zone` y `smoke-soldiers` fallaron en una corrida bajo carga del servidor y pasaron **tres veces seguidas** cada uno al repetirlos. `smoke-escort-range` y `smoke-formation` fallan **también en la base** (comprobado con `git show HEAD:src/model/combat.js`), y no se tocaron.

**Nota de equilibrio**: el enemigo desarbolado es ahora hasta 2,7× más rápido que antes en el extremo. Si el combate queda demasiado duro, el número a mover es `COMBAT.fleeHullPct` o la curva de `speedFactor`, no volver a aplicar el castigo dos veces.
