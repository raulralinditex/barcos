# Editores binarios

Los campos de Configuración que son sí/no se dibujan como casilla, no como número. Al cerrar la lista quedaban dos sueltos.

## Specs

S168. **Todo campo que es sí/no se dibuja como casilla.** Pedido (verbatim): "vamos a trabajar en los editores de la configuracion, los editores binarios, hazlos con un check".
- **S168-A, los dos que faltaban.** `combat.showRange` («Dibujar el círculo de alcance») y `combat.autofire` («Disparo automático de la capitana») se dibujan como casilla. Eran los dos únicos campos sí/no (`min 0`, `max 1`, `step 1`) que seguían saliendo como input numérico: S117 los había dejado así a propósito, y el jugador pidió lo contrario.
- **S168-B, el valor guardado no cambia.** Un campo encendido sigue siendo `1` y apagado `0`, tanto en el modelo como en `barcos:settings:v1`. La casilla sólo cambia el control, no el dato: recargar devuelve lo que el jugador dejó.
- **S168-C, una fracción no se vuelve casilla.** Un campo que toma valores entre 0 y 1 en pasos menores que 1 (porcentajes, cuotas) sigue siendo número. Una casilla sólo puede decir 0 o 1, así que ponerla ahí tiraría el 0.35 del jugador.
- **S168-D, la declaración la sostiene un test, no una heurística.** Ningún campo sí/no puede quedar sin `control: "switch"`, y ningún switch puede ponerse sobre un campo que no sea sí/no. Las dos direcciones se afirman en `test/settings-controls.test.js`.
- **S168-E, i18n es/en**: las dos etiquetas ya existían y no cambian.

## Tasks

- T75 — S168-A/B: `control: "switch"` en los dos campos de `src/model/settings.js`, y el comentario de `isSwitch` en `src/ui/settings-tab.js` que afirmaba lo contrario. Ruta: inline. Hecho.
- T76 — S168-D: `test/settings-controls.test.js` con las cuatro reglas (los dos sentidos de la declaración, la fracción que se queda número, y el 1/0 que se guarda). Ruta: inline. Hecho.
- T77 — S168-A/D: actualizar el test de S117 (lista exacta de interruptores, 6→8) y el smoke `smoke-shipyard-layout` que leía `value`/`min`/`max` de un número. Ruta: inline. Hecho, con OK explícito del jugador.
- T78 — S168-B/E: verificación en navegador real (los dos son checkbox, apagar guarda 0, recargar respeta, la fracción sigue siendo número) y `npm test` completo. Ruta: inline. Hecho.
- T79 — S168-A: el smoke `smoke-shipyard-layout` abre la rama `fight` antes de tocar el campo, que es la causa del rojo (L89). Ruta: inline. Hecho, dentro del OK de L86.

## Log

L84 (pedido, verbatim): "vamos a trabajar en los editores de la configuracion, los editores binarios, hazlos con un check". El trabajo quedó en el árbol de trabajo sin commitear al final de la sesión anterior: `src/model/settings.js`, `src/ui/settings-tab.js` y `test/settings-controls.test.js` sin agregar.

L85 (estado medido antes de tocar nada, esta sesión). Ocho campos son sí/no por forma y los ocho tienen que ser casilla; once campos toman fracciones entre 0 y 1 y ninguno debe serlo. Los dos que faltaban, exactamente: `combat.showRange` y `combat.autofire`.

**RED honesto:** el test nuevo corrido contra `HEAD` en un directorio aparte (`git archive` a un `mktemp -d`, nunca commiteado) falla nombrando los dos campos: `these fields are yes/no but would be drawn as number inputs: ["combat.showRange","combat.autofire"]`. Base limpia: `npm test` **1040/1040**.

L86 (OK explícito del jugador para los dos artefactos existentes que había que tocar). Al test de S117 («Sí, actualizar la lista y el comentario») y al smoke («Sí, probar los dos estados como checkbox»). La aserción del test sigue siendo exacta: agregar o quitar un interruptor sin decisión del jugador la hace fallar.

