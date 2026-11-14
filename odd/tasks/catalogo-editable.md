# Juego de barcos — catálogo editable: tuning completo, cascos y armas nuevos, margen histórico

Estado: en curso. S75-S84. Sigue a `escala-y-configuracion.md` (S59-S78).

## Specs

S75. Todos los valores de diseño se editan desde Configuración. Pedido (verbatim, L34 de `escala-y-configuracion.md`): "busquemos todos los valores hardcodeados que hay en el codigo y hagamoslos configurables, hagamos poder crear tipos de naves y tambien tipos de armas en la zona de la configuracion asi como variar los valores por defecto de las naves historicas y armas historicas siempre dentro de un margen historico."

S79. **El tuning completo llega a la pantalla.** Decisión del usuario: "Primero el tuning completo".
- Medición de partida (rehecha en esta tanda): 16 bloques de constantes exportadas, 67 campos numéricos de primer nivel, **25 de ellos no expuestos** hoy. `SETTINGS_FIELDS` tiene 53 campos en 10 grupos.
- Los 25 campos que faltan, por bloque: `WORLD` 3 (`despawnRadiusM`, `disengageRadiusM`, `disengagedDespawnRadiusM`), `COMBAT` 3 (`arcHalf`, `referenceArqueo`, `casualtyPoints`), `LOOT` 1 (`flatGold`), `FORT` 2 (`gunsPerVictories`, `shotsPerGun`), `REPAIR` 2 (`restored`, `minCost`), `TURNING` 4 (bloque entero: `referenceKg`, `exponent`, `minFactor`, `maxFactor`), `ESCORT` 6 (bloque entero: `stationM`, `columnM`, `catchUpSpeed`, `farM`, `stationToleranceM`, `closingShare`), `TRAIL` 3 (bloque entero: `holdS`, `drainS`, `minPx`), `BAR_SCALE` 1 (`minShare`).
- Cada campo entra con **rango y paso propios**, elegidos para que un valor fuera de rango haga el juego más duro o más blando, nunca roto: el mismo contrato de S33. Nada de `min: 0, max: 1e6` de relleno.
- Grupos nuevos en la pantalla: "Maniobra" (`TURNING`), "Escolta" (`ESCORT`), "Rastro de daño" (`TRAIL`), y los campos nuevos se suman a los grupos existentes ("El mar", "Combate", "Astillero", "Reparación", "Botín", "Escala de barras"). Cada grupo nuevo lleva su etiqueta i18n es/en, con **las mismas claves en los dos catálogos**.
- `BAR_SCALE.minShare` entra igual aunque su valor de fábrica sea 0 y S59 lo haya dejado sin piso: es un valor de diseño, y el pedido es que **todos** se puedan tocar.
- Un valor de fábrica que hoy es una expresión (`COMBAT.arcHalf = Math.PI / 3`) se expone en grados en la pantalla y se convierte en radianes al aplicarse, igual que `percent` y `kilometres` ya hacen. El modelo no cambia de unidad.

S80. **Crear cascos nuevos desde Configuración.** Pedido: "hagamos poder crear tipos de naves ... en la zona de la configuracion" (L34), decisión "Crear cascos nuevos desde Configuración" (L35).
- Un casco nuevo es un registro con los mismos campos que uno del catálogo, creado desde la pantalla. Se guarda junto a los ajustes, no en el código.
- Los campos **transcritos** de un casco histórico (`lengthM`, `beamM`, `draftRefM`, `maxPiecesPerSide`, `crewMin`, `priceGold`, `arqueo`) son editables. Los campos **derivados** (`arqueoMid`, `displacementKg`, `lightMassKg`, `waterplaneM2`, `draftRefFraction`) se recalculan desde los transcritos y no se editan a mano: son consecuencia, no decisión.
- El `id` de un casco nuevo se genera desde su nombre y no puede chocar con uno existente. Un casco nuevo **no tiene margen histórico** (decisión L35): no hay dato del que sacarlo, así que sus valores son libres dentro de los rangos del campo.
- Un casco nuevo sin imagen muestra la silueta, como ya hace un casco sin crédito (S34): no se inventa una imagen.

S81. **Crear armas nuevas desde Configuración.** Pedido: "tambien tipos de armas" (L34).
- Una pieza nueva es un registro con los campos de una del catálogo: `name`, `family`, `shotKg`, `rangeM`, `reloadS`, `mountKg`, `priceGold`, `countries`, `ammo`.
- `provenance` de una pieza nueva es `"nueva"`, no se finge una fuente histórica.
- `GUNNERY.gunnersPerGun` recibe su entrada con el valor de fábrica del resto (0,5) y aparece en el bloque de artilleros de la pantalla, como las once piezas actuales.
- La munición que admite una pieza nueva se elige entre las cuatro existentes; no se crean municiones nuevas en esta tanda.

