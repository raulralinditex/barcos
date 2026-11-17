# Juego de barcos — comercio y astilleros por zona

Estado: cerrada S112-S122, sin pendientes. Rama: `feat/comercio-y-astilleros` (se crea desde `feat/t7-combate-costados` antes del primer commit). Cierra el pendiente grande de `pendientes.md`: la carga deja de ser castigo puro y pasa a producir dinero.

## Specs

S112. **Un astillero por zona, y la lista crece sin tocar la mecánica.** Pedido (verbatim): "creemos un astillero por zona" y "implementalo pensando en un posible aumento de astilleros en un futuro".
- Los astilleros son **datos**, no código: `SHIPYARDS` en `src/data/naval-data.js`. Cada entrada declara id, clave i18n, posición y radio de atraque.
- La zona de un astillero **no se escribe a mano**: se deriva de su posición con `zoneAtRadius`, así un astillero nuevo no puede mentir sobre dónde está ni sobre qué precios tiene.
- Hoy hay tres, uno por zona: el puerto de casa en la costera, uno en aguas abiertas y uno en el abismo. Agregar un cuarto es agregar una entrada y su marca en el mapa; ninguna regla de comercio cambia.
- `shipyardAt(position)` resuelve en qué astillero está la nave; `currentShipyard` es lo que lee el HUD.
- El puerto de casa conserva su radio de atraque de 110 m (S51 no se toca) y sigue siendo el único punto de partida.

S113. **El comercio: comprar barato donde hay, vender caro donde falta.** Pedido (verbatim): "vamos con tu propuesta, comprar barato, vender caso segun tipos de zonas de los astilleros". La propuesta aceptada, verbatim del turno anterior: "Una economía por viaje: comprar barato en el astillero, vender caro en una zona lejana, con el riesgo del viaje como costo real."
- Mercancías declaradas en datos (`COMMODITIES`): id, clave i18n, kg por unidad, precio base y en qué zona se produce.
- El precio de compra y el de venta se calculan **por la zona del astillero**, con un multiplicador por zona y por lado (compra/venta). Comprar en la zona donde se produce sale barato; vender en la zona donde falta sale caro. Ningún precio es una constante suelta en el código.
- La ganancia de un viaje tiene que ser **positiva y mayor que el riesgo**: el test fija el margen mínimo entre comprar en la costera y vender en el abismo.
- Los multiplicadores por zona son configurables desde la pantalla de Configuración, como todo número de diseño (S79).

S114. **La carga se compra y se vende en el astillero, y es la misma carga que pesa.** Pedido (verbatim): "compramos y vendemos en astilleros".
- Comprar paga el precio del astillero y suma kg a la carga de la capitana; vender resta kg y paga. Fuera de un astillero no hay compraventa.
- Comprar respeta `capacityKg`: no se compra lo que no entra, y el rechazo no cobra ni acredita nada.
- El comercio **no crea un segundo inventario**: la carga comprada es la que ya pesa, cala y vale (S110, S111). El manifiesto (`manifest`) es la lista de mercancías con sus kg, y `cargoKg` es su suma; la carga que se escribe a mano en el constructor es una entrada genérica al precio de `PRICES.cargoGoldPerKg`.

S115. **Los enemigos llevan carga, y se cobra al vencerlos.** Pedido (verbatim): "pon carga en los barcos enemigos, si se rinden, la carga la podemos vender en los astilleros, si se unde, solo conseguimos un % de carga."
- Cada vela enemiga nace con un manifiesto escalado por zona: más carga y más valiosa en aguas profundas.
- Si se rinde y se captura, la carga se cobra **entera**.
- Si se hunde, se recupera sólo un porcentaje (`LOOT.sunkCargoShare`), y el resto se va al fondo con ella.
- La carga cobrada entra en la bodega de la capitana hasta donde entra; el excedente queda en el agua y se avisa. Se vende después, en un astillero: el botín no es oro, es carga.

S116. **Si se hunde una nave nuestra, su carga se pierde con ella.** Pedido (verbatim): "si se hunden nuestros barcos se pierde la carga".
- La carga vive en el casco: un casco que sale de la flota se lleva su manifiesto. Vale para la capitana y para las escoltas.
- El oro de la bolsa no se toca: sólo se pierde lo que iba a bordo.

