/**
 * S117: what happens to one of our hulls when she goes to the bottom.
 *
 * The player's rule, verbatim: "tambien vamos a poner un checpoint en configuraciones, si
 * se hunde nuestro barco, se queda como naufragio, o podemos areglarlo en el astillero".
 *
 * Two outcomes, one switch: either she is gone from the fleet, as the game always
 * played, or she stays as a wreck that waits in a yard and can be floated again.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { SINKING, floatsAgain, isWreck, wreckHull } from "../src/model/sinking.js";
import { normaliseSettings } from "../src/model/settings.js";
import { repairCost } from "../src/model/repair.js";

const ship = (over = {}) => ({
  id: "s1",
  name: "Perla",
  hullId: "galeon-pequeno",
  paidGold: 10000,
  capacityKg: 40000,
  cargoKg: 0,
  condition: { hull: 40, rigging: 100, crew: 100, morale: 100 },
  ...over,
});

test("by default a sunk hull is gone, exactly as the game always played", () => {
  assert.equal(SINKING.keepWreck, 0);
  assert.equal(wreckHull(ship()), null);
});

test("with the switch on, a sunk hull waits in the yard as a wreck", () => {
  const wreck = wreckHull(ship(), { keepWreck: 1 });
  assert.ok(wreck, "she must stay in the fleet");
  assert.equal(wreck.id, "s1");
  assert.equal(wreck.wreck, true);
  assert.equal(wreck.condition.hull, 0, "a wreck is a hull at zero");
  // She is a wreck, and she is recognised as one.
  assert.equal(isWreck(wreck), true);
  assert.equal(isWreck(ship()), false);
  // She does not sail: a hull at zero is not a captain.
  assert.equal(wreck.sails, false);
});

test("a wreck keeps nothing of her hold: it went down with her (S116)", () => {
  const wreck = wreckHull(ship({ cargoKg: 12000, manifest: [{ commodityId: "sal", units: 10 }] }), { keepWreck: 1 });
  assert.equal(wreck.cargoKg, 0);
  assert.deepEqual(wreck.manifest, []);
  assert.equal(wreck.crewAlive.marino ?? 0, 0, "the crew that was aboard is lost");
});

test("a wreck can be floated again in a yard, and only a wreck can", () => {
  const wreck = wreckHull(ship(), { keepWreck: 1 });
  const floated = floatsAgain(wreck);
  assert.ok(floated, "a wreck floats again");
  assert.equal(floated.wreck, false);
  assert.equal(floated.condition.hull, 100);
  assert.equal(floated.sails, true);
  // A hull that is not a wreck is not floated again: she was never at the bottom.
  assert.equal(floatsAgain(ship()), null);
  assert.equal(floatsAgain(null), null);
});

test("floating her again costs a full repair, which is the price of her mistake", () => {
  const wreck = wreckHull(ship(), { keepWreck: 1 });
  const price = repairCost(wreck);
  assert.ok(price > 0, "a free refloat would make sinking painless");
});

test("the switch is a setting like any other, off unless the player says so", () => {
  const settings = normaliseSettings({});
  assert.equal(settings["sinking.keepWreck"], 0);
  // Out of range, or not a number at all: the shipped default, never a broken value.
  assert.equal(normaliseSettings({ "sinking.keepWreck": 7 })["sinking.keepWreck"], 1);
  assert.equal(normaliseSettings({ "sinking.keepWreck": "basura" })["sinking.keepWreck"], 0);
  assert.equal(normaliseSettings({ "sinking.keepWreck": -3 })["sinking.keepWreck"], 0);
});

test("the switch is read when she sinks, so changing it mid-voyage counts", () => {
  assert.equal(wreckHull(ship(), { keepWreck: 0 }), null);
  assert.ok(wreckHull(ship(), { keepWreck: 1 }));
  // A broken switch is off: the harsher outcome is the safe default.
  assert.equal(wreckHull(ship(), { keepWreck: Number.NaN }), null);
});
