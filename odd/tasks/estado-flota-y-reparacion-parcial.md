# Juego de barcos — estado de la flota en el mar, tiempo y reparación parcial

Estado: cerrado y verificado. S42-S46. Sin commitear (ver `pendientes.md`). Sigue a `flota-en-formacion.md` (S35-S39) y a `estado-y-reparacion.md` (S21-S25, S40).

## Specs

S42. Las escoltas se ven con sus barritas y en el minimapa. Pedido (verbatim): "vamos con el 2" (el punto 2 que propuse: barritas de estado de las escoltas y minimapa).
- Cada escolta lleva las mismas barritas que la capitana (casco, aparejo, tripulación, daño y recarga por costado), siempre visibles. Decisión del usuario en S21: "Todo, igual que el jugador".
- Las barritas de una escolta usan la misma escala que las demás en pantalla (S21) y se leen al alcance del blanco más cercano.
- El minimapa dibuja cada escolta como una flecha propia, más chica y de otro color que la de la capitana.

S43. El tiempo vuelve a ×1 cuando un enemigo engancha. Pedido (verbatim): "el 4-> baja a X1 cuando enganche"
- "Engancha" es cuando un enemigo entra en `COMBAT.engageRadiusM` y empieza a combatir (el mismo radio de S21).
- Se dispara **una vez por enganche**, en el instante en que pasa de ningún enemigo enganchado a alguno. Con eso el jugador puede volver a acelerar con `T` en mitad del combate si quiere (decisión mía, sin pedido; se puede cambiar).
- Se avisa en pantalla (es y en) y la insignia de tiempo desaparece.

S44. Las barritas son proporcionales al valor del barco. Pedido (verbatim): "ademas las barritas de los barcos tienen que ser proporcionales a su valor, si un barco tiene casco, o daño, se mostrara mayor que otro barco con menos"
- El largo del bloque de condición (casco, aparejo, tripulación) de cada barco es proporcional a su valor (`shipValue`, S40) frente al del barco más valioso a la vista: un barco más valioso se ve con barras más largas que uno más barato.
- El relleno de cada barra sigue siendo su porcentaje de condición.
- El daño por costado ya usa una escala común (S21) y no cambia.
- Hay un largo mínimo (35 % del máximo) para que el barco más barato siga legible (decisión mía, sin pedido; se puede cambiar).
- Un enemigo no tiene precio pagado: su valor es el precio de catálogo de su casco.

S45. La reparación es parcial cuando no alcanza el oro. Pedido (verbatim): "en reparacion, si el valor de reparacion es mayor al valor que tenemos, la reparacion sera el valor que tenemos, y la reparacion sera proporcional al precio"
- Si el coste (S40) supera el oro que se tiene, se gasta **todo el oro** y se repara la parte del daño que ese oro compra: la fracción `oro / coste` de lo que falta en cada segmento (casco, aparejo, tripulación y moral).
- La reparación es proporcional al precio: con la mitad del coste se repara la mitad del daño.
- Con 0 doblones no se repara nada ni se gasta nada, y la bolsa nunca queda negativa (S32).
- Aplica a la capitana (tecla `R`), a las demás naves del puerto (S24) y al diálogo de llegada (S25), en el mar y en el Astillero.
- La tripulación repuesta se redondea a hombres enteros y nunca supera la dotación comprada.
- El panel y el diálogo dicen que la reparación será parcial y cuánto se arregla; el botón ya no queda bloqueado por falta de oro mientras haya algo de oro.

