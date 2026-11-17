import test from "node:test";
import assert from "node:assert/strict";

import { SHIPYARDS, shipyardById } from "../src/data/naval-data.js";
import { es, en } from "../src/i18n/index.js";

/**
 * S134: the title bar names the yard on screen, and changing the yard repaints every room.
 *
 * User request (verbatim): "en la pantalla de el astillero, podemos leer el titulo:
 * Astillero / Un barco a partir de un presupuesto, ahi deberia estar el nombre del
 * astillero" and "cuando cambias de astillero, tienes que actualizar todos los datos de
 * flota, astillero, mercado etc".
 *
 * The model half is the data the title reads: every yard has a name to show and a water
 * to name. The screen half (that all four rooms repaint) is pinned by the browser smoke
 * `scripts/smoke-yard-switch.mjs`, because it is a wiring rule, not a calculation.
 */

test("S134: every yard has a name to put in the title", () => {
  for (const yard of SHIPYARDS) {
    for (const catalogue of [es, en]) {
      const name = catalogue[yard.nameKey];
      assert.equal(typeof name, "string");
      assert.ok(name.trim().length > 0, `${yard.id} has no name`);
    }
  }
});

test("S134: the water under the title is a key both languages carry", () => {
  for (const catalogue of [es, en]) {
    assert.equal(typeof catalogue["shipyard.yard.water"], "string");
    assert.ok(catalogue["shipyard.yard.water"].includes("{zone}"));
  }
});

test("S134: two yards never read the same name", () => {
  const names = SHIPYARDS.map((yard) => es[yard.nameKey]);
  assert.equal(new Set(names).size, SHIPYARDS.length, `two yards share a name: ${names.join(" | ")}`);
});

test("S134: the yards are different places, so the title changes with them", () => {
  // A yard's water is her position, not a hand-written label: three yards, three waters.
  const waters = SHIPYARDS.map((yard) => `${Math.round(yard.x)},${Math.round(yard.y)}`);
  assert.equal(new Set(waters).size, SHIPYARDS.length);
  // And every one of them resolves from her id, which is what the selector stores.
  for (const yard of SHIPYARDS) assert.equal(shipyardById(yard.id)?.id, yard.id);
});
