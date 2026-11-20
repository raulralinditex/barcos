# Niebla de guerra

El mapa empieza tapado por niebla y ningún barco se ve. Al navegar se descubre el mapa, y según la regla elegida se ven o no los barcos que están en lo descubierto.

## Specs

S167. **El mapa empieza con niebla y se descubre navegando.** Pedido (verbatim): "ahora vamos a hacer niebla, todo el mapa tiene niebla y no se ve ningun barco, segun van navegando tus barcos vas descubriendo el mapa, lo implementamos con una flag en configuraciones niebla si o no". Decisión (verbatim): las dos reglas de visibilidad son "elegibles en la configuracion", y el radio es "configurable, con un valor de partida".
- **S167-A, el interruptor.** En Configuración hay una casilla «Niebla» con su valor de fábrica. Apagada, el mar se comporta exactamente como hoy: sin niebla, todo a la vista. Es la garantía de que nada de lo que ya funciona cambia para quien la deja apagada.
- **S167-B, la niebla tapa el mar.** Con la niebla encendida, el mapa se dibuja cubierto salvo lo ya descubierto. Lo descubierto se recuerda: una vez visto, no vuelve a taparse.
- **S167-C, se descubre navegando.** Cada casco de tus escuadras descubre a su alrededor mientras navega, con un radio declarado y ajustable. Las capitanas que no llevás en el timón también descubren: son tus barcos.
- **S167-D, dos reglas de visibilidad, elegibles.** `revelado`: un barco se ve si está en zona descubierta, esté donde esté dentro de ella. `contacto`: además tiene que estar cerca de alguno de tus cascos. La regla se elige en Configuración y se guarda.
- **S167-E, lo que no se ve no se dibuja ni se cuenta.** Un barco oculto, y un astillero en agua sin descubrir, no se pintan en el mar ni en el minimapa, y el propio minimapa lleva niebla sobre lo no descubierto. Además un barco oculto no aparece en el panel de combate, no se puede apuntar con un clic y no se anuncia por cercanía. El motor sí lo mueve: la niebla es de la pantalla, no del mundo.
- **S167-F, el descubrimiento viaja en el guardado, y un guardado viejo abre a oscuras.** Recargar no vuelve a tapar lo descubierto. Un guardado anterior a esta regla abre con NADA descubierto, no con el mapa entero: la niebla es opcional y apagada por defecto, así que a un guardado viejo no le cuesta nada mientras esté apagada, y quien la enciende quiere verla. (La primera versión decía lo contrario y por eso el jugador no veía la niebla: ver L80.) Un registro guardado que diga «todo descubierto» no se cree.
- **S167-G, la niebla no cambia el combate.** Un enemigo oculto sigue peleando si ya estaba en el encuentro: la niebla no vuelve invisible a quien te está disparando.
- **S167-H, i18n es/en** del interruptor, de la regla de visibilidad y del radio.

## Tasks

- T69 — S167-A/B/C/D: `src/model/fog.js` (radio, descubrimiento por rejilla, reglas de visibilidad, normalización del guardado) y `test/fog.test.js`. Ruta: inline.
- T70 — S167-F: el descubrimiento en `world.js` y en el guardado del mar. Ruta: inline.
- T71 — S167-A/D: el interruptor, la regla y el radio en Configuración, con su i18n. Ruta: inline.
- T72 — S167-B/C/E: la niebla en pantalla — velo, descubrimiento al navegar, encuentros ocultos. Ruta: inline.
- T73 — S167-E/G: el minimapa, el panel de combate, el clic y los avisos, todos leyendo la visibilidad. Ruta: inline.
- T74 — S167-H: el smoke y la verificación completa. Ruta: inline.

## Log

L77 (pedido, verbatim): "ahora vamos a hacer niebla, todo el mapa tiene niebla y no se ve ningun barco, segun van navegando tus barcos vas descubriendo el mapa, lo implementamos con una flag en configuraciones niebla si o no".

