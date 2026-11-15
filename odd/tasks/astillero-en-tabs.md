# Juego de barcos — astillero en tabs

Estado: en curso. S97+. Refactor de la pantalla del Astillero a navegación por tabs, y mecánica nueva de defensa del fuerte. Master pendiente de decidir rama: la feature arranca sobre `feat/t7-combate-costados` como las anteriores; si el usuario pide otra rama, se crea antes del primer commit.

## Specs

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

- T112 — `index.html` + `src/ui/styles.css`: esqueleto de tabs (Flota / Comprar buque / Astillero / Configuración), barra superior limpia (sin flota ni fuerte), pie global con veredicto y acciones por modo; mover la barra de flota y el panel del fuerte dentro de sus tabs. `S97,S98` — inline — pendiente
- T113 — `src/ui/app.js`: variantes del constructor (compra / reforma), renders en el tab que corresponde, acciones de pie por modo (Añadir a la flota / Guardar reforma / Zarpar en Flota). `S98,S99` — inline — pendiente
- T114 — `src/model/fort.js` + guardado: reparar el fuerte y comprar cañones con tope y coste configurables; el total alimenta `createFortCombatant`; tests con RED. `S100,S102` — inline — hecho, commit `1091c10`
- T115 — `src/ui/app.js` + styles: tab Astillero con panel del fuerte, reparar y comprar cañones; avisos de bolsa y tope. `S100` — inline — pendiente
- T116 — `src/ui/app.js`: tab Configuración montando ajustes y catálogo; `config.html` pasa a redirigir al Astillero con el tab activo. `S101` — inline — pendiente
- T117 — i18n `es.js`/`en.js`: todos los rótulos de los cuatro tabs y avisos nuevos. `S103` — inline — pendiente
- T118 — smokes: actualizar los que pintan la pantalla vieja (autorización en S104), smoke nuevo de recorrido de tabs, `npm test` y la serie de smokes en verde. `S104` — inline — pendiente
- T119 — cierre: `pendientes.md` al día, espejo Engram del documento, log de la ficha con evidencia. `S104` — inline — pendiente

## Log

- L1. Pedido original (verbatim): "vamos a refractorizar la pantalla de astillero, creando tabs, uno para pa flota con el panel de buque, aparejo, y todo lo que es reformar y zarpar; otro tab para cuando quiero comprar un buque, otro para el astillero si quiero mejorar la defensa etc, otro para la configuracion etc".
- L2. Decisiones del usuario (cuestionario): Configuración como 4to tab adentro; el tab Astillero ofrece reparar el fuerte Y comprar cañones ("Ambas cosas"); refit y compra separados entre Flota y Comprar buque; precios "Barato": reparación base 1× el modelo de reparaciones existente de la nave equivalente, cañón extra 400 dl, tope +6 por costado — toda la economía de la defensa configurable desde Configuración ("Barato + configurable").
- L3. Autorización de smokes (cuestionario): "Sí, actualizarlos con el refactor" — los smokes que pintan la pantalla vieja se actualizan al layout nuevo; los que fallen por defecto real de código arreglan el código, no la aserción. Layout: "Limpios: cada cosa en su tab" — la barra de flota y el panel del fuerte NO quedan arriba, viven dentro de su tab.
- L4. Riesgo señalado al usuario y aceptado en L3: ~25 smokes de navegador usan selectores de la pantalla actual (`hull-list`, `fleet-list`, `fort-panel`, `launch-btn`, `config.html`...). El refactor los rompe a propósito; la actualización de cada uno conserva el alcance de su aserción.
- L5. Marco de la economía nueva: reparar el fuerte sólo alcanza la condición del propio fuerte (hoy no existe reparación de fuerte; se apoya en `src/model/repair.js` como referencia de coste); la compra de cañones es acciones sobre el estado del fuerte en `barcos:game:v1`, que ya guarda `fort.condition` y `fort.status`.
- L6. T114 (commit `1091c10`): la economía del refuerzo (400 dl por cañón, tope +6 por costado = máx. 6 compras, reparación con `repairPinch` 800 dl) vive en el bloque vivo `FORT_UPGRADE`; `SETTINGS_FIELDS` suma el grupo `fortUpgrade` (gunCost, maxPerSide, repairPinch); `fortGunsPerSide` y `fortGunHeadroom` unifican base + victorias + compradas (el tope es sobre el total por costado); `sea.js` persiste y restaura `fort.boughtGuns`. RED observado (13 fallos por exports ausentes) → 13/13 verde; `npm test` 650/650. Un defecto aritmético mío en el test (headroom con victorias) se corrigió en el test, no en el modelo.
