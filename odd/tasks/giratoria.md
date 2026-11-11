# Juego de barcos — pieza giratoria (verso)

Estado: completado y verificado.

## Specs

S20. Una pieza giratoria no está atornillada a un costado: responde por el costado que dispara el jugador (`Q` babor, `E` estribor), con su propio reloj de recarga, su propia munición y su propio alcance (el verso: 180 m).
- La giratoria no ocupa portas del casco: no cuenta contra el máximo de piezas por costado.
- Cada casco admite un número limitado: `maxSwivels(hull) = ceil(maxPiecesPerSide / 2)`. Pasarse es un **error** (`too-many-swivels`) y bloquea la botadura.
- Cubre el costado que no tiene andanada propia: no salta el aviso `one-sided-battery`.
- Una pieza fija nunca puede montarse como giratoria, y una giratoria siempre se normaliza a `side: "swivel"`.

## Tasks

- T20 — Tests primero (16, RED observado: 11 fallaban). `S20` — inline — done
- T21 — Modelo: `swivel: true` en el dato, `piecesBySide` con clave `swivel`, `maxSwivels`, validación, normalización. `S20` — inline — done
- T22 — Combate: `firingPieces` acepta `p.side === side || p.side === "swivel"`. `S20` — inline — done
- T23 — UI + i18n: tarjeta de batería (lado fijo y deshabilitado), línea "giratorias N", puntos en el eje del casco, HUD de munición `G n`. `S20,S11` — inline — done
- T23b — Traducir la lista de tripulación (texto fijo en español que se me había escapado). `S11` — inline — done
- T24 — Regresión de smokes + commits. `S20` — inline — done

## Log

L24 (verbatim): "tenemos un tipo de cañon que puede atacar a babor y a estribor indistintamente?"

L25: Respuesta: el `verso` (falconete giratorio) existía en los datos pero no era jugable: ni aparecía en el astillero ni el combate lo trataba distinto. El usuario eligió la opción A ("A", cuatro veces): la giratoria dispara por el costado que tenga blanco, con reload independiente.

L26: Los dos tests existentes `test/ship-model.test.js:137` y `test/shipyard.test.js:218` hacían `deepEqual` contra `{ babor: 12, estribor: 12 }` y fallaron al agregar la clave `swivel`. Era una regresión por mi cambio (la regla pinchada seguía vigente, cambió la forma del objeto). Se preguntó y el usuario eligió **editar los 2 tests** para esperar `swivel: 0`. Es la única edición de tests existentes de esta tarea.

L27: Deuda de idioma saldada por el camino: la tarjeta de batería y la lista de tripulación tenían texto fijo en español, aunque se había dicho que no quedaba ninguno. Ahora van por catálogo (`shipyard.battery.*`, `shipyard.family.*`, `shipyard.crewTerms`). Las claves se nombraron bajo el prefijo `shipyard.` para no editar el test de claves huérfanas.

L28: Evidencia — 182/182 tests node. `scripts/smoke-swivel.mjs` verifica por interfaz: el verso se agrega, no ofrece lado, el resumen cuenta "giratorias 2" / "swivels 2", la tarjeta cambia entre idiomas, 40 giratorias bloquean la botadura con mensaje legible, y en el mar una nave solo con giratorias responde `E` con el blanco a estribor y `Q` con el blanco a babor, callando el costado opuesto. Los siete smokes (i18n, fleet, sea, combat, ui, wind, swivel) salen con exit 0.
