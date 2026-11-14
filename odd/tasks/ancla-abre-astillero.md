# Juego de barcos — el ancla abre el Astillero

Estado: cerrado y verificado. S51. Sin commitear. Sigue a S49 (reparación automática al pasar por el ancla, `estado-y-reparacion.md`).

## Specs

S51. Pasar por el ancla del puerto, en el mar, abre el Astillero, y el enlace "Volver al astillero" desaparece. Pedido (verbatim): "quitar el boton de Volver al astillero, cuando se pasa por el ancla se habre el panel del astillero"
- Decisiones del usuario (respuestas a preguntas): reparación: **"Repara sola y luego abre el Astillero"**; combate: **"Abrir siempre"**. Con consentimiento explícito se adaptan `scripts/smoke-auto-repair.mjs`, `scripts/smoke-auto-repair-reentry.mjs` y las secciones de mar de `scripts/smoke-dock.mjs` (los pasos que entran al puerto desde el mar).
- **Qué se quita:** el enlace `⚓ Volver al astillero` de la pantalla del mar (`sea.html`, clave `sea.back`). El botón "Volver al astillero" de la pantalla de hundimiento (`#gameover-back`) **se queda**: es la única salida de esa pantalla (decisión mía, sin pedido).
- **Cuándo se abre:** al entrar en el radio del puerto (110 m) desde fuera, la misma llegada de S49. Abrir el mar ya dentro del puerto **no** abre el Astillero (si no, "Zarpar" volvería al instante).
- **Orden:** primero se hace la reparación automática de S49 con el oro que haya; después se guarda todo (fleet, partida, mundo) y se pasa al Astillero.
- **Aviso:** el resumen de lo reparado y lo que costó, y lo que quedó sin reparar por falta de oro, se muestra en el Astillero (ya no hay pantalla del mar donde mostrarlo). Si nada estaba dañado, el Astillero abre sin aviso.
- **En combate:** se abre siempre, aunque haya un enemigo combatiendo. El combate se guarda donde estaba; hay que comprobar cuánto del combate persiste (el estado de combate de los enemigos) y anotarlo.
- **Pantalla de hundimiento:** no abre el Astillero por su cuenta.
- La tecla `R` y el panel del puerto siguen existiendo en el mar para cuando se zarpa desde dentro del puerto.
- Textos en es y en; los avisos nuevos con claves usadas, sin claves huérfanas (`sea.back` se elimina de los dos catálogos).

## Tasks

- T64 — Mar: quitar el enlace; al llegar, reparar (S49), guardar y navegar al Astillero dejando el resumen. `S51` — worker — done
- T65 — Astillero: leer el resumen pendiente, mostrarlo como aviso y borrarlo. `S51` — worker — done
- T66 — Smokes: nuevo para el flujo, y adaptar los tres autorizados. `S51` — worker — done

## Log

L1 (verbatim): "quitar el boton de Volver al astillero, cuando se pasa por el ancla se habre el panel del astillero"

L2: Interpretación: "el panel del astillero" es la pantalla del Astillero (`index.html`), que es donde está el constructor, la flota y el diálogo de reparación; no hay otro panel de astillero dentro del mar. Preguntas al usuario sobre lo que S49 y el combate hacen con esto, y sus respuestas: ver S51.

L3: Decisión mía sin pedido: la pantalla de hundimiento conserva su botón, porque sin él el jugador no tiene salida.

L4: Consentimientos explícitos del usuario para esta feature: adaptar `smoke-auto-repair`, `smoke-auto-repair-reentry` y las secciones de mar de `smoke-dock` (L2-L3 y la respuesta "Sí, adaptá esos tres smokes"), y después, al destaparse, también `smoke-repair-price` (un smoke mío del mismo día que lee el precio en la pantalla del mar). Ningún otro test existente se editó.

L5: Implementación (worker, con revisión mía). `src/model/arrival-notice.js` (`test/arrival-notice.test.js`): construir, serializar y leer el resumen de la llegada, y rechazar un valor roto sin lanzar. `src/ui/sea.js`: al entrar al radio del puerto desde fuera se hace la reparación automática de S49, se guarda todo y se navega a `index.html` dejando el resumen en su clave de `localStorage`; abrir el mar dentro del puerto no navega, el combate no lo impide y la pantalla de hundimiento tampoco abre el Astillero. `src/ui/app.js`: al arrancar muestra el resumen una sola vez y lo borra. Se quitó el enlace "Volver al astillero" de `sea.html` y la clave `sea.back`; `#gameover-back` se conserva. RED observado: módulo inexistente y, en el navegador, el enlace todavía existía.

L6: Hallazgo pedido en la spec (el combate al cruzar de pantalla): el estado de combate de los enemigos (`encounter.combat`) **sí** se guarda con el mundo y se restaura al reabrir el mar (`src/model/world.js:300-310,314-346`, `src/ui/sea.js:213-219,1665-1666`). El smoke nuevo lo comprueba: tras ir al Astillero y volver, el enemigo sigue `fighting` con su daño en el casco.

L7: Riesgo declarado, sin arreglar: con el almacenamiento del navegador deshabilitado, el guardado atrapa el error y la llegada igual navega, así que el viaje podría no conservarse. Es el mismo comportamiento de siempre del guardado, pero ahora ocurre al pasar por el ancla.

L8: Verificación. El informe del worker mencionó tres corridas que se colgaron sin salida en intentos anteriores y pasaron en el siguiente. Para medirlo corrí yo la regresión con el tiempo de cada smoke: `npm test` 383/383 y los 27 smokes con exit 0 (anchor-yard, auto-repair, auto-repair-reentry, dock, repair-price, refit, refit-restart, fleet, ui, i18n, shipyard-buttons, country, purse, formation, escort-dock, autofire, state, images, settings, swivel, turning, sea, time, combat, wind, escort-hud y visible-escorts), entre 2 s y 36 s cada uno, ninguno colgado. `git diff --check` limpio.
