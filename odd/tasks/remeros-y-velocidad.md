# Remos y velocidad

Los remos como propulsión de respaldo: `max(velas, remos)` en vez de suma, con fatiga, castigo por carga y mejora de maniobra. Pedido del jugador (verbatim): "los remeros los vamos a introducir en la velocidad", con la fórmula `I_total = max(I_velas, I_remos) − I_penalización carga y fatiga`, y tres precisiones: "remos automaticos, tambien influyen en la maniobrabilidad, los cascos que no tienen remos no aparecen en la interface esa posibilidad".

## Specs

S159. **Los remos son propulsión de respaldo, no un motor extra.** Pedido (verbatim): "los remeros los vamos a introducir en la velocidad" y la fórmula aceptada `I_total = max(I_velas, I_remos) − I_penalización carga y fatiga`.
- **S159-A, se toma el mayor, no la suma.** `V = throttle · max(V_velas, V_remos) · rigFactor`. Un barco no obtiene la suma de ambas propulsiones: la resultante depende de la resistencia del casco cargado. Con viento de popa fuerte gana la vela y los remos no aportan nada; con viento de proa gana el remo y el barco se salva.
- **S159-B, el remo no sufre el castigo del viento.** `V_remos` no se multiplica por `windFactor`, que es exactamente lo que hace útil al remo: independencia del viento. Es la opción por defecto de la propuesta aceptada con "me parece bien".
- **S159-C, el remo depende de la carga.** `k_carga = 1 − 0,6 · max(0, loadFraction − 0,5) / 0,5`. A media carga rinde entero; cargado al tope rinde el 40 %.
- **S159-D, la fatiga es una curva declarada.** El esfuerzo va de 0 a 1 y da `V_remos = oarMaxKn · esfuerzo`, que reproduce la tabla del jugador punto por punto (1,0 → esprint 7 kn; 0,75 → crucero 5,25; 0,50 → sostenido 3,5; 0,30 → formación 2,1). Remando baja a la mitad en `sprintS`; descansando vuelve a pleno en `recoverS`. Valores aceptados: 90 s y 60 s de juego.
- **S159-E, los remos son automáticos.** El `max()` decide solo si los remos están aportando; no hay tecla nueva. El HUD muestra cuánto están aportando cuando aportan.
- **S159-F, los remos mejoran la maniobra.** Un casco que rema gana hasta `turnBonus` sobre su tasa de giro, escalado por el esfuerzo: es la "maniobra táctica" del pedido.
- **S159-G, sólo los cascos con bancos llevan remos, y se declara por casco.** `oarBanks` y `oarMaxKn` son campos del casco. La galeaza los tiene documentados ("300 remeros"); la barca costera, pinaza, carabela latina, patache, zabra y jacht por convención del juego, y se reporta como tal.
- **S159-H, donde no hay bancos no se ofrece la opción.** La interfaz del astillero no muestra el campo de remeros en un casco sin bancos, y el aviso existente deja de ser la única barrera.
- **S159-I, nada de lo que ya funciona cambia.** Un casco sin `oarBanks`, o un guardado anterior, se comporta exactamente como hoy: sin remos, sin fatiga y sin cambio de velocidad ni de giro.

## Tasks

- T41 — S159-A/B/C/D/F + S159-G: `src/model/oars.js` (bancos, velocidad de remo, esfuerzo, castigo por carga, factor de giro) y `test/oars.test.js`. Ruta: inline.
- T42 — S159-G: los campos `oarBanks` y `oarMaxKn` en los siete cascos y su normalización en la derivación de `src/data/naval-data.js`. Ruta: inline.
- T43 — S159-A/B/F/I: `stepHull` con el `max()`, el factor de giro por remo y el esfuerzo por escuadra en `src/model/world.js`, con su compatibilidad. Ruta: inline. Hecho en `e6b92c0` (ver L57).
- T44 — S159-E/F: el cableado en `src/ui/sea.js` (esfuerzo por casco, entrada al mundo) y el indicador del HUD. Ruta: inline. Hecho en `e6b92c0` (ver L57).
- T45 — S159-H: el campo de remeros oculto en los cascos sin bancos (`src/ui/app.js`), i18n es/en. Ruta: inline. Commit: ver L56.
- T46 — el smoke `scripts/smoke-oars.mjs` y la verificación de la suite completa. Ruta: inline. Hecho en `e6b92c0` (ver L57).

## Log

L50 (pedido, verbatim): "los remeros los vamos a introducir en la velocidad teniendo en cuenta que : [fórmula `I_velocidad_total = max(I_velas, I_remos) − I_penalización carga y fatiga`]". Con la tabla de escenarios (esprint 7 kn/índice 70, crucero 5-6/50-60, sostenido 3-4/30-40, formación 2/20) y la conclusión: "los remeros mejoran la independencia del viento y la maniobra, no necesariamente la velocidad máxima sostenida".