L78 (decisiones, verbatim): a la pregunta de qué se ve en zona descubierta, "las dos opciones me gustan, agamoslas elegibles en la configuracion"; y al radio, "Configurable, con un valor de partida".

L79 (estado medido antes de tocar nada): el mar no tiene ninguna noción de visibilidad. `drawEncounters` pinta todo `world.encounters`; `drawMinimap` pinta todo `world.encounters`; `drawShipBars` y `updateDuelPanel` leen todo enemigo en combate; `nearbyEnemyWarning` avisa de cualquier enemigo cerca. Cinco lugares, todos con el mismo patrón `for (const encounter of world.encounters)`. El guardado del mar (`serializeWorld`/`deserializeWorld`) no tiene ningún campo de descubrimiento. Hay un precedente exacto de interruptor: `showTravelButton` con `control: "switch"` en `SETTINGS_FIELDS`.

L80 (reporte del jugador sobre la primera versión, verbatim): "cuando activo la niebla no la veo". **Causa medida:** la primera versión abría un guardado sin registro de descubrimiento como `complete: true` (mapa entero descubierto), y el primer autoguardado lo grababa para siempre. La partida en curso del jugador era de esas, así que el interruptor no tenía nada que tapar. Reproducido: `guardado viejo abre con complete = true` y «tras un autoguardado sigue complete = true». Era un defecto de mi diseño, no de la pantalla: pensé en «no estropear partidas viejas» olvidando que la niebla es opcional y que quien la enciende quiere verla. **Segunda causa, vista en la captura:** el minimapa no tenía niebla (mostraba el mapa entero y los tres astilleros) y el ancla del puerto asomaba bajo el velo.

L81 (cierre de S167, commit `38a0090`). `npm test` **1033/1033** (1021 + 11 en `test/fog.test.js` + 1 de la corrección). `scripts/smoke-fog.mjs` en 0.

**Lo que quedó:** `src/model/fog.js` (rejilla de celdas de 200 m, `revealAround`, `isVisible` con las dos reglas, `fogEnabled`), el descubrimiento en `updateWorld` y en el guardado del mar, el bloque `fog` en Configuración (interruptor, radio, distancia de contacto y regla; rama «El mar y el mundo»), y en pantalla el velo sobre el mar, el velo sobre el minimapa, y los barcos y astilleros ocultos fuera del dibujo, del panel de combate, del aviso de cercanía y del clic de apuntar.

**Decisiones del jugador, en su lugar:** las dos reglas elegibles (`revelado` / `contacto`, el flag `fog.rule`) y el radio configurable con valor de partida (700 m), tal como pidió.

**S167-G, la niebla no esconde un combate:** un hostil a tiro de alguno de tus cascos sigue en el panel y en los avisos aunque la niebla lo tape (`engagedWithFleet`).

**Evidencia de RED:** reproduciendo el defecto del reporte, `smoke-fog` falla **5 comprobaciones**, la principal «the water far from the fleet must be painted over by the fog». Medido a ojo en capturas con y sin niebla: con ella sólo se ve el claro alrededor de la flota y el enemigo a 450 m, no el de 1100 m; sin ella, todo.

**Smokes que había que actualizar y se actualizaron con OK explícito del jugador:** `smoke-tabs` (23→24 bloques) y `smoke-settings-menu` (23→24 y la rama «fog,levels,time,voyage,wind,world»); sólo números y lista. También el test de S117, con OK explícito, que fija la lista exacta de interruptores.

**Límites conocidos:** (a) la regla `contacto` está cubierta por tests de modelo pero no tiene smoke de pantalla; (b) el borde de lo descubierto sale en bloques de 200 m, sin suavizar; (c) el disparo automático de las escoltas no consulta la niebla, aunque en la práctica un hostil a su alcance ya está descubierto por ellas mismas.

L82 (revisión normal del delta `dfc4e1d..HEAD`, 1640 líneas en 29 archivos). Sin revisión nativa: el candidato fijado por RDD es otra vez la rama entera (`base-ref 7ace33b`, 70 archivos) y ya falló tres veces con `lens_context_budget_exceeded` sin crear autoridad. Esta vez el target del recordatorio coincidió con el de `inspect`.

