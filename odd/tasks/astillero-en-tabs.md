# Juego de barcos — astillero en tabs

Estado: cerrada S97-S104, salvo lo que queda abierto abajo. S97+. Refactor de la pantalla del Astillero a navegación por tabs, y mecánica nueva de defensa del fuerte. Master pendiente de decidir rama: la feature arranca sobre `feat/t7-combate-costados` como las anteriores; si el usuario pide otra rama, se crea antes del primer commit.

## Specs

S110. **Un casco que flota demasiado alto gobierna mal.** Pedido (verbatim): "mi pregunta sobre carga es que si un barco no tiene ninguna carga, este es beneficiado, deberia de haber un minimo de carga para cada barco para que pueda salir? esot es correcto?" — implementado como camino 3 (física), no como mínimo obligatorio.
- Medido antes: mismo casco, 0 kg de carga 6,92 kn contra 40.000 kg 5,98 kn. Ir vacío era la configuración más rápida y legal: la carga sólo costaba.
- Regla: por debajo de `TURNING.lightLoadThreshold` (20 % de la capacidad) el timón pierde hasta un 25 % de su tasa (`lightLoadFactor` 0,75), porque la quilla no muerde el agua. La penalización **entra gradualmente** con la carga: no hay acantilado.
- Vale para el jugador, las escoltas y los enemigos: es la misma física (S57). Un valor desconocido o ausente falla **abierto** (factor 1): una partida vieja no se penaliza por un campo que no tenía.
- El constructor avisa con `issue.light-load` y los números que el jugador necesita (carga actual, umbral, timón restante). Es **aviso, no error**: el barco vacío sigue zarpando, sólo gobierna mal.
- Ambos números son configurables desde la pantalla de Configuración.

S111. **La carga cuenta en el coste de reparación y en el valor de la nave.** Pedido (verbatim): "despues de implementqr el 1 y 3 tenerlo en cuenta a la hora de reparar en coste y valores".
- `shipValue` es el número contra el que se miden **dos** precios: la reparación y la venta. Se le suma el valor de la carga: `loadValueFactor` = 1 + `REPAIR.loadValueShare` × (carga / capacidad), con 0,25 por defecto.
- Se mide sobre la **carga sola**, no sobre la fracción de carga total: toda nave lleva tripulación y víveres, y cobrar por eso inflaría el precio de un barco que sólo está tripulado. Esto se descubrió con 5 regresiones en los tests de S40/S45 y se corrigió en el modelo.
- El valor **persistido** (`paidGold`) sigue siendo el base (`hullValue`): el reformador lo escribe, y guardar ahí el valor con recargo lo compondría en cada reforma. Otra regresión real que el test de S50 cazó.

S108. **Las acciones de cada nave viven en un panel común.** Pedido (verbatim): "vamos a quitar los botones reparar y vender de cada barco in el listado de flota, y los vamos a poner comuner en un panel en la primera lolumna abajo, cuando se selecciona un buque, se activan y actualizan los botones igual que estan ahora". Y antes: "añademe un panel en el tab 'tu flota' mostrando las barritas de daño etc en la columna izquierda abajo".
- El listado de flota queda con una línea limpia por casco: cheque de zarpe, nombre, casco, capitana. **Sin** botones de reparar ni vender por fila.
- Debajo del listado, en la columna izquierda, un panel con el casco seleccionado: nombre, tipo, sus cuatro barras (casco, aparejo, tripulación, moral) y los botones Reparar y Vender.
- Los botones se activan, deshabilitan y actualizan su precio exactamente como antes, pero para el casco seleccionado. Sin selección, el panel está oculto y se ve una pista para elegir una nave.
- El casco seleccionado es el mismo que edita el reformador: elegir en la lista y elegir para reformar son el mismo gesto.

S109. **Al llegar al astillero se abre el tab de comprar buque.** Pedido (verbatim): "cuando llegas al astillero el panel activo que se muestra es el de tu flota en vez de crear buque".
- Causa: `selectRefitShip(captain)` en el boot llamaba `showScreen("flota")`, así que la selección inicial de la capitana decidía el room.
- El mar vuelve con `./index.html#comprar` en sus tres salidas (desembarco, hundimiento y mar sin casco), y el boot deja el room a la regla de entrada, no a la selección del reformador.

