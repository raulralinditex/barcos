/**
 * S160: an enemy restored from a save keeps her speed, or she deletes herself.
 *
 * Found while closing the deck-fire defect. A save whose enemy `combat` record lacks
 * `maxSpeedKn` loads happily — `deserializeWorld` copies `data.encounters` as they come —
 * and then `aiStep` computes `maxSpeed = combat.maxSpeedKn * speedFactor(combat)`, which is
 * `NaN`. The hull's position becomes `NaN`, the despawn filter in `updateWorld` compares
 * `Math.hypot(NaN - x, NaN - y) <= despawnRadiusM` (false for NaN) and drops the sail from
 * the sea. Measured in the browser: the enemy fired from the deck and vanished mid-fight.
 *
 * These tests pin the two halves: the sea must not keep a hull it cannot place, and the
 * model must never turn a restorable enemy into NaN.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createWorld, deserializeWorld, serializeWorld, updateWorld } from "../src/model/world.js";
import { aiStep } from "../src/model/combat.js";

/** The combat record an enemy carries once `createEnemyCombatant` has built her. */
const enemyCombat = (over = {}) => ({
  name: "Patache",
  status: "fighting",
  condition: { hull: 95, rigging: 95, crew: 100, morale: 100 },
  crew: { marino: 14, artillero: 2, soldado: 4 },
  initialCrew: 20,
  crewMin: 6,
  hullToughness: 1,
  pieces: [],
  maxSpeedKn: 5,
  damageDealt: { babor: 0, estribor: 0 },
  crewDamagePool: 0,
  ...over,
});

const enemy = (over = {}) => ({
  id: 501,
  type: "enemy",
  x: 260,
  y: 80,
  hullId: "patache",
  zoneId: "costera",
  level: 1,
  engaged: true,
  heading: 0,
  currentSpeedKn: 0,
  drift: { heading: 0, speedKn: 1 },
  combat: enemyCombat(),
  ...over,
});

const seaWith = (encounters) => ({
  v: 1,
  seed: 4,
  rngState: 4,
  nextId: 500,
  gold: 0,
  timeS: 0,
  ship: { x: 210, y: 70, heading: 0, currentSpeedKn: 0, speedKn: 8 },
  escorts: [],
  level: 1,
  levelEnemies: [501],
  levelVictories: 0,
  order: { throttle: 0, turn: 0 },
  squadrons: [],
  encounters,
});

test("S160: a sail whose combat record has no speed never enters the sea as NaN", () => {
  // A hand-edited or truncated save: her `combat` is there, but `maxSpeedKn` is not.
  const broken = enemy({ combat: enemyCombat({ maxSpeedKn: undefined }) });
  const world = deserializeWorld(JSON.stringify(seaWith([broken])));
  assert.ok(world, "the save must still load: one bad sail does not lose the voyage");
  const stepped = updateWorld(world, { throttle: 0 }, 0.016);
  for (const entry of stepped.encounters) {
    if (entry.type !== "enemy") continue;
    assert.ok(
      Number.isFinite(entry.x) && Number.isFinite(entry.y),
      `an enemy must never be left at NaN, ${entry.id} is at (${entry.x}, ${entry.y})`,
    );
  }
});

test("S160: an enemy afloat keeps her place in the sea instead of vanishing", () => {
  const broken = enemy({ combat: enemyCombat({ maxSpeedKn: undefined }) });
  let world = deserializeWorld(JSON.stringify(seaWith([broken])));
  // A few steps, which is what it took for the despawn filter to drop her in the browser.
  for (let i = 0; i < 5; i += 1) world = updateWorld(world, { throttle: 0 }, 0.016);
  const stillThere = world.encounters.some((entry) => entry.id === 501);
  assert.ok(
    stillThere,
    `an enemy restored without a speed must not delete herself, the sea holds ${JSON.stringify(
      world.encounters.map((entry) => `${entry.type}:${entry.id}`),
    )}`,
  );
});

test("S160: aiStep never yields NaN from a combatant with no declared speed", () => {
  const hull = { id: 501, x: 260, y: 80, heading: 0, currentSpeedKn: 0, hullId: "patache" };
  const player = { x: 210, y: 70, heading: 0 };
  const result = aiStep({ ...hull, combat: enemyCombat({ maxSpeedKn: undefined }) }, player, 0.016, () => 0.5);
  assert.ok(
    Number.isFinite(result.enemy.x) && Number.isFinite(result.enemy.y),
    `aiStep must place the hull even with no declared speed, got (${result.enemy.x}, ${result.enemy.y})`,
  );
  assert.ok(
    Number.isFinite(result.enemy.currentSpeedKn),
    `aiStep must not report a NaN speed, got ${result.enemy.currentSpeedKn}`,
  );
});

test("S160: a well-formed enemy still round-trips and sails", () => {
  const world = deserializeWorld(JSON.stringify(seaWith([enemy()])));
  const back = deserializeWorld(serializeWorld(updateWorld(world, { throttle: 0 }, 0.016)));
  assert.ok(back, "a normal sea save must still load");
  const sail = back.encounters.find((entry) => entry.id === 501);
  assert.ok(sail, "the enemy must survive the round trip");
  assert.ok(Number.isFinite(sail.x) && Number.isFinite(sail.y), "and keep a real position");
});