S46. Dos botones en vez de "Botar el barco": uno para añadir la nave y otro para zarpar. Pedido (verbatim): "en vez de tener solo un boton "launch the ship" tener dos botones uno "Add to fleet" en la parte de abajo y el otro "set sail" al lado del panel "your fleet""
- **"Añadir a la flota" / "Add to fleet"**, abajo, en el lugar de "Botar el barco" (`#launch-btn`). Añade la nave a la flota y la hace capitana, como hoy, cobrando su precio; se bloquea igual que hoy cuando el barco no es factible. No abre ningún diálogo: avisa con un mensaje breve (es y en) y el jugador sigue en el Astillero.
- **"Zarpar" / "Set sail"**, al lado del panel "Tu flota" (`#set-sail-btn`, en la barra de la flota). Va al mar con la flota tal como está: la capitana y las naves con el check. Se bloquea con la flota vacía.
- **Desaparece el diálogo de botadura** (`#sail-dialog`, claves `sail.*`) y el enlace "Navegar con ..." que ofrecía zarpar con la nave existente: "Zarpar" los reemplaza. Decisión del usuario: "Quitar el diálogo Botadura". Con él se pierde la ficha de estadísticas de la nave que mostraba (decisión derivada; se puede recuperar en otro lado si se quiere).
- Los pasos de botadura de los smokes `fleet`, `i18n`, `purse`, `swivel` y `ui` se reescriben al flujo nuevo, con consentimiento explícito del usuario. Ninguna otra aserción cambia.

## Tasks

- T55 — Reparar una escolta en el Astillero debe sobrevivir a zarpar: `smoke-escort-dock.mjs` (RED), `savePurse` parchea `combat.escorts`. `S45` — inline — done
- T49 — Este documento, el espejo en Engram y la lista visible. `S42-S45` — inline — done
- T50 — Reparación parcial: tests primero (RED), modelo `repair.js`, llamadas en mar y Astillero, textos y smokes. `S45` — worker — done
- T51 — Escoltas: barritas y minimapa, escala por valor, tiempo ×1 al enganchar, textos y smoke. `S42,S43,S44` — inline — done
- T54 — Botones "Añadir a la flota" y "Zarpar": quitar el diálogo de botadura, textos es/en, smokes reescritos y smoke nuevo. `S46` — worker — done
- T52 — Documentación (`pendientes.md`, `tiempo.md`, `flota-en-formacion.md`, `estado-y-reparacion.md`) y cierre. `S42-S46` — inline — done

## Log

L1 (verbatim): "vamos con el 2, el 4-> baja a X1 cuando enganche, ademas las barritas de los barcos tienen que ser proporcionales a su valor, si un barco tiene casco, o daño, se mostrara mayor que otro barco con menos, en reparacion, si el valor de reparacion es mayor al valor que tenemos, la reparacion sera el valor que tenemos, y la reparacion sera proporcional al precio"

L2: Contexto previo de esta sesión (arreglo ya hecho, sin commitear): con dos checks activos sólo se veía la capitana. Causa: `drawSea` no dibujaba escoltas y el bucle de `frame` reescribía `world.escorts` con las posiciones viejas antes de copiarlas. Se agregó `drawEscortShip`, se reordenó la sincronización, se añadieron las claves `sea.banner.escortFire` y `sea.banner.escortLost` (faltaban en los catálogos) y `scripts/smoke-visible-escorts.mjs`. Con OK del usuario se ajustaron dos aserciones de `smoke-formation.mjs` que sólo pasaban porque las escoltas estaban quietas.

L3: Contrato que cambia en S45: hoy S22/S24/S25 dicen "sin oro suficiente no se repara nada". Los tests y smokes que lo fijan se reescriben al contrato nuevo, pero **sólo con la confirmación explícita del usuario** (regla global sobre tests existentes).

L4: Decisiones mías sin pedido, anotadas en cada spec: tiempo ×1 una vez por enganche (S43), largo mínimo 35 % (S44), el valor de un enemigo es el precio de catálogo de su casco (S44). Los commits de esta feature se hacen después de ordenar el árbol de trabajo, que arrastra unos 45 archivos sin commitear de las features anteriores.

L5 (verbatim): "en vez de tener solo un boton "launch the ship" tener dos botones uno "Add to fleet" en la parte de abajo y el otro "set sail" al lado del panel "your fleet""

L6: Decisiones del usuario sobre S46 (respuestas a preguntas): "Quitar el diálogo Botadura" y "Sí, reescribirlos al flujo nuevo" (los 5 smokes que usan el botón o el diálogo de botadura).

