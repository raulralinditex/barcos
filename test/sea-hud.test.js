import test from "node:test";
import assert from "node:assert/strict";

import { hasEnemyInGunshot, hullBarShare, timeScaleOnEngage } from "../src/model/sea-hud.js";
import { hullToughness } from "../src/model/combat.js";
import { hullById } from "../src/data/naval-data.js";

/* S59 — the condition bars are as long as the hull actually endures. */

test("S59: the toughest hull in view gets the full bar", () => {
  assert.equal(hullBarShare(6, 6), 1);
  assert.equal(hullBarShare(9, 6), 1, "a hull above the reference never overflows");
});

test("S59: the bar grows with the square root of the endurance", () => {
  // Four times the endurance is twice the bar, not four times: the compressed scale
  // is what keeps a light hull readable next to a ship of the line.
  assert.ok(Math.abs(hullBarShare(4, 16) - 0.5) < 1e-9);
  assert.ok(Math.abs(hullBarShare(1, 4) - 0.5) < 1e-9);
  assert.ok(Math.abs(hullBarShare(0.2, 6.02) - Math.sqrt(0.2 / 6.02)) < 1e-9);
});

test("S59: a tougher hull is never drawn with a shorter bar", () => {
  const reference = 6.02;
  let previous = 0;
  for (const toughness of [0.2, 0.36, 0.42, 1, 2.71, 4.49, 6.02]) {
    const share = hullBarShare(toughness, reference);
    assert.ok(share >= previous, `${toughness} shrank the bar (${share} < ${previous})`);
    previous = share;
  }
  assert.ok(hullBarShare(6.02, reference) > hullBarShare(0.2, reference));
});

test("S59: there is no floor, so a light hull reads as the little ship it is", () => {
  const barca = hullBarShare(hullToughness(hullById("barca-costera")), hullToughness(hullById("gran-buque-real")));
  assert.ok(barca < 0.35, `the lightest hull should read below the old 35 % floor, got ${barca}`);
  assert.ok(barca > 0.15, `the compressed scale should still leave it readable, got ${barca}`);
});

test("S59: a hull alone on screen gets the full bar", () => {
  assert.equal(hullBarShare(1, 1), 1);
});

test("S59: broken values give a bar inside the limits instead of throwing", () => {
  for (const [toughness, reference] of [
    [NaN, 6],
    [undefined, 6],
    [null, 6],
    [1, 0],
    [1, -5],
    [1, NaN],
    [1, undefined],
    [-1, 6],
    [0, 6],
  ]) {
    const share = hullBarShare(toughness, reference);
    assert.ok(Number.isFinite(share) && share > 0 && share <= 1, `${toughness}/${reference} gave ${share}`);
  }
});

test("S59: the catalogue hulls come out ordered by what they endure", () => {
  const light = hullToughness(hullById("barca-costera"));
  const heavy = hullToughness(hullById("gran-buque-real"));
  assert.ok(light > 0 && heavy > light, "the data should make a flagship tougher than a coastal boat");
  assert.ok(hullBarShare(light, heavy) < hullBarShare(heavy, heavy));
});

/* S43 — time goes back to x1 when an enemy engages. */

test("S43: engaging an enemy at x4 drops the time to x1 and says so", () => {
  assert.deepEqual(timeScaleOnEngage(4, false, true), { timeScale: 1, dropped: true });
  assert.deepEqual(timeScaleOnEngage(8, false, true), { timeScale: 1, dropped: true });
  assert.deepEqual(timeScaleOnEngage(2, false, true), { timeScale: 1, dropped: true });
});

test("S43: engaging at x1 changes nothing and shows no notice", () => {
  assert.deepEqual(timeScaleOnEngage(1, false, true), { timeScale: 1, dropped: false });
});

test("S43: it fires once per engagement, so the player can speed up again in the fight", () => {
  // still engaged on the next frame: the x4 the player chose is kept
  assert.deepEqual(timeScaleOnEngage(4, true, true), { timeScale: 4, dropped: false });
});

test("S43: a new engagement after the fight drops the time again", () => {
  assert.deepEqual(timeScaleOnEngage(4, true, false), { timeScale: 4, dropped: false });
  assert.deepEqual(timeScaleOnEngage(4, false, true), { timeScale: 1, dropped: true });
});

test("S43: with no enemy engaged the time is left alone", () => {
  assert.deepEqual(timeScaleOnEngage(8, false, false), { timeScale: 8, dropped: false });
});

test("S43: a broken time scale is treated as x1", () => {
  assert.deepEqual(timeScaleOnEngage(undefined, false, true), { timeScale: 1, dropped: false });
  assert.deepEqual(timeScaleOnEngage(NaN, false, true), { timeScale: 1, dropped: false });
});

/* S54 — an escort shows her bars only when she has an enemy in gunshot. */

test("S54: an escort with no enemy in gunshot shows no bars", () => {
  const escort = { x: 0, y: 0 };
  const far = [{ x: 900, y: 0 }];
  assert.equal(hasEnemyInGunshot(escort, far, 620), false);
});

test("S54: an escort with an enemy inside the radius shows her bars", () => {
  const escort = { x: 0, y: 0 };
  assert.equal(hasEnemyInGunshot(escort, [{ x: 400, y: 0 }], 620), true);
  assert.equal(hasEnemyInGunshot(escort, [{ x: 0, y: -619 }], 620), true);
});

test("S54: the radius is the same engage radius, and its edge is inside", () => {
  const escort = { x: 100, y: 100 };
  assert.equal(hasEnemyInGunshot(escort, [{ x: 100, y: 720 }], 620), true, "exactly at the radius is in gunshot");
  assert.equal(hasEnemyInGunshot(escort, [{ x: 100, y: 720.5 }], 620), false);
});

test("S54: the nearest enemy decides, wherever it lies around the escort", () => {
  const escort = { x: 0, y: 0 };
  const around = [{ x: -500, y: 0 }, { x: 0, y: 500 }, { x: 350, y: -350 }];
  assert.equal(hasEnemyInGunshot(escort, around, 620), true);
  assert.equal(hasEnemyInGunshot(escort, [], 620), false, "no enemies at all");
});

test("S54: a broken position never counts as in gunshot", () => {
  const escort = { x: 0, y: 0 };
  assert.equal(hasEnemyInGunshot(escort, [{ x: NaN, y: 0 }], 620), false);
  assert.equal(hasEnemyInGunshot({ x: NaN, y: 0 }, [{ x: 0, y: 0 }], 620), false);
  assert.equal(hasEnemyInGunshot(escort, [{ x: 10, y: 10 }], NaN), false, "a broken radius engages nobody");
});
