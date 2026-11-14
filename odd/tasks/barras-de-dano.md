# Juego de barcos — tramo de daño reciente en las barras

Estado: cerrado y verificado. S52. Sin commitear. Sigue a S21 (barritas de estado) y S44 (barras proporcionales al valor), en `estado-y-reparacion.md` y `estado-flota-y-reparacion-parcial.md`.

## Specs

S52. Cuando una barra de condición pierde vida, el tramo perdido se queda a la vista un momento. Pedido original (verbatim): "el daño provocado al barco enemino no se ve en la barra de vida del barco enemigo". Decisión del usuario: **"Tramo de daño reciente (recomendado)"**.
- Cada barra de condición de cada barco con barritas (casco, aparejo y tripulación; la capitana, las escoltas y los enemigos a tiro) muestra, justo detrás del relleno, el tramo que acaba de perder, en un color claro. Se mantiene lleno medio segundo (`TRAIL.holdS = 0.5`) y se vacía en 1,2 segundos (`TRAIL.drainS = 1.2`).
- **Mínimo visible:** un tramo perdido, por pequeño que sea, se dibuja con al menos 3 px (`TRAIL.minPx`), aunque la pérdida real sea de menos de un píxel (decisión mía, sin pedido: es justo el caso que motivó el pedido, 1 a 3 px en una barra de 38 px). Sin pérdida no se dibuja nada.
- Un golpe nuevo mientras el tramo se vacía lo extiende y reinicia el medio segundo de espera. Subir la barra (reparar) no deja tramo: el relleno sube y listo.
- Sólo las barras de condición. Las barras de daño por costado y de recarga no llevan tramo (decisión mía, sin pedido).
- Funciona con cualquier tiempo acelerado: el tramo corre con el reloj del mundo, no con el reloj real (decisión mía, sin pedido).
- La escala del tramo es la de su barra: la misma anchura que S44 le da al barco.

## Diagnóstico que lo originó

Medido instrumentando el canvas, con los tres casos que dio el usuario (enemigo barato, escoltas, otra munición): la barra funciona en todos. Escolta sola con bala de hierro: casco enemigo 100 → 79,5 → 24,6 % y barra de 38 → 30 → 9 px. Cadena: aparejo 100 → 48 % (38 → 18 px). Pero la metralla (6 % de su daño al casco) contra un patache baja 2 % de casco, 2 % de aparejo y 8 % de tripulación por tanda: de 1 a 3 px sobre 38 px, que no se ve. Desde S44 una nave barata tiene barras de al menos el 35 % del largo máximo.

## Tasks

- T67 — Reglas puras `src/model/damage-trail.js` + tests (RED primero). `S52` — inline — done
- T68 — Dibujar el tramo en `src/ui/sea.js` (después de que cierre S51: mismo archivo) y `scripts/smoke-damage-trail.mjs`. `S52` — inline — done

## Log

L1 (verbatim): "el daño provocado al barco enemino no se ve en la barra de vida del barco enemigo"

L2: Al principio el usuario eligió "La barra no baja nada". No se reprodujo: mi primera medición con un galeón de guerra mostró el panel de objetivo y la barra dibujada coincidiendo (83 %). Se afinó con tres casos que dio el usuario (barato, escoltas, otra munición) y se midió con el canvas instrumentado; ver el diagnóstico.

L3: Opciones que se le dieron: tramo de daño reciente, subir el mínimo de largo de 35 % a 60 %, o las dos. Eligió la primera. Subir el mínimo no se hace.

L4: Implementación. `src/model/damage-trail.js` (reglas puras: `createTrail`, `stepTrail`, `trailSpan`, `trailWidthPx`, constantes en `TRAIL`) con `test/damage-trail.test.js` (11 tests; RED por módulo inexistente). En `src/ui/sea.js`: `BAR.trail = "#f5e6c8"`, un estado por barra de condición guardado con su combatiente en un `WeakMap`, avanzado con el reloj del mundo (`frameWorldDt = dt * timeScale`) y dibujado en `drawBar` detrás del relleno. Si el tramo cae al final de la barra se dibuja sobre el extremo del relleno en lugar de salirse.

L5: Evidencia. `scripts/smoke-damage-trail.mjs` (nuevo; un patache que no puede devolver fuego, golpeado con metralla): RED observado antes de cablear (cinco andanadas sin ningún tramo visible), GREEN después (el tramo aparece con al menos 3 px y desaparece del todo a los 3 s del último golpe). Regresión completa tras tocar el dibujo de todas las barras: `npm test` 383/383 y los 28 smokes con exit 0 (leí las 28 líneas del log), entre 2 s y 36 s cada uno. `git diff --check` limpio.

L6: Verificación a ojo. Una primera captura salió con un disparo **fallado** (anillo de salpicadura y barras llenas) y no mostró nada, así que no se tomó como evidencia. Una segunda, tomada en el instante en que el canvas dibuja el tramo, muestra en la fila de casco del enemigo el relleno rojo seguido de un tramo crema: justo el daño recién perdido.

L7: Lo que no cambia, para que no se confunda: el relleno de la barra sigue siendo el valor real y la anchura de la barra sigue siendo la de S44 (proporcional al valor del barco). El tramo sólo añade información, y sólo en las barras de condición (casco, aparejo y tripulación).
