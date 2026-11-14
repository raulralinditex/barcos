# Juego de barcos — escala honesta de las barras, ajustes y venta de naves

Estado: cerrado y verificado. S59-S64. Sigue a `estado-flota-y-reparacion-parcial.md` (S44), `barras-de-dano.md` (S52) y `artilleros-y-recarga.md` (S56).

## Specs

S59. El largo de la barra de condición dice el aguante real del casco, no su precio. Pedido (verbatim): "el tamaño de las barritas de los enemigos no esta en la misma escala que mis barcos, porque yo con una barra mas grande pierdo rapidamente contra un barco con las barras mas pequeñas". Decisión del usuario sobre el piso: **"Escala comprimida (raíz cuadrada)"**.
- El largo del bloque de condición de una nave es `sqrt(aguante) / sqrt(aguante máximo en pantalla)`, donde el aguante es `hullToughness` (el mismo número con el que `applyDamage` divide el daño del casco).
- Sin piso: la escala comprimida ya deja legible al casco más chico, así que no se toca ningún mínimo. Desaparece `BAR_SCALE.minShare` como piso del largo.
- Reemplaza el largo por valor en oro de S44. La función nueva es `hullBarShare(toughness, referenceToughness)` en `src/model/sea-hud.js`; `barWidthShare` y sus tests de S44 se retiran, con autorización explícita del usuario.
- El relleno de cada barra no cambia: sigue siendo el porcentaje de condición.
- Consecuencia declarada (decisión mía, sin pedido): un píxel perdido pasa a valer daño absoluto comprimido, porque el largo ya no es constante. Es monótono — más aguante, menos píxeles por el mismo daño — y es lo que hace comparables dos cascos.

S60. El daño de las zonas es configurable. Pedido (verbatim): "que el daño de las zonas sea configurable".
- Un multiplicador por zona (`costera`, `abierto`, `abismo`) que escala el daño que pega el enemigo de esa zona, con el valor de fábrica 1 en las tres: de fábrica el juego pega exactamente lo mismo que antes.
- Aplica al daño real y al daño esperado que leen las barras de daño por costado, para que la barra no mienta.
- Se edita en la pantalla de Configuración, en un grupo propio, y entra al cargar el mar o el astillero, como el resto de S33.

S62. Vender un barco propio por un porcentaje de su valor. Pedido (verbatim): "ahora quiero poder vender mis barcos por un % del valor".
- En la flota del Astillero, cada nave tiene un botón "Vender · {gold}" que paga `valor × share` en doblones enteros, redondeado hacia abajo.
- El `share` de fábrica es 0,5 (la mitad), el mismo criterio que ya usa el reembolso de la reforma (S50), y es un valor de la pantalla de Configuración.
- El valor de una nave es el que ya usa la reparación (`shipValue`, S40): lo pagado por ella, o el precio de catálogo de su casco si el guardado es viejo.
- **La última nave no se vende**: quedaría sin nada que navegar. Su botón sale deshabilitado y el modelo rechaza la venta.
- Vender a la capitana está permitido: la flota pasa a la siguiente nave en línea, igual que cuando se hunde (S36).
- La venta suma a la bolsa y se guarda en el acto, en la flota y en el guardado del mar.

S63. Capturar un enemigo rendido y que pase a la flota como propio. Pedido (verbatim): "ademas los barcos enemigos se pueden capturar, aparecer como mios y poderlos vender".
- Un enemigo **rendido** (el mismo umbral `COMBAT.surrenderCrewPct` que ya decide la rendición) se toma como presa: pasa a la flota del jugador y **no** deja pecio con oro, porque el jugador se queda con el casco.
- Un enemigo **hundido** sigue siendo un pecio con oro: al fondo del mar no se baja a buscarlo.
- La presa conserva el casco, los cañones que llevaba, la munición que le quedaba y la condición con la que se rindió. Su dotación es la superviviente. Hay que repararla y reponerla como cualquier nave.
- Su valor es el precio de catálogo del casco, porque no se pagó nada por ella.
- Entra marcada con `captured: true`, para que las pantallas puedan decir de dónde salió.
- No desplaza a la capitana. Si la flota no tiene capitana (el jugador perdió todas sus naves), la presa pasa a serlo: es la única forma de volver a navegar.
- Se avisa por pantalla con el nombre de la nave capturada.