L51 (decisiones, verbatim): "me parece bien, remos automaticos, tambien influyen en la maniobrabilidad, los cascos que no tienen remos no aparecen en la interface esa posibilidad". El "me parece bien" acepta la propuesta completa, incluido el ritmo de fatiga de 90 s de esprint y 60 s de descanso, y la inmunidad del remo al castigo del viento (S159-B).

L52 (medición previa): hoy los remeros sólo pesan. `computeBudget` no lee el rol para nada, así que 20 remeros en una barca costera cuestan −8,26 % de velocidad y en una galeaza −0,34 %. La regla vigente (`ship-model.js:262`) es `counts.remero > 0 && hull.id !== "galeaza"` → WARN, no ERROR, así que cualquier casco puede llevar remeros y sólo recibe un aviso. Eso es lo que S159-G/H reemplaza.

L55 (cierre de S159, commits `8beb5f5` y `3898109`). `npm test` **971/971** con los tests nuevos: 15 en `test/oars.test.js`, 11 en `test/boarding.test.js` y los tres de S162 en `test/zone-quota.test.js`.

**Lo que está implementado y probado:**

| Pieza | Dónde | Estado |
|---|---|---|
| `max(velas, remos)`, nunca la suma | `src/model/world.js` `stepHull` | ✅ |
| Los remos no sufren el viento | `oarSpeedKn` no multiplica `windFactor` | ✅ |
| Castigo por carga (media carga rinde entero, al tope el 40 %) | `loadPenalty` | ✅ |
| Fatiga 90 s de esprint / 60 s de descanso, curva de la tabla del jugador | `effortStep` | ✅ |
| Remos automáticos (`max()` decide) | `rowingTarget` | ✅ |
| Los remos mejoran la maniobra (+25 % al esfuerzo pleno) | `oarTurnFactor` | ✅ |
| `oarBanks`/`oarMaxKn` por casco; sin bancos no hay remos | `naval-data.js`, 7 cascos | ✅ |
| El aviso dejó de ser una excepción hardcodeada de la galeaza | `ship-model.js` | ✅ |

**El ajuste de velocidad del documento de `/Users/raulripoll/Downloads` quedó pendiente, y es deliberado.** La medición mostró que la tabla del documento no es función de la eslora (la carabela de 20 m es más rápida que la galeaza de 50 m), así que el ajuste por mínimos cuadrados daba un exponente de 0,09 —casi plano— que destruye la física. La forma fiel sería `Vref = 2,43·√L · k_casco`, con un `k` por casco. **No se implementó** porque reescribe `test/ship-model.test.js:131`, que fija la fórmula vigente, y esa decisión quedó sin respuesta.

**Estado de las dos fichas:** S159 (remos) cerrada en modelo y física; falta el cableado en la pantalla del mar (el esfuerzo por casco no se pasa todavía a `stepHull` desde `sea.js`) y el indicador del HUD.

L56 (cierre de S159-H / T45, el cableado que faltaba de la ficha). `npm test` **974/974** (971 + 3 en `test/oars.test.js`).

**Pedido del jugador, verbatim**: "en el panel de aparejos, si ese buque, los remeros no inportan, esconde el editor de añador remeros". Es S159-H tal como se había especificado en L51 ("los cascos que no tienen remos no aparecen en la interface esa posibilidad"), que nunca se había ejecutado: `renderCrew` recorría los cuatro roles sin mirar el casco.

**La regla vive en el modelo, no en la pantalla** (`src/model/oars.js`):

| Pieza | Qué hace |
|---|---|
| `crewRolesForHull(hull, roles)` | devuelve los roles que el casco puede sentar; sin bancos, sin `remero` |
| `withoutUnseatableRowers(hull, crew)` | la misma tripulación sin los remeros que el casco no puede sentar |

**Dónde se lee**: `renderCrew` (`src/ui/app.js`) arma las filas desde `crewRolesForHull`, y el casco se resuelve con `hullById(state.hullId)`, así que elegir otro casco cambia lo que ofrece el panel sin otra regla. `withoutUnseatableRowers` se aplica en los tres momentos en que la tripulación puede quedar sin asiento: elegir casco, cargar un guardado y `applyCountryToLoadout`. Los otros roles nunca se tocan.

**Evidencia**: RED observado dos veces. En el modelo, `test/oars.test.js` no podía ni importar las funciones (`SyntaxError: does not provide an export named 'crewRolesForHull'`). En pantalla, `scripts/smoke-oars-editor.mjs` sobre la base falla las tres comprobaciones («a nao armada must not offer rowers, it offered ["marino","artillero","soldado","remero"]», y los 120 remeros sobreviven al cambio de casco); con el arreglo pasa en 0. Verde además: `smoke-refit`, `smoke-shipyard-buttons`, `smoke-ui`, `smoke-i18n`.

