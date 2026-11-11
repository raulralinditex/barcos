# Juego de barcos — flota desde presupuesto, navegación, tesoros y combate artillero

Juego web (HTML+JS, sin build) cuyo motor naval se calibra con `modelo_naval.xlsx` y `crear_modelo_naval.py`.
Estado: milestone 1 — constructor naval con validación de masa.

## Specs

S1. Presupuesto monetario: el jugador arranca con un valor monetario y el barco se compone gastando ese dinero en casco, artillería, dotación, provisiones y carga.

S2. Constructor híbrido: se elige un casco histórico con rango de arqueo (patache, zabra, galeón, fluyt, jacht, nao, galeaza, gran buque real) y encima se compra armamento, tripulación y carga; el balance de masa del modelo decide si la configuración cabe realmente.

S3. Validación de masa real, portando las fórmulas de `05_Calculadora`:
`U = desplazamiento_max − M0`;
`M_armas = Σ qty_i·(montaje_i + disparos_i·(proyectil_i + pólvora_i + otros_i))`;
`M_provisiones = N·D·r/(1 − pérdida)`;
`C_max = U − M_armas − M_provisiones − E − B − R`;
`f = (M_real − M0)/U`;
`T = T_ref + (f − f_ref)·U/(ρ·A_flotación)`;
`V = V_ref·(M_ref/M_actual)^β`.

S4. Combate en tiempo real con costados separados: cada pieza pertenece a babor o estribor, y solo dispara si el objetivo cae en el arco de ese costado y dentro del alcance eficaz de la pieza.

S5. Municiones diferenciadas: bala de hierro, bala de piedra (pedrero), metralla/hailshot y proyectil compuesto; cada una reparte su daño de forma distinta entre casco, aparejo y tripulación.

S6. Mundo por zonas de dificultad concéntricas: costera (segura) → mar abierto → abismo (peligrosa), cada una con más botín y enemigos más duros.

S7. Progresión de un barco a una flota: se empieza capitaneando una nave y el oro permite comprar y mandar más.

S8. Autoguardado en `localStorage` con opción de borrar partida.

S9. Tesoros y encuentros en la navegación: al mover el barco por el mundo se descubren tesoros y velas enemigas.

S10. Idioma: código, comentarios e identificadores en inglés; toda la interfaz de usuario en español.

## Tasks

- T1 — Datos navales y calibración del juego, extraídos del xlsx. `S1,S2,S3` — inline — done — `e2645b6`
- T2 — Modelo de masa, calado y velocidad (funciones puras) + tests. `S3` — inline — done — `d656173`
- T3 — Economía: precios de casco, piezas, dotación, provisiones y munición. `S1,S2` — inline — done — `eeaba7f`
- T4 — Constructor naval: validación, fábrica de barcos y veredicto. `S2,S3` — inline — done — `944886e`
- T5 — UI del astillero con previsualización del casco y puertos de cañón. `S1,S2,S10` — inline — done — `fd3f68d`
- T6 — Mundo por zonas, movimiento y encuentros. `S6,S9` — done — `d428272`
- T7 — Combate en tiempo real por costados con municiones. `S4,S5,S6` — inline — done — ver L6
- T8 — Flota y progresión. `S7` — inline — done — ver L10
- T9 — Autoguardado en localStorage. `S8` — inline — done — ver L10

## Log

L1 (verbatim): "vamos a crear un juego de barcos, la idea es crear una flota o un barco a partir de un valor monetario, la informacion sobre el barco esta en: @modelo_naval.xlsx y @crear_modelo_naval.py , una vez creado el barco lo moveremos y nos encontraremos con tesoros, otros barcos que lucharemos con los cañones a cada lado del barco, con las distintas municiones, etc, empecemos por aqui y vete preguntandome segun te aparezcan duduas"

L2: Decisiones de producto — plataforma web HTML+JS en un solo archivo; escala un barco que crece a flota; combate en tiempo real con babor/estribor, distancia y munición que reparte daño entre nave y tripulación; constructor híbrido de tramos con validación de masa; mundo por zonas de dificultad; autoguardado en localStorage; código en inglés y UI en español.

L3: Milestone 1 cerrado y verificado — 42/42 tests node en verde y smoke Playwright sin errores de consola: arranca con un galeón pequeño viable de 8.126 doblones (10 piezas, 70 hombres), el casco insignia se bloquea por precio (18.926), el diálogo de botadura persiste el barco en localStorage. Evidencia: commits e2645b6, d656173, eeaba7f, 944886e, fd3f68d.

L4: T6 cerrado y verificado — 58/58 tests en verde, smoke Playwright del mar sin errores: el barco zarpa de (210,70), navega con W/S/A/D (velamen por cuartos, timón con tope), el autosalvar escribe un mundo válido cada 3 s, tesoros y velas enemigas aparecen por densidad de zona, y la bolsa es compartida con el astillero (la botadura cobra el precio). Ritmo de navegación: arcadeScale 12 (~40 m/s a toda vela). Evidencia: commit d428272.