S64. Vender el barco capturado. Pedido (verbatim): el mismo de S63 ("... y poderlos vender").
- Una presa se vende exactamente como cualquier otra nave de la flota (S62), con el mismo botón y el mismo porcentaje.
- Como su valor es el precio de catálogo de su casco, una presa vale lo que valga ese casco, no lo que costaron sus cañones.

S61. El botín del barco es configurable en porcentaje. Pedido (verbatim): "que el botin del barco sea configurable en %". Decisión del usuario: **"% del precio de catálogo, manteniendo los 50 fijos"**.
- El botín de un pecio es `precio de catálogo del casco × share + 50`, y después el factor de botín de la zona, como hoy. Se expone sólo el `share`, con el 6 % de fábrica; los 50 doblones fijos no se exponen.
- Se edita en la pantalla de Configuración, en el grupo de precios.

## Tasks

- T69 — `hullBarShare` en `src/model/sea-hud.js` y tests de S44 reescritos a la regla nueva (RED primero). `S59` — inline — done
- T70 — `src/ui/sea.js` dibuja el largo por aguante y `scripts/smoke-escort-hud.mjs` se actualiza. `S59` — inline — done
- T71 — `ZONE_DAMAGE` en `combat.js`, campos en `settings.js`, grupo en Configuración, i18n es/en, tests. `S60` — inline — done
- T72 — `LOOT.hullShare` en `combat.js`, campo en `settings.js`, i18n es/en, tests. `S61` — inline — done
- T74 — `src/model/sale.js` (venta, captura, presa) + `test/sale.test.js`. `S62,S63,S64` — inline — done
- T75 — Botón de venta en la flota del Astillero, captura al rendirse en el mar, i18n es/en, estilos. `S62,S63,S64` — inline — done
- T76 — `scripts/smoke-sale.mjs` (RED observado) y actualización del conteo de bloques en `smoke-settings.mjs`. `S62,S63,S64` — inline — done
- T73 — Regresión (`npm test` y los 30 smokes) y documentación. `S59,S60,S61,S62,S63,S64` — inline — done

## Log

L1 (verbatim): "el tamaño de las barritas de los enemigos no esta en la misma escala que mis barcos, porque yo con una barra mas grande pierdo rapidamente contra un barco con las barras mas pequeñas"

L2: Diagnóstico medido antes de tocar nada. Las barras usaban dos escalas y ninguna era fuerza: el largo del bloque de condición era proporcional al **oro pagado** (`paidGold`: casco + cañones + sueldos + víveres + munición) y el relleno de daño por costado era `sideCapacity` contra la banda más fuerte en pantalla. Caso reproducido: capitana patache con 6 falconetes por banda (valor 3573) contra un jacht de mar abierto (valor 700) — barra de 108 px contra 38 px, pero potencia de banda 14,6 contra 119,5. Tercer defecto anotado: el porcentaje de casco no es comparable entre cascos, porque `applyDamage` divide el daño por `hullToughness`.

L3: El usuario eligió el alcance: "que el largo diga la verdad, que el daño de las zonas sea configurable, y que el botin del barco sea configurable en %". Se abre S59, S60 y S61.

L4: Decisiones del usuario. Piso del largo con aguante real: "Escala comprimida (raíz cuadrada)" (medido: con el largo lineal el casco más chico quedaba en 4 px sobre 108; con la raíz queda en 20 px). Botín: "% del precio de catálogo, manteniendo los 50 fijos". Autorización explícita para reescribir los tests existentes de S44, que fijan la regla vieja.

L5: Routing. Un solo worker no aplica: las tres unidades comparten `src/model/settings.js` y los catálogos de i18n, así que las superficies de edición no son disjuntas y van inline, una detrás de otra.

L6 (verbatim): "ahora quiero poder vender mis barcos por un % del valor, ademas los barcos enemigos se pueden capturar, aparecer como mios y poderlos vender"

L7: Alcance nuevo, tres specs más. S62 vender un barco propio por un porcentaje de su valor; S63 capturar un enemigo rendido y que pase a la flota como propio; S64 vender el barco capturado. Se exploró antes de escribir: `removeShip` ya existe y devuelve la flota sin la nave (`src/model/fleet.js:26`); la rendición ya se detecta (`status === "surrendered"`, `src/ui/sea.js:1319`) pero hoy sólo se convierte en un pecio con oro (`wreckPrize`); la reforma ya tiene un reembolso parcial del 50 % (`REFIT.refundShare`, `src/model/refit.js:5`) como precedente de "un % del valor".

