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

/* ------------------------------------------------ a soft edge (the player asked to smooth it) */

import { fogMask } from "../src/model/fog.js";

/** The mask's darkness at a point of the sea, 0 (clear) to 1 (fully fogged). */
const darknessAt = (mask, point) => {
  const ix = Math.floor(point.x / mask.cellM) - mask.x0;
  const iy = Math.floor(point.y / mask.cellM) - mask.y0;
  return mask.alpha[iy * mask.n + ix];
};

const litAround = (x, y, radiusM) => revealAround({}, { x, y }, radiusM);

test("fog edge: deep in the lit water the veil is clear, deep in the dark it is solid", () => {
  const mask = fogMask({ known: litAround(0, 0, 1200), radiusM: 5200, softness: 2 });
  assert.ok(darknessAt(mask, { x: 0, y: 0 }) < 0.02, "the middle of the lit water is clear");
  // (3000, 3000) is inside the chart; (4000, 4000) is past its rim and is never painted.
  assert.ok(darknessAt(mask, { x: 3000, y: 3000 }) > 0.98, "far from anything lit is solid fog");
});

test("fog edge: the border between lit and dark is a gradient, not a step", () => {
  const known = litAround(0, 0, 1200);
  const hard = fogMask({ known, radiusM: 5200, softness: 0 });
  const soft = fogMask({ known, radiusM: 5200, softness: 2 });
  // The biggest jump between two neighbouring cells along a line through the edge.
  const stepOf = (mask) => {
    let worst = 0;
    for (let x = -2000; x < 2000; x += mask.cellM) {
      const a = darknessAt(mask, { x, y: 0 });
      const b = darknessAt(mask, { x: x + mask.cellM, y: 0 });
      worst = Math.max(worst, Math.abs(a - b));
    }
    return worst;
  };
  assert.ok(stepOf(hard) > 0.95, "without softening the edge is a full step, which is what the player saw");
  assert.ok(stepOf(soft) < 0.45, `softened, no two neighbouring cells may differ by much, the worst step is ${stepOf(soft).toFixed(2)}`);
});

test("fog edge: softening never hides what is lit, it only feathers the border", () => {
  // A cell that is lit stays mostly clear at its centre, so a hull in the middle of her own
  // lit water is never greyed out by the blur.
  const mask = fogMask({ known: litAround(0, 0, 1200), radiusM: 5200, softness: 2 });
  for (const x of [-600, -300, 0, 300, 600]) {
    assert.ok(darknessAt(mask, { x, y: 0 }) < 0.2, `the lit water at x=${x} must stay clear`);
  }
});

test("fog edge: lighting more sea never darkens any part of the veil", () => {
  // Monotonic: discovery only grows, so the fog can only lift. A blur that let a newly lit
  // cell darken its neighbour would make the edge flicker as the fleet sails.
  const before = fogMask({ known: litAround(0, 0, 900), radiusM: 5200, softness: 2 });
  const after = fogMask({ known: revealAround(litAround(0, 0, 900), { x: 800, y: 0 }, 900), radiusM: 5200, softness: 2 });
  assert.equal(before.n, after.n);
  for (let i = 0; i < before.alpha.length; i += 1) {
    assert.ok(after.alpha[i] <= before.alpha[i] + 1e-9, `cell ${i} got darker after more sea was lit`);
  }
});

test("fog edge: a hostile in the fight opens a clearing in the veil", () => {
  const known = litAround(0, 0, 300);
  const without = fogMask({ known, radiusM: 5200, softness: 2 });
  const withHole = fogMask({ known, radiusM: 5200, softness: 2, holes: [{ x: 2000, y: 0 }] });
  assert.ok(darknessAt(without, { x: 2000, y: 0 }) > 0.9, "unlit water is fogged");
  assert.ok(darknessAt(withHole, { x: 2000, y: 0 }) < 0.2, "a sail in the fight is seen, so the veil opens around her");
});

test("fog edge: nothing is painted beyond the known sea", () => {
  const mask = fogMask({ known: {}, radiusM: 5200, softness: 2 });
  const corner = darknessAt(mask, { x: -mask.cellM * (mask.n / 2 - 1), y: -mask.cellM * (mask.n / 2 - 1) });
  assert.ok(corner < 0.05, "the far corner of the bounding box lies outside the chart and must stay clear");
});

test("fog edge: a broken record or radius gives an empty mask, not a crash", () => {
  for (const args of [{}, { known: null, radiusM: 0 }, { known: "roto", radiusM: NaN }]) {
    const mask = fogMask(args);
    assert.ok(mask.n >= 0 && mask.alpha.length === mask.n * mask.n, `a broken input (${JSON.stringify(args)}) must still give a consistent mask`);
  }
});