L5: T7 was interrupted during combat UI integration. The worker returned `Writer bootstrap requires the original safe project root` with the session in Documents and the repository nested at Documents/barcos. No usable native Agent fallback was found. Existing uncommitted work must be preserved; tests and browser checks have not been run after the latest UI changes. Resume from a session opened at the barcos repository root and verify integration before marking T7 done.

L6: T7 cerrado y verificado en una sesión abierta en la raíz del repo. Integración completada en `src/ui/sea.js`: `processCombat`, `drawFx`, `updateTargetPanel` y `showGameOver` se llaman desde el frame loop, `playerCombat` se crea y se restaura del autoguardado, el HUD muestra casco/aparejo/tripulación/munición B-E, y Q/E disparan cada costado. Se agregó el estado `wreck` (pecio saqueable) al mundo, al dibujo y al minimapa.

L7: Tres defectos reales encontrados y corregidos al verificar, no asumidos:
1. **Combate irresoluble**: con `damageScale 0.6` hacían falta ~350 andanadas para hundir una zabra, más munición de la que lleva cualquier carga. Recalibrado a `damageScale 10` con `hullToughness = arqueo / referenceArqueo`, así un casco pesado aguanta más que uno liviano.
2. **S6 violado**: el armamento enemigo dependía solo del tamaño del casco, nunca de la zona, así que en la costa (la zona "segura" según S6) un fluyt montaba 7 cañones por costado contra los 5 del jugador. Ahora la zona decide calibre y cantidad (`ENEMY_ORDNANCE`, `ENEMY_GUN_SHARE`): costa con piezas livianas, abismo con baterías pesadas.
3. **Doble movimiento del enemigo**: el paso de deriva de `world.js` seguía moviendo al enemigo ya enganchado, peleando contra su AI de combate. Ahora la deriva se retira cuando `engaged` está activo.

L8: Ritmo de combate: `timeScale` pasó de 6 a 20 (andanadas cada 4-6 s en vez de 15-20 s). Balance medido con 36 duelos por zona (6 cascos x 6 semillas), jugador con la carga por defecto del astillero: costera 31 victorias / 5 derrotas (media 10 s), abierto 1/35, abismo 0/36. La progresión de dificultad de S6 ahora existe.

L9: Evidencia de T7 — 86/86 tests node en verde; smoke Playwright de combate (`scripts/smoke-combat.mjs`) OK observando por interfaz: panel de objetivo al entrar en rango, Q sin blanco a babor no dispara, E consume munición y baja el casco enemigo, el enemigo hundido deja un pecio saqueable (293 doblones). Smokes de mar y astillero siguen sin errores de consola. Los binarios de Playwright no estaban instalados en esta máquina: `npx playwright install chromium` es requisito previo para correr los smokes.

L10: T8 y T9 cerrados. Decisiones de producto tomadas por el usuario: "mandar más" (S7) significa **varias naves con capitana elegible** — se compran cascos, se conservan todos en puerto y el jugador elige cuál zarpa; el borrado de partida (S8) es **completo y con confirmación**.

T8 — `src/model/fleet.js` (nuevo, funciones puras): `addShip` (la nave comprada pasa a ser capitana), `setCaptain`, `removeShip` (perder la capitana entrega la flota al siguiente casco), `captainShip`, `fleetWorth`, `fleetUpkeep`, `serializeFleet`/`deserializeFleet`. El astillero muestra la franja "Tu flota" en el topbar con la capitana marcada y permite promover cualquier nave con un clic. `sea.js` zarpa con `captainShip(fleet)`, no con una nave suelta. Al hundirse, la nave sale de la flota pero el resto sobrevive.

T9 — `saveConfig` ya autoguardaba; faltaba el borrado. Botón "Borrar partida" con diálogo de confirmación que limpia `config`, `game`, `current-ship` y `fleet`, y recarga en estado inicial. Cancelar no toca nada.

Migración: una partida guardada con la clave vieja `barcos:current-ship:v1` se adopta como flota de una nave (`deserializeFleet(json, legacyShip)`), así nadie pierde su barco. Cubierto por test.

L11: Evidencia T8/T9 — 101/101 tests node en verde (15 nuevos de flota). Smoke Playwright nuevo (`scripts/smoke-fleet.mjs`) verifica por interfaz: astillero arranca sin naves, la primera botadura crea la capitana, comprar un segundo casco conserva el primero y lo corona capitán, promover otra nave funciona, el mar zarpa con la capitana persistida, "Borrar partida" pide confirmación, cancelar conserva todo y confirmar deja `fleet`/`game`/`current-ship` en null con el astillero sin naves. Smokes de mar, astillero y combate sin errores de consola.

Corrección de contrato: `smoke-ui.mjs` y `smoke-combat.mjs` sembraban `barcos:current-ship:v1`; ahora siembran `barcos:fleet:v1`, que es la fuente de verdad. El smoke del mar sigue pasando sin cambios porque ejercita la migración legacy.