S82. **Los valores por defecto de lo histórico se editan dentro de un margen.** Pedido: "variar los valores por defecto de las naves historicas y armas historicas siempre dentro de un margen historico" (L34).
- La **identidad** de un registro histórico no se toca: `id`, `name`, `type`, `country`, `date`, `provenance` y `note` son de sólo lectura. Lo que se edita son sus números.
- El margen sale **del rango medido del propio registro donde existe** (decisión del usuario: "Del rango medido donde existe"). Hoy el único campo con rango medido es `arqueo`, y el margen de cada casco es la semianchura de ese rango respecto de su punto medio, medido: `galeon-guerra` ±11,1 %, `gran-mercante` ±8,3 %, `galeaza` ±12,5 %, `gran-buque-real` ±15,8 %, `fluyt` ±16,7 %, `galeon-pequeno` ±20,0 %, `carabela-latina` ±33,3 %, `bark-armado` ±33,3 %, `patache` ±42,9 %, `barca-costera` ±48,1 %, `nao-armada` ±61,0 %.
- Cuatro cascos tienen `arqueo` degenerado (`[x, x]`: `jacht`, `zabra`, `gran-galeon`, `pinaza`) y por lo tanto margen medido 0 %. Un margen de 0 % haría el registro intocable, que no es lo que se pidió. Esos cuatro, y **todos los campos que no son `arqueo`**, usan el margen de convención.
- Margen de convención: **±50 %** del valor de fábrica. Es una decisión mía, declarada: no hay dato del que sacarlo, y es el ancho que deja jugar con un valor sin poder convertirlo en otra cosa. El margen es por campo, como pidió L35, y nunca puede salir del rango del campo ni producir un valor ≤ 0 donde el modelo lo divide.
- El margen se **muestra** en la pantalla junto al campo ("dentro de ±20 %"), para que el jugador vea cuánto puede moverse antes de que la pantalla lo frene.

S83. **El catálogo guardado no rompe una partida.** Un catálogo guardado con cascos o armas nuevas entra al cargar el mar o el astillero, como los ajustes de S33.
- Un registro guardado con un `id` que ya existe **no reemplaza** al histórico: se descarta, porque un archivo editado a mano no puede reescribir el catálogo.
- Un catálogo corrupto deja el juego jugable con el catálogo de fábrica, exactamente como un ajuste corrupto cae al valor de fábrica.
- Una nave de la flota guardada cuyo casco ya no existe no se borra: conserva sus números y muestra su `hullId` como nombre, porque perder la flota por un catálogo es peor que mostrar un nombre feo.

S84. **La pantalla sigue diciendo la verdad.** Los smokes y la documentación se actualizan con cada bloque nuevo.
- `scripts/smoke-settings.mjs` cuenta bloques: su número sube con cada grupo nuevo. Se actualiza en el mismo commit que agrega el grupo.
- Un smoke nuevo prueba el ciclo completo de un casco creado desde la pantalla: se crea, aparece en el catálogo del Astillero, se puede comprar y zarpar con él.
- Otro prueba que un valor histórico fuera del margen se recorta al margen, no al rango del campo.

## Tasks

- T92 — `TURNING`, `ESCORT`, `TRAIL` y `BAR_SCALE` entran a `SETTINGS_FIELDS` con rangos y pasos propios; grupos nuevos, i18n es/en, tests. `S79` — inline — pendiente
- T93 — Los 13 campos sueltos que faltan (`WORLD` 3, `COMBAT` 3, `LOOT` 1, `FORT` 2, `REPAIR` 2) se suman a sus grupos; `arcHalf` en grados; tests. `S79` — inline — pendiente
- T94 — `src/model/catalogue.js`: registro de casco nuevo, derivación de campos, id desde el nombre, validación y márgenes; tests (RED primero). `S80,S82` — inline — pendiente
- T95 — `src/model/weapons.js`: registro de pieza nueva, `provenance: "nueva"`, entrada en `gunnersPerGun`; tests. `S81` — inline — pendiente
- T96 — `src/model/catalogue-storage.js`: guardado y carga del catálogo con las tres reglas de S83; tests. `S83` — inline — pendiente
- T97 — Pantalla de Configuración: editor de cascos y de piezas, margen visible por campo, i18n es/en. `S80,S81,S82` — inline — pendiente
- T98 — `scripts/smoke-settings.mjs` al conteo nuevo y dos smokes nuevos (casco creado y comprado; valor recortado al margen). `S84` — inline — pendiente
- T99 — Regresión (`npm test` y todos los smokes), documentación y Engram. `S79,S80,S81,S82,S83,S84` — inline — pendiente
- T100 — Al abrir el astillero con flota, seleccionar la capitana y mostrar su aparejo; conservar el constructor con la flota vacía y probar ambos en navegador. `S83,S84` — inline — hecho