S117. **Naufragio o pérdida total: se elige en Configuración.** Pedido (verbatim): "tambien vamos a poner un checpoint en configuraciones, si se hunde nuestro barco, se queda como naufragio, o podemos areglarlo en el astillero".
- Ajuste `sinking.keepWreck` (0/1), apagado por defecto como el juego de hoy: un casco hundido sale de la flota.
- Encendido: el casco hundido **se queda en la flota como naufragio** (`wreck: true`, casco a 0). No navega, no puede ser capitana y no se vende; se reflota en un astillero pagando la reparación completa.
- La carga del naufragio ya se perdió al hundirse (S116): reflotar devuelve el casco, no el botín.
- El ajuste se lee en el momento del hundimiento, así cambiarlo a mitad de partida vale para el próximo.

S118. **El astillero es el mismo en todas partes; lo que cambia es el mercado.** Derivado de S112 y S113.
- Cualquier astillero abre la misma pantalla: construir, flota, fuerte y ajustes funcionan igual en los tres.
- La pestaña nueva **Mercado** muestra lo que ese astillero vende y compra, con sus precios ya calculados para su zona.
- El HUD y el minimapa muestran los astilleros, para que el viaje se pueda planear.

S119. **A market with memory.** Pedido (verbatim): "venga vamos con el mercado con memoria". Decisión del usuario sobre el stock: **se recupera con el tiempo**, con sus palabras: "Vendés 40 barriles de sal en la cala → el precio cae 35 %. Esperás 3 días de juego → vuelve casi al precio base. Efecto: el jugador rota entre mercancías y puertos, no repite un único viaje perfecto para siempre."
- **El precio deja de ser una tabla y pasa a ser una consecuencia.** Cada astillero guarda cuánto tiene de cada mercancía; el precio se deriva de ese stock. Una yarda llena es barata de comprar y mala de vender; una vacía es lo contrario.
- **El reposo está en el medio de la banda, no en el techo.** Es lo que hace posible el efecto pedido: vender empuja el precio por debajo del base de la zona, comprar lo empuja por encima, y la recuperación arrastra ambos de vuelta al base.
- `MARKET_MEMORY`: `baseStock` 60 (reposo, precio = base de la zona), `maxStock` 120 (atestada, precio al `floorShare` 0,45), `floorShare` 0,45, `ceilShare` 1,6 (yarda vacía), `recoveryDays` 3.
- `stockFactor` es lineal a trozos alrededor del reposo: 1,6 en 0 → 1 en 60 → 0,45 en 120, y clamp fuera del rango. Nunca NaN, nunca precio negativo.
- **La yarda no vende lo que no tiene.** Una compra mayor que el stock disponible se rechaza entera: no cobra, no carga y no mueve el stock. `affordableUnits` está limitada por las unidades enteras en stock, y el botón de comprar lo refleja.
- **La recuperación la mueve el reloj del juego** (`world.timeS`), no el reloj de pared: `recoverMarkets` recibe segundos jugados y usa la conversión de S67 (100 s = 1 día). Vuelve desde cualquier lado, sin pasarse del reposo.
- **La memoria vive en `barcos:game:v1`**, el mismo registro que el oro, bajo `markets`. Un guardado anterior a S119 no tiene el campo y carga con todos los puertos en reposo.
- **El efecto medido**: dos viajes idénticos de 20 unidades de sal. Viaje 1: compra 11→13 (237 pagados), venta 58→47 (1160 cobrados). Viaje 2: compra 13→15 (279 pagados), venta 47→36 (940 cobrados). El segundo cuesta más y paga menos: eso es el mercado con memoria.
- Vender 40 de sal en el abismo en reposo mueve el precio de 58 a 36, una caída del **37,93 %**. La frase del usuario decía "unos 35 %": es una ilustración del efecto, no un contrato de precisión, y la curva no se deforma para clavar el número.

