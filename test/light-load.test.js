/**
 * S110: a hull that floats too high steers badly.
 *
 * Empty is not free. The same hull that answers her helm properly when laden loses a
 * quarter of her turn rate when she carries less than a fifth of what she can hold,
 * because the rudder needs weight in the water to bite. The penalty fades in as the load
 * rises, so there is no cliff: it is physics, not a fee.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  TURNING,
  lightLoadTurnFactor,
  shipTurnFactor,
  hullTurnFactor,
} from "../src/model/turning.js";
import { buildShip } from "../src/model/shipyard.js";

const config = (cargoKg) => ({
  hullId: "galeon-pequeno",
  batteries: [],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45,
  cargoKg,
  ballastKg: 0,
  equipmentKg: 0,
  reserveKg: 0,
});

test("a laden hull keeps her full turn rate", () => {
  assert.equal(lightLoadTurnFactor(0.5), 1);
  assert.equal(lightLoadTurnFactor(1), 1);
  assert.equal(lightLoadTurnFactor(TURNING.lightLoadThreshold), 1);
});

test("an empty hull loses a quarter of her helm", () => {
  assert.equal(lightLoadTurnFactor(0), TURNING.lightLoadFactor);
  assert.equal(lightLoadTurnFactor(0), 0.75);
});

test("the penalty fades in with the load instead of jumping", () => {
  const empty = lightLoadTurnFactor(0);
  const half = lightLoadTurnFactor(TURNING.lightLoadThreshold / 2);
  const loaded = lightLoadTurnFactor(TURNING.lightLoadThreshold);
  assert.ok(empty < half && half < loaded, `${empty} < ${half} < ${loaded}`);
  // Half the threshold is halfway between the floor and full.
  assert.ok(Math.abs(half - (TURNING.lightLoadFactor + 1) / 2) < 1e-9);
});

test("an unknown load steers exactly as she always did", () => {
  // A ship with no load on record must not be punished for the gap.
  assert.equal(lightLoadTurnFactor(undefined), 1);
  assert.equal(lightLoadTurnFactor(null), 1);
  assert.equal(lightLoadTurnFactor(Number.NaN), 1);
  assert.equal(lightLoadTurnFactor(""), 1);
});

test("the hull's own tonnage and her load both apply", () => {
  const hull = hullTurnFactor("galeon-pequeno");
  assert.equal(shipTurnFactor("galeon-pequeno", 0.5), hull);
  assert.ok(shipTurnFactor("galeon-pequeno", 0) < hull);
});

test("the builder warns a hull that floats too high, and not a laden one", () => {
  const empty = buildShip(config(0), 999999);
  const laden = buildShip(config(20000), 999999);
  const warning = (ship) => ship.warnings.find((w) => w.code === "light-load");
  assert.ok(warning(empty), "an empty hull must warn about her helm");
  assert.equal(warning(laden), undefined, "a laden hull must not warn");
  // The warning names the numbers the player has to act on.
  assert.equal(typeof warning(empty).params.load, "number");
  assert.equal(typeof warning(empty).params.needed, "number");
});

test("the warning is not an error: an empty hull still sails", () => {
  const empty = buildShip(config(0), 999999);
  assert.equal(empty.errors.find((e) => e.code === "light-load"), undefined);
  assert.equal(empty.feasible, true);
});
