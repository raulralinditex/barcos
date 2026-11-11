# Juego de barcos — elegir país

Estado: especificado, sin implementar. Espera a que cierre T35 (diálogo de reparación), que toca los mismos archivos (`app.js`, `sea.js`, catálogos i18n).

## Specs

S26. El jugador elige un país y sólo puede comprar cascos y artillería de ese país. Pedido (verbatim): "vamos a hacerlo por paises, eliges un pais y los barcos, artilleria etc, etc solo pueden ser de ese pais, el pais por defecto es inglaterra"
- Países disponibles: Inglaterra, España, Portugal y Países Bajos (los que ya existen en los datos de cascos). El país por defecto es **Inglaterra**.
- El país se elige en el Astillero con un selector y se guarda en el navegador (clave propia, con prefijo `barcos:`).
- Con un país elegido, el catálogo del Astillero muestra únicamente los cascos y las piezas de ese país; los demás no aparecen (no basta con deshabilitarlos).
- Las naves que ya están en la flota se conservan aunque sean de otro país: la restricción es del catálogo de compra, no de lo ya comprado.
- Cambiar de país con una configuración a medias que usa un casco o piezas que el país nuevo no tiene no puede romper nada: se pasa al primer casco válido y se descartan las piezas no válidas.
- La interfaz del selector sale en es y en en.

S27. Cada casco declara a qué países pertenece (`countries`, lista de ids), derivada de su campo `country` actual, con dos decisiones sobre los compuestos:
- Galeaza (`"Nápoles / Felipe II"`) → **España** (Nápoles pertenecía a la Corona de Felipe II).
- Gran galeón (`"Portugal / Felipe II"`) → **España y Portugal** (Portugal estuvo bajo Felipe II desde 1580).
- Resultado: España = patache, zabra, nao armada, galeaza, gran galeón; Portugal = carabela latina, gran galeón; Países Bajos = jacht, fluyt, gran mercante; Inglaterra = galeón pequeño, galeón de guerra, gran buque real y los tres de abajo.

S28. Cascos ingleses menores nuevos (decisión del usuario: "Añado cascos ingleses menores"), porque hoy Inglaterra tiene tres cascos y ninguno cuesta menos de 3.200 con 12.000 de oro inicial. Los datos salen de fuentes y lo que no tiene fuente se marca como convención del juego:
- **Barca costera** (small bark): ~14 a 40 toneladas. Fuente: el *Swallow* de 14 t, "small bark", con dos falconetes y dos giratorias, arrestado en 1586 (Gresham College, *Elizabethan Merchant Ships and Shipbuilding*).
- **Pinaza** (small pinnace): ~50 toneladas inglesas, tripulación 35 a 40, de 5 a 9 piezas nominales (típico: 4 sacres, 2 minions y 3 piezas menores). Quilla 50 pies (15,24 m), manga 13-14 pies (3,96-4,27 m), puntal 6 pies (1,83 m) en el *Sun* y el *Spy*; el *Charles* tiene quilla de 63 pies y manga de 16. Fuentes: BWAS-1603 vía Three Decks; NAVWAR "small pinnace".
- **Bark mercante armado**: ~100 a 200 toneladas. El *Bark Hawkyns* (1585) tenía 150 t, y 100 t era el mínimo oficial para que un mercante pudiera combatir (Ian Friel, *History Today*).
- Los precios, las esloras totales, el calado y la tripulación mínima son convención del juego, calibrados contra los cascos vecinos (patache 40-100 t = 900, jacht 60 t = 700, zabra 166 t = 2.200). Cada casco nuevo lleva su nombre, tipo, país y nota en es y en, y un nombre de barco por defecto.

S29. Cada pieza de artillería declara los países que la usaron en la época (`countries`). La munición no lleva país propio: sigue a la pieza, que ya lista las suyas. Mapa (convención del juego, con fuentes abajo):