S120. **Dos cascos iguales no comparten identidad.** Reporte del usuario (verbatim): "tenia dos barcos del mismo tipo en la flota, y se han mezclado los datos de los dos cuando los he ido variando".
- **Causa real**: en el guardado del mar (`barcos:game:v1`), el combatiente de la capitana vive bajo la llave `combat.player`, que es un **rol**, no una identidad. Al ascender a capitana a otra nave, el registro viejo se quedaba bajo `player` y el nuevo no se escribía: la capitana nueva heredaba el casco, la tripulación y los cañones de la vieja. Con dos cascos iguales el jugador no podía notarlo hasta que el daño aparecía en la nave equivocada.
- **Arreglo**: al cambiar de capitana, los dos combatientes se mueven juntos (`savePurse` con `promoteFrom`/`promoteTo`): el viejo baja a `escorts[suId]` y el nuevo sube a `player`. Los loadouts de cada casco nunca se tocaron: el bug era de condición y tripulación, no del reformador.
- **Prueba en rojo**: `scripts/smoke-two-hulls.mjs` recorre reformar A, reformar B, descartar A, reformar A dos veces, ascender capitana y transferir el mando en el mar. Sin el parche falla con "promotion missing combat player / condition / crew"; con el parche pasa entero.

S121. **Un casco sin pólvora se rearma en el astillero.** Reporte del usuario (verbatim): "despues de librar varias batallas y teniendo todo correctamente el barco a dejado de disparar".
- **Causa real**: cada cañón lleva `shotsLeft`; disparar gasta uno, y un cañón en cero se filtra fuera de `firingPieces`, así que deja de existir como cañón. Nada en el juego reponía rondas: ni el astillero, ni el ancla, ni la reparación. Tras suficientes batallas el casco quedaba con cañones mudos para siempre, y el jugador lo leía como un juego roto.
- **La regla**: rearmar es un servicio que el astillero **vende**, al precio de la misma fórmula de munición que ya usa el constructor (precio del proyectil + la pólvora del disparo). Se cobra **sólo por las rondas que faltan**, así que media recámara cuesta la mitad y rearmar dos veces paga una vez.
- **Qué se mide**: la asignación comprada del casco (`shotsPerPiece` de su entrada en la flota) contra lo que queda en las recámaras del guardado del mar. Un casco en puerto sin estado vivo de combate no debe nada: no hay recámara que reponer.
- **Dónde se escribe**: en los dos lados. El guardado del mar (`barcos:game:v1`, `combat.player.pieces[].shotsLeft`) es de donde el mar reconstruye los cañones en la próxima travesía; la ficha de la flota es de donde se arma el casco. Reponer sólo uno de los dos deja el bug vivo en el otro.
- **El tope de munición es un valor declarado**: `REARM.maxRoundsPerGun` (400), no el 200 escrito dos veces en la pantalla del constructor. El pedido del jugador de llevar más munición no se puede cumplir con el número hardcodeado en el HTML.
- **El mar lo dice en voz alta**: cuando la capitana se queda sin una sola ronda entre todos sus cañones, sale el banner `sea.banner.dry` nombrando el casco y dónde arreglarlo. Antes la nave simplemente se callaba, que es exactamente lo que el jugador reportó como síntoma.
- **Lados**: una recámara vieja guardada con `side: "lado"` cuenta como la misma banda que declara la ficha (`babor`): mismo cañón con otro nombre no es otro cañón.

S122. **Las recámaras de una escolta viajan con ella.** Consecuencia de S121: rearmar escribe las rondas en `combat.escorts[id].pieces` del guardado del mar, pero el mar **nunca escribía ni leía** las piezas de una escolta — sólo `condition` y `crew`. El resultado era el peor de los dos mundos: el jugador pagaba el rearme y la escolta zarpaba como recién construida, con la asignación completa del constructor.
- **Se guarda**: el autoguardado del mar escribe `pieces` por escolta con `pieceId`, `side`, `ammoId`, `shotsLeft` y `reloadTimer` — los mismos campos que ya se guardaban para la capitana.
- **Se lee**: al zarpar, cada cañón de la escolta se restaura índice a índice, con las mismas dos guardas que la capitana: la pieza tiene que ser la misma (un reformador puede poner otro cañón en ese hueco) y el proyectil guardado tiene que ser uno que esa pieza pueda disparar (S65).
- **Un guardado anterior a S122 no rompe nada**: sin `pieces` el casco se arma desde la ficha de la flota, que es lo que hacía siempre.