S106. **El tab Flota aprovecha todo el espacio.** Pedido (verbatim): "vamos refinando el tab flota, aprovecha todo el espacio horizontal, amplia el panel 'tu flota' y el panel 'el buque' para que coja todo el espacio lateral".
- La columna de flota crece (`minmax(320px, 24%`) y corre el alto completo del room.
- El panel del buque y el del aparejo ocupan **todo el ancho restante**: el buque arriba, el aparejo debajo. Ninguna tercera columna vacía.
- Los slots de aparcamiento son transparentes a la grilla (`display: contents`), así un slot con dos paneles no los apila en una sola columna.
- Causa del defecto: los tres rooms usaban la plantilla de tres columnas, pero en Flota el aparejo quedaba como hijo del mismo slot que el buque, así que ambos se apilaban en la columna central y la tercera quedaba **vacía** (350 px perdidos).

S107. **El radio de tiro se ve para toda la línea, no sólo para la capitana.** Pedido (verbatim): "vamos a mostras el radio de distancia de tiro tambien para el resto de naves propias aparte de la capitana".
- Cada casco propio en el mar dibuja los arcos de sus dos bandas, con el alcance real de la munición cargada (`rangeCircleM`, S68).
- Los arcos de la capitana mantienen su brillo; los de las escoltas son más finos y tenues: informan, no compiten con la puntería del jugador.
- El bonus de la primera andanada sólo se marca en la capitana: es su privilegio de apertura (S69).

S105. **Cada tab lee como la pantalla original, cambiando sólo el panel izquierdo.** Pedido (verbatim): "el tab de crear buque se deberia de ver exactamente igual que antes, pero sin el panel de flota y sin los botones que no son necesarios para crear un buque. el tab de flota se debe de ver igual que el primer tab pero reemplazando el panel de casco por el de flota, y añadiendo los botones relacionados con la flota, el panel de astillero se tendria que ver como el primero pero reemplazando el panel de cascos por el de astillero con los botones relacionados con astillero, el panel de configuracion tendria que tener varias colummnas en ver de todos los paneles de valores en una".
- Los tres rooms de juego (Comprar buque, Flota, Astillero) muestran las **tres columnas** de la pantalla original: panel izquierdo propio, panel del buque, panel del aparejo.
- **Comprar buque**: panel izquierdo = catálogo de cascos (con país). Acciones del pie: precio, "Añadir a la flota", veredicto. Sin tira de flota, sin Zarpar, sin Borrar partida.
- **Flota**: panel izquierdo = panel de flota (lista con cheque de zarpe, capitana, reparar, vender). Pie: Zarpar y Borrar partida; al elegir una nave para reformar aparecen precio y "Guardar reforma". Sin catálogo de cascos (reformar no cambia casco, S26).
- **Astillero**: panel izquierdo = panel del fuerte con sus botones (Reparar, Comprar cañón). Sin acciones de compra ni de flota en el pie.
- **Configuración**: en varias columnas de tarjetas de valores, no en una sola columna.
- El panel del buque y el del aparejo son **el mismo DOM** en los tres rooms: se re-parentan al cambiar de room (nunca se clonan).
- Comprar un buque deja al jugador en Comprar buque, con el aviso de compra.

S97. **La pantalla del Astillero se organiza en tabs.** Pedido (verbatim): "vamos a refractorizar la pantalla de astillero, creando tabs, uno para pa flota con el panel de buque, aparejo, y todo lo que es reformar y zarpar; otro tab para cuando quiero comprar un buque, otro para el astillero si quiero mejorar la defensa etc, otro para la configuracion etc".
- Cuatro tabs: **Flota**, **Comprar buque**, **Astillero**, **Configuración**.
- La barra de flota y el panel del fuerte dejan de estar siempre visibles arriba: cada uno vive dentro de su tab (decisión del usuario: "Limpios: cada cosa en su tab"). La barra superior queda con marca, bolsa e idioma; el pie queda con el veredicto, el precio y los botones.

