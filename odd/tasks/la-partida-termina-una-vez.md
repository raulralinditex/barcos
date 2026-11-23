# La partida termina una sola vez

Cuando se hundía todo el escuadrón, el jugador volvía al astillero y encontraba su capitana hundida en la lista, sin poder repararla. Compraba naves, zarpaba, y aparecía en el punto donde se hundió, sin las naves compradas, y con el diálogo de hundimiento otra vez.

## Specs

S175. **Cuando no queda ningún barco, la partida termina y el astillero queda limpio.** Reporte del jugador (verbatim): "cuando se me hunde una capitana, me sale el dialogo el barco se hunchio, volver al astillero, y cuando vuelvo, veo a la capitana sin poderla areglar, y cuando creo mas naves, y le doy a zarpar, en vez de salir del astillero, aparezco donde se hundio la capitana, pero sin los barcos que cree, y me vuelve a salir el dialogo de se hunchio la capitana volver al astillero. lo que quiero es que cuand no me quedan ningun barco, se salga el dialogo se hundio la capitana, volver al astillero, pero en el astillero no hay ningun barco hundido, puedo crear mas barcos y cuando zarpo, salgo del astillero no del punto donde me hundi".
- **S175-A, el diálogo sale cuando no queda nada a flote.** Ya era así (S87/S155-C): `squadronStatus` mira toda la línea y sólo da la partida por terminada cuando se hundió todo. No cambia.
- **S175-B, en el astillero no queda ningún casco hundido.** Al volver, **todos** los cascos con la condición a cero salen de la flota, no sólo la capitana. Antes se quitaba únicamente `runtimeShip`, y las escoltas hundidas quedaban en la lista como naufragios imposibles de reparar.
- **S175-C, la partida muerta no se vuelve a escribir.** Con `gameOver`, `saveGame` no escribe nada. El `beforeunload` corre justo cuando el jugador sale del mar, y era el que resucitaba el guardado con `world.ship` en el punto del hundimiento y las naves que ya no existían.
- **S175-D, una nave nueva zarpa desde el astillero.** Con el guardado del mar borrado y la flota limpia, `createWorld` abre un mar nuevo en el puerto, con la nave comprada como capitana. Sin diálogo de hundimiento.

## Tasks

- T102 — S175-B: `gameoverBack` filtra todos los cascos con `hull <= 0`, no sólo la capitana; si la capitana sobrevive, conserva el mando. Ruta: inline. Hecho.
- T103 — S175-C: `saveGame` no escribe cuando `gameOver`. Ruta: inline. Hecho.
- T104 — S175: `scripts/smoke-gameover-return.mjs`. Ruta: inline. Hecho.
- T105 — Verificación: `npm test` completo, los smokes de hundimiento y del mar, con RED medido. Ruta: inline. Hecho.

## Log

L103 (reporte, verbatim): "cuando se me hunde una capitana, me sale el dialogo el barco se hunchio, volver al astillero, y cuando vuelvo, veo a la capitana sin poderla areglar, y cuando creo mas naves, y le doy a zarpar, en vez de salir del astillero, aparezco donde se hundio la capitana, pero sin los barcos que cree, y me vuelve a salir el dialogo de se hunchio la capitana volver al astillero. lo que quiero es que cuand no me quedan ningun barco, se salga el dialogo se hundio la capitana, volver al astillero, pero en el astillero no hay ningun barco hundido, puedo crear mas barcos y cuando zarpo, salgo del astillero no del punto donde me hundi".

L104 (reproducido en navegador real **antes** de tocar nada). Con capitana y escolta hundidas:

```
ANTES de volver:  overlay visible, flota ['cap(hull=0)', 'esc(hull=0)'], game EXISTE
DESPUES:          url index.html#comprar
                  flota ['esc(hull=0)', 'cap(hull=0)']   ← las hundidas siguen
                  game REESCRITO, world.ship = { x: 210, y: 70, id: 'cap' }   ← el punto del hundimiento
```

Las dos causas, medidas:

1. **`gameoverBack` quitaba sólo `runtimeShip`** (`removeShip(fleet, runtimeShip.id)`). La escolta hundida se quedaba, y la capitana **volvía** porque el merge de `writeFleetSave` la restauraba desde la hoja guardada. De ahí "la capitana sin poderla arreglar".
2. **`beforeunload` llamaba a `saveGame` después del borrado** y reescribía `barcos:game:v1` con el mundo muerto. De ahí que al zarpar de nuevo apareciera "donde se hundió la capitana, pero sin los barcos que creé": el mundo viejo se cargaba con la nave vieja, y la flota nueva se descartaba.

L105 (cierre). **`npm test` 1071/1071.** Siete smokes en 0: `gameover-return` (nuevo), `own-wreck`, `command-handover`, `seaworthy`, `auto-repair`, `mode-save`, `dock`.

**RED honesto**: con `src/ui/sea.js` de `HEAD`, el smoke falla nombrando las dos causas — «no sunk hull may wait in the shipyard, found ["smoke-escort","smoke-flagship"]» y «the dead voyage must not be written again on the way out».

**Un detalle que costó**: el mar autoguarda cada 3 s, así que leer `barcos:game:v1` a los 1,5 s da `null` y parece que el mar no arrancó. El HUD ya decía «Gamma» y el overlay estaba oculto: era mi aserción la que medía demasiado pronto. Se espera la escritura, que es lo que un jugador consigue navegando un momento.

**Un matiz de diseño que se respetó**: `gameoverBack` conserva el mando de la capitana si sobrevive. Hoy no puede pasar (el diálogo sólo sale cuando se hundió todo), pero la regla no debe depender de eso.
