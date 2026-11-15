# Juego de barcos — recuperar el astillero tomado

Estado: en curso. S91-S95. Cierra el soft-lock de S74 (`escala-y-configuracion.md`).

## Specs

S91. **El aviso de puerto cerrado se lee como lo que es.** Pedido (verbatim): "ahora cuando le doy a zarpar no sale nada".
- Causa medida: el aviso sí se escribe, pero en `#purchase-notice`, que está estilado `color: var(--green)` (verde de éxito, 13 px) y vive en el extremo **izquierdo** del pie mientras el botón Zarpar está en el **derecho** (`justify-content: space-between`). El jugador ve "nada".
- El aviso de puerto cerrado lleva su propia clase de error (rojo), no la de éxito. El resto de los avisos del pie no cambia de color.

S92. **Zarpar navega siempre.** Decisión del usuario.
- Con el astillero tomado, el botón Zarpar **navega al mar**: el jugador tiene que poder salir a pelear. Lo único que el puerto cerrado bloquea es la reparación.
- El aviso en rojo sigue apareciendo al apretar Zarpar, y dice que no se repara hasta recuperarlo, no que no se pueda zarpar.
- La razón por la que existe: con el zarpe cerrado y el jugador adentro del Astillero no había ninguna vía al mar, y la partida quedaba trabada para siempre. Es el soft-lock que el usuario reportó.

S93. **El astillero tomado es un enemigo en el mar.** Decisión del usuario: "Recuperarlo peleando en el mar".
- Un astillero en manos enemigas se dibuja en el mar como una batería hostil, en el origen, con su estado.
- El jugador le dispara con las reglas que ya existen: `targetForSide` lo tiene que poder elegir como blanco y `firePlayerBroadside` le aplica el daño. Sus escoltas también le disparan.
- El astillero tomado **le dispara al jugador** con su batería, con las mismas reglas de `fortFire`. Mientras está tomado no es de los nuestros: no aparece en el panel de duelo como aliado ni lo protege la zona de seguridad (S66), que existe para los hostiles.
- El daño al astillero tomado se mide contra su **guarnición** (`crew`), no contra su casco: recuperarlo es romperle la guarnición, no hundir la propia fortificación. Su casco no se toca mientras está tomado, para que el jugador no se quede sin astillero por haberlo bombardeado.
- Cuando la guarnición cae bajo el umbral de rendición (`COMBAT.surrenderCrewPct`), el astillero **vuelve a manos propias**: `status` pasa a `"fighting"`, el puerto reabre, y el jugador recupera la reparación y el zarpe normal.

S94. **Recuperado no es intacto, y no se vuelve a rendir solo.** Consecuencia de S93, medida.
- El **casco** vuelve exactamente como estaba: sus cañones y su casco son los que tenía, no se reconstruye gratis.
- La **guarnición** vuelve a `OCCUPATION.recoveredGarrisonPct` (45 %), por encima del umbral de rendición (`COMBAT.surrenderCrewPct`, 40 %). Los hombres que lo retomaron se quedan a sostenerlo.
- Por qué el piso es obligatorio, medido: el astillero se rindió *porque* su guarnición estaba rota (0 %). Si al recuperarlo se le devolviera esa misma guarnición, el siguiente `refreshStatus` lo volvería a poner en `"surrendered"` y el soft-lock que esta feature elimina volvería por la puerta de atrás. Comprobado en node: con guarnición 20 % el `refreshStatus` lo rinde otra vez; con 45 % sigue `"fighting"`.
- Lo que **no** hace: no le regala la guarnición entera ni el casco. Recuperar no es reconstruir.

S95. **La pantalla sigue diciendo la verdad.** Los smokes y la documentación se actualizan con la regla nueva.
- `scripts/smoke-fort.mjs` se reescribe: la aserción vieja ("a captured yard must not let the player sail") es exactamente la regla que S92 invierte. Autorizado por el usuario.
- Un smoke nuevo prueba el ciclo completo: el astillero tomado aparece como hostil, el jugador le dispara, la guarnición baja, vuelve a manos propias y el puerto reabre.
- Un test unitario por cada regla nueva de `src/model/fort.js`, con RED observado antes del verde.

## Tasks

- T107 — `src/model/fort.js`: la recuperación como regla pura (`fortRecoverable`, `fortRecover`), daño a la guarnición del astillero tomado, y la guarda para que el casco no se toque mientras está tomado; tests con RED. `S93,S94` — inline — hecho
- T108 — `src/model/autofire.js`: `targetForSide` acepta el astillero tomado como blanco; tests con RED. `S93` — inline — hecho
- T109 — `src/ui/sea.js`: el astillero tomado se dibuja y se comporta como hostil (blanco del jugador y de las escoltas, dispara al jugador, sin zona de seguridad, fuera del panel de duelo como aliado); recuperación cableada. `S93,S94` — inline — hecho
- T110 — `src/ui/app.js`: Zarpar navega siempre; el aviso de puerto cerrado en rojo y con el texto de reparación, no de zarpe; i18n es/en. `S91,S92` — inline — hecho
- T111 — `src/ui/styles.css`: la clase de error del aviso del pie. `S91` — inline — hecho
- T112 — `scripts/smoke-fort.mjs` reescrito y `scripts/smoke-fort-recovery.mjs` nuevo, los dos con RED observado. `S95` — inline — hecho
- T113 — Regresión (`npm test` y los smokes del bloque), documentación y Engram. `S91,S92,S93,S94,S95` — inline — hecho

