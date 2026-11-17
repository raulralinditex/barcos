import test from "node:test";
import assert from "node:assert/strict";
import { shipsAtYard, shipsAvailableAtYard } from "../src/model/fleet.js";
import { floatsAgain, isWreck, refloatCost, wreckHull } from "../src/model/sinking.js";

const home = "puerto-casa";
const away = "cala-del-abismo";

test("S117/S130: a hull sunk at sea returns home and can be refloated there", () => {
  const sailing = {
    id: "escort", name: "Escolta", hullId: "galeon-pequeno", speedKn: 5,
    paidGold: 10000, yardId: null, sails: true, cargoKg: 500,
    condition: { hull: 40, rigging: 100, crew: 100, morale: 100 },
  };
  const wreck = wreckHull(sailing, { keepWreck: 1 });
  const fleet = { captainId: "captain", ships: [{ id: "captain", yardId: null }, wreck] };
  assert.equal(wreck.yardId, home);
  assert.deepEqual(shipsAtYard(fleet, home).map((ship) => ship.id), ["escort"]);
  assert.deepEqual(shipsAtYard(fleet, away), []);
  assert.deepEqual(shipsAvailableAtYard(fleet, home, away).map((ship) => ship.id), ["escort"]);
  assert.equal(isWreck(wreck), true);
  assert.equal(wreck.sails, false);
  assert.equal(wreck.cargoKg, 0);
  assert.ok(refloatCost(wreck) > 0);
  const floated = floatsAgain(wreck);
  assert.equal(floated.id, sailing.id);
  assert.equal(floated.yardId, home);
  assert.equal(floated.wreck, false);
  assert.equal(floated.condition.hull, 100);
  assert.equal(floated.sails, true);
  assert.equal(sailing.yardId, null);
});

test("S117 preserve: with wrecks disabled a sinking leaves no wreck", () => {
  const ship = { id: "escort", yardId: null };
  assert.equal(wreckHull(ship, { keepWreck: 0 }), null);
  assert.deepEqual(ship, { id: "escort", yardId: null });
});