| Pieza | Inglaterra | España | Portugal | Países Bajos |
|---|---|---|---|---|
| Cañón de 60 libras | sí | sí | sí | no |
| Cañón de 40 libras | sí | sí | sí | sí (*kartouw*, 40-50 lb) |
| Medio cañón de 32 | sí (*demi-cannon*) | sí | sí | sí (*halve kartouw*) |
| Culebrina de 18 | sí (*culverin*) | sí | sí (*colubrina*) | sí (*culverijn*) |
| Media culebrina de 9 | sí (*demi-culverin*) | sí | sí | sí (*halve slang*) |
| Sacre | sí (*saker*) | sí | sí | no |
| Minion de 4 libras | sí (*mynion*) | no | no | sí (*mignon*) |
| Falcón | sí | sí | sí (*falcão*) | sí |
| Falconete | sí | sí | sí | sí (*valkonet*) |
| Pedrero | sí (*portpiece*) | sí | sí | sí (*steenstuk*) |
| Verso (giratoria) | sí (*fowler*) | sí | sí (*berço*) | sí (*draaibas*) |

Honestidad sobre la fuerza de esta tabla: la artillería naval del XVI-XVII era en buena parte internacional, así que el mapa distingue poco entre Inglaterra, España y Portugal. Hay evidencia firme de qué tenía cada flota (listas de 1599 de la Marina inglesa y la Armada de 1588), pero **no** de que un país no usara jamás una pieza. Lo que sí separa de verdad: el *minion* sólo aparece en las flotas inglesa y holandesa; los portugueses llaman *berço* al verso español; los holandeses ordenan sus bronces por *kartouw/slang/mignon*. Los cruces dudosos (la fila de Países Bajos para sacre y cañón de 60) son los de menor confianza.

S30. Fuera de alcance, sin cambios: los enemigos del mar siguen saliendo de sus pozas por zona, de cualquier país. Que un enemigo sea de otro país que el del jugador es natural; hacer enemigos por país sería otra feature.

## Fuentes

- Lista de la Marina Real inglesa de 1599, con las especies Cannon, Demi-Cannon, Culverin, Demi-Culverin, Saker, Mynion, Falcon, Falconet, Portpiece y Fowler: *Archaeologia* vol. 13, Wikisource.
- Armada de 1588, artillería española (cañones, medios cañones, culebrinas, medias culebrinas, sacres, falconetes, pedreros, versos): González-Aller et al., *La Batalla del Mar Océano*, vol. V; Armada Guns, Society for Nautical Research.
- Artillería holandesa (*kartouw*, *halve kartouw*, *slang*, *halve slang*, *mignon*): VOCsite; Verbeek, *VOC-Artillerie 1602-1796*; *Kanonnen van Nederland*.
- Artillería portuguesa (*berço* = verso español, *falcão*, *falconete*, *esmeril*, *colubrina*): Kardasz, *Berço manuelino del naufragio de Santiago*; Smith, comparación de artillería portuguesa y mediterránea.
- Pinazas: Three Decks (BWAS-1603: *Sun*, *Spy*, *Makeshift*, *Charles*); NAVWAR, "small pinnace". Barcas y mercantes: Gresham College; Ian Friel, *History Today*; Three Decks, *Bark Hawkyns*.

## Pregunta abierta antes de implementar

¿Se puede cambiar de país con una flota ya comprada? La spec asume que se puede cambiar el selector en cualquier momento y que la flota se conserva (S26), pero está sin confirmar.

## Tasks

- T36 — Tests primero y datos: `countries` en cascos y piezas, `availableHulls(country)` y `availablePieces(country)` puros. `S26,S27,S29` — pending
- T37 — Los tres cascos ingleses menores con sus fuentes, nombres, notas y nombre de barco por defecto, en es y en. `S28` — pending
- T38 — Estado del Astillero: selector, persistencia, filtro del catálogo y reconversión de la configuración a medias. `S26` — pending
- T39 — i18n del selector y del catálogo, smoke de navegador en los dos idiomas, documentación. `S26,S28` — pending

## Log

L1 (verbatim): "vamos a hacerlo por paises, eliges un pais y los barcos, artilleria etc, etc solo pueden ser de ese pais, el pais por defecto es inglaterra"

L2: Al preguntar cómo asignar país a la artillería (los datos de piezas no lo traen), el usuario respondió, textual: "busca en la web esa informacion". Se investigó (fuentes arriba) y el mapa de S29 es el resultado. Sobre los cascos de Inglaterra eligió "Añado cascos ingleses menores".

L3: Hallazgo: los datos de cascos ya tienen `country`, pero como texto libre, con dos compuestos ("Nápoles / Felipe II", "Portugal / Felipe II"). Las piezas y las municiones no tienen país. Por eso S27 pasa a una lista de ids y la galeaza y el gran galeón se resuelven como se indica arriba.