S130. **Los cascos pertenecen al astillero donde quedan amarrados.** Pedido (verbatim): "los astilleros son entidades independientes, si una nave esta en un astillero, no aparece en el otro". Decisión (verbatim): "Al zarpar, las naves marcadas con el check te acompanan (escoltas), como hoy: las que no van con vos se quedan en el astillero y no aparecen en otro. La capitana y sus escoltas navegan, no estan en ningun puerto."
- Cada entrada de flota guarda `yardId`: un id de astillero o `null` mientras navega. Un guardado anterior o un id desconocido se resuelve al puerto de casa.
- La posición válida del guardado del mar manda sobre la ubicación guardada de la capitana: al abrir la pantalla y sus salas, se actualiza al astillero donde está o a `null` en aguas abiertas. Los cascos que quedaron en puerto no se mueven.
- Comprar deja el casco en el astillero actual y lo hace capitana. Al zarpar, la capitana y las escoltas marcadas de ese astillero salen; las no marcadas quedan, y un naufragio no navega.
- Un casco hundido en el mar que se conserva como naufragio (S117) vuelve al puerto de casa (`puerto-casa`) para reflotarse allí, sin importar de qué astillero zarpó.
- El mar forma y guarda las escoltas que zarparon. Un guardado anterior sin escoltas abre con la capitana sola.
- Flota, reparación y selector de mercado muestran los cascos amarrados allí y la escuadra visitante, nunca cascos de otro astillero. El contador y las acciones siguen el mismo alcance.

## Tasks

- T1 — S112: registro de astilleros, `shipyardAt`/`currentShipyard` y zona derivada. Ruta: inline. Commit: `a4b7b1e`.
- T2 — S113, S114: mercancías, precios por zona, manifiesto y compraventa con capacidad. Ruta: inline. Commit: `597bf85`.
- T3 — S115, S116: carga en enemigos, botín entero al rendirse, porcentaje al hundirse, y la carga que se va con el casco. Ruta: inline. Commit: `936f4f1`.
- T4 — S117: ajuste `sinking.keepWreck`, naufragio en la flota y reflotado en el astillero. Ruta: inline. Commit: `06cebbe`.
- T5 — S118 y la UI de S112-S117: pestaña Mercado, astilleros en el HUD y el minimapa, grupo `commerce` y el interruptor en Configuración, i18n es/en y smokes. Ruta: inline + un worker para el bug del click. Commit: `4633a20`.
- T6 — S119: mercado con memoria. Stock por astillero, precio derivado del stock, recuperación por reloj de juego, persistencia en el guardado del mar y pantalla con el stock a la vista. Ruta: worker con contrato cerrado por el orquestador. Commit: `feat(market): a port remembers what she sold you`.
- T7 — S120: identidad de dos cascos iguales. El rol `combat.player` se movía sin la nave que lo ocupaba. Ruta: worker + verificación del orquestador en rojo y verde. Commit: `fix(fleet): two identical hulls no longer swap their combat record`.
- T8 — S121: el astillero rearma, y el tope de munición por cañón es un valor declarado. Modelo (`src/model/rearm.js`), botón en el panel del casco, banner en el mar, i18n y smoke. Ruta: inline. Commit: `fix(gunnery): a dry hull buys her rounds back at the yard`.
- T9 — S122: las recámaras de las escoltas en el guardado del mar (escritura y lectura). Ruta: inline. Commit: `fix(fleet): an escort's racks travel with her`.
- T10 — S123: el astillero en el minimapa con su barra de guarnición. Ruta: inline. Commit: `feat(minimap): a taken yard shows the garrison left`.
- T11 — S124: la bodega del casco seleccionado en el panel de la flota. Ruta: inline. Commit: `feat(fleet): the panel shows what the hull is carrying`.
- T12 — S125: la venta grande paga el precio de cada unidad. Ruta: inline. Commit: `fix(market): a big sale pays the curve, not one quote`.
- T13 — S126: la yarda dispara a cualquier enemigo en alcance. Ruta: worker + verificación del orquestador en rojo y verde. Commit: `fix(fort): the yard fires at any enemy in range`.
- T14 — S127: la orden de munición es de toda la escuadra. Ruta: inline. Commit: `feat(gunnery): the captain-s ammunition order loads the squadron`.
- T15 — S128: cualquier casco de la escuadra recoge un pecio. Ruta: inline. Commit: `feat(squadron): any hull of the squadron picks up a prize`.
- T16 — S129: el arranque en Comprar no entra en modo reforma. Ruta: inline. Commit: `fix(shipyard): the buy screen opens able to sell any hull`.
- T17 — S130: ubicación persistida por casco y compatibilidad; compra y zarpar por astillero; formación y guardado de escoltas; flota y mercado locales; tests nuevos y smoke de dos astilleros. Ruta: worker.

