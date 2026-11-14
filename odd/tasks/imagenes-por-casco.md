# Juego de barcos — retrato de cada casco

Estado: cerrado y verificado (S34, S41: zoom por clic).

## Specs

S34. Al elegir un casco en el Astillero se ve una imagen histórica de ese tipo de nave. Pedido (verbatim): "intenta buscar en la web una imagen para cada tipo de barco y muestrala cuando se selecciona ese tipo de barco"
- Cada casco tiene su propia imagen, servida desde `assets/ships/<id>.jpg`, dentro del repositorio: el juego no pide nada a internet al jugar.
- La imagen se muestra en el panel del buque y cambia al cambiar de casco, sin recargar la página.
- **La imagen lleva siempre su crédito**: autor y licencia, visibles sobre la foto. Sin crédito no se muestra la foto.
- Sólo se admiten imágenes de dominio público, CC0, CC BY o CC BY-SA. Cada archivo y su licencia quedan registrados en `assets/ships/credits.json` y en `assets/ships/CREDITS.md`.
- Si un casco no tiene imagen, o el paquete no existe, el Astillero sigue funcionando con la silueta dibujada en canvas. La falta de una imagen opcional nunca es un error visible.
- El texto alternativo de la imagen y el del crédito existen en es y en.

S41. Al hacer clic sobre la imagen, se amplía para verla entera. Pedido original (verbatim, por hover): "la imagen de los barcos, si pasamos sobre ella con el raton, se amplia para verla entera". Cambiado por el usuario (verbatim, ver L11): "el aumento de la imagen del barco en el astillero, en vez de ser cuando pase el raton, que sea cuando se cliekea sobre ella"
- La miniatura es un banner recortado (`object-fit: cover`); al hacer clic la imagen se muestra **completa** (`object-fit: contain`), centrada sobre la página y con el resto atenuado. **Pasar el ratón por encima ya no la amplía.**
- "Entera" significa que la caja conserva las proporciones propias del archivo: no se recorta nada. Tope: 92 % del ancho y 88 % del alto de la ventana.
- El crédito sigue legible sobre la imagen ampliada.
- La imagen ampliada **se queda abierta** aunque el ratón se vaya. Se cierra con otro clic sobre ella, con `Escape` o con un clic en cualquier otro lugar. Cierre con clic fuera y con `Escape`: decisión mía, sin pedido; se puede cambiar.
- El resto del Astillero **no se mueve** mientras la imagen está ampliada. Si la imagen se oculta (casco sin foto), el zoom se cierra.
- Un poco de estado (la clase `is-zoomed` de la figura, que alterna `app.js`); el resto sigue siendo CSS.

## Tasks

- T45 — Modelo puro `shipImagePath`/`shipImageCredit` + tests, figura en `index.html`, `renderHullPicture` en `app.js` y estilos. `S34` — inline — done
- T46 — Búsqueda y descarga de las 15 imágenes con su licencia (worker, con la API de Wikimedia Commons). `S34` — worker — done
- T47 — Smoke de navegador y documentación. `S34` — inline — done
- T48 — Zoom al pasar el ratón: estilos, altura reservada y smoke. `S41` — inline — done (reemplazado por T53)
- T53 — Zoom por clic en vez de hover: smoke reescrito (RED observado), estado `is-zoomed` en `app.js`, estilos y cierre con clic / `Escape` / clic fuera. `S41` — inline — done

## Log

L1 (verbatim): "intenta buscar en la web una imagen para cada tipo de barco y muestrala cuando se selecciona ese tipo de barco"

L2: Se delegó la descarga a un worker con superficies de edición limitadas a `assets/ships/**`. Reglas que se le dieron: sólo dominio público o CC0/CC BY/CC BY-SA, ancho máximo 900 px, JPEG por debajo de 200 KB, créditos completos por casco, y **ninguna imagen inventada ni sustituida por otra nave**: si no encontraba una que encajara, la dejaba fuera. Wikimedia limita por ráfagas (HTTP 429), así que el worker fue con pausas y llamadas por lotes.

L3: Resultado del worker: 15 de 15 cascos con imagen y crédito completo. El reparto son grabados y pinturas de época (Baugean, Rijksmuseum, altarpiece de Santa Auta, etc.), la mayoría dominio público.

L4: Decisión de implementación: la foto **sólo se muestra si hay crédito registrado**. Es más estricto que "si hay archivo", y es a propósito: una imagen sin licencia conocida no se publica. El test `ship-image.test.js` verifica que todo crédito del paquete apunte a un archivo que existe y a un casco real.

L5: Evidencia. `npm test` 310/310. `scripts/smoke-images.mjs` con exit 0: la imagen del casco de apertura carga (900 px) con su crédito y su texto alternativo, al cambiar a la galeaza cambia la imagen y el crédito, y las 15 imágenes del paquete cargan en el navegador.

L6 (verbatim): "la imagen de los barcos, si pasamos sobre ella con el raton, se amplia para verla entera"

L7: Implementación sólo con CSS. Al pasar el ratón la imagen pasa a `position: fixed`, centrada, con `object-fit: contain`, y un `::after` atenúa la página. Como un descendiente `fixed` sigue contando como hover del `<figure>`, el visor no parpadea al mover el ratón sobre él.

L8: Hallazgo propio al probarlo: al sacar la imagen del flujo, el panel entero saltaba 240 px hacia arriba mientras el zoom estaba abierto. Se arregló reservando la altura del `<figure>` (`height: 240px`); el smoke mide la posición del canvas antes y durante el zoom y exige que sea la misma.

L9: Hallazgo ajeno al pedido, corregido por ser de una línea y estar en la misma pantalla: el veredicto "listo" del Astillero se mostraba como la clave cruda `issue.ready`. Existía desde el multilenguaje (idéntico en `HEAD`): `renderVerdict` pasaba el código `ready` a `issueMessage`, que busca `issue.ready` en el catálogo, y esa clave no existe; la frase correcta ya viajaba en `issue.message`. Ahora usa `issue.message ?? issueMessage(...)`. El smoke de imágenes comprueba que el veredicto no muestre una clave sin traducir.

L10: Evidencia. `scripts/smoke-images.mjs` con exit 0: la miniatura es `cover`, al pasar el ratón pasa a `contain` y crece de 240 a 627 px de alto, la caja tiene las proporciones del archivo (no recorta), la posición del canvas es idéntica antes y durante, y al sacar el ratón la miniatura vuelve a su tamaño.

L11 (verbatim): "el aumento de la imagen del barco en el astillero, en vez de ser cuando pase el raton, que sea cuando se cliekea sobre ella"

L12: Cambio de requisito sobre S41. Con confirmación explícita del usuario se reescribió la sección "hovering shows the picture whole" de `scripts/smoke-images.mjs`, que fijaba el hover. RED observado antes de tocar el código: el hover ampliaba (238 → 591 px), nada cerraba el visor y `Escape` no hacía nada. El CSS pasó de `.ship-figure:hover` a `.ship-figure.is-zoomed`, y `app.js` alterna la clase con un clic sobre la foto y la quita con otro clic, `Escape` o un clic en otro lado.

L13: Evidencia. `scripts/smoke-images.mjs` con exit 0 y `failures: []`: el hover no amplía, el clic sí (de 238 a más de 1,5 veces, `contain`, con las proporciones del archivo y sin mover el panel), el visor sigue abierto al mover el ratón fuera, y lo cierran otro clic sobre la imagen, `Escape` y un clic fuera.
