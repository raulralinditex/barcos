# El panel de aparejo sólo con nave elegida

En la sala «Tu flota», los paneles del buque y del aparejo aparecen sólo cuando hay una nave elegida.

## Specs

S165. **Sin nave seleccionada, la sala «Tu flota» no muestra el panel de aparejo.** Pedido (verbatim): "en la pantalla tu flota del astillero, no mostrar el panel de aparejo si no hay ninguna nave seleccionada".
- **S165-A, la regla es de la selección, no de la sala.** Los paneles del buque y del aparejo siguen a la nave que el jugador eligió. Sin elección no pertenecen a nadie, y la sala muestra la lista sola.
- **S165-B, elegir una nave los trae.** Al elegir un casco de la lista, los dos paneles aparecen con sus datos, como hasta ahora.
- **S165-C, dejarla de elegir los saca.** Volver a entrar a la sala sin elegir, o comprar y quedar sin selección, deja la sala sin los paneles.
- **S165-D, las demás salas no cambian.** «Comprar buque» los mantiene siempre, porque ahí se arma un casco desde cero y no hay flota que elegir. Configuración, Astillero y Mercado siguen sin tomarlos (S145/S147).
- **S165-E, nada de lo que los paneles dicen cambia.** Sólo se decide si están a la vista.

## Tasks

- T62 — S165-A: `showsBuilderPanels` en `src/model/fleet-panels.js`, con su test. Ruta: inline.
- T63 — S165-A/B/C/D: el cableado en `src/ui/app.js` (`layoutBuilderPanels`), al cambiar de sala, al elegir y al deseleccionar. Ruta: inline.
- T64 — S165-E: el smoke y la verificación completa. Ruta: inline.

## Log

L70 (pedido, verbatim): "en la pantalla tu flota del astillero, no mostrar el panel de aparejo si no hay ninguna nave seleccionada".

L71 (estado medido antes de tocar nada): los paneles `.panel-ship` y `.panel-build` los movía `showScreen` con una regla **por sala** (`standIn = next !== "configuracion" && next !== "astillero" && next !== "mercado"`), sin mirar la selección. Medido en el navegador: al abrir «Tu flota» sin elegir nada, `{"shipPanel":true,"rigPanel":true,"detail":false}` — los paneles estaban a la vista con los datos de la capitana que el boot pone en el editor (S109), mientras el detalle de la flota sí estaba oculto. Tras «nueva nave»: `{"shipPanel":true,"rigPanel":true,"detail":false}`, el mismo defecto.

L72 (cierre de S165, commit `SIN_COMMIT`). `npm test` **1021/1021** (1016 + 5 en `test/fleet-builder-panels.test.js`). `scripts/smoke-fleet-panels.mjs` en 0.

**La regla quedó en el modelo** (`showsBuilderPanels`), no en la pantalla, porque es una decisión de producto y no un detalle de pintado: tres salas de lectura nunca los toman, «comprar» siempre los toma, y «flota» depende de la selección. La pantalla sólo la aplica (`layoutBuilderPanels`).

**Dos puntos de cableado que no eran obvios**, y sin ellos el arreglo no habría servido: la selección cambia **después** de `showScreen`, así que hay que re-layout al elegir (`selectRefitShip` con `openRoom: false`, que es el camino del boot) y al deseleccionar (`#new-ship-btn`). Sin esos dos, la sala se quedaba con el estado del último `showScreen`.

**Evidencia de RED**: sin el arreglo, `smoke-fleet-panels` falla **4 de sus comprobaciones** (los dos paneles, en la sala recién abierta y en una visita nueva).

**Medido en el navegador, las cinco salas:** `comprar` → paneles visibles; `astillero`, `mercado`, `configuracion` → ocultos; `flota` sin elegir → ocultos, con nave elegida → visibles.

**Smokes en 0**: fleet-panels, fleet, refit, tabs, yard-entry, shipyard-layout.
