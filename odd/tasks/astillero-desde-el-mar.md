# Entrar al astillero desde el mar

Clic en el ancla de un astillero mientras se navega: entra en él. Si la capitana no está en su radio de atraque, es una **visita** — las naves no se mueven y sólo funciona lo que no las necesita.

## Specs

S163. **Desde el mar se entra al astillero haciendo clic en su ancla.** Pedido (verbatim): "cuando estamos en el mar, si cliqueamos en el icono de un astillero, entrar en el, podremos hacer todo menos lo que necesitemos un barco como mercado etc."
- **S163-A, el clic siempre entra.** Un clic sobre el ancla de un astillero abre el astillero de ese astillero, esté la capitana donde esté. No se pide confirmación ni se ofrece navegar: se entra.
- **S163-B, fuera del radio de atraque es una visita.** Si la capitana no está dentro del radio de atraque de ESA yarda, la pantalla la muestra en modo visita (S133-C, la regla que ya existe entre astilleros): los datos están a la vista y las acciones que necesitan una nave se rechazan con el motivo escrito.
- **S163-C, una visita no mueve ninguna nave.** Entrar de visita desde el mar no cambia la posición de ninguna capitana ni de ninguna escuadra, no gasta suministro y no altera el guardado del mar. Es mirar, no viajar.
- **S163-D, qué funciona en visita.** De las salas del astillero, en visita funciona **Comprar buque**: se compra un casco nuevo, que nace en la yarda que se está mirando. El resto —Flota con sus acciones de reparar, rearmar y vender; Astillero con reforma y aparejo; Mercado— queda en modo visita con su motivo a la vista, porque todas necesitan una nave presente en esa yarda.
- **S163-E, la capitana en el mar no tiene yarda.** Hoy `captainYard()` cae al puerto de casa cuando la capitana está navegando, así que el astillero cree que está atracada y habilita acciones sobre un casco que no está. Una capitana en el mar no está atracada en ninguna parte: se dice así, y toda acción de presencia se rechaza.
- **S163-F, al volver al mar no se perdió nada.** Entrar de visita y salir no toca el guardado del mar: la capitana sigue en su posición, con su rumbo, su velocidad, su carga y su suministro, exactamente como estaba.
- **S163-G, el ancla se ve y se puede apuntar.** El ancla de cada astillero en el mapa tiene que ser un blanco claro: se ilumina al pasar el ratón por encima y el cursor dice que se puede entrar. Hoy el ancla es un dibujo sin zona de clic.
- **S163-H, i18n es/en** del aviso de visita desde el mar y del cursor.

## Tasks

- T53 — S163-E: `captainYard()` deja de mentir cuando la capitana navega, y la presencia se resuelve contra la yarda en pantalla. Ruta: inline.
- T54 — S163-A/B/G: la zona de clic del ancla en `src/ui/sea.js`, el cursor y el resaltado. Ruta: inline.
- T55 — S163-A/B: la yarda destino viaja del mar al astillero y el astillero abre en visita cuando corresponde. Ruta: inline.
- T56 — S163-D: las salas que no necesitan nave siguen funcionando en visita; las demás se rechazan con el motivo. Ruta: inline.
- T57 — S163-F: el viaje de ida y vuelta no toca el guardado del mar. Ruta: inline.
- T58 — S163-H, el smoke y la verificación completa. Ruta: inline.

## Log

L61 (pedido, verbatim): "ahora podemos tener capitanas en el astillero y capitanas en el mar, necesitamos cuando estamos en el mar, si cliqueamos en el icono de un astillero, entrar en el, podremos hacer todo menos lo que necesitemos un barco como mercado etc."

L62 (alcance, verbatim): "si la capitana no esta en el radio de atraca, simplemente vas de visita al astillero, las naves no se mueven, y solo puedes hacer cosas en el astillero que no necesiten naves". De las salas ofrecidas, eligió sólo **Comprar buque** como funcional en visita.

L63 (estado medido antes de tocar nada): el mar dibuja cada astillero de `SHIPYARDS` como un círculo con un ancla (`drawSea`), pero **no hay ninguna zona de clic**: los clics del canvas sólo buscan escuadras (`squadronAtPointer`). El astillero se abre hoy por una única vía, `updatePortArrival`, que dispara cuando la capitana **entra en el puerto de casa** y navega a `index.html#comprar`. `app.js` elige la yarda con `screenShipyard() = shipyardById(viewedYardId) ?? captainYard()`, y `captainYard()` devuelve `currentShipyard(posición) ?? puerto de casa`: **con la capitana en el mar miente**, porque cae al puerto de casa y `visitingYard()` compara mostrada contra atracada y da falso. Hay 10 llamadas a `refuseVisit()` en `app.js`; las salas son flota, comprar, astillero (reforma) y mercado.

L64 (cierre de S163, commit `e533090`). `npm test` **1004/1004** (998 + 12 en `test/yard-presence.test.js`). `scripts/smoke-shipyard-from-sea.mjs` en 0.

**El defecto de fondo era el que decía S163-E y era peor de lo que parecía.** `captainYard()` caía al puerto de casa cuando la capitana navegaba, y `visitingYard()` exigía `shown && moored`, así que una capitana en el mar **no era visita de nada**: el astillero la trataba como presente en la yarda que mirara y habilitaba acciones sobre un casco que no estaba. Peor: `shipsAvailableAtYard` compara la yarda en pantalla contra la yarda de la capitana, y con `captainYard()` mintiendo esa comparación nunca fallaba.

