# Juego de barcos — comercio y astilleros por zona

Estado: cerrada S112-S120, sin pendientes. Rama: `feat/comercio-y-astilleros` (se crea desde `feat/t7-combate-costados` antes del primer commit). Cierra el pendiente grande de `pendientes.md`: la carga deja de ser castigo puro y pasa a producir dinero.

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

## Tasks

- T1 — S112: registro de astilleros, `shipyardAt`/`currentShipyard` y zona derivada. Ruta: inline. Commit: `a4b7b1e`.
- T2 — S113, S114: mercancías, precios por zona, manifiesto y compraventa con capacidad. Ruta: inline. Commit: `597bf85`.
- T3 — S115, S116: carga en enemigos, botín entero al rendirse, porcentaje al hundirse, y la carga que se va con el casco. Ruta: inline. Commit: `936f4f1`.
- T4 — S117: ajuste `sinking.keepWreck`, naufragio en la flota y reflotado en el astillero. Ruta: inline. Commit: `06cebbe`.
- T5 — S118 y la UI de S112-S117: pestaña Mercado, astilleros en el HUD y el minimapa, grupo `commerce` y el interruptor en Configuración, i18n es/en y smokes. Ruta: inline + un worker para el bug del click. Commit: `4633a20`.
- T6 — S119: mercado con memoria. Stock por astillero, precio derivado del stock, recuperación por reloj de juego, persistencia en el guardado del mar y pantalla con el stock a la vista. Ruta: worker con contrato cerrado por el orquestador. Commit: `feat(market): a port remembers what she sold you`.

## Log

L1 (pedido original, verbatim): "vamos con el comercio, creemos un astillero por zona, vamos con tu propuesta, comprar barato, vender caso segun tipos de zonas de los astilleros, compramos y vendemos en astilleros, pon carga en los barcos enemigos, si se rinden, la carga la podemos vender en los astilleros, si se unde, solo conseguimos un % de carga. si se hunden nuestros barcos se pierde la carga, tambien vamos a poner un checpoint en configuraciones, si se hunde nuestro barco, se queda como naufragio, o podemos areglarlo en el astillero"

L2 (verbatim): "implementalo pensando en un posible aumento de astilleros en un futuro" — de ahí S112: los astilleros son datos y su zona se deriva de la posición.

L3 (decisión del orquestador, sin consulta): el mercado es una pestaña más del astillero (S118), porque el astillero ya es la pantalla con tabs de S97 y agregar una pestaña no cambia ninguna regla. Se reporta en el cierre; si el usuario prefiere otro sitio, se mueve.

L4 (cierre): T1-T5 verificados. `npm test` 702/702. Smokes en verde: market, sale, fleet, dock, shipyard-layout, sea, anchor-yard. Un bug real apareció y se arregló: la fila del mercado se desbordaba de su columna de 300 px y el click de "Vender todo" caía sobre `#ship-photo`, así que vender no hacía nada aunque el botón estuviera habilitado. `src/ui/styles.css` lo ajusta y `scripts/smoke-market.mjs` comprueba el blanco del click a tres anchos, sin `force`.

L5: `scripts/smoke-settings.mjs` y `scripts/smoke-tabs.mjs` afirmaban **15** bloques de configuración. S117 y S113 agregan dos legítimos (`sinking` y `commerce`), así que ahora son **17**. El usuario confirmó actualizarlos ("ok"). Se actualizaron a 17 y se les agregó la comprobación de que la casilla de naufragio es un checkbox apagado por defecto y de que los ocho precios del mercado están en pantalla. Ambos en verde.

L6: El usuario eligió la opción A: el reposo (60) es el centro de la banda; la escasez sube el precio hasta 1.6 y el exceso lo baja hasta 0.45, con stock máximo 120 y recuperación hacia 60. La especificación anterior se contradecía: un puerto lleno al precio base, con ambos valores como techo, no podía subir al comprar ni bajar al vender.

L7: El usuario eligió la opción B: no se compra más de lo que tiene el puerto; el pedido entero se rechaza sin mover oro, bodega ni stock. Dos viajes idénticos de 20 unidades caben en el stock inicial. La venta separada de 40 de sal en el abismo ilustra «unos 35 %»: con la curva acordada el precio redondeado cae de 58 a 36, un 37,93 %, sin alterar `floorShare` para forzar el ejemplo.

L8 (cierre de S119): `npm test` **717/717**. Smokes verificados uno por uno con su exit code: market, sale, fleet, dock, settings, tabs, sea, anchor-yard, shipyard-layout, todos en 0. Los dos smokes que el worker había saltado por miedo a escribir capturas fuera de su superficie no escriben en el repo: van a `/tmp/fleet.png` y `/tmp/sea.png`, que no están versionados.
- T7 — S120: identidad de dos cascos iguales. El rol `combat.player` se movía sin la nave que lo ocupaba. Ruta: worker + verificación del orquestador en rojo y verde. Commit: `fix(fleet): two identical hulls no longer swap their combat record`.

L9 (S120): el worker se colgó a los 4 minutos pero dejó el parche y el smoke. Verifiqué el rojo yo mismo con `git stash`: sin el parche el smoke falla con la capitana nueva heredando condición, tripulación y cañones de la vieja; con el parche pasa. `npm test` 717/717, y smokes market, fleet, sale, dock y tabs en 0.