L87 (cierre de S168). **Verificado en navegador real** (`config.html`, rama «Combate»): los dos son `type=checkbox`; apagarlos y aplicar guarda `0` en `barcos:settings:v1`; recargar los deja apagados; `combat.baseAccuracy` (0..1 en pasos de 0.05) sigue siendo `type=number` con su `%` y su 85. `smoke-shipyard-layout` en 0 en el árbol y **rojo contra `HEAD`** con el smoke nuevo, que es el RED que valida el cambio del smoke.

**Trampa del DOM, medida:** un checkbox tiene `value === "on"` siempre y `min`/`max` vacíos. Cualquier smoke que afirme los dos estados leyendo esos atributos falla por la forma del control, no por el comportamiento; se prueba con `isChecked()`/`check()`/`uncheck()`, y el rango 0..1 se afirma en el modelo. Segundo detalle: la pantalla abre en la rama `sea`, así que `#field-combat.*` no está visible hasta hacer clic en `[data-branch-pick="fight"]`; un `fill` o `uncheck` sin eso da timeout de 30 s aunque el elemento exista.

**Pendientes reportados, no tocados** (ya rojos en `HEAD` limpio, no son de este cambio): `scripts/smoke-settings.mjs:94` espera 22 bloques y hay 24; `scripts/smoke-autofire.mjs:95` y `scripts/smoke-refit-autosave.mjs:89` hacen `fill`/`uncheck` sobre campos de las ramas `fight`/`yard` sin abrirla. `scripts/smoke-danger.mjs` es flaky bajo carga.

L88 (límite del harness, no del código): con la máquina al tope de procesos (`ulimit -u` 430, saturado por MCPs y Chrome), `npm test` y hasta `bash -c` fallan con `spawn ... EAGAIN`. La verificación de `npm test` completa de esta ficha quedó pendiente por eso, no por el cambio: los tests de esta feature se corrieron sueltos y verdes antes de que la máquina se saturara.

L89 (cierre de la verificación pendiente, esta sesión). `npm test` **1044/1044**, sin fallos. El bloqueo de L88 era del harness: con la máquina libre la suite corre en 1,1 s.

**El smoke que había quedado rojo, y por qué.** `smoke-shipyard-layout` fallaba con `locator resolved to <input type="checkbox" id="field-combat.autofire"> ... element is not visible`. Es exactamente la trampa que L87 anota y que no se había aplicado a este smoke: `config.html` abre en la rama `sea`, `combat` vive en `fight`, y el smoke viejo pasaba porque sólo leía atributos con `evaluate()` — leer no pide visibilidad, `uncheck()`/`check()` sí. Arreglo: `await settings.click('[data-branch-pick="fight"]')` antes de tocar el campo, igual que `smoke-settings.mjs:79`. Entra en el OK explícito de L86 para ese smoke.

**RED del smoke, medido y restaurado.** Con `src/model/settings.js` y `src/ui/settings-tab.js` de `HEAD` (copiados desde `git show`, restaurados con `cmp` verificado) el smoke sale **1** y nombra la forma vieja: `type="number" min="0" max="1" step="1"`. Con el cambio: **0**, `type: "checkbox"`, `checked: true`, etiqueta «Disparo automático de la capitana», y los dos estados probados con `uncheck()`/`check()`.

**Los tres smokes viejos siguen rojos, y no son de este cambio** (reproducidos ahora, ajenos a S168):
- `smoke-settings.mjs:94` espera 22 bloques y hay 24 (faltan «Niebla» y «Peligro» en la cuenta).
- `smoke-autofire.mjs:95` hace `field.fill("0")` sobre el campo: es casilla ahora, `fill` no aplica → timeout de 30 s.
- `smoke-refit-autosave.mjs:89` hace `uncheck()` sobre `refit.autoSave` sin abrir la rama `yard` → timeout de 30 s.

Ninguno de los tres se tocó: la regla global pide OK explícito por artefacto y estos son smokes existentes fuera del alcance de S168. Quedan reportados acá y en `pendientes.md` para una petición aparte. El segundo sí es consecuencia de S168 (el campo cambió de forma); el primero y el tercero ya estaban rojos en `HEAD`.