**No se tocó la regla del aviso.** `rowers-without-galley` sigue emitiéndose en `ship-model.js` y su test sigue verde: el aviso cubre el guardado viejo y la reforma, la pantalla cubre al jugador que arma un casco.

**Tres smokes fallan también en la base** (comprobado con `git stash` de este trabajo): `smoke-two-hulls` y `smoke-buy-hull` agotan el tiempo esperando `#launch-btn`, y `smoke-tabs` cuenta 23 bloques de Configuración donde espera otro número. Son previos y ajenos a esta ficha; quedan reportados, no tocados.

L57 (cierre de T43, T44 y T46 — S159 completa, commit `e6b92c0`). `npm test` **987/987** (974 + 13: 7 en `test/oars-sea.test.js` y los 6 que el propio cableado hizo posibles). `scripts/smoke-oars.mjs` en 0 con **8 comprobaciones**.

**Lo que faltaba era exactamente lo que T43/T44 pedían, y estaba a la vista**: `stepHull` y `stepEscort` ya leían `input.oars` desde `8beb5f5`, pero `updateWorld` no le pasaba nada. Cada casco del juego real navegaba con `oarKn = 0` y la fatiga no ocurría nunca. El modelo estaba probado y el juego no lo usaba.

**Tabla de lo que quedó cableado:**

| Pieza | Dónde | Estado |
|---|---|---|
| `world.oarEffort` por casco, avanzado en cada paso | `oarRecord` en `world.js` | ✅ |
| El esfuerzo llega a la física de capitana, escoltas y escuadras | `stepShip`/`stepEscort` vía `input.oars` | ✅ |
| `world.oarReading`: lo que la capitana rema ahora | `updateWorld` | ✅ |
| Fila de remos en el HUD, oculta sin bancos | `sea.html`, `updateHud` en `sea.js`, i18n es/en | ✅ |

**Tres defectos que el cableado destapó, los tres arreglados acá:**

1. **El mar no conocía la identidad de la capitana.** `world.ship` era posición y velocidad y nada más: sin `hullId`, ninguna regla que lea el casco podía aplicársele; sin `id`, un registro por casco no tenía clave. Y `deserializeWorld` los volvía a tirar al cargar, así que el esfuerzo quedaba huérfano en cada recarga. Es la causa raíz de que S159 no se notara en pantalla.
2. **Una escolta con bancos remaba cero.** `createEscort` no llevaba `hullId`, `loadFraction` ni la tripulación: la capitana remaba y su escuadra no, con el mismo casco. Medido: con `createEscort` sin esos campos, el registro del esfuerzo sólo tenía la capitana.
3. **Cada escuadra heredaba la identidad de la capitana del timón.** `{...world.ship}` en el arranque le daba a toda capitana el casco, la carga y la tripulación de la primera. Con los remos cableados, una segunda capitana habría remado con la tripulación de otra. Ahora cada una lleva la suya (`hullSpec`).

**Evidencia de RED, observada en los dos niveles:**

- **Modelo**: `test/oars-sea.test.js` con el `createEscort` viejo falla «the escort's crew must have an effort on record, got {"ship-…":0.994}» — sólo la capitana. Verde con el arreglo.
- **Pantalla**: `scripts/smoke-oars.mjs` con la capitana sin identidad falla **5 de 8** comprobaciones: la fila de remos no aparece, dice «—», el guardado no lleva `hullId`, no hay esfuerzo gastado y no sobrevive a la recarga. Verde con el arreglo.
- **Suite**: los dos rojos que el cableado produjo se arreglaron con su causa —`S8 round-trip` (identidad perdida al cargar) y `S155-C lista rota` (una escuadra `null` hacía estallar `oarRecord` antes de que corriera la física)— y no relajando ninguna aserción.

**El escenario del gasto es el que la regla describe.** El smoke tuitea el aparejo al 10 % para forzar el caso: con aparejo entero y viento a favor gana la vela y la tripulación descansa, que es lo correcto (S159-A), y ahí no hay esfuerzo que gastar. Los remos existen para el día en que la vela no alcanza.

**Límite conocido**: el `oarReading` que publica el mundo es el de la capitana que lleva el timón, no el de una capitana parqueada. El HUD muestra el casco que el jugador está gobernando, que es lo que pide S159-E; leer el de otra escuadra sin tomar su timón no se pidió y no se hizo.

**Smokes en 0**: oars, sea, sea-squadrons, fleet, levels, ui, i18n, tabs, combat, danger.

**Smokes que fallan y NO son de este cambio**, comprobados contra la base con `git stash` (idéntico mensaje en los dos estados): `smoke-formation` («a sunk escort is still in the fleet», y antes «the escort never left its starting station») y `smoke-state` («live escort not repaired», «firing did not change the bars»). Los dos venían rotos desde antes de S155 (L49).