S98. **Tab Flota.** La flota y su gobierno, en un solo lugar.
- La lista de la flota (chips con cheque de zarpe, capitana, reparar, vender) vive dentro del tab.
- La ficha de la flota en la barra superior desaparece; su contenido pasa al tab.
- Al elegir una nave de la flota para reformar, el constructor entra en modo reforma dentro de este tab: el panel del buque (foto, silueta, baterías, balance de masa, estadísticas) y el aparejo (sub-tabs Artillería/Dotación/Carga) son los de siempre, con Guardar reforma.
- Zarpar vive en este tab: navega según el chequeo de cada nave y la capitana, con las reglas vigentes (S35, S92).

S99. **Tab Comprar buque.** El constructor de cero, separado de la reforma (decisión del usuario: "Refit y compra separados").
- Catálogo de cascos con selector de país, baterías, dotación y carga: es el mismo constructor, en modo compra.
- Su acción de pie es **Añadir a la flota**, con las reglas de precio y viabilidad de siempre.
- El constructor es **una sola** pieza de DOM: no hay dos estados de construcción en paralelo. El tab que lo monta depende del modo (compra aquí, reforma en Flota); entrar en un modo u otro no conserva basura del otro. Las reglas de siempre se mantienen: reformar no deja cambiar de casco ni de país (S26), comprar sí.

S100. **Tab Astillero.** Mejorar la defensa de la fortificación.
- El panel del fuerte (estado, casco, guarnición, cañones, victorias) vive dentro de este tab (hoy está en la barra superior).
- **Reparar el fuerte**: con doblones se repone el casco y la guarnición dañados tras un asedio o una recuperación, usando la base de la reparación existente.
- **Comprar cañones**: cañones adicionales para el fuerte, más allá de los que gana por victorias. Decisión del usuario del precio: "Barato + configurable".
- El astillero tomado no vende ni repara: sólo un fuerte propio se puede mejorar.
- El total de cañones del fuerte (base por costado + premio por victorias + comprados) es el que miden `createFortCombatant` y el panel.

S101. **Tab Configuración.** La pantalla de configuración entra al Astillero (decisión del usuario: "Config como 4to tab adentro").
- Los grupos de ajustes (`SETTINGS_FIELDS`) y el editor de catálogo se montan dentro del tab, con Guardar y Restablecer.
- `config.html` pasa a redirigir al Astillero con el tab de configuración activo (los enlaces viejos no se rompen).
- Lo que la configuración ya cubre (S33, S88, turnos, viento, catálogo) no cambia de comportamiento: cambia de domicilio.

S102. **Los números de la defensa nueva son configurables.**
- El coste de reparar el fuerte sale del modelo de reparaciones existente sobre su condición.
- Cada cañón extra cuesta **400 doblones**, con tope de **+6 por costado** sobre la batería total del fuerte.
- Ambos números (coste por cañón y tope) se exponen en la pantalla de Configuración desde el día uno, como el resto de los SETTINGS.

S103. **Todo rótulo nuevo habla los dos idiomas.** Claves i18n es/en para tabs, acciones, avisos y confirmaciones del tab Astillero y del tab Comprar. Ningún texto crudo en el markup ni en el JS.

S104. **Verificación.**
- `npm test` completo en verde; un test de modelo con RED observado por cada regla nueva de S100/S102 (reparación del fuerte, tope y coste de cañones, guardado del total).
- Los smokes cuya aserción pinta la pantalla vieja se actualizan al nuevo layout **con autorización explícita del usuario** (dada: "Sí, actualizarlos con el refactor"). Ningún smoke se degrada para pasar: si una aserción falla por un defecto real de código, se arregla el código.
- Un smoke nuevo recorre los cuatro tabs: cambia de tab, compra un buque en Comprar, reforma en Flota y compra cañones en Astillero.
- Regla vigente: ningún test que existió antes se edita sin confirmación; los smokes de layout están cubiertos por la autorización de arriba, el resto no.

## Tasks

