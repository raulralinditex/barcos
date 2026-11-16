import test from "node:test";
import assert from "node:assert/strict";

import {
  KN_TO_MS,
  WORLD,
  ZONE_BANDS,
  createWorld,
  deserializeWorld,
  mulberry32,
  nearestEncounter,
  serializeWorld,
  riggingSpeedFactor,
  stepHull,
  stepShip,
  updateWorld,
  zoneAtRadius,
} from "../src/model/world.js";
import { COMBAT } from "../src/model/combat.js";

const testShip = { speedKn: 8 };

test("S6: zones map by radius from the home port", () => {
  assert.equal(zoneAtRadius(0).id, "costera");
  assert.equal(zoneAtRadius(ZONE_BANDS[0].maxRadiusM - 1).id, "costera");
  assert.equal(zoneAtRadius(ZONE_BANDS[0].maxRadiusM).id, "abierto");
  assert.equal(zoneAtRadius(ZONE_BANDS[1].maxRadiusM - 1).id, "abierto");
  assert.equal(zoneAtRadius(ZONE_BANDS[1].maxRadiusM).id, "abismo");
  assert.equal(zoneAtRadius(WORLD.radiusM).id, "abismo");
  assert.equal(zoneAtRadius(WORLD.radiusM * 2).id, "abismo");
});

test("S6: each zone band merges its data (danger, loot factor)", () => {
  const costera = zoneAtRadius(0);
  assert.equal(costera.lootFactor, 1);
  assert.equal(costera.danger, 1);
  const abismo = zoneAtRadius(WORLD.radiusM - 1);
  assert.ok(abismo.lootFactor > costera.lootFactor);
  assert.ok(abismo.danger > costera.danger);
});

test("S9: the same seed always produces the same sea", () => {
  const a = createWorld(42, testShip);
  const b = createWorld(42, testShip);
  assert.deepEqual(a.encounters, b.encounters);
  const c = createWorld(43, testShip);
  assert.notDeepEqual(c.encounters, a.encounters);
});

test("S9: the starting sea has the coastal zone density", () => {
  const world = createWorld(7, testShip);
  const band = ZONE_BANDS[0];
  assert.equal(world.encounters.length, band.encounters);
  const enemies = world.encounters.filter((e) => e.type === "enemy").length;
  assert.equal(enemies, Math.round(band.encounters * band.enemyShare));
});

test("mulberry32 is deterministic and advances state", () => {
  const first = mulberry32(1);
  const second = mulberry32(1);
  assert.equal(first.value, second.value);
  assert.equal(first.state, second.state);
  const next = mulberry32(first.state);
  assert.notEqual(next.value, first.value);
});

test("movement: full sail straight ahead covers the expected distance", () => {
  const ship = { x: 100, y: 0, heading: 0, currentSpeedKn: 8, speedKn: 8 };
  const dt = 2;
  const stepped = stepShip(ship, { turn: 0, throttle: 1 }, dt);
  const expected = 8 * KN_TO_MS * WORLD.arcadeScale * dt;
  assert.ok(Math.abs(stepped.x - (100 + expected)) < 1e-9);
  assert.equal(stepped.y, 0);
});

test("movement: speed eases and never jumps to full sail instantly", () => {
  const ship = { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: 8 };
  const stepped = stepShip(ship, { turn: 0, throttle: 1 }, 0.1);
  assert.ok(stepped.currentSpeedKn > 0);
  assert.ok(stepped.currentSpeedKn < 8);
});

test("movement: full helm turns at the rudder rate and no faster", () => {
  const ship = { x: 0, y: 0, heading: 0, currentSpeedKn: 5, speedKn: 8 };
  const stepped = stepShip(ship, { turn: 1, throttle: 1 }, 1);
  assert.ok(Math.abs(stepped.heading - WORLD.maxTurnRate) < 1e-9);
  const clamped = stepShip(ship, { turn: 3, throttle: 1 }, 1);
  assert.ok(Math.abs(clamped.heading - WORLD.maxTurnRate) < 1e-9);
});

