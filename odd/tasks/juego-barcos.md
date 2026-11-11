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
- T6 — Mundo por zonas, movimiento y encuentros. `S6,S9` — en curso
- T7 — Combate en tiempo real por costados con municiones. `S4,S5` — pendiente
- T8 — Flota y progresión. `S7` — pendiente
- T9 — Autoguardado en localStorage. `S8` — pendiente

## Log

L1 (verbatim): "vamos a crear un juego de barcos, la idea es crear una flota o un barco a partir de un valor monetario, la informacion sobre el barco esta en: @modelo_naval.xlsx y @crear_modelo_naval.py , una vez creado el barco lo moveremos y nos encontraremos con tesoros, otros barcos que lucharemos con los cañones a cada lado del barco, con las distintas municiones, etc, empecemos por aqui y vete preguntandome segun te aparezcan duduas"

L2: Decisiones de producto — plataforma web HTML+JS en un solo archivo; escala un barco que crece a flota; combate en tiempo real con babor/estribor, distancia y munición que reparte daño entre nave y tripulación; constructor híbrido de tramos con validación de masa; mundo por zonas de dificultad; autoguardado en localStorage; código en inglés y UI en español.

L3: Milestone 1 cerrado y verificado — 42/42 tests node en verde y smoke Playwright sin errores de consola: arranca con un galeón pequeño viable de 8.126 doblones (10 piezas, 70 hombres), el casco insignia se bloquea por precio (18.926), el diálogo de botadura persiste el barco en localStorage. Evidencia: commits e2645b6, d656173, eeaba7f, 944886e, fd3f68d.