L8: Implementación de S62-S64. `src/model/sale.js` (nuevo, puro): `SALES.share`, `salePrice`, `sellShip`, `canSellShip`, `capturedShip`, `captureableShip`, `withPrize`. Reusa `removeShip` (la capitana vendida pasa el mando igual que cuando se hunde) y `shipValue` (S40). La captura se dispara en `resolveDefeatedEnemies` (`src/ui/sea.js`), que devuelve `null` para el enemigo capturado y filtra los nulos para no dejar huecos en `world.encounters`. El botón de venta vive en cada fila de la flota del Astillero.

L9: Dos defectos propios encontrados y corregidos antes de cerrar. (a) El multiplicador de zona se congelaba al crear el enemigo, así que cambiarlo en Configuración no afectaba a un combate ya abierto: pasó a leerse en vivo con `damageFactorOf`, y hay un test que lo fija. (b) `resolveDefeatedEnemies` devolvía `null` dentro de un `map` sin filtrar, lo que dejaba un hueco en la lista de encuentros.

L10: Evidencia. `npm test` 447/447 (29 tests nuevos entre `test/zone-damage.test.js` y `test/sale.test.js`; los 8 de S59 reemplazan a los de S44 en `test/sea-hud.test.js`). RED observado en los tres frentes: módulo `sale.js` inexistente, `hullBarShare` inexistente y, en el navegador, `smoke-sale.mjs` fallando las cuatro comprobaciones de captura con el código de captura anulado a propósito. GREEN: los 30 smokes con exit 0, uno por vez. `git diff --check` limpio.

L11: Medición de S59 con el catálogo, sobre 108 px: barca costera 20, pinaza 25, patache 29, jacht 27, zabra 45, galeón pequeño 39, galeón de guerra 74, gran buque real 108. Coincide con la tabla que el usuario eligió al decidir la escala comprimida.

L12: Ajuste necesario en `smoke-escort-hud.mjs`, no cosmético: con la capitana en galeón-pequeño (aguante 0,75) y la escolta en zabra (1,00), la escolta pasaba a ser la nave más dura de la pantalla y medía lo mismo que la capitana, así que la comprobación "la escolta no muestra barras mientras no tiene enemigo a tiro" no podía distinguir a quién veía. El escenario se invirtió (capitana zabra, escolta galeón-pequeño) y ahora las tres barras miden distinto: 108, 94 y 70.

L13: La cifra "cinco bloques" de `smoke-settings.mjs` pasó a ocho, por los tres grupos nuevos (daño por zona, botín, venta de naves). Es una aserción de conteo, no de comportamiento.

L14: Sin commitear, como el resto del árbol de trabajo. El merge y el PR los hace el usuario.

L15 (verbatim): "vamos a dejar una zona de seguridad alrededor del astillero donde los barcos enemigos no pueden acercarse\n\nvamos a hacer que donde indica un dia(racion, soldada,etc), sea un tiempo en segundos determinado pongamos 100s por defecto pero es configurable\n\nademas, como el alcance depende del tipo de arma y municion, bamos a dibujar con un circulo el alcance, y mostrar o esconder configurable"

L16: Tres specs nuevas. S66 zona de seguridad alrededor del astillero; S67 el día de juego pasa a durar un tiempo configurable en segundos (100 s de fábrica), sin migrar la unidad del modelo; S68 círculo de alcance por costado según la munición cargada, con visibilidad configurable.

L17: Decisiones del usuario. Suministro: "Lo anterior + cobrar la soldada al consumirse" — el suministro se agota con el reloj del mundo y la soldada se cobra al consumirse, activando `fleetUpkeep`, que existía y nadie cobraba. Unidad: "queda todo igual excepto que los calculos de manutencion soldada etc que en la vida real son en dias, el tiempo de juego de un dia corresponde a 100s, el resto continua igual" — **no se migra** `days` a segundos: se agrega `TIME.gameSecondsPerDay` (configurable) y todo lo que hoy es "por día" se cobra por día de juego consumido. Círculo: "Alcance real por costado, según la munición".

