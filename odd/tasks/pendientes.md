# Juego de barcos — pendientes

Estado: las peticiones anteriores están cerradas. Lo que sigue abierto es lo de esta lista.

## Cerrado (ya no es pendiente)

- Barritas de estado y reparación: `estado-y-reparacion.md` (S21-S25, S40).
- Reparar las demás naves de la flota (era un pendiente de S22): cerrado por S24.
- `scripts/smoke-wind.mjs` flaky: arreglado en `efd1469` con OK del usuario.
- Pregunta de `tiempo.md` (¿volver a ×1 al enganchar?): cerrada por S43.
- Barritas y minimapa de las escoltas, escala por valor, reparación parcial, tiempo ×1 al enganchar y los botones "Añadir a la flota" / "Zarpar": `estado-flota-y-reparacion-parcial.md` (S42-S46).
- Zoom de la imagen del casco por clic en vez de hover: `imagenes-por-casco.md` (S41).
- Precio de reparación topado a la bolsa: `estado-y-reparacion.md` (S45, L35-L36).
- Disparo automático de la capitana (check en el Astillero) y radio de giro por tonelaje: `disparo-automatico-y-giro.md` (S47, S48).
- Reparación automática al pasar por el ancla (S49) y el ancla que abre el Astillero con el enlace "Volver al astillero" quitado (S51): `estado-y-reparacion.md` y `ancla-abre-astillero.md`.
- Reformar un barco de la flota en el constructor, con reembolso parcial y el botón "Capitana" aparte (S50): `reforma-de-flota.md`.
- Artilleros que dotan cañones, recarga acelerada hasta ×1,3 y cañones disponibles según la dotación, configurable por tipo de pieza: `artilleros-y-recarga.md` (S53).
- Tramo de daño reciente en las barras de condición, que resuelve "el daño al enemigo no se ve en su barra" (S52): `barras-de-dano.md`.
- Barritas de escolta amontonadas (se muestran sólo con la escolta a tiro) y precio mínimo de reparación de un doblón: `escoltas-a-tiro-y-precio-minimo.md` (S54, S55).
- Largo de las barras por aguante real del casco, daño de cada zona configurable, botín del pecio configurable en %, venta de naves propias y captura de enemigos rendidos: `escala-y-configuracion.md` (S59-S64).



### El astillero no se ve en el minimapa con su estado

Único punto abierto de S74 (`escala-y-configuracion.md`, L33 punto a). El astillero pelea de verdad —`updateFortCombat`, `fortFire`, `damageFort`, guardado y restauración de su condición, el puerto cerrado bloqueando reparar y zarpar, y `smoke-fort-combat.mjs` midiendo el asedio—, pero en el minimapa sólo se ve el aro del puerto. Si se quiere que aparezca como objetivo con su barra de guarnición, es trabajo de `drawMinimap` en `src/ui/sea.js`.

### La ficha de estadísticas de la nave desapareció

Al quitar el diálogo de botadura (S46) se perdió la ficha que mostraba casco, eslora, desplazamiento, velocidad, dotación, artillería y coste antes de zarpar. Si se quiere, se puede mostrar en el panel del buque del Astillero.

### Ajustar la maniobra de los cascos pesados

El radio de giro ahora cae con el peso (S48): el gran galeón gira al 35 % del giro base y la barca costera al 160 %. Los enemigos pesados también maniobran peor, así que cerrar distancia con ellos puede ser lento. La curva (`TURNING` en `src/model/turning.js`) no está en la pantalla de configuración. Si se quiere afinarla o usar la masa embarcada en vez del desplazamiento del casco, es una petición aparte.


### La velocidad del enemigo no usa el modelo de masas (cerrado como causa, abierto como regla)

Con S57 el enemigo comparte la física del casco con el jugador (giro, aceleración, viento, timón y límite del mundo), pero su **velocidad máxima** sigue siendo `referenceSpeedKn` del casco vacío, no el modelo de masas que usa el jugador. Medido: el mismo casco cargado como jugador navega 1,20× a 1,35× más rápido que ese enemigo. Es la única regla donde el enemigo está en desventaja. Decisión del usuario en S57: no tocarla por ahora. Igualarla lo haría más difícil de alcanzar y de hundir.

Con S58 esto ya no hace que el enemigo desaparezca: un enemigo en combate no se borra, se desengancha a 4600 m y sigue en el mar (`artilleros-y-recarga.md`, L24-L30). El usuario describió justamente ese efecto: "la velocidad es menor, con lo que cuando aumenta la distancia se desengancha". Queda abierto sólo como decisión de equilibrio.

### Guardado con el almacenamiento del navegador deshabilitado

El guardado atrapa el error y sigue; con S51 el mar navega al Astillero al pasar por el ancla aunque no haya podido guardar el viaje. Es el comportamiento de siempre del guardado, ahora en un momento más visible.

### Equilibrar el combate tras la regla de artilleros

