import test from "node:test";
import assert from "node:assert/strict";

import { HULLS } from "../src/data/naval-data.js";
import {
  TURNING,
  hullTurnFactor,
  turnRateFactor,
  turningRadiusM,
} from "../src/model/turning.js";
import { WORLD, stepShip } from "../src/model/world.js";
import { createEscort, stepEscort } from "../src/model/formation.js";
import { aiStep } from "../src/model/combat.js";

/* S48 — the turning radius follows the tonnage: the heavier the hull, the wider the turn. */

const byWeight = [...HULLS].sort((a, b) => a.displacementKg - b.displacementKg);

test("S48: the reference hull turns at the base rudder rate", () => {
  assert.equal(turnRateFactor(TURNING.referenceKg), 1);
});

test("S48: a heavier hull turns slower and a lighter one faster", () => {
  assert.ok(turnRateFactor(TURNING.referenceKg * 2) < 1);
  assert.ok(turnRateFactor(TURNING.referenceKg / 2) > 1);
});

test("S48: the factor never rises with the weight, hull after hull", () => {
  let previous = Infinity;
  for (const hull of byWeight) {
    const factor = turnRateFactor(hull.displacementKg);
    assert.ok(factor <= previous + 1e-12, `${hull.id} (${hull.displacementKg} kg) turns faster than a lighter hull`);
    previous = factor;
  }
});

test("S48: the lightest and the heaviest hulls are really different", () => {
  const light = hullTurnFactor(byWeight[0].id);
  const heavy = hullTurnFactor(byWeight.at(-1).id);
  assert.ok(light > heavy * 2, `light ${light} vs heavy ${heavy}`);
});

test("S48: the factor stays inside its declared limits", () => {
  assert.equal(turnRateFactor(1), TURNING.maxFactor);
  assert.equal(turnRateFactor(1e12), TURNING.minFactor);
  for (const hull of HULLS) {
    const factor = turnRateFactor(hull.displacementKg);
    assert.ok(factor >= TURNING.minFactor && factor <= TURNING.maxFactor, hull.id);
  }
});

test("S48: an unknown weight or hull changes nothing", () => {
  for (const mass of [undefined, null, NaN, 0, -5, "abc"]) {
    assert.equal(turnRateFactor(mass), 1, String(mass));
  }
  assert.equal(hullTurnFactor("no-such-hull"), 1);
  assert.equal(hullTurnFactor(undefined), 1);
});

test("S48: at the same speed a heavier hull describes a wider circle", () => {
  const speedKn = 5;
  const radius = (hullId) => turningRadiusM(speedKn, WORLD.maxTurnRate * hullTurnFactor(hullId));
  const light = radius(byWeight[0].id);
  const heavy = radius(byWeight.at(-1).id);
  assert.ok(heavy > light * 2, `light ${Math.round(light)} m vs heavy ${Math.round(heavy)} m`);
});

test("S48: the radius is speed over turn rate", () => {
  const expected = (4 * (1852 / 3600) * WORLD.arcadeScale) / 0.5;
  assert.ok(Math.abs(turningRadiusM(4, 0.5) - expected) < 1e-9);
  assert.equal(turningRadiusM(4, 0), Infinity);
});

test("S48: a captain with a heavy hull turns less per tick than one with a light hull", () => {
  const base = { x: 0, y: 0, heading: 0, currentSpeedKn: 3, speedKn: 6 };
  const light = stepShip({ ...base, turnFactor: 1.5 }, { turn: 1, throttle: 1 }, 1);
  const heavy = stepShip({ ...base, turnFactor: 0.4 }, { turn: 1, throttle: 1 }, 1);
  assert.ok(heavy.heading < light.heading, `${heavy.heading} vs ${light.heading}`);
  assert.ok(Math.abs(heavy.heading - WORLD.maxTurnRate * 0.4) < 1e-9);
  assert.ok(Math.abs(light.heading - WORLD.maxTurnRate * 1.5) < 1e-9);
});

test("S48: a ship with no hull factor turns exactly as before", () => {
  const plain = stepShip({ x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: 5 }, { turn: 1 }, 1);
  assert.ok(Math.abs(plain.heading - WORLD.maxTurnRate) < 1e-9);
});

test("S48: an escort turns at its own hull's rate towards its station", () => {
  const captain = { x: 0, y: 0, heading: 0 };
  const station = { x: 0, y: 400 }; // due south: a 90 degree turn to make
  const make = (turnFactor) => ({ ...createEscort({ id: "e", speedKn: 6, turnFactor }, captain, 0), x: 0, y: 0, heading: 0 });
  const light = stepEscort(make(1.5), station, { captainSpeedKn: 4 }, 1);
  const heavy = stepEscort(make(0.4), station, { captainSpeedKn: 4 }, 1);
  assert.ok(heavy.heading < light.heading, `${heavy.heading} vs ${light.heading}`);
});

test("S48: an enemy heavy hull turns less per tick than a light one", () => {
  const player = { x: 0, y: 600, combat: { status: "fighting" } };
  const enemy = (hullId) => ({
    id: 1, type: "enemy", hullId, x: 0, y: 0, heading: 0, currentSpeedKn: 3,
    combat: { status: "fighting", pieces: [], crew: {}, condition: { hull: 100, rigging: 100, crew: 100, morale: 100 }, maxSpeedKn: 6 },
  });
  const turned = (hullId) => {
    const result = aiStep(enemy(hullId), player, 1, () => 0.5);
    return Math.abs(result.enemy.heading > Math.PI ? result.enemy.heading - Math.PI * 2 : result.enemy.heading);
  };
  assert.ok(turned(byWeight.at(-1).id) < turned(byWeight[0].id));
});