## Log

L1 (pedido original, verbatim): "vamos con el comercio, creemos un astillero por zona, vamos con tu propuesta, comprar barato, vender caso segun tipos de zonas de los astilleros, compramos y vendemos en astilleros, pon carga en los barcos enemigos, si se rinden, la carga la podemos vender en los astilleros, si se unde, solo conseguimos un % de carga. si se hunden nuestros barcos se pierde la carga, tambien vamos a poner un checpoint en configuraciones, si se hunde nuestro barco, se queda como naufragio, o podemos areglarlo en el astillero"

L2 (verbatim): "implementalo pensando en un posible aumento de astilleros en un futuro" — de ahí S112: los astilleros son datos y su zona se deriva de la posición.

L3 (decisión del orquestador, sin consulta): el mercado es una pestaña más del astillero (S118), porque el astillero ya es la pantalla con tabs de S97 y agregar una pestaña no cambia ninguna regla. Se reporta en el cierre; si el usuario prefiere otro sitio, se mueve.

L4 (cierre): T1-T5 verificados. `npm test` 702/702. Smokes en verde: market, sale, fleet, dock, shipyard-layout, sea, anchor-yard. Un bug real apareció y se arregló: la fila del mercado se desbordaba de su columna de 300 px y el click de "Vender todo" caía sobre `#ship-photo`, así que vender no hacía nada aunque el botón estuviera habilitado. `src/ui/styles.css` lo ajusta y `scripts/smoke-market.mjs` comprueba el blanco del click a tres anchos, sin `force`.

L5: `scripts/smoke-settings.mjs` y `scripts/smoke-tabs.mjs` afirmaban **15** bloques de configuración. S117 y S113 agregan dos legítimos (`sinking` y `commerce`), así que ahora son **17**. El usuario confirmó actualizarlos ("ok"). Se actualizaron a 17 y se les agregó la comprobación de que la casilla de naufragio es un checkbox apagado por defecto y de que los ocho precios del mercado están en pantalla. Ambos en verde.

L6: El usuario eligió la opción A: el reposo (60) es el centro de la banda; la escasez sube el precio hasta 1.6 y el exceso lo baja hasta 0.45, con stock máximo 120 y recuperación hacia 60. La especificación anterior se contradecía: un puerto lleno al precio base, con ambos valores como techo, no podía subir al comprar ni bajar al vender.

L7: El usuario eligió la opción B: no se compra más de lo que tiene el puerto; el pedido entero se rechaza sin mover oro, bodega ni stock. Dos viajes idénticos de 20 unidades caben en el stock inicial. La venta separada de 40 de sal en el abismo ilustra «unos 35 %»: con la curva acordada el precio redondeado cae de 58 a 36, un 37,93 %, sin alterar `floorShare` para forzar el ejemplo.

L8 (cierre de S119): `npm test` **717/717**. Smokes verificados uno por uno con su exit code: market, sale, fleet, dock, settings, tabs, sea, anchor-yard, shipyard-layout, todos en 0. Los dos smokes que el worker había saltado por miedo a escribir capturas fuera de su superficie no escriben en el repo: van a `/tmp/fleet.png` y `/tmp/sea.png`, que no están versionados.

L9 (S120): el worker se colgó a los 4 minutos pero dejó el parche y el smoke. Verifiqué el rojo yo mismo con `git stash`: sin el parche el smoke falla con la capitana nueva heredando condición, tripulación y cañones de la vieja; con el parche pasa. `npm test` 717/717, y smokes market, fleet, sale, dock y tabs en 0.

