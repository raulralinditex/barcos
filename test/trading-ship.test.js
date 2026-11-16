/**
 * The market trades with the hull the player picks, not always with the captain.
 *
 * User request (verbatim): "en el mercado no podemos elegir el buque donde van a ir las
 * mercancias".
 */
import test from "node:test";
import assert from "node:assert/strict";

import { tradingShip } from "../src/model/fleet.js";

const fleet = {
  captainId: "a",
  ships: [{ id: "a" }, { id: "b" }, { id: "w", wreck: true }],
};

test("tradingShip: the picked hull is the one that trades", () => {
  assert.equal(tradingShip(fleet, "b").id, "b");
});

test("tradingShip: no pick, or an unknown pick, falls back to the captain", () => {
  assert.equal(tradingShip(fleet, null).id, "a");
  assert.equal(tradingShip(fleet, "nope").id, "a");
});

test("tradingShip: a wreck cannot carry goods, so the captain trades instead", () => {
  assert.equal(tradingShip(fleet, "w").id, "a");
});

test("tradingShip: an empty fleet has nobody to trade with", () => {
  assert.equal(tradingShip({ captainId: null, ships: [] }, "a"), null);
});