/* S57 — the enemy hull obeys the same physics as the player's hull. */

const hullCombat = (overrides = {}) => ({
  status: "fighting",
  pieces: [],
  crew: { artillero: 0, marino: 100, soldado: 50 },
  crewMin: 10,
  condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
  maxSpeedKn: 6,
  ...overrides,
});

const enemyAt = (hullId, combat = hullCombat()) => ({
  id: 1, type: "enemy", hullId, x: 0, y: 0, heading: 0, currentSpeedKn: 0, combat,
});

test("S57: the enemy's rudder obeys WORLD.maxTurnRate, not a copied constant", () => {
  // A hull that turns at the base rate must turn exactly what stepShip would turn.
  const turnFactor = 1;
  const enemy = enemyAt("galeon-pequeno");
  // Straight at the player: full helm, no other influence on the heading.
  const player = { x: 0, y: -1000 };
  const dt = 1;
  const enemyTurn = Math.abs(aiStep(enemy, player, dt, () => 0.5).enemy.heading);
  const shipTurn = Math.abs(stepShip({ x: 0, y: 0, heading: 0, speedKn: 6, currentSpeedKn: 0, turnFactor }, { turn: 1, throttle: 1 }, dt).heading);
  assert.ok(Math.abs(enemyTurn - shipTurn) < 1e-9, `enemy ${enemyTurn} vs ship ${shipTurn}`);
});

test("S57: the enemy's acceleration obeys WORLD.accelerationRate", () => {
  const enemy = enemyAt("galeon-pequeno");
  const dt = 1;
  // Full throttle, straight at the player: it accelerates the way a hull accelerates.
  const result = aiStep(enemy, { x: 0, y: -2000 }, dt, () => 0.5);
  const ship = stepShip({ x: 0, y: 0, heading: 0, speedKn: 6, currentSpeedKn: 0, turnFactor: 1 }, { turn: 0, throttle: 1 }, dt);
  assert.ok(
    Math.abs(result.enemy.currentSpeedKn - ship.currentSpeedKn) < 1e-9,
    `enemy ${result.enemy.currentSpeedKn} vs ship ${ship.currentSpeedKn}`,
  );
});

/** Sail the enemy straight at a far player until its speed settles, and report it. */
const settledSpeed = (enemy, wind) => {
  let current = enemy;
  // Far enough to keep full throttle the whole way; the heading barely moves.
  for (let i = 0; i < 400; i += 1) {
    current = aiStep(current, { x: 0, y: -40000 }, 0.1, () => 0.5, wind ? { wind } : {}).enemy;
  }
  return current.currentSpeedKn;
};

test("S57: a wind in the enemy's teeth holds it back, as it holds the player", () => {
  // The enemy runs north (heading -PI/2) against a wind blowing south: head wind.
  const enemy = { ...enemyAt("galeon-pequeno"), heading: -Math.PI / 2 };
  const wind = { direction: Math.PI / 2, strengthKn: 20 };
  const withWind = settledSpeed(enemy, wind);
  const noWind = settledSpeed(enemy, null);
  assert.ok(withWind < noWind, `the head wind must slow the enemy: ${withWind} vs ${noWind}`);
});

test("S57: a following wind speeds the enemy up, as it speeds the player up", () => {
  // The enemy runs north with a wind blowing north behind it: following wind.
  const enemy = { ...enemyAt("galeon-pequeno"), heading: -Math.PI / 2 };
  const wind = { direction: -Math.PI / 2, strengthKn: 20 };
  const withWind = settledSpeed(enemy, wind);
  const noWind = settledSpeed(enemy, null);
  assert.ok(withWind > noWind, `the following wind must speed the enemy up: ${withWind} vs ${noWind}`);
});

test("S57: below its minimum sailors the enemy loses half its rudder, like the player", () => {
  const dt = 1;
  const player = { x: 0, y: -1000 };
  const full = enemyAt("galeon-pequeno", hullCombat());
  const short = enemyAt("galeon-pequeno", hullCombat({ crew: { artillero: 0, marino: 2, soldado: 5 }, crewMin: 20 }));
  const fullTurn = Math.abs(aiStep(full, player, dt, () => 0.5).enemy.heading);
  const shortTurn = Math.abs(aiStep(short, player, dt, () => 0.5).enemy.heading);
  assert.ok(Math.abs(shortTurn - fullTurn / 2) < 1e-9, `short ${shortTurn} vs full ${fullTurn}`);
});

test("S57: the enemy cannot sail out of the world, as the player cannot", () => {
  const dt = 5;
  const enemy = { ...enemyAt("galeon-pequeno"), x: 0, y: 0, heading: Math.PI / 2, currentSpeedKn: 6 };
  // Chasing a player far to the south, it would run past the edge.
  let current = enemy;
  for (let i = 0; i < 200; i += 1) {
    current = aiStep(current, { x: 0, y: 40000 }, dt, () => 0.5).enemy;
    assert.ok(
      Math.hypot(current.x, current.y) <= WORLD.radiusM + 1e-6,
      `the enemy escaped to ${Math.hypot(current.x, current.y)} m (world ${WORLD.radiusM})`,
    );
  }
});