L10 (pedido original de S121, verbatim): "despues de librar varias batallas y teniendo todo correctamente el barco a dejado de disparar".

L11 (pedido de continuación, verbatim): "arranca el servidor y continua con lo que no esta cerrado".

L12 (decisión del orquestador, sin consulta): el tope de rondas por cañón pasa a ser **un valor declarado** (`REARM.maxRoundsPerGun`, 400) en vez del 200 escrito dos veces en la pantalla del constructor. El pedido del jugador de "llevar más munición" no se puede cumplir con el número hardcodeado en el HTML, y la regla de diseño del proyecto es que todo número de diseño es configurable o declarado. Se reporta en el cierre.

L13 (cierre de S121): `npm test` **726/726**. `scripts/smoke-rearm.mjs` nuevo, verde, con RED observado en dos tandas: sin el handler del botón falla con "the yard charges exactly what it quoted" (el oro no se movía); sin `warnIfDry()` falla con "the sea names the dry hull instead of going silent". El smoke no usa números mágicos: la cotización esperada sale de `rearmQuote`, la misma llamada que hace la pantalla. Cotización medida en el caso del smoke: 60 rondas por 92 doblones. Se corrigió de paso `writeFortSave` en el camino del reflotado, que escribía `gold` dentro de `fort` en vez de en la raíz del guardado del mar.

L14 (S122, autorizado con "si" sobre la limitación reportada en el cierre de S121): el guardado del mar no llevaba las recámaras de las escoltas. Se agregaron al autoguardado y al arranque de la travesía, con las mismas guardas de pieza y proyectil que la capitana. `scripts/smoke-escort-racks.mjs` nuevo: RED observado sin el arreglo con "the escort's racks are in the sea save at all (S122)"; con el arreglo verde, y prueba además que la escolta zarpó con las 25 rondas que le vendió el astillero y no con la asignación del constructor. `npm test` 726/726. Smokes en 0: escort-racks, escort-dock, escort-range, formation, visible-escorts, command-handover, combat, fleet, rearm, two-hulls, sea, anchor-yard.

S123. **El astillero se ve en el minimapa con su guarnición.** Único punto abierto de S74 (`escala-y-configuracion.md`, L33 punto a), elegido por el usuario entre los pendientes reales.
- El fuerte pelea de verdad desde S74/S93, pero en el minimapa sólo se veía el aro del puerto: no se podía saber si estaba en pie, tomado o cuánto le quedaba a la guarnición sin volver a puerto a mirar.
- **En pie**: la marca del astillero es el color del puerto (`#a9955f`) y no hay barra.
- **Tomado**: la marca pasa a hostil (`#d0503c`) y aparece una barra de guarnición encima, del ancho que le queda a los ocupantes (`fortOccupierCondition`).
- **Tamaño en pantalla, no en el mundo**: la marca y la barra se dibujan después de deshacer la escala del mapa (`1 / scale`), o se encogerían con la carta hasta ser ilegibles. Medidas: barra de 46 × 6 px sobre un minimapa de 170 px, levantada 9 px.
- Sólo el astillero de casa puede estar tomado (el único que el enemigo asedia, S93); los demás siguen siendo puntos de mercado.

S124. **La carga de un casco se ve en la flota.** Reporte del usuario (verbatim): "cuando en el mercado cargamos una nave con carga, la carga de la nave no cambia y no podemos saber que carga lleva la nave".
- **El mercado sí guardaba la carga**: comprar escribe `manifest` y `cargoKg` en la entrada de la flota del capitán y la pantalla del mercado lo muestra. Lo que faltaba era **todo el resto de los lugares donde se mira un casco**: el panel de la flota mostraba sus barras de condición y nada de lo que llevaba, así que la carga era invisible salvo estando en un astillero.
- **El panel del casco seleccionado muestra la bodega**: total contra capacidad, una línea por mercancía con unidades y kg, y la carga suelta del constructor aparte (no es mercancía y no se puede vender, pero pesa).
- **La suma es la del modelo**: la línea de total usa `shipHold`, no una segunda contabilidad, así la pantalla no puede discrepar de la regla.
- Una bodega vacía lo dice ("Bodega vacía") y no inventa filas; venderlo todo vacía el panel sin recargar.

