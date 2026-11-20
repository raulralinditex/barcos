/**
 * S160: the enemy's rigging slows her ONCE, like the player's.
 *
 * `speedFactor(combat)` in combat.js and `riggingSpeedFactor(combat)` in world.js are the
 * same curve (0.3 + 0.7·rigging/100), and both were applied to an enemy: `aiStep` folded it
 * into `maxSpeed`, and then `stepHull` — the physics every hull obeys (S57) — applied it
 * again from `input.rigging`. A player's hull feels it once, so a dismasted enemy was up to
 * 2.7× slower than the same rule says.
 *
 * Measured before the fix, at a steady 0.1 s step: 1.06 kn at 50 % rigging where the curve
 * asks for 1.63, and 0.34 kn at 10 % where it asks for 0.93. That is why boarding a beaten
 * enemy was so hard: she could not keep station, let alone close.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { aiStep, speedFactor } from "../src/model/combat.js";
import { riggingSpeedFactor, stepHull } from "../src/model/world.js";

const enemy = (rigging, over = {}) => ({
  id: 1,
  x: 260,
  y: 80,
  heading: 0,
  currentSpeedKn: 0,
  hullId: "patache",
  speedKn: 5,
  combat: {
    status: "fighting",
    condition: { hull: 95, rigging, crew: 100, morale: 100 },
    crew: { marino: 14, artillero: 2, soldado: 4 },
    initialCrew: 20,
    crewMin: 6,
    hullToughness: 1,
    pieces: [],
    maxSpeedKn: 5,
    damageDealt: { babor: 0, estribor: 0 },
    crewDamagePool: 0,
    ...over,
  },
});

/** The enemy held on a straight course until her speed settles. */
const settled = (rigging) => {
  const player = { x: 210, y: 70, heading: 0 };
  let current = enemy(rigging);
  for (let i = 0; i < 200; i += 1) {
    current = aiStep(current, player, 0.1, () => 0.5, { wind: null }).enemy;
  }
  return current.currentSpeedKn;
};

test("S160: both curves really are the same, which is why the second application is a bug", () => {
  for (const rigging of [0, 25, 50, 75, 100]) {
    const combat = { condition: { rigging } };
    assert.ok(
      Math.abs(speedFactor(combat) - riggingSpeedFactor(combat)) < 1e-12,
      `the two curves must agree at ${rigging}%, or this whole rule is about different things`,
    );
  }
});

test("S160: an enemy with a whole rig makes her hull's speed, unaffected by the fix", () => {
  // The regression guard: with nothing torn, both applications are ×1 and nothing changes.
  const whole = settled(100);
  assert.ok(
    Math.abs(whole - 2.5) < 0.01,
    `an undamaged enemy must still make her hull's speed, she makes ${whole}`,
  );
});

test("S160: an enemy's rigging slows her once, exactly as it slows the player's hull", () => {
  // The rule, stated as the physics states it: a hull's speed is scaled by the rigging curve
  // ONCE. The enemy holds her broadside band at `throttle: 0.5` (see `aiStep`), so her speed
  // is half the hull's speed for that rig, not the whole of it.
  //
  // The defect was that the curve went in twice, so at 50 % rigging she made 1.06 kn where
  // once gives 1.63. Comparing the RATIO between two riggings is what isolates it: the
  // throttle cancels out, and what is left is how many times the curve was applied.
  const whole = settled(100);
  for (const rigging of [50, 30, 10]) {
    const withRig = settled(rigging);
    const once = whole * riggingSpeedFactor({ condition: { rigging } });
    assert.ok(
      Math.abs(withRig - once) < 1e-6,
      `at ${rigging}% the enemy must make ${once.toFixed(3)} kn (the curve applied once), she made ${withRig.toFixed(3)}`,
    );
    // And the defect is not just "slightly off": it was the curve applied twice.
    const twice = whole * riggingSpeedFactor({ condition: { rigging } }) ** 2;
    assert.ok(
      Math.abs(withRig - twice) > 1e-3,
      `at ${rigging}% the enemy must NOT make the doubly-punished ${twice.toFixed(3)} kn`,
    );
  }
});

test("S160: the enemy's speed tracks the same curve the player's hull obeys", () => {
  // The same hull, the same torn rig, the same shared physics: the enemy in her band runs at
  // half throttle, so her speed must be exactly half of what the hull makes at full sail.
  for (const rigged of [100, 50, 10]) {
    const asHull = stepHull(
      { x: 260, y: 80, heading: 0, currentSpeedKn: 0, speedKn: 5 },
      { turn: 0, throttle: 0.5, wind: null, rigging: { condition: { rigging: rigged } } },
      10,
    );
    const asEnemy = settled(rigged);
    assert.ok(
      Math.abs(asEnemy - asHull.currentSpeedKn) < 1e-6,
      `at ${rigged}% the enemy must move exactly as the same hull does at the same throttle: ${asEnemy.toFixed(3)} vs ${asHull.currentSpeedKn.toFixed(3)}`,
    );
  }
});
