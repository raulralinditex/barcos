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

**Cerrado por S141** (`comercio-y-astilleros.md`). Al quitar el diálogo de botadura (S46) se perdió la ficha que mostraba casco, eslora, desplazamiento, velocidad, dotación, artillería y coste antes de zarpar. Ahora el panel del buque muestra las seis cosas que no se veían en ningún otro lado —casco, país, eslora, desplazamiento, provisiones y mercancía— en el bloque «Ficha del casco» (`#hull-sheet`), siempre a la vista en las tres pantallas que comparten el constructor.

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

## Cerrado: el comercio (S112-S122, `comercio-y-astilleros.md`)

El pendiente grande quedó cerrado. El resumen de lo que cambió, para que no haya que releer la ficha entera:

- **Astilleros por zona como datos** (S112): `SHIPYARDS` en `src/data/naval-data.js`; la zona se deriva de la posición, no se escribe a mano.
- **Comprar barato donde hay, vender caro donde falta** (S113, S114): mercancías declaradas, precio por zona y por lado, manifiesto en la bodega y capacidad real.
- **Los enemigos llevan carga** (S115, S116): botín entero al rendirse, un porcentaje al hundirse, y la carga de un casco propio se va con él.
- **Naufragio o pérdida total** (S117): interruptor en Configuración; el pecio espera en el astillero y se reflota pagando.
- **El mercado tiene memoria** (S119): stock por puerto, precio derivado del stock y recuperación por reloj de juego.
- **Dos cascos iguales no comparten identidad** (S120) y **un casco seco compra sus rondas en el astillero** (S121), con las recámaras de las escoltas viajando en el guardado del mar (S122).

Las tres preguntas que bloqueaban el comercio se contestaron en esa ficha (L1-L14), no acá: este documento deja de ser el lugar donde vive el comercio.

## Estado del repositorio

- Rama `feat/comercio-y-astilleros`, sobre `feat/t7-combate-costados`. Merge y PR los hace el usuario.
- Cerradas hasta S122. `npm test` son **726 tests** y los smokes son **52** `scripts/smoke-*.mjs`.
- Para jugar: `python3 -m http.server 8765` en la raíz y abrir `http://localhost:8765/index.html`.
- Los smokes necesitan ese servidor y `npx playwright install chromium` la primera vez.
- `git` pasa por un wrapper que falla con 401: usar `/usr/bin/git`.
- Regla global vigente: no editar tests existentes sin confirmación explícita del usuario.
- Verificación completa: `npm test` y los smokes `scripts/smoke-*.mjs`, uno por vez (tardan de 2 s a 36 s cada uno). En macOS no existe el comando `timeout`: no usarlo como prefijo.
- `scripts/smoke-escort-hud.mjs` es **flaky**: puede fallar la lectura del minimapa ("S42: the escort is missing") bajo carga y pasar al reintentar. No es una regresión de nada.
- El árbol de trabajo está limpio: todo lo cerrado hasta S122 está commiteado.

## Cerrado: las escoltas hacían bolutas (S96)

Reporte (verbatim): "los barcos que siguen a la capitana parece que no siguen las normas de la velocidad, hacen muchas bolutas".

Medido antes del arreglo, con la capitana sosteniendo 6,00 kn: la velocidad de la escolta serruchaba entre **5,64 y 6,44 kn** en un ciclo de ~2 s (banda 0,80), y al entrar en estación frenaba hasta **3,15 kn**. En el navegador real la banda era de 3,83 kn.

Dos causas, las dos en `stepEscort` (`src/model/formation.js`):
1. El blanco de velocidad era `capitana + cierre`, y el término de cierre caía a cero dentro de la tolerancia. Así el blanco quedaba **por debajo** de la velocidad de la capitana y la escolta frenaba, caía atrás, volvía a acelerar y volvía a frenar.
2. Dentro de la tolerancia la escolta dejaba de gobernar por completo: sólo navegaba recta con el rumbo que tuviera. Un casco apuntado al través se iba de lado hasta salir de la tolerancia y tenía que volver — el lazo que se veía como bolutas.

Arreglo (decisión del usuario: "Velocidad estable, rumbo siempre corregido"): zona muerta en el blanco de velocidad, medida desde el borde de la tolerancia, y el rumbo se corrige siempre (a media caña dentro de la tolerancia).

Evidencia: `test/escort-steady.test.js` (4 tests) con RED observado — el serrucho fallaba con banda 1,05 kn. Después: banda **0,00 kn** en el modelo y **0,09 kn** en el navegador, con la escolta a 0 m de su estación. `npm test` 637/637. Smokes `smoke-fleet`, `smoke-escort-dock`, `smoke-escort-hud` y `smoke-formation` verdes.