## Log

L56 (verbatim): "ahora cuando le doy a zarpar no sale nada"

L57: Reproducción medida en navegador (Playwright) antes de tocar código. Tres hechos.
1. Con el astillero en manos propias, Zarpar navega a `sea.html` en tres resoluciones distintas: el botón no estaba roto.
2. Con el astillero tomado, Zarpar **se negaba** y escribía el aviso en `#purchase-notice`, que está estilado `color: var(--green)` (verde de éxito, 13 px) y vive en el extremo **izquierdo** del pie, mientras el botón está en el **derecho** (`justify-content: space-between`). El jugador veía "nada".
3. **El soft-lock**: `fort.status` sólo viajaba a `"surrendered"`/`"sunk"` y nada lo devolvía a `"fighting"`; el jugador no podía dispararle al astillero; y el bloqueo vivía sólo en el botón Zarpar. Con el astillero tomado la partida quedaba trabada para siempre, y el estado se persiste en `localStorage`. La spec de S74 decía "hasta recuperarlo", pero la recuperación nunca se construyó.

L58: Decisiones del usuario, las dos necesarias porque cambiaban el alcance y la regla de S74.
1. Recuperación: **"Recuperarlo peleando en el mar"** (descartadas: pagar doblones, recuperación automática por victorias, y arreglar sólo el aviso).
2. Salida a pelear: **"Zarpar navega igual, el puerto sólo cierra reparaciones"** (descartada: Zarpar bloqueado + botón aparte "Recuperar el astillero").
3. Autorización explícita para reescribir `scripts/smoke-fort.mjs`, cuya aserción "a captured yard must not let the player sail" es exactamente la regla que S92 invierte.

S91. El aviso de puerto cerrado se lee como lo que es.
- Clase propia `.purchase-notice.is-error`: rojo (`var(--red)`), peso 600 y un `⚠` por `::before`, para que cruce la distancia del pie.
- El texto cambia de "no se puede zarpar" a "se puede zarpar, pero no se repara hasta recuperarlo", en es/en.
- Se limpia la clase cuando el astillero está en manos propias, para que el rojo no quede pegado.
- **Defecto adicional encontrado**: `sea.banner.portClosed` **no existía en el i18n**. `t()` devuelve la clave cruda cuando falta, así que el mar mostraba literalmente `sea.banner.portClosed` al rechazar una reparación. Se agregaron `sea.banner.portClosed` y `sea.banner.fortRetaken` en es/en.

S92. Zarpar navega siempre. El bloqueo de zarpe sale de `src/ui/app.js`: queda sólo el aviso. Lo único que el puerto cerrado bloquea es la reparación (las dos llamadas de `sea.js` que ya lo hacían).

S93. El astillero tomado es un enemigo en el mar.
- La ocupación es un **pool separado** de la tripulación del astillero, y esa es la decisión de diseño que hace que la regla funcione: el astillero se rindió *porque* su guarnición estaba rota, así que medir el contraataque contra ese mismo pool habría empezado la pelea ya perdida.
- `damageOccupiedFort` toca **sólo la guarnición ocupante**, nunca el casco del astillero: recuperar tu propio puerto no es bombardearlo hasta los escombros.
- Al romperse la ocupación, el astillero vuelve a `"fighting"`, el puerto reabre y el aviso `sea.banner.fortRetaken` lo anuncia.
- El astillero tomado **no vive en `world.encounters`**: ahí derivaría, la zona de seguridad lo empujaría y podría volverse un pecio. Entra como blanco extra de `targetForSide` (quinto parámetro opcional, retrocompatible) y como hostil en el panel de barras.
- Los ocupantes disparan al jugador con los cañones del astillero (`occupierFire`), con la misma caída de daño que cualquier batería.

S94. Recuperado no es intacto.
- El casco vuelve como estaba. La guarnición vuelve a `OCCUPATION.recoveredGarrisonPct` (45 %): sin ese piso, el astillero se rendiría otra vez en el siguiente `refreshStatus` —porque se rindió por tener la guarnición baja— y el soft-lock volvería por la puerta de atrás. Los hombres que lo retomaron se quedan a sostenerlo.

Evidencia de T107-T111: `test/fort-recovery.test.js` **13/13** con RED observado (el módulo no exportaba `damageOccupiedFort`); `test/autofire.test.js` **18/18** con RED observado (el quinto parámetro no existía: `undefined` contra `'fort'`); `npm test` **633/633**. Dos errores propios corregidos durante la implementación: una aserción imposible en mi test (`fortOccupierCondition` devuelve 100 tras recuperar, por definición) y un `playerMaxRangeM` duplicado en `sea.js` que el smoke nuevo detectó como `Identifier already declared`.

