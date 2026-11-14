# Juego de barcos — disparo automático y radio de giro por tonelaje

Estado: implementado y verificado. S47-S48 (y el precio topado de S45, en `estado-y-reparacion.md`). Sin commitear.

## Specs

S47. Un check de disparo automático en el Astillero. Pedido (verbatim): "poner en astilleros un check point para disparo automatico"
- Decisiones del usuario: **"Un check global: la capitana"** y **"Encendido por defecto"**.
- El check está en el Astillero, debajo del botón "Zarpar" (`#autofire-check`, "Disparo automático" / "Automatic fire"). Se guarda en `barcos:autofire:v1` ("1"/"0") y sobrevive a recargar. Es una preferencia: "Borrar partida" no la toca.
- Encendido, la capitana dispara sola cada costado cuando hay un enemigo que cae en su costado, a su alcance, y la pieza está cargada, igual que ya hacían las escoltas. Los enemigos vencidos (hundidos o rendidos), los tesoros y los pecios nunca son blanco.
- Apagado, no dispara sola. `Q` y `E` siguen disparando a mano en los dos casos.
- Sólo un "apagado" explícito apaga el automático: un valor guardado roto o desconocido cuenta como encendido (decisión mía: un guardado dañado no debe dejar mudos los cañones).
- El automático no muestra avisos de "sin blanco" ni "recargando" en cada tick (decisión mía, sin pedido).

S48. El radio de giro depende del tonelaje. Pedido (verbatim): "el radio de giro de los barcos estara en relacion al tonelaje del barco, siendo mas grande cuanto mas pesado sea"
- El timón de cada barco gira a una fracción de la velocidad base (`WORLD.maxTurnRate`) que **cae con el peso del casco**: `factor = (250 t / desplazamiento) ^ 0,5`, acotado entre 0,25 y 1,6. A igual velocidad, menos giro por segundo es un círculo más ancho: `radio = velocidad / giro`.
- Aplica a la capitana, a las escoltas y a los enemigos (cada uno con su casco). Los cascos del catálogo van de 54 t a 2000 t: la barca costera gira al 160 % y el gran galeón al 35 % del giro base.
- "Tonelaje" es el **desplazamiento del casco** del catálogo (`hull.displacementKg`), no la carga que lleve puesta (decisión mía, sin pedido; se puede cambiar a la masa embarcada).
- La curva está declarada en `TURNING` (`src/model/turning.js`) y no aparece en la pantalla de configuración (decisión mía, sin pedido).
- Un barco sin tonelaje registrado gira exactamente como antes (factor 1), y un guardado viejo abre igual: el factor se calcula al abrir el mar.

## Tasks

- T56 — Módulo puro `autofire.js` + 12 tests (RED, luego verde). `S47` — inline — done
- T57 — Check en el Astillero (`index.html`, `app.js`, estilos, textos es/en) y disparo en el mar (`sea.js`, con `firePlayerBroadside` compartiendo la elección de blanco). `S47` — inline — done
- T58 — `smoke-autofire.mjs` (RED observado) y regresión; `smoke-swivel.mjs` y `smoke-state.mjs` siembran el check apagado, con OK del usuario. `S47` — inline — done
- T59 — Módulo puro `turning.js` + 12 tests (3 en RED hasta cablear `stepShip`, `stepEscort` y `aiStep`). `S48` — inline — done
- T60 — Cableado en `world.js`, `formation.js`, `combat.js` y `sea.js`, más `smoke-turning.mjs`. `S48` — inline — done

## Log

L1 (verbatim): "poner en astilleros un check point para disparo automatico"

L2: Preguntas al usuario antes de implementar S47, con sus respuestas: ¿qué naves dispara? "Un check global: la capitana"; ¿con qué valor arranca? "Encendido por defecto".

L3: Evidencia de S47. `test/autofire.test.js` (12 tests; RED por módulo inexistente). `scripts/smoke-autofire.mjs` (RED observado: sin `#autofire-check` y sin disparo): el check existe, arranca encendido, se guarda, tiene su etiqueta en es y en, la capitana dispara sola con el check encendido (150 → 147 en el primer costado), no dispara con él apagado y `E` sigue funcionando a mano. Un primer intento de mi smoke comparaba contra una lectura tardía y falló por mi error de medición, no del código.

L4: Efecto del valor por defecto sobre smokes existentes. Con el automático encendido fallaron `smoke-swivel.mjs` (leía 116 tiros antes de pulsar la tecla: el automático ya había disparado) y `smoke-state.mjs` (las barras del enemigo no aparecían). Con copias temporales (ya borradas) con el check apagado ambos dieron exit 0, así que no eran regresiones del código sino del valor por defecto. Con consentimiento explícito del usuario se sembró `barcos:autofire:v1 = "0"` en su `localStorage` inicial (1 línea en el swivel, 2 en el state); ninguna aserción cambió.

L5 (verbatim): "el radio de giro de los barcos estara en relacion al tonelaje del barco, siendo mas grande cuanto mas pesado sea"

L6: Hallazgo: el giro vivía en tres sitios con tres copias de la regla: `stepShip` (`world.js`, la capitana), `stepEscort` (`formation.js`) y `aiStep` (`combat.js`), éste con un `0.55` escrito a mano. Los tres leen ahora el factor del casco.

L7: Evidencia de S48. `test/turning.test.js` (12 tests; 9 puros en verde y 3 de cableado en RED hasta conectar los tres sitios). `npm test` 356/356 sin tocar ningún test existente, incluido el de `world.test.js` que fija el giro de una nave sin factor. `scripts/smoke-turning.mjs` con dos capitanas reales en el navegador y el mismo timón sostenido 1,5 s: la barca costera giró 1,33 rad y el gran galeón 0,29 rad (ratio 0,22, igual al esperado por los factores). Un primer intento falló con ratio 0,110: mi fixture daba 20 marineros y el gran galeón exige 120, así que la regla ya existente de tripulación mínima (`maneuverFactor`) le ponía el timón al 50 %. Corregido en el smoke con 130 marineros; el cableado estaba bien.

L8: Consecuencia de juego a vigilar: un casco muy pesado ahora maniobra mucho peor que antes. El enemigo también, así que combates con galeones grandes serán más lentos de cerrar. Los números de la curva están en `TURNING` para ajustarlos.
