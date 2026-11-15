/**
 * S111: a laden hull is worth more, and costs more to put right.
 *
 * One rule, two prices: what a ship is worth already drives both the repair fee and the
 * sale price. Adding her load to that worth means the cargo she carries is part of what
 * the yard is saving — and part of what a buyer is paying for.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { REPAIR, loadValueFactor, shipValue, repairCost } from "../src/model/repair.js";
import { salePrice } from "../src/model/sale.js";

const ship = (cargoKg, capacityKg = 40000) => ({
  hullId: "galeon-pequeno",
  paidGold: 10000,
  cargoKg,
  capacityKg,
  condition: { hull: 50, rigging: 100, crew: 100, morale: 100 },
});

test("a hull with no cargo on record is worth exactly what she cost", () => {
  assert.equal(loadValueFactor({}), 1);
  assert.equal(loadValueFactor({ cargoKg: 0 }), 1);
  assert.equal(loadValueFactor({ cargoKg: "" }), 1);
  assert.equal(shipValue({ hullId: "galeon-pequeno", paidGold: 10000 }), 10000);
});

test("a manned but empty hull is not inflated by her crew and provisions", () => {
  // Her load fraction is above zero just for being crewed; only cargo may add value.
  assert.equal(loadValueFactor({ cargoKg: 0, loadFraction: 0.4, capacityKg: 40000 }), 1);
});

test("a laden hull is worth more than the same hull empty", () => {
  const empty = shipValue(ship(0));
  const laden = shipValue(ship(40000));
  assert.equal(empty, 10000);
  assert.ok(laden > empty, `${laden} > ${empty}`);
  // At full capacity she is worth her price plus the declared share.
  assert.ok(Math.abs(laden - 10000 * (1 + REPAIR.loadValueShare)) < 1e-6);
});

test("a half-loaded hull sits between the two", () => {
  const half = loadValueFactor(ship(20000));
  assert.ok(half > 1 && half < 1 + REPAIR.loadValueShare);
});

test("her cargo makes her dearer to repair, not cheaper", () => {
  const empty = repairCost(ship(0));
  const laden = repairCost(ship(40000));
  assert.ok(laden > empty, `laden repair ${laden} must cost more than empty ${empty}`);
});

test("her cargo makes her sell for more, by the same worth", () => {
  const empty = salePrice(ship(0));
  const laden = salePrice(ship(40000));
  assert.ok(laden > empty, `laden sale ${laden} must pay more than empty ${empty}`);
});

test("a broken or negative cargo never inflates a price", () => {
  assert.equal(loadValueFactor({ cargoKg: -500, capacityKg: 40000 }), 1);
  assert.equal(loadValueFactor({ cargoKg: Number.NaN, capacityKg: 40000 }), 1);
  assert.equal(loadValueFactor({ cargoKg: null, capacityKg: 40000 }), 1);
  // No capacity on record: nothing to measure her cargo against, so no surcharge.
  assert.equal(loadValueFactor({ cargoKg: 5000 }), 1);
});