test("movement: the ship cannot leave the world", () => {
  const ship = {
    x: WORLD.radiusM - 10,
    y: 0,
    heading: 0,
    currentSpeedKn: 12,
    speedKn: 12,
  };
  const stepped = stepShip(ship, { turn: 0, throttle: 1 }, 10);
  assert.ok(Math.hypot(stepped.x, stepped.y) <= WORLD.radiusM + 1e-9);
});

test("S9: sailing over a treasure collects its gold and removes it", () => {
  let world = createWorld(11, testShip);
  // plant a treasure right under the bow, inside the pickup radius
  world = {
    ...world,
    encounters: [
      ...world.encounters.filter((e) => e.type === "enemy"),
      { id: 999, type: "treasure", x: world.ship.x + WORLD.pickupRadiusM - 1, y: world.ship.y, gold: 75, zoneId: "costera" },
    ],
  };
  const before = world.gold;
  world = updateWorld(world, { turn: 0, throttle: 0 }, 0.01);
  assert.equal(world.collected, 1);
  assert.equal(world.gold, before + 75);
  assert.ok(!world.encounters.some((e) => e.id === 999));
});

test("S9: a treasure beyond the pickup radius stays where it is", () => {
  let world = createWorld(11, testShip);
  world = {
    ...world,
    encounters: [
      ...world.encounters.filter((e) => e.type === "enemy"),
      { id: 998, type: "treasure", x: world.ship.x + WORLD.pickupRadiusM + 40, y: world.ship.y, gold: 75, zoneId: "costera" },
    ],
  };
  world = updateWorld(world, { turn: 0, throttle: 0 }, 0.01);
  assert.equal(world.collected, 0);
  assert.ok(world.encounters.some((e) => e.id === 998));
});

test("S9: sailing over a wreck loots its gold like a treasure", () => {
  let world = createWorld(13, testShip);
  world = {
    ...world,
    encounters: [
      ...world.encounters,
      { id: 997, type: "wreck", x: world.ship.x + WORLD.pickupRadiusM - 1, y: world.ship.y, gold: 240, zoneId: "costera" },
    ],
  };
  const before = world.gold;
  world = updateWorld(world, {}, 0.01);
  assert.equal(world.gold, before + 240);
  assert.ok(!world.encounters.some((e) => e.id === 997));
});

test("S9: collecting keeps the zone density by spawning replacements", () => {
  let world = createWorld(11, testShip);
  const band = ZONE_BANDS[0];
  // remove every treasure, then tick: the sea should restock itself
  world = { ...world, encounters: world.encounters.filter((e) => e.type === "enemy") };
  world = updateWorld(world, {}, 0);
  assert.equal(world.encounters.length, band.encounters);
});

test("S9: enemy sails drift over time", () => {
  const worldA = createWorld(21, testShip);
  const worldB = updateWorld(worldA, {}, 5);
  const enemyA = worldA.encounters.find((e) => e.type === "enemy");
  const enemyB = worldB.encounters.find((e) => e.id === enemyA.id);
  assert.ok(enemyB, "enemy must still exist after drifting");
  assert.notDeepEqual({ x: enemyB.x, y: enemyB.y }, { x: enemyA.x, y: enemyA.y });
});

test("nearestEncounter finds the closest blip of a type", () => {
  let world = createWorld(5, testShip);
  world = {
    ...world,
    encounters: [
      { id: 1, type: "enemy", x: world.ship.x + 500, y: world.ship.y, hullId: "patache", drift: { heading: 0, speedKn: 2 } },
      { id: 2, type: "enemy", x: world.ship.x + 200, y: world.ship.y, hullId: "patache", drift: { heading: 0, speedKn: 2 } },
    ],
  };
  const nearest = nearestEncounter(world, "enemy");
  assert.equal(nearest.encounter.id, 2);
  assert.equal(Math.round(nearest.distance), 200);
  assert.equal(nearestEncounter(world, "treasure"), null);
});