L18: Hallazgo de exploración, medido: hoy `days` sólo pesa y cuesta; nadie lo consume, y `fleetUpkeep` (`src/model/fleet.js:72`) no tiene llamadores. `world.timeS` ya acumula el tiempo del mundo, así que la reserva se descuenta de ahí sin inventar un reloj nuevo.

L19 (verbatim): "vamos a cambiar las reglas de los disparos, la primera ondonada una vez se enganchan los barcos, tiene un % mas de daño y efectividad, a partir de aqui cada pieza dispara segun su tiempo de recarga, si se cambia de municion el tiempo de recarga aumenta en un % , mostramos el alcance de las diferentes piezas activas"

L20: S69-S71. S69 la primera andanada al enganchar lleva bonus de daño y de efectividad; S70 cambiar de munición cuesta un % de tiempo de recarga; S71 los arcos de alcance se iluminan cuando el costado tiene todas sus piezas listas.

L21: Decisiones del usuario. Primera andanada: "Una vez por costado, al abrir el fuego" — el bonus se cobra la primera vez que cada costado dispara contra el enemigo recién enganchado. Alcance activo: "Sólo mejorar los arcos, sin lista nueva" — no se agrega una lista de piezas al HUD; el arco de cada costado se ilumina cuando ese costado está listo.

L22: Nota de exploración. "Cada pieza dispara según su tiempo de recarga" ya es el comportamiento actual: cada pieza tiene su propio `reloadTimer` (`src/model/combat.js:519`) y `fireBroadside` sólo toma las que están listas. Lo que falta es el bonus de apertura y el coste de cambiar munición. La andanada de apertura hoy existe pero sin bonus.

L23: Defecto chico encontrado al escribir el smoke de S69/S70, anotado y NO corregido todavía: `firePlayerBroadside` muestra el aviso "Recargando el costado de {side}" cuando `volley.length === 0`, sin distinguir si la causa es que las piezas recargan o que el blanco quedó fuera del alcance real de la munición cargada (S68). Al cambiar a cadena el alcance baja a 245 m en el minion, y un enemigo que la IA aleja deja de estar a tiro: el jugador lee "recargando" cuando en realidad no llega. Es una corrección de mensaje, no de regla.

L24: El smoke `scripts/smoke-opening-broadside.mjs` quedó en RED por esa misma causa (el enemigo se mueve y la comparación de recarga se hace contra un disparo que no ocurrió). Pendiente de reescribir con un enemigo que no se desplace, o midiendo la recarga en el modelo y no en el navegador.

L25 (verbatim): "vamos a poner una bandera de su pais a cada barco/flota mostrado, la bandera sera la de la capitana"

L26: S72. Cada barco dibujado en el mar (la capitana, las escoltas y los enemigos) lleva la bandera del país que enarbola. Decisión del usuario: "Siempre la de la capitana, sin excepción" — la flota entera ondea la bandera de la capitana, presas de otro país incluidas. Un enemigo ondea la bandera de su propio casco.

L27 (verbatim): "cuando se engancha una nave enemiga, mostramos un dialogo de esa nave con tres barras, hagamos lo mismo con nuestras naves, cuando se enganchan mostramos las 3 barritas, para las enemiga y las nuestras, asi podemos compara facilmente como va el combate"

L28: S73. El panel de objetivo pasa a ser un panel de duelo. Decisión del usuario: "panel de duelo con todas las naves enfrentadas" — una sola lista con **todas** las naves enganchadas, las propias y las enemigas, cada una con sus tres barras de condición (casco, aparejo, tripulación), para comparar de un vistazo. Reemplaza al panel que hoy muestra sólo el enemigo más cercano.
- "Enganchada" es lo mismo que ya usa el juego: un enemigo en combate dentro de `COMBAT.engageRadiusM`, y una nave propia con un enemigo a tiro de ella (S54).
- Las naves propias se distinguen de las enemigas de un vistazo, y el orden pone primero lo propio y después lo hostil, cada grupo por cercanía.

L29: Dos smokes en rojo al cerrar S73, ambos pendientes y anotados, no corregidos:
- `scripts/smoke-combat.mjs` busca `#target-panel`, que S73 reemplazó por `#duel-panel`. Es un cambio de selector, no de comportamiento: hay que actualizarlo a la interfaz nueva.
- `scripts/smoke-opening-broadside.mjs` sigue fallando en S70 porque el enemigo se mueve y el disparo con munición cambiada no llega a salir (ver L23-L24). La comparación de recarga debe hacerse en el modelo, no en el navegador.

