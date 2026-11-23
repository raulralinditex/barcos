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

## Log

L95 (pedido, verbatim): "vamos a hacer un plan de refractorizacion para poder tener distintos tipos de juegos, el que tenemos implementado ahora se podia llamar 'batalla por nivel' y cuando le damos al boton reiniciar seleccionariamos el tipo de juego". El plan F0/F1/F2 se presentó y el jugador dijo "arranca".

L96 (mapa medido antes de tocar nada). La regla no era un modo: estaba soldada en **tres puntos** de `updateWorld` (198 líneas, `world.js:622-820`) más dos de lectura: `createWorld` sembrando nivel 1, `enemiesPerZone(level)` como cupo, `seedLevel(next, level+1)` como avance, `levelProgressFromGameSave` en el chip, y `recordVictory` contando. El quinto (contar una victoria) es del **mar**, no del modo: cualquier modo quiere saber que hundiste algo, así que se quedó donde estaba.

L97 (cierre de F0). **`npm test` 1049/1049**, y los **1044 que existían pasan sin tocar uno solo**: la costura no cambió comportamiento, que es el criterio S171-C. Nueve smokes en 0: `settings`, `tabs`, `yard-mooring`, `own-wreck`, `fog`, `command-handover`, `shipyard-layout`, `sea-squadrons`, `fleet-squadrons`.

**Tres cosas que costaron y quedan anotadas:**

1. **`withMode` no alcanzaba para probar la siembra.** `createWorld` ya había sembrado con el modo por defecto antes de que el test pudiera estampar otro, así que el test veía el nivel 1 del shipped. La costura exige que `createWorld` **sepa** el modo al nacer: se le agregó `modeId` como quinto parámetro, con default. Estampar después no sirve para la siembra.
2. **`updateWorld` normaliza el nivel a mínimo 1** (`normaliseLevel`), así que un modo de prueba con `level: 0` es indistinguible del shipped. El modo de prueba usa `level: 7`: un nivel que el shipped no puede alcanzar en una sola siembra, y por eso la aserción es inequívoca.
3. **Hay un ciclo de importación** entre `modes/by-level.js` (importa `seedLevel` de `world.js`) y `world.js` (importa el registro). Funciona porque `seedLevel` es una declaración izada y sólo se llama en runtime, no al cargar el módulo. Verificado cargando el registro en un proceso aparte antes de cablear nada.

**Un detalle de diseño que se respetó:** `advance(world)` devuelve el mundo siguiente **o `null`** para quedarse. Devolver el mundo siempre habría hecho que un modo sin avance re-sembrara el mismo nivel en cada tick.
