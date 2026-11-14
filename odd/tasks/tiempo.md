# Juego de barcos — tecla de tiempo (×1, ×2, ×4, ×8)

Estado: completado y verificado. S31 (tecla), ciclo ×1-×8 y S43 (vuelve a ×1 al enganchar).

## Specs

S31. Una tecla duplica la velocidad del tiempo para no esperar tanto entre un objetivo y otro. Pedido (verbatim): "vamos a tener una tecla que haga el tiempo por 2 para no tener que esperar tanto de un objetivo a otro"
- La tecla es `T` y cicla ×1 → ×2 → ×4 → ×8 → ×1 (ver L4; al principio sólo alternaba ×1/×2). Mantenerla pulsada no cicla de nuevo.
- Cada multiplicador acelera todo el mar: navegación, viento, enemigos, recargas y efectos. El reloj del mundo corre al doble.
- Se avanza en los mismos pasos pequeños que en tiempo normal, N veces por fotograma (N = el multiplicador), y no un paso N veces más largo, para que recargas, deriva y radios de recogida se comporten igual.
- Mientras está activo se ve una insignia "×N" y un aviso al activarlo y al desactivarlo. La línea de ayuda menciona la tecla.
- Textos en es y en. No se desactiva sola por tiempo ni por distancia; sí al enganchar un enemigo (S43, ver L5).

## Tasks

- T40 — `scripts/smoke-time.mjs` (RED: no existía `#time-badge`), tecla y bucle en `sea.js`, insignia en `sea.html` y `styles.css`, textos en es y en. `S31` — inline — done

## Log

L1 (verbatim): "vamos a tener una tecla que haga el tiempo por 2 para no tener que esperar tanto de un objetivo a otro"

L2: Evidencia — el smoke mide el reloj del mundo en segundos reales: 1,00× antes de la tecla, 2,00× con ella, 1,00× tras una segunda pulsación; en dos corridas. La insignia aparece y desaparece, el aviso sale traducido en inglés y la ayuda menciona la `T`. 217/217 tests y diez smokes con exit 0.

L3: Pendiente que decide el usuario: con ×2 activo un enemigo puede entrar en combate sin que el jugador lo note. Hoy no se frena solo. Si se quiere, volver a ×1 al entrar un enemigo en el radio de enganche es un cambio chico.

L4 (verbatim): "la tecla T del tiempo, que sea un bucle x1,x2,x4,x8"
Implementación: `TIME_SCALES = [1, 2, 4, 8]` en `src/ui/sea.js`, y la tecla pasa al siguiente valor del ciclo. Los textos usan `{scale}` en es y en.

L5: El pendiente de L3 se cerró con S43 (`odd/tasks/estado-flota-y-reparacion-parcial.md`). Pedido (verbatim): "el 4-> baja a X1 cuando enganche". Cuando un enemigo engancha (pasa a combatir), el tiempo vuelve a ×1 y se avisa; se dispara una vez por enganche, así que el jugador puede volver a acelerar con `T` en mitad del combate. Regla pura en `src/model/sea-hud.js` (`timeScaleOnEngage`, test en `test/sea-hud.test.js`) y comprobada en el navegador por `scripts/smoke-escort-hud.mjs`.
