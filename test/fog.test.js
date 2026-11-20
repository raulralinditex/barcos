/**
 * S167: the fog of war.
 *
 * The player asked for it (verbatim): "ahora vamos a hacer niebla, todo el mapa tiene niebla y
 * no se ve ningun barco, segun van navegando tus barcos vas descubriendo el mapa, lo
 * implementamos con una flag en configuraciones niebla si o no". The two visibility rules are
 * both configurable, and the reveal radius is a starting value the player can tune.
 *
 * What this file pins is the rule, not the painting: which pieces of sea are known, and which
 * hulls the player is allowed to see given what she knows.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  FOG,
  discoveredWith,
  fogEnabled,
  isDiscovered,
  isVisible,
  normaliseDiscovered,
  revealAround,
} from "../src/model/fog.js";

test("S167-A: the switch is off by default, and off means the sea is as it was", () => {
  assert.equal(fogEnabled({}), false, "a save written before the fog existed must not have it on");
  assert.equal(fogEnabled({ enabled: 0 }), false);
  assert.equal(fogEnabled({ enabled: 1 }), true);
  assert.equal(fogEnabled({ enabled: "si" }), false, "a broken value is off, never on");
});

test("S167-C: a hull reveals the sea around her, within her radius", () => {
  const known = revealAround({}, { x: 0, y: 0 }, 700);
  assert.equal(isDiscovered(known, { x: 0, y: 0 }), true, "the point under the hull is known");
  assert.equal(isDiscovered(known, { x: 400, y: 0 }), true, "inside the radius is known");
  assert.equal(isDiscovered(known, { x: 1400, y: 0 }), false, "beyond the radius is not");
});

test("S167-B: what was discovered stays discovered", () => {
  let known = revealAround({}, { x: 0, y: 0 }, 700);
  known = revealAround(known, { x: 3000, y: 0 }, 700);
  assert.equal(isDiscovered(known, { x: 0, y: 0 }), true, "the first place is still known");
  assert.equal(isDiscovered(known, { x: 3000, y: 0 }), true, "and so is the second");
  assert.equal(isDiscovered(known, { x: 1500, y: 0 }), false, "the gap between them is not");
});

test("S167-D: rule `revelado` shows a hull anywhere in known water", () => {
  const known = revealAround({}, { x: 0, y: 0 }, 2000);
  const far = { x: 1900, y: 0 };
  assert.equal(
    isVisible({ known, rule: "revelado", hull: far, fleet: [{ x: 0, y: 0 }], contactM: 400 }),
    true,
    "a hull in discovered water is visible under `revelado`, however far it is",
  );
});

test("S167-D: rule `contacto` needs the hull near one of ours", () => {
  const known = revealAround({}, { x: 0, y: 0 }, 2000);
  const far = { x: 1900, y: 0 };
  assert.equal(
    isVisible({ known, rule: "contacto", hull: far, fleet: [{ x: 0, y: 0 }], contactM: 400 }),
    false,
    "a hull in discovered water but far from our ships stays hidden under `contacto`",
  );
  assert.equal(
    isVisible({ known, rule: "contacto", hull: { x: 300, y: 0 }, fleet: [{ x: 0, y: 0 }], contactM: 400 }),
    true,
    "a hull within contact range is visible",
  );
});

test("S167-E: a hull in undiscovered water is never visible, whatever the rule", () => {
  const known = revealAround({}, { x: 0, y: 0 }, 300);
  const unknown = { x: 4000, y: 4000 };
  for (const rule of ["revelado", "contacto"]) {
    assert.equal(
      isVisible({ known, rule, hull: unknown, fleet: [{ x: 0, y: 0 }], contactM: 500 }),
      false,
      `a hull in the dark must stay hidden under \`${rule}\``,
    );
  }
});

test("S167-A: with the fog off, everything is visible", () => {
  for (const rule of ["revelado", "contacto"]) {
    assert.equal(
      isVisible({ enabled: false, known: {}, rule, hull: { x: 4000, y: 4000 }, fleet: [], contactM: 0 }),
      true,
      "the fog off must not hide anything",
    );
  }
});

test("S167-F: a save written before the fog opens DARK, because turning the fog on is the player asking for it", () => {
  // The fog is opt-in: off by default, and off means the sea is exactly as it was. So an old
  // save is never hurt by the rule while it is off, and the player who switches it on wants
  // to SEE it. Opening an old save "fully discovered" made the switch do nothing: the first
  // autosave wrote that record for good and the fog never appeared on a voyage in progress.
  const back = normaliseDiscovered(undefined, { legacy: true });
  assert.equal(back.complete, false, "an old save must not open with the whole sea lit");
  assert.deepEqual(back.cells, []);
});

test("S167-F: a record that claims the whole sea is discovered is not believed", () => {
  // An earlier build wrote `complete: true` into saves. Honouring it would keep the fog
  // invisible on exactly those voyages, so the flag is never read back.
  const back = normaliseDiscovered({ complete: true, cells: ["0:0"] });
  assert.equal(back.complete, false);
  assert.deepEqual(back.cells, ["0:0"], "the cells it did list are still known");
});

test("S167-F: a broken discovery record is empty, not a crash", () => {
  for (const value of [null, "roto", [], 42, { cells: "x" }]) {
    const back = normaliseDiscovered(value, { legacy: false });
    assert.equal(back.complete, false, `a broken record (${JSON.stringify(value)}) must not open the map`);
    assert.deepEqual(back.cells, [], `a broken record (${JSON.stringify(value)}) must read as no cells`);
  }
});

test("S167-C: the fleet's own hulls all reveal, not only the one under the helm", () => {
  // A captain the player is not steering is still her ship, and she still discovers.
  const known = discoveredWith({}, [{ x: 0, y: 0 }, { x: 2000, y: 0 }], 700);
  assert.equal(isDiscovered(known, { x: 0, y: 0 }), true);
  assert.equal(isDiscovered(known, { x: 2000, y: 0 }), true);
});

test("S167: the defaults are a starting point the player can tune", () => {
  assert.ok(FOG.revealRadiusM > 0, "the reveal radius must have a starting value");
  assert.ok([0, 1, "revelado", "contacto"].includes(FOG.rule), "the rule must default to one of the two");
  assert.ok(FOG.contactM > 0, "the contact radius must have a starting value");
});
