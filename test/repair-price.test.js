import test from "node:test";
import assert from "node:assert/strict";

import { priceWithPurse } from "../src/model/repair.js";

/* S45 — the price a repair offer shows can never exceed the gold the player has. */

test("S45: a purse that covers the repair shows the full price", () => {
  assert.equal(priceWithPurse(865, 5000), 865);
  assert.equal(priceWithPurse(865, 865), 865);
});

test("S45: a short purse shows the purse, which is what the partial repair spends", () => {
  assert.equal(priceWithPurse(1045, 300), 300);
  assert.equal(priceWithPurse(1045, 1), 1);
});

test("S45: an empty purse shows 0, never the full price", () => {
  assert.equal(priceWithPurse(1045, 0), 0);
});

test("S45: a sound hull has no price whatever the purse", () => {
  assert.equal(priceWithPurse(0, 5000), 0);
  assert.equal(priceWithPurse(0, 0), 0);
});

test("S45: a broken or negative purse shows 0 instead of a debt or NaN", () => {
  for (const purse of [-50, NaN, undefined, null, "abc"]) {
    assert.equal(priceWithPurse(865, purse), 0, `purse ${String(purse)}`);
  }
});

test("S45: a broken cost shows 0 instead of NaN", () => {
  for (const cost of [NaN, undefined, null, -10]) {
    assert.equal(priceWithPurse(cost, 5000), 0, `cost ${String(cost)}`);
  }
});

test("S45: the price shown is exactly what repairShip charges", async () => {
  const { repairShip, repairCost } = await import("../src/model/repair.js");
  const ship = {
    hullId: "galeon-pequeno",
    paidGold: 5000,
    crew: { marino: 34, artillero: 10, soldado: 26 },
    condition: { hull: 30, rigging: 60, crew: 100, morale: 100 },
  };
  const cost = repairCost(ship);
  for (const purse of [0, 1, Math.floor(cost / 2), cost, cost + 400]) {
    const shown = priceWithPurse(cost, purse);
    const result = repairShip(ship, purse);
    assert.equal(shown, result.spent, `purse ${purse}: shown ${shown}, charged ${result.spent}`);
  }
});

/* S55 — a damaged hull always quotes at least one doubloon, however small the damage. */

test("S55: the tiniest damage still costs one doubloon", async () => {
  const { repairCost } = await import("../src/model/repair.js");
  const hull = { hullId: "galeon-pequeno", paidGold: 1, condition: { hull: 99, rigging: 100, crew: 100, morale: 100 } };
  assert.ok(repairCost(hull) > 0, "a damaged hull must never quote 0");
  assert.equal(repairCost(hull), 1, "and the smallest quote is one doubloon");
});

test("S55: a free repair is never offered while damage is left", async () => {
  const { repairCost, needsRepair } = await import("../src/model/repair.js");
  for (const paidGold of [1, 10, 100, 5000]) {
    for (const hull of [99, 99.9, 90, 50]) {
      const ship = { hullId: "galeon-pequeno", paidGold, condition: { hull, rigging: 100, crew: 100, morale: 100 } };
      assert.ok(needsRepair(ship), `${hull} % is damage`);
      assert.ok(repairCost(ship) >= 1, `${hull} % of a ${paidGold}-gold hull quoted ${repairCost(ship)}`);
    }
  }
});

test("S55: a sound hull still costs nothing", async () => {
  const { repairCost } = await import("../src/model/repair.js");
  assert.equal(repairCost({ paidGold: 5000, condition: { hull: 100, rigging: 100, crew: 100, morale: 100 } }), 0);
});
