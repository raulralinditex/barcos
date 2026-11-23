# El botón Reparar deja la nave en condiciones

Reparar hoy pone el casco a punto y nada más. Una nave reparada puede salir sin dotación suficiente, sin provisiones y flotando tan alta que el timón no muerde. El botón pasa a vender las tres cosas juntas, con un solo precio.

## Specs

S174. **El botón Reparar también deja la nave en condiciones de navegar.** Pedido (verbatim): "en el boton de reparar, añadamos tambien la dotacion minima si no la tenemos y en carga, suministro para 25 dias y la carga necesaria".
- **S174-A, la dotación mínima es la del astillero.** Decisiones del jugador (verbatim): "El minimo del astillero". Marinos hasta `hull.crewMin`, 2 artilleros y 10 soldados: exactamente el juego que usa `minimumShipPrice`, y exactamente el `crew-below-minimum` que el astillero ya marca como **error**. No se inventa un segundo criterio.
- **S174-B, se topa, nunca se recorta.** Una nave con más hombres que el mínimo los conserva. El botón sólo compra lo que falta.
- **S174-C, el suministro va a 25 días.** Si la nave tiene menos, se compra la diferencia; si tiene más, no se toca. Los días son de provisión de la tripulación que queda **después** de contratar, porque el marinero nuevo come desde que firma.
- **S174-D, «la carga necesaria» es lastre.** Decisiones del jugador (verbatim): "Lastre para no flotar alto". Se añade el lastre justo para cruzar `TURNING.lightLoadThreshold` (20 %), que es el `light-load` que el astillero ya avisa y que cuesta hasta la mitad del giro (S110). Ni un kg de más, y nunca a costa del espacio de la bodega.
- **S174-E, se suma al precio.** Decisiones del jugador (verbatim): "Se suma al precio". El botón muestra el total, con los precios que ya usa el astillero (`crewHirePrice`, `provisionsPrice`, `ballastPrice`).
- **S174-F, primero el casco, después lo demás.** El casco se repara con la regla de siempre, incluida la compra parcial si la bolsa no alcanza. Los hombres, los días y el lastre se compran **enteros** y sólo con lo que queda: una nave a la que no le alcanza sigue reparada, que es lo urgente.
- **S174-G, una nave ya en condiciones paga sólo la reparación.** Si no falta nada, el plan cuesta 0 y el botón se comporta exactamente como antes. Es la compatibilidad con todo lo que ya existía.

## Tasks

- T98 — S174-A/B/C/D/E: `src/model/seaworthy.js` (`SEAWORTHY`, `seaworthyPlan`, `applySeaworthy`, `seaworthyCost`), puro y sin almacenamiento, con los criterios del astillero prestados. Ruta: inline. Hecho.
- T99 — S174-E/F: el botón de `app.js` muestra el total y el handler repara el casco y luego compra lo que falta con lo que queda. Ruta: inline. Hecho.
- T100 — S174: `test/seaworthy.test.js` (11 tests) y `scripts/smoke-seaworthy.mjs`. Ruta: inline. Hecho.
- T101 — Verificación: `npm test` completo, los smokes de reparación existentes y el nuevo, con RED medido. Ruta: inline. Hecho.

## Log

L100 (pedido, verbatim): "en el boton de reparar, añadamos tambien la dotacion minima si no la tenemos y en carga, suministro para 25 dias y la carga necesaria". Tres decisiones pedidas antes de escribir: dotación = «El minimo del astillero»; carga = «Lastre para no flotar alto»; cobro = «Se suma al precio».

L101 (estado medido antes de tocar nada). El botón Reparar sólo llamaba `repairFleetShip`: casco, arpón y tripulación viva, nada más. Las tres cosas que faltaban ya tenían criterio en el código: `crew-below-minimum` es un error del astillero y `minimumShipPrice` usa `{ marino: crewMin, artillero: 2, soldado: 10 }`; `light-load` avisa con `TURNING.lightLoadThreshold`; y las provisiones son `days` con `supplySeconds`.

L102 (cierre). **`npm test` 1071/1071** (1060 más 11 nuevos). Smokes en 0: `seaworthy` (nuevo), `manual-repair`, `repair-price`, `dock`, `anchor-yard`, y los del refactor de modos.

**RED honesto del smoke**: con `src/ui/app.js` de `HEAD`, falla nombrando las cinco reglas — marinos en 5, artilleros en 0, soldados en 0, 4 días de provisión, 0 kg de lastre.

**Un defecto real que el test encontró en mi propio código**: `Math.ceil(total - 1e-9)` devuelve **`-0`** cuando no se compra nada, y `assert.equal(-0, 0)` falla en `strict`. Se arregló con `Math.max(0, ...)`, que además es lo correcto: un precio nunca es negativo.

**Un fallo previo, ajeno a S174 y no tocado**: `scripts/smoke-auto-repair.mjs` está **rojo en `HEAD` limpio** (`git stash -u` verificado). Espera `[40, 30, 42]` de condiciones de casco y lee `[40, 80, 42]`: el casco de la capitana queda en 80. No tiene relación con este cambio (S174 no toca la condición del casco) y se reporta, no se arregla sin decisión del jugador.