S125. **Una venta grande paga el precio de cada unidad, no uno solo para todo el lote.** Reporte del usuario (verbatim): "he comprado como 2000 doblones y los he vendido en el abismo y he conseguido casi 290000 doblones, un poco exagerado no?".
- **Causa medida**: la pantalla cotiza un precio por mercancía y `sellCargo` lo aplicaba a **todas** las unidades del lote; el stock subía **después** de cobrar. Vender 500 de plata en el abismo pagaba 576 × 500 = **288.000** con un mercado de 60 unidades: la curva de S119 nunca llegaba a morder.
- **La regla**: con la memoria del puerto, el astillero paga el precio que corresponde a **cada unidad** que toma, subiendo el stock paso a paso. Ese mismo lote de 500 de plata paga **139.174** (una caída del 51,7 %). Una venta chica no se castiga: 5 unidades pagan el precio de reposo.
- **Sin memoria, la cotización plana sigue**: los llamadores que no tienen estado de mercado (y los tests que fijan un precio único) siguen funcionando. Un puerto sin memoria es un puerto en reposo (`{}`), no un puerto sin precios.
- **La curva de S119 no se toca**: el usuario eligió explícitamente "sólo cobrar por unidad, sin tocar la curva", después de ver que bajar `floorShare` a 0,20 y subir `maxStock` a 200 degradaba el ejemplo de los 40 barriles (de 38 % a 24 % de caída) que él mismo había pedido.

S126. **El astillero dispara a cualquier enemigo en su alcance, venga de donde venga.** Reporte del usuario (verbatim): "el astillero no ataca las naves enemigas". Decisión del usuario sobre el arreglo, elegida entre cuatro: "Que dispare a todo enemigo en rango, de cualquier zona".
- **Causa medida**: dentro de `updateFortCombat` la yarda sólo disparaba si `canAssaultFort(encounter.zoneId ?? currentZone().id)`, y esa función sólo acepta la zona `"abismo"`. Pero el mundo genera los enemigos con la zona donde nacieron, y los que nacen junto al puerto son de la costera (medido con semilla 99: 2 enemigos, `zoneId: "costera"`, a 1319 m y 2253 m). **Ningún enemigo generado cerca del puerto era elegible nunca.** El único motivo por el que el smoke viejo pasaba es que sembraba a mano un escuadrón con `zoneId: "abismo"`.
- **La regla**: la yarda dispara a cualquier combatiente hostil que esté en alcance, sin preguntar por su zona. El alcance real lo sigue poniendo cada cañón (`media-culebrina-9`, 430 m) dentro de `fortFire`; la puerta de `engageRadiusM` (620 m) se mantiene como filtro barato.
- **La zona segura no se toca (S66)**: un enemigo sigue siendo empujado fuera de los 300 m del puerto y sigue sin disparar desde dentro. `insideSafeZone`, `clampToSafeZone` y `occupiedFortFire` quedan como estaban.
- **`canAssaultFort` no se toca**: sigue gobernando quién viene a asediar la yarda y a quién apunta un escuadrón del abismo (S74, S93). Lo que cambia es sólo la puerta de fuego de la propia yarda.
- **Medido**: `scripts/smoke-fort-defence.mjs` — un enemigo costero a 200 m baja el casco de 100 a 45,7; uno a 931 m no recibe nada; la capitana dentro de la zona segura no recibe nada. Sin el arreglo falla con "the yard should damage the coastal enemy (hull 100 -> 100, crew 100 -> 100)".

L15 (S126): el worker quitó la puerta de zona del fuego de la yarda y escribió `scripts/smoke-fort-defence.mjs`. Su smoke salía flaky en mi máquina: el empuje de la zona segura deja al enemigo a 299,99999999999994 m contra un radio de 300, así que el assert `>= 300` fallaba por coma flotante. Lo arreglé con un metro de tolerancia (test nuevo, no existente). RED verificado por mí restaurando la línea vieja: "the yard should damage the coastal enemy (hull 100 -> 100, crew 100 -> 100)"; con el arreglo, tres corridas seguidas en verde. `npm test` 727/727. Smokes en 0: fort-defence, fort-combat, fort, safe-zone, fort-recovery.