L30 (verbatim): "vamos a mejorar la funcionalidad del astillero en el mapa, el astillero se comporta como una nave estatica, con dotacion de armas y daño efectivo a las naves enemigas, la zona de esculsion la zona de esclusion la mantenemos, pero configurable, con lo que si ponemos distancia de exclusion 0 es como si no hubirera, la idea principal es que un astillero, igual que una nave puede rendirse y ser capturado por el enemigo, partimos de una defensa y casco por defecto configurable, pero puede ser aumentada el numero de piezas de artilleria y soldados a voluntad."

L31: Decisiones del usuario para S74. Al caer: "Cierra el puerto: pierdes reparar y zarpar". Quién ataca: "Sólo los enemigos del abismo". Ampliación: "Crece automáticamente, sin comprar" (cada 5 victorias, +1 cañón). Dónde se gestiona: "Sólo en la pantalla del Astillero".

S74. El astillero es un combatiente estático. Pedido (verbatim, en L30).
- El astillero tiene casco, aparejo no aplica, tripulación (soldados y artilleros) y una batería, como una nave. Combate con las mismas reglas: `applyDamage`, umbral de rendición por tripulación (`COMBAT.surrenderCrewPct`) y de hundimiento por casco.
- Defensa y casco por defecto **configurables** en la pantalla de Configuración (grupo propio), y crecen **automáticamente**: cada 5 victorias del jugador suma 1 cañón al astillero, sin compra ni interfaz de compra.
- La **zona de exclusión** (S66, hoy `WORLD.safeZoneM`) se mantiene y sigue siendo configurable; con 0 no hay zona, como ya hace `safeZoneRadiusM()`.
- **Sólo los enemigos de la zona del abismo** atacan el astillero. Un enemigo de aguas costeras o de mar abierto lo ignora, aunque pase por al lado.
- El astillero **puede rendirse** (tripulación bajo el umbral) y ser **capturado**: al caer, el puerto **cierra** y el jugador pierde la reparación y el zarpe hasta recuperarlo. No es game over.
- Se gestiona y se ve **sólo en la pantalla del Astillero** (`index.html`), en su propia sección: estado, casco, tripulación, cañones y si está en manos propias o tomado.

## Tasks (S74)

- T87 — Modelo puro `src/model/fort.js`: creación del combatiente estático, daño, rendición, captura y crecimiento por victorias + tests (RED primero). `S74` — inline — pendiente
- T88 — Configuración: casco y defensa por defecto del astillero, grupo propio, i18n. `S74` — inline — pendiente
- T89 — Mar: los enemigos del abismo atacan el astillero, y el puerto cerrado bloquea reparar y zarpar. `S74` — inline — pendiente
- T90 — Pantalla del Astillero: sección con estado y crecimiento. `S74` — inline — pendiente
- T91 — Smoke de navegador y regresión completa. `S74` — inline — pendiente

L32: Estado real de S74 al cerrar esta tanda. Hecho y verificado: `src/model/fort.js` con 24 tests; los cinco campos de configuración del astillero con i18n; el astillero cableado en el mar (`updateFortCombat`, `fortFire`, `damageFort`, victorias que hacen crecer la batería, guardado y restauración de su condición y su estado); el bloqueo de reparar en puerto con el astillero tomado; y el bloqueo de "Zarpar" en la pantalla del Astillero, con su smoke (`scripts/smoke-fort.mjs`, RED observado al quitar el bloqueo). `npm test` 569/569.

L33: Lo que falta de S74, sin hacer: (a) que el astillero aparezca en el panel de duelo y en el mapa con su estado; (b) T90, la sección de estado del astillero en la pantalla del Astillero; (c) el smoke del combate del astillero (que un escuadrón del abismo le pegue y la rinda), que hoy sólo está cubierto en el modelo.

L34 (verbatim): "busquemos todos los valores hardcodeados que hay en el codigo y hagamoslos configurables, hagamos poder crear tipos de naves y tambien tipos de armas en la zona de la configuracion asi como variar los valores por defecto de las naves historicas y armas historicas siempre dentro de un margen historico."