**Tres reglas, en el modelo, con sus tests:**

| Regla | Dónde | Test |
|---|---|---|
| Una capitana navegando no está atracada en ninguna parte | `captainYardId` en `fleet.js` | 4 |
| Un clic en el ancla nombra esa yarda | `nearestShipyard` en `world.js` | 4 |
| Un casco comprado en una yarda se queda en ella | `reconcileCaptainPosition(..., { freshlyBought })` | 2 |

**El caso `freshlyBought` es el hallazgo que no estaba en la ficha.** Comprar un casco lo vuelve capitán (S7) y el guardado del mar conserva la posición de la capitana ANTERIOR, así que la reconciliación de `showScreen` escribía `yardId: null` encima de la yarda donde se acababa de comprar: el casco nacía en alta mar. Medido en el navegador: `Golden Hind(yard=null)`. Con el arreglo: `Golden Hind(yard="cala-del-abismo")`. No se arregló en `reconcileCaptainPosition` para todos los casos porque **rompe S130** —una capitana atracada en casa que aparece en el mar SÍ debe pasar a `null`—; el llamador nombra el casco que acaba de comprar, así que la excepción es de esa compra y no de la regla.

**Dos regresiones mías, encontradas y arregladas antes de cerrar:**

1. **`smoke-fleet` en rojo** («sailing must not lose the fleet, got sin naves»): `localFleet()` filtraba por `captainYard()?.id`, que ahora es `null`, así que el panel de flota quedaba **vacío** al abrir el astillero desde el mar. Verde en la base, rojo con mi cambio. Arreglado: sin yarda no hay ventana por la que filtrar.
2. **Escape no salía del astillero** (reporte del jugador, verbatim: "no funciona esc para salir del astillero e ir al mar"). `canSailOut()` exigía `!visitingYard()`, y con la capitana en el mar toda yarda es visita, así que el botón y la tecla quedaban muertos. Arreglado con `captainIsUnderWay()`: desde el mar, salir es volver a la travesía que ya estaba en curso, sin mover nada.

**Lo que quedó cableado en pantalla:** el clic en el ancla (`YARD_CLICK_RADIUS_M = 320`), el resaltado y el cursor al pasar por encima, el hash `#comprar:<yardId>` que abre esa yarda, y `launch()` sin `refuseVisit()` cuando no es una reforma.

**Verificado en el navegador real**: la capitana en `(1200,300)` entra a Cala del abismo, compra un casco que nace en esa yarda, el mercado la rechaza con motivo, Escape vuelve al mar y la capitana sigue en `(1200,300)` con su misma velocidad.

**Smokes en 0**: shipyard-from-sea, yard-entry, yard-switch, yard-escape, fleet, market, market-ship, refit, tabs, settings-menu, oars, sea.

**Smokes que fallan y NO son de este cambio**: `smoke-sale` y `smoke-soldiers`, comprobados contra la base.

**Límite conocido**: el resaltado del ancla se midió por código, no con el ratón sobre el canvas en un smoke; el clic del ancla está cubierto por `nearestShipyard` en el modelo y por la entrada por hash en el smoke, pero el gesto completo ratón→ancla→astillero no tiene smoke propio.

L69 (revisión del delta de S163 y S164). Sin revisión nativa: el candidato es de nuevo la rama entera (`base-ref 7ace33b`, 58 archivos) y ya falló tres veces con `lens_context_budget_exceeded` sin crear autoridad. **Divergencia reportada**: el target del recordatorio (`e6b2f0ac…`) no coincide con el que devuelve `gentle_review inspect` (`5baf04b2…`); el reminder consume la generación observada por la sesión e `inspect` lee el árbol, y no se inventó ningún valor.

**Rango revisado**: `97439c1..HEAD`, 1001 líneas en 12 archivos. Cero líneas eliminadas en `test/`: no se relajó ninguna aserción.

**Bordes medidos, todos sanos:**

| Caso | Resultado |
|---|---|
| `captainYardId` con capitana en el mar (`yardId: null`) | `null` — correcto |
| `captainYardId` con `yardId` ausente (guardado viejo) | puerto de casa — deliberado |
| `captainYardId` con `yardId` basura | puerto de casa — degrada al comportamiento viejo |
| `captainYardId` sin capitana, o flota `null` | `null`, sin lanzar |
| `freshlyBought` sobre un casco que NO es capitán | no lo toca |
| `freshlyBought` sobre un casco sin yarda válida | reconcilia normal |

**Un falso positivo mío, para no repetirlo**: probé `#sala-que-no-existe:cala-del-abismo` con un fixture **sin flota** y vi «Puerto de casa», y lo tomé por un defecto de mi parseo. Con una capitana real la yarda se respeta (`Cala del abismo`, selector `cala-del-abismo`). El fallo era del fixture: sin capitana, la reconciliación deja la flota vacía y `screenShipyard()` cae al puerto de casa, que es el comportamiento de siempre. **Un fixture sin flota no sirve para medir la yarda en pantalla.**