L16 (límite conocido que el worker reportó, no arreglado): `ensureEnemyCombat` se construye por proximidad a la **capitana**, no a la yarda. Un enemigo que está cerca del puerto pero lejos del jugador puede no tener combatiente y entonces la yarda lo salta. No cambia el reporte del usuario (que veía enemigos encima suyo, con combatiente ya creado), pero es la parte que falta para que "cualquier enemigo en rango" sea literal. Queda abierto como pendiente menor.

S129. **Comprar un barco deja elegir el casco aunque la flota ya tenga uno.** Reporte del usuario (verbatim): "al comprar un barco, si has comprado un barco antes, no puedes cambiar el tipo de barco, siempre compras el mismo independientemente del que elijas".
- **Causa medida**: al arrancar, el boot llenaba el editor con la capitana y dejaba `refitId` apuntando a ella, mientras la pantalla de entrada es Comprar. `renderHulls` deshabilita **todas** las cartas cuando `refitId !== null`, y el botón se vuelve "Guardar reforma". El click sobre un casco no hacía nada (estaba `disabled`) y el botón aplicaba la reforma de la capitana: se lee como "siempre compra el mismo barco". Nada de la compra estaba roto.
- **La regla**: el arranque en Comprar **no entra en modo reforma**. El editor sigue llenándose con la capitana, pero `refitId` queda en `null`, así que las cartas responden y el botón ofrece añadir a la flota.
- **La reforma no se toca**: sigue disponible eligiendo un casco desde la pestaña Flota, que es lo que hace `selectRefitShip` con `openRoom: true`.
- **Medido**: `scripts/smoke-buy-hull.mjs` — abre en Comprar con 0 cartas deshabilitadas y el botón "Añadir a la flota", elige `barca-costera`, la compra deja la flota en `galeon-pequeno + barca-costera`, y elegir la capitana desde Flota vuelve a ofrecer "Guardar reforma". Sin el arreglo falla con "with a fleet already afloat the yard must offer a purchase, not a refit: Guardar reforma".

S127. **La munición que elige la capitana la carga toda la escuadra.** Pedido del usuario (verbatim): "quiero que cuando la capitana cambie de municion, toda la flota adjunta la cambie tambien".
- `setFleetAmmo(captain, escorts, ammoId)` en `src/model/combat.js`: aplica `setBroadsideAmmo` a la capitana y a cada escolta, y devuelve los totales de la escuadra además del resultado de la capitana.
- **Cada casco responde por sus propios cañones**: un 32 libras no puede disparar metralla, así que la conserva — igual que en la capitana. Nada se gasta al cambiar, y cada cañón que cambia paga su propia penalización de recarga (S70).
- **Un casco hundido o rendido no recibe la orden**: no es un cañón que pueda obedecer.
- El banner cuenta los cañones de **toda la flota**, que es lo que el jugador ve.

S128. **Cualquier casco de la escuadra recoge un pecio.** Pedido del usuario (verbatim): "tambien quiero que todos los barcos de la flota actuen igual que la capitana si pasan por un naufragio".
- En `updateWorld` la recogida de tesoros y pecios miraba sólo la posición de la capitana, así que un premio por el que pasaba una escolta se quedaba en el agua. Ahora `pickers = [ship, ...escorts]`: cualquier casco dentro de `pickupRadiusM` (60 m) lo recoge y el oro va a la bolsa compartida.
- La regla es la misma para todos los cascos: no hay excepción ni prioridad por ser la capitana.

L17 (pedido, verbatim): "los astilleros son entidades independientes, si una nave esta en un astillero, no aparece en el otro".

L18 (decisión, verbatim): "Al zarpar, las naves marcadas con el check te acompanan (escoltas), como hoy: las que no van con vos se quedan en el astillero y no aparecen en otro. La capitana y sus escoltas navegan, no estan en ningun puerto."

L19 (destino de los naufragios, decisión verbatim): "Al puerto de casa (Recomendada)".