L35: Decisiones del usuario para S75. Orden: "Terminar S74 primero, después el catálogo". Qué es tuning: "Sólo las constantes de diseño ya nombradas" (16 bloques, ~90 campos; no los ~1250 literales). Cascos: "Crear cascos nuevos desde Configuración" (los históricos no se editan en su identidad, pero sí sus valores por defecto dentro de margen). Margen: "Margen por campo, sacado de la procedencia del dato" (R4, R6), no un porcentaje global.

L36: Medición de partida para S75: 16 bloques de tuning exportados, 52 campos configurables hoy, ~1250 literales numéricos en modelos y datos, 15 cascos y 11 piezas en el catálogo. Los literales de aritmética (`Math.PI/3`, el `2` de un `*2`) no se convierten: no son decisiones de diseño.

L37: `scripts/smoke-fort-combat.mjs` NO cierra: se colgó a los 900 s de reloj de pared. Diagnóstico medido: el asedio de un galeón contra un astillero sano dura ~55 s de tiempo de mundo, y cada cañón de 32 libras recarga en 9 s de ese reloj, así que el casco baja en oleadas (1,16 de casco en 10 s de pared). El smoke espera de verdad, y 900 iteraciones de 500 ms no alcanzan a cubrir los 55 s de mundo porque el bucle pierde tiempo. **Pendiente**: medir el asedio en el modelo (que ya funciona: 55 s, 134 andanadas) y dejar el smoke sólo para la consecuencia que el jugador ve —el puerto cerrado—, con el astillero sembrado ya tomado. No es un defecto del juego; es un smoke mal planteado.

L38 (verbatim): "las imagenes que hemos conseguido de las diferentes naves historicas via web, si tenemos mas de una, que cada se vaya cambiando ca vez que cliqueo en la nave, haz otra busqueda en la web para conseguir mas imagenes de cada nave"

S76. Varias imágenes por casco, que rotan al clicar. Decisiones del usuario: buscar "en toda la web" y "clic en el casco pasa a la imagen siguiente, en ciclo".
- Criterio propio, más estricto que el pedido: sólo entra una imagen si autor, licencia y fuente se pueden citar desde su página de origen. Se descartaron `Spanish_Galleon.jpg` (atribución disputada entre Durero y anónimo) y `Engagement between a Spanish galleon and a Dutch ship` y `Pinque.jpg` (sin plantilla de licencia legible). No se buscó fuera de Wikimedia Commons: lo que no se puede verificar no se usa.
- Modelo (`src/model/ship-image.js`): `shipImagePath(id, index)` — la primera sigue siendo `<id>.jpg`, las siguientes `<id>-2.jpg`, `<id>-3.jpg`; `shipImagePaths(credits, id)`; `nextImageIndex`. `credits.json` admite `{ "pictures": [ ... ] }`. Una imagen sin crédito completo no se muestra.
- Se agregaron 3 segundas imágenes (de 15 cascos con 1 imagen → 18 imágenes): `nao-armada-2` (carraca del XV, dominio público), `galeaza-2` (galeaza veneciana del Museo Naval, CC BY-SA 3.0, obra derivada por redimensionado), `barca-costera-2` (lugre costero, grabado de **1826**, posterior al casco de 1586: se muestra como tipo y así consta en el crédito). Todas ≤ 900 px y < 200 KB.
- Evidencia: 19 tests de `ship-image` (los nuevos recorren **todas** las imágenes que promete el crédito; el test viejo sólo mira `<id>.jpg`); `scripts/smoke-image-rotation.mjs` con RED observado (sin la rotación la imagen y el crédito no cambian) y GREEN: imagen y crédito cambian juntos (van de Velde → Baugean) y a la tercera vuelve a la primera.
- **CONFLICTO ABIERTO**: `scripts/smoke-images.mjs` (S41) exige que *clicar la imagen ampliada la cierre*. La rotación usa ese mismo clic. No toqué el smoke (regla global: no editar tests existentes sin confirmación). Ver decisión pendiente.

