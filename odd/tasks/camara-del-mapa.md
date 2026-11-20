# La cámara del mar: el minimapa mueve la vista

Un clic en el panel redondo del mapa mira esa parte del mar en pantalla. La capitana no se mueve.

## Specs

S166. **Un clic en el minimapa mira esa parte del mapa.** Pedido (verbatim): "en el mar, tenemos un panel redondo con una miniatura de todo el mapa, cuando en ese panel cliqueas un punto, mostrar esa parte del mapa en pantalla".
- **S166-A, el clic mueve la vista, no el barco.** La cámara deja de estar soldada a la capitana: un clic en el mapa centra la pantalla en ese punto del mar, y el timón sigue gobernando el mismo casco.
- **S166-B, mirar no navega.** Mirar otra parte del mapa no mueve ninguna capitana, no gasta suministro, no cambia el rumbo y no altera el guardado del mar. Es mirar.
- **S166-C, la vista no sale del mar conocido.** Un clic cerca del borde del mapa se acota al radio del mundo, para que la pantalla no quede mirando un vacío sin nada dibujado.
- **S166-D, se puede volver a la capitana.** Una tecla (`V`) devuelve la vista a la capitana que lleva el timón. Un guardado recargado siempre abre mirando a la capitana.
- **S166-E, la pantalla dice cuándo está mirando a otro lado.** El título del casco se marca mientras la vista no sigue a la capitana: si no, el jugador leería que su barco dejó de moverse.
- **S166-F, nada de lo que el mar dibuja cambia.** Zonas, astilleros, encuentros, escoltas, barras, arcos de alcance y la flecha del jugador se pintan igual, sólo que alrededor de otro punto.
- **S166-G, i18n es/en** del aviso al mirar y del aviso al volver.

## Tasks

- T65 — S166-A/B/C/D: `src/model/sea-camera.js` (`cameraFor`, `clampCamera`, `isFollowingCaptain`) y `test/sea-camera.test.js`. Ruta: inline.
- T66 — S166-A/F: la cámara en `src/ui/sea.js`: los dos centros de dibujo, `toScreen` y `toWorld`. Ruta: inline.
- T67 — S166-A/D/E: el clic del minimapa, la tecla `V`, el marcado del título y el i18n. Ruta: inline.
- T68 — S166-G: el smoke y la verificación completa. Ruta: inline.

## Log

L73 (pedido, verbatim): "volvamos a la tarea de cuando clequeas el mapa mostrar esa parte del mapa, estamos hablando que en el mar, tenemos un panel redondo con una miniatura de todo el mapa, cuando en ese panel cliqueas un punto, mostrar esa parte del mapa en pantalla".

L74 (corrección de alcance, verbatim del turno anterior): "Con varias capitanas, ¿qué debe hacer un clic en el minimapa?" se había contestado «Elegir la capitana que está ahí», y **esta vez el jugador aclara que lo que quería era mover la vista**. S164 queda reemplazada por S166: `squadronOnChart` y su smoke se retiraron por quedar huérfanos.

L75 (estado medido antes de tocar nada): el mar centraba **todo** en `world.ship`: dos bloques de dibujo hacían `ctx.translate(-world.ship.x, -world.ship.y)`, y `toScreen`/`toWorld` restaban o sumaban `world.ship`. No había ninguna noción de cámara. Eran cuatro puntos, no más, así que la cámara se pudo introducir sin tocar el resto del dibujo.

L76 (cierre de S166, commit `SIN_COMMIT`). `npm test` **1021/1021** (1016 + 5 en `test/sea-camera.test.js`; el total baja de 1026 porque se retiraron los 5 de `test/minimap-pick.test.js`, que fijaban S164). `scripts/smoke-minimap-camera.mjs` en 0.

**La regla vive en el modelo** (`sea-camera.js`) porque la distinción que importa es de producto y no de pintado: **la capitana es donde está el viaje, la cámara es donde mira el jugador**. `cameraFor` resuelve el punto de dibujo, `clampCamera` lo acota al mar conocido, y una cámara rota o ausente significa «seguir a la capitana».

**Medido en el navegador**: la capitana en `(900,300)`; un clic en el mapa hacia `(-3000,-2500)` cambia **los píxeles del mar** (captura comparada), el título se marca `is-viewing-elsewhere`, y **la capitana sigue en `(900,300)`** en el guardado. `V` devuelve la vista y el banner dice «La vista vuelve al Alfa».

**Evidencia de RED**: sin el clic de cámara (volviendo al de S164), `smoke-minimap-camera` falla 2 comprobaciones: el título no se marca y volver no cambia el mar.

**Retirado a propósito**: `squadronOnChart` en `world.js`, `minimapReachM`/`MINIMAP_PICK_PX` en `sea.js`, `test/minimap-pick.test.js` y `scripts/smoke-minimap-pick.mjs`. Eran de S164 y quedaban sin uso. Se retiran enteros en vez de dejarlos como código muerto.

**Smokes en 0**: minimap-camera, sea, sea-squadrons, sea-save-merge, fleet, oars. `smoke-sea-collect` falla **también en la base** (comprobado con `git show HEAD:src/ui/sea.js`) y no se tocó.