L59: Cierre de T112. Construir el smoke destapó **cinco defectos reales de mi cableado en `sea.js`**, ninguno visible en los tests de modelo:
1. La barra de guarnición se armaba con el registro de ocupación pelado, que no tiene `pieces`: `loadedShare` hacía `.filter` sobre `undefined` y **el bucle de dibujo del mar se caía** apenas el astillero tomado entraba en pantalla.
2. `updateFortCombat` ocupaba el astillero sólo si `fortHeldByEnemy`, que ya exige una ocupación existente: una partida guardada con el astillero tomado y sin ocupación **no podía recibirla nunca**. Ahora guarda con `portClosed`.
3. Los ocupantes **hundían a la capitana dentro del puerto**, a quemarropa, antes de que pudiera zarpar, y además recargaban con `dt = 0`. Ahora respetan la zona de seguridad (S66) y recargan con el reloj real. Medido: dentro de la zona el casco queda en 100; fuera y a tiro baja a ~77; fuera de alcance, 100.
4. El astillero tomado está en `"surrendered"` y todas las reglas de blanco exigen `"fighting"`: la capitana contestaba "Sin blanco" mientras el astillero le disparaba. Se agregó `occupiedFortCombatant()`, una fachada con estado `"fighting"` y la guarnición ocupante como tripulación, sin reescribir el `status` guardado, que es lo que cierra el puerto. La usan el blanco del jugador, el de las escoltas, la barra y el panel de duelo (donde el astillero tomado aparece del lado hostil).
5. **Diseño**: la ocupación copiaba la guarnición defensiva completa (212 hombres). Medido: con 3 cañones eran 475 andanadas para rendirla, con una batería de 20 cañones unas 45. Un destacamento de ocupación es otra escala: `OCCUPATION.garrisonPct` = 28 % (68 hombres, ~41 bajas para rendirla).

Más, ya en la prueba y no en el juego: `sideForBearing` deja un blanco a proa o a popa fuera de toda banda, así que el smoke siembra a la capitana con el astillero exactamente de través (rumbo -PI/2 desde (300, 0)); el mar **descarta** un mundo guardado cuyo `speedKn` difiere en un nudo o más del casco, así que hay que sembrar el real; y `addInitScript` corre en **cada** navegación, recargas incluidas, por lo que sin una guarda con `sessionStorage` la recarga volvía a sembrar el astillero como tomado y el test leía su propio fixture.

Corrección de spec: el worker señaló que mi S94 decía "no se le regala la guarnición" mientras el código pone un piso del 45 %. El código tenía razón y la spec estaba mal: sin el piso, el siguiente `refreshStatus` la rinde de nuevo. S94 reescrita con la medición.

Evidencia de T112: `scripts/smoke-fort-recovery.mjs` verde (partida vieja sin ocupación recibe una; el astillero aparece como hostil en el panel; disparar baja la guarnición sin tocar el casco; vuelve a ser nuestra con 45 %; sobrevive a una recarga). RED observado rompiendo el código y restaurando con `cmp`: sin el piso de S94 falla con "garrison is 20" y el astillero **se vuelve a rendir al recargar** (vuelve el soft-lock); si la recuperación toca el casco falla con "65 -> 1". `scripts/smoke-fort.mjs` reescrito a S92 con RED observado (con la regla vieja, Zarpar no navega y el smoke da timeout). `npm test` **637/637**.

L60: `scripts/smoke-fort-combat.mjs` (S74, preexistente) falla de forma **intermitente**: 2 fallos en 7 corridas sobre el código actual, con el banner «¡Vela hostil a 305 m!» en lugar del aviso de puerto cerrado; el commit base `4fc055e` pasó 2 de 2. Un sondeo muestra que tras apretar `R` el banner dice el aviso correcto durante todo el intervalo. La hipótesis, **no confirmada**, es una carrera preexistente: el aviso de proximidad de enemigos pisa el banner cada 6 s y la aserción lee el banner una sola vez a los 400 ms. Nota aparte: esa aserción aceptaba la clave cruda `sea.banner.portClosed` (contiene "port"), así que en el base pasaba mostrando la clave sin traducir. Por la regla global no se edita ese smoke sin confirmación del usuario.


L61 (autorización del usuario: "continua con 1 y 2"): se edita `scripts/smoke-fort-combat.mjs`, un smoke de S74 preexistente, y se suben los commits.
- Causa del intermitente, ahora confirmada por el RED: la aserción leía el banner una sola vez a los 400 ms de apretar `R`, y el aviso de proximidad de enemigos, que se repite cada 6 s mientras el escuadrón sigue sobre el astillero, lo pisaba (2 fallos en 7 corridas con «¡Vela hostil a 305 m!»; el commit base pasó 2 de 2).
- Cambio: el aviso se busca durante los 3 s que dura el banner, y se exige el texto traducido (`/astillero.*enemig/`), porque el patrón viejo `/port/` aceptaba la clave sin traducir `sea.banner.portClosed`.
- Evidencia: RED observado quitando la traducción de `es.js` (falla: nunca aparece el aviso traducido en toda la ventana), restaurado con `cmp`; luego 3 corridas verdes de 3.