**Sano, medido:** `updateWorld` con la niebla encendida y el mar entero descubierto (2809 celdas, 23 KB) cuesta 0,104 ms por paso, contra 0,019 apagada; el registro pesa lo que pesa en el peor caso y se escribe cada 3 s. Las únicas líneas eliminadas en `test/` son las de `test/minimap-pick.test.js` (retirado entero al reemplazar S164 por S166, anotado en su ficha) y la lista de interruptores de `test/settings.test.js` (con OK explícito).

**Dos defectos reales encontrados, los dos míos y los dos con RED medido:**

1. **S166, la vista no seguía al timón.** `chooseSquadron` no tocaba la cámara: con la vista en una zona lejana, `C` pasaba el timón a Beta (6000 m fuera de pantalla) y la vista se quedaba donde estaba; gobernabas un casco que no veías. Mi primera reproducción era mala (miré justo la posición de Beta y se veía por casualidad); con una zona neutra quedó claro. Arreglo: tomar el mando de una capitana lleva la vista a ella. RED: `smoke-minimap-camera` falla un check, el resto pasa.
2. **S167-G, la niebla escondía un combate.** Con un radio de descubrimiento chico (el mínimo configurable es 100 m) un hostil trabado a 450 m quedaba en agua sin descubrir: el panel de combate lo listaba («Patache 339 · 450 m») porque usaba `engagedWithFleet`, pero el mar no lo dibujaba, el minimapa no lo marcaba y el velo lo cubría, así que te atacaba algo que no veías. Rompía mi propia regla S167-G. Con el radio por defecto (700 m) no se nota. Arreglo en un solo punto: `encounterVisible` incluye el combate, y el velo deja un claro alrededor de cada hostil trabado, en el mar y en el minimapa. RED: sin el claro, el píxel junto al enemigo vale 66 (oscuro) y `smoke-fog` falla.

**Limpieza:** `nearestEncounter` y `cellOf` quedaron importados sin uso en `sea.js` por mis cambios; retirados.

**Sin arreglar, reportado:** un guardado editado a mano con una lista de celdas enorme no tiene tope (`normaliseDiscovered` no acota el largo); no es alcanzable jugando.

L83 (pedido, verbatim): "suaviza el borde de la niebla". El borde de lo descubierto salía en bloques de 200 m (el límite que L81 ya anotaba).

**Cómo:** la máscara (cuánto oscurece cada celda) pasa al modelo (`fogMask`, con su test) y se difumina con dos pasadas de un núcleo [1 2 1]/4 por eje, con pesos no negativos, de modo que descubrir más mar nunca oscurece ninguna celda (el borde no parpadea al navegar). La pantalla pinta esa máscara en un canvas de un píxel por celda y lo **escala con interpolación**: eso, y no sólo el desenfoque, es lo que quita la escalera. Se reconstruye sólo cuando cambia (celdas descubiertas o posición de un hostil trabado, a 50 m); el resto de los cuadros reutiliza la imagen.

**Un hallazgo en el camino:** el claro alrededor de un hostil trabado (S167-G) no puede pasar por el difuminado, porque son cuatro celdas y el desenfoque las erosiona: medido, un claro de 4 celdas quedaba abierto sólo al 39 %, o sea el enemigo seguía tapado. Se aplica después, como un degradé redondo (abierto del todo a 300 m, de vuelta a la niebla hacia 700 m).

**Medido:** el salto máximo de brillo entre píxeles vecinos cruzando el borde baja de **266** (rectángulos) a **42**. **Un RED que no valía:** con `softness: 0` el smoke seguía pasando, porque la interpolación del navegador ya reparte el borde en una celda; el check distingue «rectángulos» de «imagen escalada», no «con desenfoque» de «sin él». El RED honesto es contra la versión de rectángulos (`HEAD`), que da 266 y falla. El desenfoque en sí lo fijan los 8 tests de `fogMask`.
