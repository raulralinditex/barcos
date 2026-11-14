/**
 * The purse can never go negative (S32). Gold is only ever added by treasure and
 * only ever removed by a purchase the player could afford, so a negative balance is
 * always a corrupted or hand-edited save. The rule lives in the model so both screens
 * (shipyard and sea) clamp the same way, and the repairs refuse to spend what is not
 * there instead of handing back a debt.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { STARTING_GOLD } from "../src/data/naval-data.js";
import { normaliseGold } from "../src/model/economy.js";
import { repairFleetShip, repairShip } from "../src/model/repair.js";

const hurt = () => ({
  id: "hull-1",
  name: "Golden Hind",
  hullId: "galeon-pequeno",
  condition: { hull: 40, rigging: 60, crew: 50, morale: 80 },
  crew: { marino: 34, artillero: 10, soldado: 26 },
});

/* ---------------------------------------------------------------- the purse itself */

test("S32: a normal purse is returned unchanged", () => {
  assert.equal(normaliseGold(0), 0);
  assert.equal(normaliseGold(500), 500);
  assert.equal(normaliseGold(STARTING_GOLD), STARTING_GOLD);
  assert.equal(normaliseGold(12.5), 12.5);
});

test("S32: a negative purse becomes zero", () => {
  for (const value of [-1, -500, -0.5, -Number.MAX_VALUE]) {
    assert.equal(normaliseGold(value), 0, `gold ${value}`);
  }
});

test("S32: a broken purse becomes zero instead of NaN", () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, "500", {}, []]) {
    assert.equal(normaliseGold(value), 0, `gold ${JSON.stringify(value) ?? String(value)}`);
  }
});

/* ---------------------------------------------------------------- spending */

test("S32: repairing a captain with a negative purse spends nothing and leaves zero", () => {
  const result = repairShip(hurt(), -400);
  assert.equal(result.repaired, false);
  assert.equal(result.reason, "unaffordable");
  assert.equal(result.gold, 0);
  assert.ok(result.gold >= 0, "the purse went negative");
});

test("S32: repairing a fleet hull with a negative purse spends nothing and leaves zero", () => {
  const fleet = { ships: [hurt()], captainId: null };
  const result = repairFleetShip(fleet, "hull-1", -400);
  assert.equal(result.repaired, false);
  assert.equal(result.gold, 0);
  assert.ok(result.gold >= 0, "the purse went negative");
  assert.equal(result.fleet.ships[0].condition.hull, 40, "the hull was repaired for free");
});

test("S32: a repair never returns a purse below zero, whatever it is handed", () => {
  for (const purse of [-1000, -1, 0, 100, NaN, undefined, null]) {
    const captain = repairShip(hurt(), purse);
    assert.ok(captain.gold >= 0, `captain purse went negative with ${String(purse)}`);
    const fleet = repairFleetShip({ ships: [hurt()], captainId: null }, "hull-1", purse);
    assert.ok(fleet.gold >= 0, `fleet purse went negative with ${String(purse)}`);
  }
});

test("S32: a repair that is paid for still leaves the right remainder", () => {
  const result = repairShip(hurt(), 10_000);
  assert.equal(result.repaired, true);
  assert.ok(result.gold >= 0);
  assert.equal(result.gold, 10_000 - result.spent);
});