test("S8: a saved sea round-trips through serialize/deserialize", () => {
  let world = createWorld(31, testShip);
  world = updateWorld(world, { turn: 0.4, throttle: 1 }, 3);
  const restored = deserializeWorld(serializeWorld(world));
  assert.ok(restored);
  assert.equal(restored.gold, world.gold);
  assert.equal(restored.rngState, world.rngState);
  assert.deepEqual(restored.ship, world.ship);
  assert.deepEqual(restored.encounters, world.encounters);
  // and the restored sea keeps evolving deterministically
  const a = updateWorld(restored, {}, 1);
  const b = updateWorld(world, {}, 1);
  assert.deepEqual(a.encounters, b.encounters);
});

test("S8: a corrupted save yields null instead of a broken sea", () => {
  assert.equal(deserializeWorld("not json"), null);
  assert.equal(deserializeWorld("{}"), null);
  assert.equal(deserializeWorld('{"v":1}'), null);
  assert.equal(deserializeWorld('{"v":1,"rngState":1,"gold":10,"ship":{},"encounters":[]}'), null);
});

/* S58 — an engaged enemy is not erased for being far; it disengages instead. */

const combatant = (overrides = {}) => ({
  status: "fighting",
  pieces: [],
  crew: { artillero: 0, marino: 100, soldado: 50 },
  crewMin: 10,
  condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
  maxSpeedKn: 5,
  ...overrides,
});

const engagedEnemy = (x, y, combat = combatant()) => ({
  id: 901, type: "enemy", hullId: "patache", x, y, heading: 0, currentSpeedKn: 0,
  engaged: true, combat, drift: { heading: 0, speedKn: 1 },
});

const seaWith = (ship, encounters) => ({
  seed: 42, rngState: 42, nextId: 2000, gold: 0, timeS: 0,
  ship: { x: ship.x, y: ship.y, heading: 0, speedKn: 8, currentSpeedKn: 0 },
  escorts: [], encounters,
});

test("S58: an unengaged sail is still forgotten past the despawn radius", () => {
  const far = { id: 1, type: "enemy", hullId: "patache", x: 0, y: 5000, heading: 0, currentSpeedKn: 0, drift: { heading: 0, speedKn: 1 } };
  const world = updateWorld(seaWith({ x: 0, y: 0 }, [far]), {}, 0);
  assert.equal(world.encounters.some((e) => e.id === 1), false, "a drifting sail left behind is forgotten");
});

test("S58: an engaged enemy is not erased for being far from the player", () => {
  const far = engagedEnemy(0, 5000);
  const world = updateWorld(seaWith({ x: 0, y: 0 }, [far]), {}, 0);
  const kept = world.encounters.find((e) => e.id === 901);
  assert.ok(kept, "an enemy in combat must survive the despawn radius");
});

test("S58: past the disengage radius the enemy gives up the chase but stays in the world", () => {
  const far = engagedEnemy(0, WORLD.disengageRadiusM + 1);
  const world = updateWorld(seaWith({ x: 0, y: 0 }, [far]), {}, 0);
  const kept = world.encounters.find((e) => e.id === 901);
  assert.ok(kept, "it stays in the world");
  assert.equal(kept.engaged, false, "it is no longer engaged");
  assert.equal(kept.combat, undefined, "its combat is released, so it goes back to drifting");
});

test("S58: inside the disengage radius the chase goes on", () => {
  const near = engagedEnemy(0, WORLD.disengageRadiusM - 1);
  const world = updateWorld(seaWith({ x: 0, y: 0 }, [near]), {}, 0);
  const kept = world.encounters.find((e) => e.id === 901);
  assert.equal(kept.engaged, true);
  assert.ok(kept.combat, "it keeps its combat");
});

test("S58: the disengage radius is larger than the engage radius, so it cannot flicker", () => {
  // A ship that engaged must not disengage the instant it steps outside the engage radius.
  assert.ok(
    WORLD.disengageRadiusM > COMBAT.engageRadiusM,
    `disengage ${WORLD.disengageRadiusM} must exceed engage ${COMBAT.engageRadiusM}`,
  );
});