## Log

L43 (verbatim): "continuamos con los barcos"

L44: Punto de partida medido al abrir esta ficha. `npm test` 589/589 verde. Los tres smokes que estaban bloqueados quedaron desbloqueados y verdes con RED observado (`escala-y-configuracion.md`, S78 y L42). El árbol de trabajo sigue sin commitear desde `3da5b9d` en `feat/t7-combate-costados`: 121 entradas.

L45: Medición para S79. 16 bloques de constantes, 67 campos numéricos de primer nivel, 53 ya expuestos en 10 grupos, **25 sin exponer**. Se verificó campo por campo leyendo los objetos vivos con `import()`, no a ojo.

L46: Dos ambigüedades planteadas al usuario, porque las dos cambian el resultado y ninguna la puedo decidir yo.
1. L35 pide "margen por campo, sacado de la procedencia del dato", pero **la procedencia es por registro, no por campo**: cada casco tiene un `provenance` (`R4`, `R6`, `BWAS-1603 / convención`, ...) y el único campo con procedencia propia es `draftSource`. Decisión del usuario: **"Del rango medido donde existe"**. Consecuencia medida: sólo `arqueo` trae rango, así que 11 cascos tienen margen medido (0 % a 61 %) y 4 tienen `arqueo` degenerado; todos los demás campos caen al margen de convención. Opciones descartadas: "Por clase de procedencia del registro" y "Anotar procedencia por campo primero" (~230 anotaciones nuevas).
2. Por dónde arrancar. Decisión del usuario: **"Primero el tuning completo"**. Descartadas: "Primero cascos y armas" y "Primero completar los grupos existentes".

L47 (verbatim, tres pedidos): "areglar deja de ser automatico, añaidos un boton areglar en el panel de la flota" · "cuando se hunde un barco no se vuelve al astillero," · "los paneles de batalla solo se muestran en combate,"

L48: Decisiones del usuario para los tres pedidos de L47.
1. Reparar: **"Uno por nave en la lista"**. Deja de ser automático al llegar al puerto: el jugador repara la nave que quiere, con su botón, como ya vende con el suyo.
2. Hundimiento (aclaración del usuario): **"solo se vuelve al astillero cuando se hunden todas las naves"**. La regla no es "no volver nunca": es que la partida sigue mientras quede una nave, y el cartel de hundimiento sólo aparece cuando no queda ninguna.
3. Paneles: **"Ocultar todo lo de combate"**. Fuera de combate, la pantalla del mar no muestra ni el panel de duelo ni las barras de costado ni la recarga.

L49: El astillero abría con el aparejo del constructor aunque ya hubiera una capitana: `refitId` quedaba vacío hasta pulsar una nave. Ahora la capitana se selecciona al cargar mediante la misma copia de configuración que usa la lista; con flota vacía sigue el constructor. `scripts/smoke-refit-boot.mjs` observó RED sin pulsar (10 piezas del constructor frente a 4 falconetes de la capitana) y GREEN tras el arreglo; `npm test` 611/611 verde.

L50 (verbatim): "vamos a volver a mostar el panel de combate siempre"

L51: El usuario revierte S85: los paneles de combate vuelven a mostrarse siempre. Se aplica después de commitear lo que ya está verificado (S86 y el defecto del panel de Aparejo), para que la reversión quede como un cambio aislado y revisable, no mezclada con el trabajo cerrado.

S86. Reparar deja de ser automático y pasa a ser un botón por nave. Pedido (verbatim, L47): "areglar deja de ser automatico, añaidos un boton areglar en el panel de la flota".
- Al llegar al puerto el mar ya no repara nada ni gasta un doblón: sólo guarda y navega al Astillero, que es donde están los botones.
- Cada nave de la flota lleva su botón "Reparar · {gold}", al lado de "Vender". El botón está deshabilitado cuando el casco está sano y dice por qué.
- Reparar una nave no toca a las demás: probado, capitana 40 % → 100 % con la escolta intacta en 30 %.
- El diálogo de reparación al abrir el Astillero ya no se abre solo. La forma de reparar es el botón de cada nave.
- Decisión del usuario: `src/model/auto-repair.js` y `test/auto-repair.test.js` se **borran**, porque el módulo quedó sin consumidores y su regla ya no existe. Eso retira 6 tests de S49; el usuario lo autorizó explícitamente ("Borrar módulo y test").
- Evidencia: `scripts/smoke-manual-repair.mjs` con RED observado (sin el manejador del botón: "the repair button did not repair the captain (40)") y GREEN. `npm test` 605/605 (611 menos los 6 de S49).