S77. Los doblones iniciales son configurables. Pedido (verbatim): "el numero de doblones con el que empezamos es configurable".
- `STARTING_GOLD` sigue siendo la constante de fábrica (12000) porque los tests de balance se escriben contra ella; la copia viva es `START.gold` (`naval-data.js`), campo `prices.startGold` de Configuración.
- Rango 2500–1 000 000. El mínimo no es arbitrario: el casco jugable más barato por país cuesta 1097 (Inglaterra), 1595 (Países Bajos), 1795 (España) y **2036 (Portugal)**; menos de eso dejaría a la capitana de un país sin poder comprar ni un barco. Un test lo exige para los cuatro países.
- Sólo rige para una partida **nueva**: `loadGold()` pisa el valor con la bolsa guardada, así que una partida en curso conserva la suya.
- Defecto que anticipé y la prueba confirmó: `state` se construye en la línea 94 de `app.js`, antes de `bootSettings()` (línea ~1554), así que sólo cambiar la constante no habría tenido efecto. Se vuelve a fijar `state.gold` justo después de `bootSettings()`.
- Evidencia: 8 tests (`test/start-gold.test.js`); `scripts/smoke-start-gold.mjs` con RED observado (sin el cableado la partida nueva abre con 12000 en vez de 20000) y GREEN en los cuatro casos: partida nueva = 20000, sin ajuste = 12000, partida guardada conserva 777, ajuste absurdo se recorta a 2500. `npm test` 589/589.

L39: Cierre de L37 (smoke del asedio del astillero). Tres hallazgos, en orden.
1. **Causa de que no cerrara**: el smoke armaba al escuadrón por la vía normal, y `ensureEnemyCombat` (`src/ui/sea.js`) arma a un enemigo con `currentZone()`, la zona **donde está el jugador** (costera, junto al puerto): medido, 12 piezas ligeras en vez de las 34 pesadas del abismo. No es un defecto del juego —un enemigo del abismo que persigue al jugador hasta el puerto conserva el armamento con el que se enganchó— sino un escenario mal armado. Se siembra el `combat` del escuadrón con su zona real.
2. **Dos aserciones mías mal planteadas**: "el astillero arranca sana" se leía del navegador ya con el combate en marcha (guarnición 92 a los 1,5 s); ahora se verifica sobre lo sembrado. Y la espera pasó de contar vueltas a un tope por reloj de pared (150 s): con el asedio sin terminar cada vuelta tarda ~4,6 s y 280 vueltas fueron **22 minutos** (el `alarm` de perl no cortó a node).
3. **Evidencia**: VERDE a los 55 s de pared, guarnición 91 → 40, el astillero se rinde y la tecla R rechaza reparar. RED (sin el bloque `if (assaulting)` del bombardeo): el smoke falla con la guarnición en 99 y el aviso "No hay nada que reparar". `src/ui/sea.js` verificado idéntico al respaldo tras el RED (`cmp`), `npm test` 589/589.

Pendiente de L33 que sigue sin hacer: (a) que el astillero aparezca en el mapa con su estado más allá del aro rojo; (c) ya cubierto por este smoke. El punto (b), la sección del Astillero (T90), está hecho.

L40: `scripts/smoke-opening-broadside.mjs` (S69-S71) cerrado, y con una corrección de fondo. Su chequeo de S71 ("el arco del costado listo se dibuja sólido") **no medía nada** desde la primera versión: pasaba con el arco apagado, y yo había dado ese verde por bueno sin hacer nunca el RED. Dos causas: el alfa del píxel del canvas vale siempre 255 (el mar es opaco), así que la opacidad de la línea no se ve ahí; y el filtro de tono aceptaba cualquier celeste claro, como las barras de recarga. Rehecho midiendo sólo el **anillo** del arco, en la fase de hierro (el enemigo está en alcance; con cadena a 245 m la IA lo aleja y el segundo disparo nunca sale).
- Evidencia: VERDE ×4 con 788 px sólidos (listo) y 0 (recargando), sin variación. RED ×2 forzando `ready = false`: falla las dos veces con 141 px contra el umbral de 400. Un primer umbral de 30, puesto a ojo, dejaba pasar ese RED; el de 400 está calibrado con lo medido (sólido ~790, tenue 0-141). `sea.js` verificado idéntico al respaldo (`cmp`). `npm test` 589/589.
- Se quitó del smoke la comparación de recarga de S70 (se mide mal en navegador con enemigo móvil); esa regla queda fijada por los 10 tests del modelo en `test/opening-broadside.test.js`. En el navegador sólo queda que la tecla 2 cargue cadena.
- Lección general para el resto de smokes: **un verde sin RED observado no es evidencia**. Los smokes de S69/S71 y el de banderas (S72) se escribieron antes de que yo midiera esto; el de banderas sí tuvo RED, el de duelo (S73) también, pero conviene revisar con el mismo criterio cualquier chequeo que cuente píxeles de color sobre todo el canvas.