test("S58: a disengaged enemy drifts again instead of standing still", () => {
  const far = engagedEnemy(0, WORLD.disengageRadiusM + 1);
  const first = updateWorld(seaWith({ x: 0, y: 0 }, [far]), {}, 1);
  const kept = first.encounters.find((e) => e.id === 901);
  assert.equal(kept.engaged, false);
  const second = updateWorld(first, {}, 1);
  const moved = second.encounters.find((e) => e.id === 901);
  assert.notEqual(moved.x, kept.x, "a sail under drift keeps moving");
});

test("S58: a defeated enemy is not resurrected by the disengage rule", () => {
  const sunk = engagedEnemy(0, WORLD.disengageRadiusM + 1, combatant({ status: "sunk", condition: { hull: 0, rigging: 100, crew: 100, morale: 100 } }));
  const world = updateWorld(seaWith({ x: 0, y: 0 }, [sunk]), {}, 0);
  const kept = world.encounters.find((e) => e.id === 901);
  assert.ok(kept, "it is still there for the wreck rule to resolve");
});

/* ---------------------------------------------------------------- S89: rigging and speed */

test("S89: a shredded rig slows the hull, the same way on every ship", () => {
  // The rule existed in combat.js since S5 and nothing applied it: `stepHull` computed the
  // speed from the hull's own maximum and never looked at the rigging, so a dismasted ship
  // sailed as fast as a whole one. This is the check that the sea actually uses it.
  const ship = {
    x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: 10, turnFactor: 1,
  };
  const input = { throttle: 1 };
  const step = (rigging) => {
    let current = { ...ship };
    const rig = { condition: { hull: 100, rigging, crew: 100, morale: 100 } };
    for (let i = 0; i < 400; i += 1) current = stepHull(current, { ...input, rigging: rig }, 0.1);
    return current.currentSpeedKn;
  };
  const whole = step(100);
  const half = step(50);
  const shredded = step(0);

  assert.ok(Math.abs(whole - 10) < 0.05, `a whole rig must make the hull's full speed, got ${whole}`);
  assert.ok(half < whole - 0.5, `half a rig did not cost speed (${whole} -> ${half})`);
  assert.ok(shredded < half, `a shredded rig must be the slowest (${shredded} vs ${half})`);
  // The curve is the one combat.js already declares: 0.3 at zero rigging, 1 at full.
  assert.ok(
    Math.abs(shredded - 3) < 0.1,
    `a shredded rig must leave 30 % of the hull's speed, got ${shredded} of ${whole}`,
  );
});

test("S128: any hull of the squadron picks up a prize, not only the captain", () => {
  // The captain is at the origin; the escort sits 40 m away, inside the 60 m pickup radius,
  // and the prize is under the escort. The captain used to be the only picker.
  const base = createWorld({ seed: 11 }, { ship: { speedKn: 6 } });
  // The prize is 200 m out, well beyond the 60 m pickup radius of the captain, so only a
  // hull standing on it can take it.
  const escort = { id: "escolta-1", x: 200, y: 0, heading: 0, currentSpeedKn: 0, speedKn: 6 };
  const prize = { id: 901, type: "treasure", x: 200, y: 0, gold: 500, zoneId: "costera" };
  const world = {
    ...base,
    ship: { ...base.ship, x: 0, y: 0, currentSpeedKn: 0 },
    escorts: [escort],
    encounters: [prize],
  };
  const after = updateWorld(world, {}, 0);
  assert.equal(after.gold, world.gold + 500, "the escort's prize must reach the shared purse");
  assert.equal(after.encounters.some((e) => e.id === prize.id), false, "and the prize leaves the sea");
  assert.equal(after.collected, 1);

  // A prize nobody reached stays where it is, so the rule did not become a magnet.
  // A prize nobody reached pays nothing. It may still be despawned by the distance rule
  // (a seeded encounter 4000 m away is beyond the forget radius), so the assertion is
  // about the purse, which is what the rule governs.
  const far = { ...prize, id: 902, x: 400, y: 0 };
  const missed = updateWorld({ ...world, encounters: [far] }, {}, 0);
  assert.equal(missed.gold, world.gold, "an untouched prize pays nothing");
  assert.equal(missed.encounters.some((e) => e.id === far.id), true, "and stays afloat at 400 m");
});
