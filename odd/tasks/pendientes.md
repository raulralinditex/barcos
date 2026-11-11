# Juego de barcos — pendientes

Estado: las dos peticiones que estaban acá (T25 barritas de estado, T26 reparar el barco) se cerraron en `odd/tasks/estado-y-reparacion.md` (specs S21-S23, commits `10d0f3d`, `4468287`, `deadc8e`).

## Pendientes abiertos

### Reparar las naves de la flota que no son capitana

S22 repara sólo la nave que el jugador capitanea. Las otras naves de la flota quedan con el daño que traían, porque el puerto del mar no tiene interfaz de flota (sólo el astillero la lista, y ahí no se repara). Si se quiere, el camino natural es un panel de flota en el puerto base con el estado y la reparación de cada nave.

### `scripts/smoke-wind.mjs` es flaky (preexistente)

Verificado contra el commit base `55c6ea5` en un worktree aparte: falló 5 de 10 corridas con "downwind should cover more ground" y "downwind should be faster". No es una regresión de esta feature.

Causa: el bucle de timón del smoke lee el rumbo desde `localStorage`, que se guarda cada 3 s, así que corrige con datos viejos y a veces no llega al rumbo pedido. La prueba compara después la distancia recorrida, y con el rumbo mal puesto el resultado se da vuelta.

No se tocó: es un test existente y la regla vigente pide confirmación explícita antes de editarlo. Propuesta, si se autoriza: leer el rumbo de la propia página (una función expuesta para el smoke o un `data-` en el HUD) en lugar de `localStorage`, o esperar 3 s entre correcciones de timón.

## Estado del repositorio

- Rama `feat/t7-combate-costados`, sobre `master`. Merge y PR los hace el usuario (lo pidió así).
- 201/201 tests (`npm test`), smokes con exit 0: i18n, fleet, sea, combat, ui, swivel, state.
- Para jugar: `python3 -m http.server 8765` en la raíz y abrir `http://localhost:8765/index.html`.
- Los smokes necesitan ese servidor y `npx playwright install chromium` la primera vez.
- `git` pasa por un wrapper que falla con 401: usar `/usr/bin/git`.
- Regla global vigente: no editar tests existentes sin confirmación explícita del usuario.
