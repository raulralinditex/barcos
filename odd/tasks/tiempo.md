# Juego de barcos — tecla de tiempo ×2

Estado: completado y verificado.

## Specs

S31. Una tecla duplica la velocidad del tiempo para no esperar tanto entre un objetivo y otro. Pedido (verbatim): "vamos a tener una tecla que haga el tiempo por 2 para no tener que esperar tanto de un objetivo a otro"
- La tecla es `T` y alterna entre tiempo normal y ×2; una segunda pulsación vuelve a normal. Mantenerla pulsada no la alterna de nuevo.
- ×2 acelera todo el mar: navegación, viento, enemigos, recargas y efectos. El reloj del mundo corre al doble.
- Se avanza en los mismos pasos pequeños que en tiempo normal, dos veces por fotograma, y no un paso el doble de largo, para que recargas, deriva y radios de recogida se comporten igual.
- Mientras está activo se ve una insignia "×2" y un aviso al activarlo y al desactivarlo. La línea de ayuda menciona la tecla.
- Textos en es y en. Sin límite de uso: no se desactiva sola al entrar en combate (decisión mía, sin pedido; se puede cambiar).

## Tasks

- T40 — `scripts/smoke-time.mjs` (RED: no existía `#time-badge`), tecla y bucle en `sea.js`, insignia en `sea.html` y `styles.css`, textos en es y en. `S31` — inline — done

## Log

L1 (verbatim): "vamos a tener una tecla que haga el tiempo por 2 para no tener que esperar tanto de un objetivo a otro"

L2: Evidencia — el smoke mide el reloj del mundo en segundos reales: 1,00× antes de la tecla, 2,00× con ella, 1,00× tras una segunda pulsación; en dos corridas. La insignia aparece y desaparece, el aviso sale traducido en inglés y la ayuda menciona la `T`. 217/217 tests y diez smokes con exit 0.

L3: Pendiente que decide el usuario: con ×2 activo un enemigo puede entrar en combate sin que el jugador lo note. Hoy no se frena solo. Si se quiere, volver a ×1 al entrar un enemigo en el radio de enganche es un cambio chico.