L7: Decisión del usuario sobre S45 y el smoke de reparación de flota: "Arreglar el fixture (recomendado)". El fixture de `scripts/smoke-state.mjs` (líneas 404-405) decía tripulación 70 % pero tenía 21 de 70 hombres (30 % real); con la cotización por daño vivo (S45) el precio sale de lo que de verdad hay a bordo. Se corrige el fixture a 49 de 70 hombres y no se toca ninguna aserción de precio.

L8: Evidencia de S42-S44. `test/sea-hud.test.js` (13 tests, RED por módulo inexistente y después verde) cubre `barWidthShare` y `timeScaleOnEngage` en `src/model/sea-hud.js`. `scripts/smoke-escort-hud.mjs` (RED observado en las tres specs) mide en el canvas: la capitana, la escolta (zabra) y un enemigo (patache) muestran barras de 108, 93 y 38 px según su valor; la escolta aparece en el minimapa con su color; y con el tiempo en ×4 el enganche lo devuelve a ×1, y `T` vuelve a acelerar en pleno combate. El valor de un enemigo es el precio de catálogo de su casco, como se dijo en S44.

L9: Hallazgo de diseño, sin decidir: las barritas se dibujan en pantalla y las escoltas navegan a 120 m (unos 48 px), así que sus bloques se pisan con los de la capitana, que quedan encima y se leen. Opciones: separar la formación (`ESCORT.stationM`), mostrar las barritas de una escolta sólo a tiro o seleccionada, o apilarlas. Anotado en `pendientes.md`.

L10: Evidencia de S45 y de T55 en `odd/tasks/estado-y-reparacion.md` (L30-L34). Zoom por clic (S41, T53): `odd/tasks/imagenes-por-casco.md` (L11-L13).

L11: Evidencia de S46 (T54). RED observado con `scripts/smoke-shipyard-buttons.mjs` (nuevo) antes de implementar. Ahora: "Añadir a la flota" (`#launch-btn`) añade la nave sin abrir ningún diálogo y avisa con un mensaje; "Zarpar" (`#set-sail-btn`, junto al panel "Tu flota") queda bloqueado con la flota vacía y lleva al mar con la capitana; `#sail-dialog`, las claves `sail.*` y el enlace "Navegar con ..." ya no existen. Pasos de botadura reescritos, con el consentimiento del usuario, en `smoke-fleet`, `smoke-i18n` (la etiqueta "Launch the ship" pasó a "Add to fleet") y `smoke-ui`; `smoke-purse` y `smoke-swivel` no necesitaron cambios.

L12: Consentimientos explícitos de esta feature, todos del usuario: S45 y los tests/smokes que fijaban "sin oro no repara" (L3, L7 y `estado-y-reparacion.md` L31); S46 y los 5 smokes de botadura (L6); y sacar `sail.gunsDetailSwivel` de la lista de claves que exige `test/swivel.test.js` (l.221), porque esa clave era del diálogo de botadura eliminado. Ningún otro test existente se editó.

L13: Regresión final. `npm test` 325/325 y `git diff --check` limpio. Los 19 smokes con exit 0: shipyard-buttons, fleet, i18n, purse, swivel, ui, state, dock, country, settings, images, formation, escort-dock, visible-escorts, escort-hud, time, combat, sea y wind. `smoke-visible-escorts` falló una vez porque su línea 46 hacía clic en el enlace "Navegar con ..." que S46 reemplazó; es un smoke nuevo de esta sesión y se actualizó a `#set-sail-btn`. Una primera corrida con el prefijo `timeout` no corrió nada (exit 127, el comando no existe en macOS) y se descartó.

L14: Riesgo declarado: `Risk: none` en el código del mar y del modelo más allá de lo pedido; `Risk: item 3` vigilado en S46, que elimina una pantalla (el diálogo con las estadísticas de la nave) y deja de mostrar esa ficha en cualquier lado. Si se quiere recuperar, es una petición aparte.
