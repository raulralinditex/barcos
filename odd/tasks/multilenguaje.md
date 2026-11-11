# Juego de barcos — soporte multilenguaje (español e inglés)

Estado: completado. Reemplaza el alcance de idioma de S10 en `juego-barcos.md`.

## Specs

S11. Idiomas soportados: español (`es`) e inglés (`en`). Todo el texto que ve el jugador —interfaz, botones, mensajes de validación, banners, nombres y descripciones de cascos, piezas, municiones, zonas y roles de tripulación— existe en ambos idiomas. No queda texto de interfaz escrito directamente en el código ni en el HTML.

S12. Detección inicial: la primera vez, el idioma se elige del navegador (`navigator.language`). Si empieza con `en`, arranca en inglés; cualquier otro valor cae a español. La elección del jugador se guarda y gana sobre la detección en visitas posteriores.

S13. Selector de idioma: vive solo en el astillero (`index.html`). Cambiar de idioma re-renderiza la pantalla al instante, sin recargar, y persiste la elección. El mar (`sea.html`) no tiene selector: hereda el idioma guardado.

S14. Interpolación: los mensajes con valores dinámicos (masa, precio, días, número de piezas) se arman con marcadores de posición, no concatenando fragmentos de oración, para que cada idioma controle su propio orden y concordancia.

S15. El código, los identificadores, las claves de traducción y los `code` de los issues siguen en inglés (S10 vigente). Los tests que verifican mensajes lo hacen por `code`, no por texto en un idioma.

## Tasks

- T10 — Núcleo i18n: catálogo de claves, interpolación, detección y persistencia + tests. `S11,S12,S14` — inline — done
- T11 — Traducir el dataset naval (12 cascos, 11 piezas, 4 municiones, 3 zonas, 4 roles). `S11` — inline — done
- T12 — Mensajes de validación por clave en `ship-model.js` y `shipyard.js`, con tests migrados a `code`. `S11,S14,S15` — inline — done
- T13 — Astillero: HTML con `data-i18n`, render traducido y selector de idioma. `S11,S13` — inline — done
- T14 — Mar: HUD, banners y pantalla de hundimiento traducidos. `S11,S13` — inline — done
- T15 — Verificación: tests + smoke de ambos idiomas. `S12,S13` — inline — done

## Log

L12 (verbatim): "merge y PR los hago yo, vamos a hacerlo multilenguaje, empecemos con español y ingles"

L13: Decisiones de producto — detección por navegador con la elección recordada; se traduce **todo**, incluidos nombres de cascos, piezas y zonas; el selector vive solo en el astillero.

L14: Implementación completa. `src/i18n/` (nuevo): `core.js` (catálogo, interpolación, detección, persistencia), `es.js` y `en.js` (catálogos completos), `terms.js` (vistas localizadas del dataset + `issueMessage`) e `index.js` (entrada).

L15: El cambio de contrato central fue en los mensajes de validación: `ship-model.js` y `shipyard.js` ya no arman oraciones, emiten `{ level, code, params }` y el texto sale del catálogo. Los dos tests que verificaban texto español ahora verifican `code` y `params` (S15). `one-sided-battery` se partió en `.babor` / `.estribor` para que el mensaje nombre el costado vacío, y `under-gunned-crew` en `.one` / `.many` para la concordancia.

L16: Evidencia — 144/144 tests node en verde (37 nuevos: 19 del núcleo, 12 del catálogo, 12 de términos menos solapamiento). Smoke nuevo `scripts/smoke-i18n.mjs` verifica por interfaz: navegador español arranca en español, navegador inglés en inglés, locale no soportado (fr) cae a español, el selector cambia la pantalla sin recargar, la elección persiste tras recargar y gana sobre el locale, los nombres de casco se traducen (Galeón pequeño → Small galleon), y el mar hereda el idioma sin tener selector propio. Los smokes previos se fijaron en español porque verifican comportamiento, no textos.

L17: Deuda detectada y saldada durante la implementación: los nombres por defecto de las naves vivían en una función del astillero y diferían de lo que yo había puesto en el catálogo (fluyt=Ruyter, nao-armada=Rosario, gran-mercante=Batavia, galeaza=Galeaza). Se movieron al catálogo con los valores originales y se borró la función.
