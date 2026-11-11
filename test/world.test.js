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
  stepShip,
  updateWorld,
  zoneAtRadius,
} from "../src/model/world.js";

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
