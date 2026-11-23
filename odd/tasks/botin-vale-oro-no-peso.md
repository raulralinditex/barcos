# El botín vale oro, no peso

Una presa podía valer 522 doblones o 13.440.000 según el bien que le tocara en suerte. El jugador llegó al astillero con 13 millones en la bodega. La regla pasa a ser de valor: la presa vale lo que vale su casco, y los bienes son la forma que ese valor toma.

## Specs

S176. **La bodega nunca acepta más de lo que puede llevar.** Bug encontrado al investigar S177, y es la parte de "se cuentan varias veces" que el jugador sospechaba (verbatim: "creo que por alguna razon se cuentan varias veces las mercancias y por eso aumenta mucho el peso de las mismas").
- **S176-A, el espacio se mide después de cada línea.** `awardHold` calculaba `freeKg` **una vez** antes del bucle y lo usaba para todas las líneas del botín: tres líneas cabían tres veces. Medido: una bodega de 40.000 kg aceptaba 40.140 kg.
- **S176-B, lo que no entra se reporta.** El excedente vuelve como `left`, con su peso, para que la pantalla avise. Nada se descarta en silencio.

S177. **Una presa vale lo que vale su casco, no lo que pesa su carga.** Reporte del jugador (verbatim): "llego al astillero con mercancia por valor de 13 millones de doblones, chequea que no hay algun bugs".
- **S177-A, el objetivo es un valor.** `enemyHoldFor` apunta a `precioDelCasco × prizeShareOfHull × factorZona × banda`. Antes apuntaba a 12 t de lo que saliera.
- **S177-B, el bien es la forma del valor.** Las unidades de una línea se compran con el valor de la línea al precio base del bien, así que un bien caro llega en poca cantidad y uno barato a granel. Eso es el arreglo y también lo realista.
- **S177-C, el peso es un techo, no un objetivo.** El valor solo compraba 104 t de vino para un gran galeón, que ningún casco puede llevar. El techo es el `enemyHoldKg` de siempre por zona: el valor decide, el peso sólo impide el absurdo.
- **S177-D, el valor que no entra en el peso se recoloca.** Doce toneladas de madera no pueden llevar una presa rica: la línea se quedaba corta y dos presas del mismo casco y agua diferían 8×. El valor sobrante va a los bienes más densos en valor por kilo, que es la carga que llevaría un mercante de verdad.
- **S177-E, ninguna presa llega al millón.** Afirmado para 4 cascos × 3 aguas × 120 ids.
- **S177-F, sigue siendo determinista.** Mismo id, misma presa: un reload no puede re-tirar los dados.

## Tasks

- T106 — S176-A/B: `roomKg` que baja con cada línea en `awardHold`. Ruta: inline. Hecho.
- T107 — S177-A/B/C/D: `HOLD_VALUE` y `enemyHoldFor` reescrito de peso a valor, con techo de peso y recolocación del sobrante. Ruta: inline. Hecho.
- T108 — S176/S177: `test/hold-capacity.test.js` (6 tests) y `test/prize-value.test.js` (7 tests). Ruta: inline. Hecho.
- T109 — Verificación: `npm test` completo y los smokes de comercio, con RED medido. Ruta: inline. Hecho.

## Log

L106 (reporte, verbatim): "creo que las mercancias encontradas se descontrolan, porque llego al astillero con mercancia por valor de 13 millones de doblones, chequea que no hay algun bugs". El jugador eligió después «hazlo» al plan de arreglo de raíz, y dejó su bodega como está.

L107 (medido antes de tocar nada). **El 13 M no era acumulación de muchas presas: era una sola.** Medido: una presa en el abismo con 805 diamantes valía 3.666.598; con 1.411 valía 6.325.928. Y la causa: el botín apuntaba a 12 t de lo que saliera, así que 12 t de maderas (18 unidades × 9) y 12 t de diamantes (3.000 × 1.400) eran la misma tirada.

**El bug de acumulación era real pero secundario**, y el jugador lo había sospechado: `awardHold` medía el espacio una vez. Con botines reales casi no se disparaba porque `enemyHoldFor` ya acotaba el total a 12 t.

L108 (cierre). **`npm test` 1084/1084** (1077 más 7 nuevos de S177; los 6 de S176 ya estaban). Smokes en 0: `market`, `hold-buy`, `dock`, `own-wreck`, `gameover-return`.

**Efecto medido**, valor de venta de una presa típica:

| Casco | Precio | Presa típica | Antes |
|---|---|---|---|
| patache | 900 | 31 | hasta 522 |
| galeón pequeño | 3.200 | 454 | hasta ~3.000.000 |
| galeón de guerra | 6.500 | 914 | hasta 6.325.928 |
| gran galeón | 11.000 | 4.923 | hasta 13.440.000 |

La presa vale ahora entre el 3 % y el 45 % del casco. La banda dentro del mismo casco y agua bajó de cuatro órdenes de magnitud a 2,4-5,1×.

**Dos defectos que encontraron mis propios tests, y eran míos**: la primera versión del arreglo dejaba presas **vacías** (el sorteo elegía bienes caros y `floor` daba 0) y **104 t de peso** (el valor solo no miraba el casco). Los dos están cubiertos por test ahora.

**Un fallo previo, ajeno y no tocado**: `scripts/smoke-sea-collect.mjs` está **rojo en `HEAD` limpio** (`git stash -u` verificado), idéntico con y sin este cambio: espera que la ronda termine sola y el banner dice "+78 doblones · tesoro rescatado". No tiene relación con el botín de enemigos.

**Lo que NO se tocó**: la bodega de 13 M que el jugador ya tiene. Decisión suya (verbatim): "Dejala, ya la tenés". Al cambiar la regla, lo que está a bordo no se altera.