- T112 — `index.html` + `src/ui/styles.css`: esqueleto de tabs (Flota / Comprar buque / Astillero / Configuración), barra superior limpia (sin flota ni fuerte), pie global con veredicto y acciones por modo; mover la barra de flota y el panel del fuerte dentro de sus tabs. `S97,S98` — inline — hecho, commit `6318bf8`
- T113 — `src/ui/app.js`: variantes del constructor (compra / reforma), renders en el tab que corresponde, acciones de pie por modo (Añadir a la flota / Guardar reforma / Zarpar en Flota). `S98,S99` — inline — hecho, commit `6318bf8`
- T114 — `src/model/fort.js` + guardado: reparar el fuerte y comprar cañones con tope y coste configurables; el total alimenta `createFortCombatant`; tests con RED. `S100,S102` — inline — hecho, commit `1091c10`
- T115 — `src/ui/app.js` + styles: tab Astillero con panel del fuerte, reparar y comprar cañones; avisos de bolsa y tope. `S100` — inline — hecho, commit `6318bf8`
- T116 — `src/ui/settings-tab.js` + `config.html` redirigido con hash `#configuracion`: ajustes y catálogo dentro del tab, repintado por cambio de idioma compartiendo el traductor de la página (leído a la hora de la llamada). `S101` — inline — hecho, commit `b92e40c`
- T117 — i18n `es.js`/`en.js`: todos los rótulos de los cuatro tabs y avisos nuevos. `S103` — inline — hecho, commit `6318bf8`
- T118 — smokes: actualizar los que pintan la pantalla vieja (autorización en S104), smoke nuevo de recorrido de tabs, `npm test` y la serie de smokes en verde. `S104` — inline — hecho, commit `dfe7236`
- T120 — `index.html` + `src/ui/styles.css` + `src/ui/app.js`: S105, cada room con la grilla original de tres columnas y su panel izquierdo propio; configuración en varias columnas; slots de aparcamiento destapados al mudar los paneles. `S105` — inline — hecho, commit `d895d04`
- T121 — smokes: entrar al room que posee cada control (flota/comprar/astillero) antes de operarlo; aserciones de smoke-tabs al comportamiento nuevo. `S105` — inline — hecho, commit `d895d04`
- T122 — `src/ui/styles.css`: S106, plantilla propia de los rooms de flota/astillero, slots transparentes, panel de flota a alto completo. `S106` — inline — hecho, commit `70162f1`
- T123 — `src/ui/sea.js` + `scripts/smoke-escort-range.mjs`: S107, arcos de tiro para toda la línea; smoke con RED observado (arcos desde un solo casco) y GREEN. `S107` — inline — hecho, commit `70162f1`
- T124 — `index.html` + `src/ui/app.js` + `styles.css` + i18n: S108, panel común del casco seleccionado con sus barras y sus dos acciones; filas de flota sin botones. `S108` — inline — hecho, commit `62be33e`
- T125 — `src/ui/app.js` + `src/ui/sea.js`: S109, el boot no elige room y el mar desembarca en `#comprar`. `S109` — inline — hecho, commit `62be33e`
- T126 — smokes: reparar y vender ahora pasan por el panel del casco elegido; los que desembarcan entran al tab Flota y aceptan la URL con hash. `S108,S109` — inline — hecho, commit `62be33e`
- T127 — `src/model/turning.js` + `ship-model.js` + `src/ui/sea.js` + settings + i18n: S110, regla de maniobra por casco ligero, cableada en capitana, escoltas y enemigos, con aviso en el constructor. `S110` — inline — hecho, commit `pending`
- T128 — `src/model/repair.js` + `refit.js`: S111, la carga suma al valor y por tanto al coste de reparar y al precio de venta; `hullValue` separa el valor persistido. `S111` — inline — hecho, commit `pending`
- T119 — cierre: `pendientes.md` al día, espejo Engram del documento, log de la ficha con evidencia. `S104` — inline — hecho, commit `2bad095`

## Log