Cerrado por S56: el enemigo ya no cobra el tope de recarga por disparar un solo costado (`artilleros-y-recarga.md`, L11-L16). El bonus ahora se mide contra la batería dotada entera y los enemigos vuelven exactamente al ritmo anterior. Lo que sigue en pie de S53: la falta de artilleros **quita cañones** (con 3 artilleros para 20 cañones, −31 % de daño), por decisión del usuario. Si se quiere afinar, es con la pantalla de configuración o con una petición aparte.

### Sin test unitario del bucle del mar

La sincronización de las escoltas con el mundo vive en `src/ui/sea.js` y sólo la cubren smokes de navegador, no `npm test`.

## Pendiente grande: el comercio (la carga tiene que dar dinero)

Decisión del usuario: se retoma más adelante. **No implementado.**

### El problema medido

La carga es hoy **puro castigo**: pagás doblones por embarcarla
(`PRICES.cargoGoldPerKg`), perdés velocidad (medido: mismo casco, 6,92 kn vacío
contra 5,98 kn con 40 t) y ganás calado. No hay ninguna mecánica que la consuma:
busqué en todo `src/model` y `src/ui` y no existe comercio, flete, ni destino.
`cargoKg` sólo aparece en el constructor, el reformador y la economía de compra.

Con S110 y S111 el hueco se estrechó pero no se cerró: ir vacío ya no es gratis
(el timón pierde hasta un 25 % por debajo del 20 % de capacidad) y la carga suma
al valor de la nave, así que una nave cargada vale más y se vende más caro. Pero
sigue sin **producir** nada.

### Las tres preguntas que hay que contestar antes de escribir código

1. ¿La mercancía se compra en el astillero y se vende navegando, o al revés?
2. ¿El precio varía por zona (costera barata, abismo caro) o es fijo por tipo?
3. ¿Qué pasa con la carga si te hunden, o si vendés la nave con carga a bordo?

### Por dónde empezaría, cuando toque

Una economía por viaje: comprar barato en el astillero, vender caro en una zona
lejana, con el riesgo del viaje como costo real. Eso convierte el dilema
"vacío y rápido contra cargado y lento" en una decisión legítima en vez de un
exploit. El modelo ya tiene la física; falta la economía.

## Estado del repositorio

- Rama `feat/t7-combate-costados`, sobre `master`. Merge y PR los hace el usuario.
- S97-S104 (`astillero-en-tabs.md`): astillero en cuatro tabs (Flota / Comprar buque /
  Astillero / Configuración), reparación del fuerte y cañones comprables (400 dl, tope
  +6 por costado, configurable). `config.html` redirige a `index.html#configuracion`.
- Verificación: `npm test` son **650 tests**; los smokes son **46**, entre ellos el
  nuevo `smoke-tabs.mjs` (recorrido de las cuatro rooms).
- Para jugar: `python3 -m http.server 8765` en la raíz y abrir `http://localhost:8765/index.html`.
- Los smokes necesitan ese servidor y `npx playwright install chromium` la primera vez.
- `git` pasa por un wrapper que falla con 401: usar `/usr/bin/git`.
- Regla global vigente: no editar tests existentes sin confirmación explícita del usuario.
- Verificación completa: `npm test` (**614 tests**) y los **45** smokes `scripts/smoke-*.mjs`, uno por vez (tardan de 2 s a 36 s cada uno). En macOS no existe el comando `timeout`: no usarlo como prefijo.
- El árbol de trabajo está limpio: todo lo cerrado hasta S90 está commiteado. Los smokes de reparación y astillero corren verdes en serie.

## Cerrado: las escoltas hacían bolutas (S96)

Reporte (verbatim): "los barcos que siguen a la capitana parece que no siguen las normas de la velocidad, hacen muchas bolutas".

Medido antes del arreglo, con la capitana sosteniendo 6,00 kn: la velocidad de la escolta serruchaba entre **5,64 y 6,44 kn** en un ciclo de ~2 s (banda 0,80), y al entrar en estación frenaba hasta **3,15 kn**. En el navegador real la banda era de 3,83 kn.

Dos causas, las dos en `stepEscort` (`src/model/formation.js`):
1. El blanco de velocidad era `capitana + cierre`, y el término de cierre caía a cero dentro de la tolerancia. Así el blanco quedaba **por debajo** de la velocidad de la capitana y la escolta frenaba, caía atrás, volvía a acelerar y volvía a frenar.
2. Dentro de la tolerancia la escolta dejaba de gobernar por completo: sólo navegaba recta con el rumbo que tuviera. Un casco apuntado al través se iba de lado hasta salir de la tolerancia y tenía que volver — el lazo que se veía como bolutas.

Arreglo (decisión del usuario: "Velocidad estable, rumbo siempre corregido"): zona muerta en el blanco de velocidad, medida desde el borde de la tolerancia, y el rumbo se corrige siempre (a media caña dentro de la tolerancia).

Evidencia: `test/escort-steady.test.js` (4 tests) con RED observado — el serrucho fallaba con banda 1,05 kn. Después: banda **0,00 kn** en el modelo y **0,09 kn** en el navegador, con la escolta a 0 m de su estación. `npm test` 637/637. Smokes `smoke-fleet`, `smoke-escort-dock`, `smoke-escort-hud` y `smoke-formation` verdes.
