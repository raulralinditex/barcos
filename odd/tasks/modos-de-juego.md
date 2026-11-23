# Modos de juego: la costura

El juego pasa a tener **modos**. El que existe hoy se llama «batalla por nivel» y es uno más, no la única regla posible. F0 abre la costura sin cambiar comportamiento; F1 lleva el modo al guardado; F2 hace que el botón Reiniciar lo pregunte.

## Specs

S171. **La regla del juego es un modo, no una costura soldada.** Pedido (verbatim): "vamos a hacer un plan de refractorizacion para poder tener distintos tipos de juegos, el que tenemos implementado ahora se podia llamar 'batalla por nivel' y cuando le damos al boton reiniciar seleccionariamos el tipo de juego".
- **S171-A, un modo responde cinco preguntas.** `enemiesPerZone(world)`, `stamp(world)`, `seed(world)`, `advance(world)` y `progress(world)`. No guarda estado propio: lee el mundo y contesta. El registro es `MODES` en `src/model/modes/index.js`, y agregar un modo es un fichero más una entrada.
- **S171-B, «batalla por nivel» es el modo de siempre.** Su cuerpo es el código que estaba en `world.js` y `levels.js`, movido de lugar y sin cambiar una línea de regla: el cupo por zona (S150), el avance por victorias (S150), la siembra del nivel 1 (S140) y el progreso del astillero.
- **S171-C, F0 no cambia el juego.** El criterio de aceptación es duro: los **1044 tests que existían pasan sin tocar uno solo**. Si uno cambia, la costura está mal puesta.
- **S171-D, la costura es real y se prueba con otro modo.** `test/modes.test.js` registra un modo de prueba que no se parece al shipped (cupo cero, nivel 7, no avanza) y comprueba que el mar cambia de verdad. Si `updateWorld` siguiera llamando `enemiesPerZone` y `seedLevel` directamente, esos cinco tests fallan.
- **S171-E, un mundo sin `mode` juega «batalla por nivel».** Es la compatibilidad que ya usa el resto del formato: un guardado escrito antes de esta costura abre como se jugaba.
- **S171-F, el modo no se afina en Configuración.** No es un número que se mueva con un deslizador, es la elección de partida. No entra en `SETTINGS_FIELDS` ni en `SETTINGS_BRANCHES`.

S172. **El modo viaja con la partida** (F1). El mundo guardado es la autoridad de la partida ya nacida; `barcos:mode:v1` es la elección para la partida por nacer. Campo aditivo, **sin subir `v`**: `deserializeWorld` rechaza `v !== 1` y subirlo rompería todos los guardados.

S173. **Reiniciar elige el modo** (F2). El diálogo de `#erase-dialog` gana la lista de modos con nombre y descripción, y la elección se escribe antes de borrar y recargar.

## Tasks

- T87 — S171-A/B: `src/model/modes/index.js` (registro, `modeById`, `modeOf`, `withMode`, `registerMode`, `allModes`) y `src/model/modes/by-level.js` (el cuerpo movido). Ruta: inline. Hecho.
- T88 — S171-A/C: las tres costuras de `world.js` pasan por el modo: `createWorld` (siembra + campo `mode`), el cupo por zona, y el avance. `createWorld` gana `modeId` con default. Ruta: inline. Hecho.
- T89 — S171-A: el chip del astillero en `app.js` pregunta al modo del guardado. Ruta: inline. Hecho.
- T90 — S171-D/E: `test/modes.test.js` con los cinco casos, incluido el modo de prueba distinto. Ruta: inline. Hecho.
- T91 — S171-C: `npm test` completo y los smokes de la zona tocada. Ruta: inline. Hecho.
- T92 — S172: `serializeWorld` escribe `mode`; `deserializeWorld` lo lee con `modeById`, que cae al shipped para un id desconocido o ausente. `v` sigue en 1. Ruta: inline. Hecho.
- T93 — S172: `barcos:mode:v1` y `readChosenMode()` en `sea.js`; un mar nuevo nace en el modo elegido, uno guardado conserva el suyo. Ruta: inline. Hecho.
- T94 — S172: `test/mode-save.test.js` (7 tests) y `scripts/smoke-mode-save.mjs`. Ruta: inline. Hecho.
- T95 — S173: `#mode-picker` en `index.html`, `renderModePicker()` en `app.js` que dibuja la lista del registro, y `eraseConfirm` escribiendo `barcos:mode:v1`. CSS de la lista. Ruta: inline. Hecho.
- T96 — S173: i18n es/en (`erase.mode.legend`, `mode.byLevel.*`) y la familia `mode.` declarada en la lista blanca de `test/i18n-catalogue.test.js`. Ruta: inline. Hecho.
- T97 — S173: `test/mode-restart.test.js` (4 tests) y `scripts/smoke-mode-restart.mjs`. Ruta: inline. Hecho.

## Log

L95 (pedido, verbatim): "vamos a hacer un plan de refractorizacion para poder tener distintos tipos de juegos, el que tenemos implementado ahora se podia llamar 'batalla por nivel' y cuando le damos al boton reiniciar seleccionariamos el tipo de juego". El plan F0/F1/F2 se presentó y el jugador dijo "arranca".