- L1. Pedido original (verbatim): "vamos a refractorizar la pantalla de astillero, creando tabs, uno para pa flota con el panel de buque, aparejo, y todo lo que es reformar y zarpar; otro tab para cuando quiero comprar un buque, otro para el astillero si quiero mejorar la defensa etc, otro para la configuracion etc".
- L2. Decisiones del usuario (cuestionario): Configuración como 4to tab adentro; el tab Astillero ofrece reparar el fuerte Y comprar cañones ("Ambas cosas"); refit y compra separados entre Flota y Comprar buque; precios "Barato": reparación base 1× el modelo de reparaciones existente de la nave equivalente, cañón extra 400 dl, tope +6 por costado — toda la economía de la defensa configurable desde Configuración ("Barato + configurable").
- L3. Autorización de smokes (cuestionario): "Sí, actualizarlos con el refactor" — los smokes que pintan la pantalla vieja se actualizan al layout nuevo; los que fallen por defecto real de código arreglan el código, no la aserción. Layout: "Limpios: cada cosa en su tab" — la barra de flota y el panel del fuerte NO quedan arriba, viven dentro de su tab.
- L4. Riesgo señalado al usuario y aceptado en L3: ~25 smokes de navegador usan selectores de la pantalla actual (`hull-list`, `fleet-list`, `fort-panel`, `launch-btn`, `config.html`...). El refactor los rompe a propósito; la actualización de cada uno conserva el alcance de su aserción.
- L5. Marco de la economía nueva: reparar el fuerte sólo alcanza la condición del propio fuerte (hoy no existe reparación de fuerte; se apoya en `src/model/repair.js` como referencia de coste); la compra de cañones es acciones sobre el estado del fuerte en `barcos:game:v1`, que ya guarda `fort.condition` y `fort.status`.
- L6. T114 (commit `1091c10`): la economía del refuerzo (400 dl por cañón, tope +6 por costado = máx. 6 compras, reparación con `repairPinch` 800 dl) vive en el bloque vivo `FORT_UPGRADE`; `SETTINGS_FIELDS` suma el grupo `fortUpgrade` (gunCost, maxPerSide, repairPinch); `fortGunsPerSide` y `fortGunHeadroom` unifican base + victorias + compradas (el tope es sobre el total por costado); `sea.js` persiste y restaura `fort.boughtGuns`. RED observado (13 fallos por exports ausentes) → 13/13 verde; `npm test` 650/650. Un defecto aritmético mío en el test (headroom con victorias) se corrigió en el test, no en el modelo.
- L7. T112/T113/T115/T117 (commit `6318bf8`): los cuatro tabs viven; el constructor es un único DOM (`#builder`) que se re-parenta entre los slots de Flota y Comprar; el pie muestra sólo las acciones del tab; comprar lleva a Flota y reformar abre Flota. Defectos reales cazados y arreglados: (a) `builderEl` apuntaba al slot y no al contenido (HierarchyRequestError); (b) `launch()` no revalidaba la bolsa en una segunda invocación directa — compraba en deuda; lo cazó smoke-shipyard-buttons y se arregló en el código con el guard `ship.price.total > state.gold`; (c) `renderFort` mostraba la clave cruda del i18n para el botón deshabilitado. Las claves nuevas usan prefijo `shipyard.` para pasar el guardián S11 de claves huérfanas (i18n-catalogue). Smokes actualizados con la autorización de L3: smoke-fleet, smoke-refit, smoke-shipyard-buttons (la aserción de compra repetida ahora observa el botón de vuelta en Comprar, y la revalidación real quedó probada en código), smoke-images (geometría absoluta), smoke-settings (15 bloques). Los 25 smokes de index.html en verde.
- L8. T116 (commit `b92e40c`): settings-tab.js reusa el renderizado de config.js; config.html redirige a `index.html#configuracion`; el hash decide el tab de entrada. El módulo importa antes de que app.js publique su traductor, así que `t()` resuelve el traductor compartido a la hora de la llamada. smoke-settings adaptado: el h1 de la página es la marca (Shipyard), no "Settings".
- L9. T118 (commit `dfe7236`): smoke-tabs.mjs nuevo recorre los cuatro rooms con las cuatro reglas de S97-S101 (reparentado único del builder, compra aterriza en Flota, reforma dentro de Flota, fort con su reparación/cañón, settings dentro con clamp, redirect de config.html). Los 46 smokes en verde (smoke-safe-zone flakeó en serie, verde solo). npm test 650/650. smoke-image-rotation: el catálogo del tab Configuración comparte [data-hull-id] con el estante; el smoke ahora apunta a .hull-card[data-hull-id].
