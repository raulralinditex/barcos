# El minimapa elige capitana

Con varias capitanas a flote, el minimapa deja de ser un dibujo: un clic sobre una capitana toma su timón.

## Specs

S164. **El minimapa elige la capitana que está ahí.** Pedido (verbatim): "al poder tener varias capitanas tendremos que poder ir donde estan, para eso necesitamos que en el panel del mapa, si clicamos sobre el vayamos a donde hemos clicado". Precisión (verbatim, elegida entre tres): "Elegir la capitana que está ahí".
- **S164-A, el clic en el minimapa toma el timón de la capitana más cercana al punto.** Es el mismo gesto que ya hace el clic en el mar (S155-E): elegir un mando, no dar una orden. El minimapa no navega: cambia de capitana.
- **S164-B, el minimapa no entra a los astilleros.** Decisión (verbatim): "No, sólo el ancla del mar entra". Un astillero se abre clicando su ancla en el mar (S163); el minimapa sólo elige capitanas.
- **S164-C, el alcance del clic es el de un mapa, no el de la pantalla.** Un minimapa de 170 px muestra un mar de miles de metros, así que el radio de acierto se mide en metros del mundo y es proporcional a lo que el mapa dibuja, no al tamaño con que se dibuja una capitana en el mar.
- **S164-D, un clic en agua vacía no hace nada.** No hay capitana que tomar: el mando se queda donde está, igual que hoy un clic en agua abierta en el mar.
- **S164-E, el mapa dice que se puede clicar.** El cursor cambia al pasar sobre una capitana, para que el jugador sepa que el minimapa responde.
- **S164-F, nada de lo que el minimapa dibuja cambia.** Las zonas, los astilleros, los encuentros, las escoltas y la flecha del jugador se pintan igual.

## Tasks

- T59 — S164-A/C/D: `squadronOnChart` en el modelo, con su radio en metros del mundo, y su test. Ruta: inline.
- T60 — S164-A/E: el clic y el cursor en el minimapa de `src/ui/sea.js`. Ruta: inline.
- T61 — S164-F: el smoke que fija el gesto y la verificación completa. Ruta: inline.

## Log

L65 (pedido, verbatim): "al poder tener varias capitanas tendremos que poder ir donde estan, para eso necesitamos que en el panel del mapa, si clicamos sobre el vayamos a donde hemos clicado".

L66 (decisiones, verbatim): el clic "Elegir la capitana que está ahí", y sobre los astilleros "No, sólo el ancla del mar entra".

L67 (estado medido antes de tocar nada): `drawMinimap` en `src/ui/sea.js` dibuja zonas, astilleros, encuentros, escoltas, cada escuadra (`drawMinimapHull`) y la flecha del jugador, pero **no tiene ni un solo `addEventListener`**: el minimapa es sólo un dibujo. El canvas mide 170 px y dibuja el mar entero de `WORLD.radiusM` en `MINIMAP_RADIUS - 6 = 79` px, así que un clic de mapa cubre muchísimo más mar que un clic de pantalla: el radio de acierto tiene que salir de esa escala, no del `CAPTAIN_CLICK_RADIUS_M = 90` del mar.

L68 (cierre de S164, commit `SIN_COMMIT`). `npm test` **1009/1009** (1004 + 5 en `test/minimap-pick.test.js`). `scripts/smoke-minimap-pick.mjs` en 0.

**Lo que se implementó, y dónde vive la regla:**

| Pieza | Dónde | Por qué ahí |
|---|---|---|
| `squadronOnChart(world, point, radiusM)` | `src/model/world.js` | El alcance lo decide quien llama, porque depende de la escala del mapa y no del mar |
| `minimapReachM()` = `MINIMAP_PICK_PX / escala` | `src/ui/sea.js` | 9 px de mapa: un punto legible en 170 px |
| `minimapAtPointer(event)` | `src/ui/sea.js` | Geometría propia del mapa: centro en el origen del mar, no en la cámara |
| El clic, el cursor y `mouseleave` | `src/ui/sea.js` | El mapa responde y lo dice antes del clic |

**La trampa que había que evitar:** el minimapa se dibuja con **su propia geometría** —centrado en el origen del mar y con su escala—, así que `toWorld` (que lee la cámara) habría interpretado un clic del mapa como un punto cerca de la capitana. El clic se convierte por la geometría del mapa: `(px - centro) / escala`, y antes se mapea del tamaño CSS al tamaño del canvas, porque el canvas se estira por CSS.

**Evidencia de RED, medida:** sin el cableado, `smoke-minimap-pick` falla **3 de 4** comprobaciones (el cursor queda en `""` y el clic no cambia de capitana). Verde con él.

**Medido en el navegador real, con dos capitanas**: el título dice «Alfa — Galeón pequeño · 2 capitanas en el mar»; el cursor sobre Beta es `pointer`; el clic lleva el mando a **Beta**; y un clic en agua vacía deja el mando en Beta y el cursor en `""`.

**Límite conocido**: el minimapa se estira por CSS, así que la conversión de clic depende de `rect.width/height` del canvas. Está en el código y el smoke lo ejercita, pero no se probó con el mapa escalado por una media query distinta.