L42 (verbatim, autorización): "Sí, a 10 bloques" / "Como está: 1er clic amplía, siguientes rotan" / "Sí, a #duel-panel". Los tres bloqueos de L41 quedan desbloqueados por decisión explícita del usuario. Los tres smokes tocados son tests existentes, así que se aplicó la regla global: RED observado antes de dar el verde por bueno.

S78. Los tres smokes de la tanda vuelven a correr.
- `scripts/smoke-settings.mjs:79`: `groups.length` pasa de 9 a 10. El bloque "Astillero" (S74) es real, la aserción estaba vieja.
- `scripts/smoke-combat.mjs`: el selector `#target-panel` pasa a `#duel-panel`, y las dos lecturas del panel viejo se reescriben contra el roster de S73. `#target-hull` (el `style.width` de la barra de casco) pasa a `.duel-row.is-theirs .duel-bar-hull .duel-fill-hull` (primera fila enemiga), y `#target-name` a `.duel-row.is-theirs .duel-name` (primer nombre enemigo). Es el mismo dato: un porcentaje 0..100 en el ancho del relleno. `targetHull` devuelve 0 cuando no hay fila enemiga, que es lo que el chequeo necesita cuando el enemigo ya se hundió.
- `scripts/smoke-images.mjs`: el bloque "A click on the enlarged picture closes it" se reescribe a la regla de S76. Ahora verifica que el clic **rota** (src y crédito cambian juntos, la imagen nueva carga, el panel sigue ampliado), que la rotación **cierra el ciclo** (un clic más vuelve al primer `src`) y que el zoom se cierra con Escape (vuelve a la altura del pulgar) y con un clic afuera. Se fue la aserción `closedByClick` de S41.
- Evidencia: los tres verdes. `smoke-settings` (10 bloques, clamp y traducción), `smoke-images` (15/15 imágenes cargan, rotación y crédito juntos, ciclo completo, Escape y clic afuera) y `smoke-combat` (engancha contra una Zabra, el costado vacío no dispara, 960→936 rondas, casco 100→0, pecio de 182 doblones).
- RED observado en dos de los tres, porque las aserciones nuevas son mías y un verde sin RED no prueba nada: en `smoke-images`, con el clic viejo (cerrar en vez de rotar) inyectado en `app.js`, fallan las tres aserciones nuevas ("did not turn to the next picture", "the credit did not follow", "closed instead of turning the page"); en `smoke-combat`, con `duelVisible` forzado a `false`, fallan "the target panel never appeared" y "the enemy hull never dropped (0 -> 0)". El tercero (`smoke-settings`) es un cambio de número contra un conteo real del modelo, sin comportamiento nuevo que probar. `src/ui/app.js` y `src/model/duel-panel.js` verificados idénticos al respaldo (`cmp`) tras cada RED.

## Estado al guardar (L41)

Hecho y verificado: S59-S73 (barras por aguante, daño por zona, botín, venta y captura, cambio de munición, zona de seguridad, día de juego, alcance, primera andanada, banderas, panel de duelo); S74 completo (modelo, configuración, combate, bloqueo de puerto, sección del Astillero, smokes del bloqueo y del asedio con RED); S76 (imágenes múltiples); S77 (doblones iniciales). `npm test` 589/589.

Desbloqueado por decisión del usuario en L42 (S78): los tres smokes corren de nuevo y quedan verdes con RED observado. Nada sigue bloqueado por tests existentes.

Pendiente sin empezar: S75, catálogo editable (16 bloques de tuning ~90 campos; crear cascos y armas nuevos; margen histórico por campo sacado de la procedencia R4/R6 del dato; los cascos nuevos sin margen). Orden decidido: S74 antes, ya cumplido.

Decisión mía a revisar: el lugre de 1826 en `barca-costera-2` (anacrónico para un casco de 1586) está incluido y marcado en el crédito; si el usuario prefiere no mostrarlo, se quita.
