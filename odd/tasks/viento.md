# Juego de barcos — viento

Estado: completado.

## Specs

S16. Viento determinista y uniforme: el viento de un mar está definido por `(seed, tiempo)` y siempre vale lo mismo para el mismo par. La dirección y la fuerza varían de forma **aleatoria pero continua**: puntos de control cada pocos segundos interpolados suavemente, sin saltos. Nunca hay calma absoluta ni huracán permanente.

S17. El viento mueve el barco en dos ejes:
- **Velocidad**: con el viento de popa el barco gana hasta un 40 % de velocidad; de proa pierde hasta un 40 %. De través es neutro.
- **Deriva**: el viento empuja el casco de costado, perpendicular al rumbo, hacia el lado al que sopla. La deriva crece con la fuerza y con cuánto cae el viento por el través.

S18. Indicadores en pantalla: dos flechas sobre una rosa de los vientos. La primera muestra **dirección y fuerza actuales**; la segunda, **dirección y fuerza que habrá 10 segundos después**. La flecha apunta hacia donde sopla el viento y su largo representa la fuerza. La predicción es exacta, no aproximada, porque el modelo es determinista (S16).

S19. Idioma: las etiquetas de los indicadores de viento existen en español e inglés como el resto de la interfaz (S11).

## Tasks

- T16 — Modelo de viento determinista (`src/model/wind.js`) + tests. `S16` — inline — done
- T17 — Viento en la navegación: velocidad y deriva en `stepShip`, `timeS` en el mundo y autoguardado. `S17` — inline — done
- T18 — Rosa de los vientos con las dos flechas en el mar. `S18,S19` — inline — done
- T19 — Verificación: tests + smoke de viento. `S16,S17,S18` — inline — done

## Log

L18 (verbatim): "vamos a añadir viento que influira en la velocidad, la direccion y fuerza del viento variara aletoria y uniformemente, tendremos una flecha que indicara la direccion y la fuerza y otra flecha que nos indicara la direccion y fuerza que habra 110 segundos despues, vamos a añadir viento que influira en la velocidad, la direccion y fuerza del viento variara aletoria y uniformemente, tendremos una flecha que indicara la direccion y la fuerza y otra flecha que nos indicara la direccion y fuerza que habra 10 segundos despues"

L19: Aclaración del usuario — el horizonte de la segunda flecha es **10 segundos** (el "110" del primer párrafo fue un error de tipeo). El viento afecta **velocidad y deriva a la vez**.

L20: Implementación completa. `src/model/wind.js` (nuevo): `windAt(seed, t)` determinista con puntos de control cada 12 s interpolados con smoothstep, fuerza acotada 3-22 kn, `windForecast(seed, t)` = exactamente `windAt(seed, t+10)`. El mundo lleva `timeS` y lo serializa, así el viento sobrevive al autoguardado.

L21: Efecto medido en `stepShip` con un rumbo fijo al este durante 30 s: sin viento 926 m, viento de popa 1287 m (+39 %), viento de proa 565 m (−39 %), viento de través 981 m con 324 m de deriva lateral. La rosa de los vientos dibuja la flecha actual (sólida, dorada) y la de +10 s (anillo abierto, azul), más el casco del jugador para leer el viento contra el rumbo.

L22: Evidencia — 162/162 tests node en verde (18 nuevos de viento). Smoke nuevo `scripts/smoke-wind.mjs` verifica por interfaz: la rosa existe y está dibujada (no es un cuadrado vacío), el texto muestra un punto cardinal y una fuerza, el viento cambia en 6 s, navegar a favor recorre más que navegar en contra, y ambas flechas renderizan. La leyenda mostraba el texto duplicado por spans anidados con data-i18n; corregido usando clases y un span por entrada.

L23: Corrección del smoke: la primera versión del timón navegaba en círculos porque apretaba la tecla sin soltarla. Ahora usa timón proporcional (mantener hasta casi el rumbo y soltar), y la comprobación de "más rápido a favor" pasa midiendo distancia recorrida, no la lectura del HUD, que suaviza la velocidad.