L96 (mapa medido antes de tocar nada). La regla no era un modo: estaba soldada en **tres puntos** de `updateWorld` (198 líneas, `world.js:622-820`) más dos de lectura: `createWorld` sembrando nivel 1, `enemiesPerZone(level)` como cupo, `seedLevel(next, level+1)` como avance, `levelProgressFromGameSave` en el chip, y `recordVictory` contando. El quinto (contar una victoria) es del **mar**, no del modo: cualquier modo quiere saber que hundiste algo, así que se quedó donde estaba.

L97 (cierre de F0). **`npm test` 1049/1049**, y los **1044 que existían pasan sin tocar uno solo**: la costura no cambió comportamiento, que es el criterio S171-C. Nueve smokes en 0: `settings`, `tabs`, `yard-mooring`, `own-wreck`, `fog`, `command-handover`, `shipyard-layout`, `sea-squadrons`, `fleet-squadrons`.

**Tres cosas que costaron y quedan anotadas:**

1. **`withMode` no alcanzaba para probar la siembra.** `createWorld` ya había sembrado con el modo por defecto antes de que el test pudiera estampar otro, así que el test veía el nivel 1 del shipped. La costura exige que `createWorld` **sepa** el modo al nacer: se le agregó `modeId` como quinto parámetro, con default. Estampar después no sirve para la siembra.
2. **`updateWorld` normaliza el nivel a mínimo 1** (`normaliseLevel`), así que un modo de prueba con `level: 0` es indistinguible del shipped. El modo de prueba usa `level: 7`: un nivel que el shipped no puede alcanzar en una sola siembra, y por eso la aserción es inequívoca.
3. **Hay un ciclo de importación** entre `modes/by-level.js` (importa `seedLevel` de `world.js`) y `world.js` (importa el registro). Funciona porque `seedLevel` es una declaración izada y sólo se llama en runtime, no al cargar el módulo. Verificado cargando el registro en un proceso aparte antes de cablear nada.

L98 (cierre de F1). **`npm test` 1056/1056** (los 1049 de F0 más 7 nuevos), nueve smokes en 0. `test/mode-save.test.js` prueba la regla del formato: el modo sobrevive al guardado, `v` sigue en 1, un guardado sin `mode` abre como se jugó, y un id roto cae al shipped sin tirar.

**Dos autoridades, una por momento**: el mar guardado manda sobre la partida ya nacida (`world.mode`), y `barcos:mode:v1` sólo decide la partida por nacer. Lo aplica `sea.js`: `savedWorld ?? createWorld(..., readChosenMode())`.

**Lo que costó**: el smoke nuevo fallaba con «an old save must play the shipped mode, got undefined» y no era el código. El mar **no reescribe un guardado sin cambios**: el autoguardado compara y sólo escribe si el mundo difiere, así que un guardado sembrado y no tocado nunca volvía. Arreglo en el smoke: navegar un momento (lo que hace un jugador) y disparar `beforeunload`, que el mar ya escucha como escritura final. El modelo, medido aparte, ya resolvía bien los dos casos.

**RED honesto del smoke**: con `world.js` de `HEAD` falla nombrando las tres reglas — el mar nuevo pierde el modo, el id desconocido no cae, el guardado viejo no abre.

L99 (cierre de F2, con la decisión del jugador de no escribir todavía el segundo modo). **`npm test` 1060/1060**, once smokes en 0.

**Lo que se hizo, y lo que deliberadamente no**: la lista del reinicio se dibuja **del registro** (`allModes()`), en orden de registro, con el nombre y la descripción que cada modo declara. Con un solo modo, la lista muestra uno. Agregar el segundo es un fichero en `src/model/modes/` y una entrada en `MODES`: no se toca `index.html`, ni `app.js`, ni el smoke. Eso es lo que `test/mode-restart.test.js` fija — registra un modo de prueba y comprueba que **aparece en la lista sin tocar la pantalla**.

**Dos cosas que costaron:**

1. **La lista blanca de i18n.** `test/i18n-catalogue.test.js` exige que toda familia de claves esté declarada, y `mode.` no lo estaba: falló con `orphan catalogue key: mode.byLevel.description`. Es el mismo caso que S80/S82 ya documentó con `catalogue.`. Se agregó `"mode."` con su comentario.
2. **`addInitScript` se re-ejecuta en cada navegación.** El smoke sembraba la partida, el reinicio la borraba, la recarga volvía a sembrarla, y el smoke leía su propio fixture: «the old voyage survived the restart, the purse still holds 4321». Arreglo: bandera en `sessionStorage`, la misma trampa ya anotada en la memoria del proyecto. Y una segunda corrección de aserción: el astillero reescribe su registro al pintar, así que la clave `barcos:game:v1` **existe de nuevo**; lo que prueba el borrado es que los 4321 doblones no estén.

**RED honesto del smoke**: con `index.html` y `app.js` de `HEAD`, falla nombrando las cuatro reglas — no hay lista, la lista está vacía, falta el modo shipped, y no hay ninguno preseleccionado.

**Un detalle de diseño que se respetó:** `advance(world)` devuelve el mundo siguiente **o `null`** para quedarse. Devolver el mundo siempre habría hecho que un modo sin avance re-sembrara el mismo nivel en cada tick.
