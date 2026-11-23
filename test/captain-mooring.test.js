import test from "node:test";
import assert from "node:assert/strict";
import * as fleetModel from "../src/model/fleet.js";

const home = "puerto-casa";
const away = "cala-del-abismo";
const ship = (id, fields = {}) => ({ id, speedKn: 5, ...fields });

test("S130: the sea position reconciles only the captain, at another yard or in open water", () => {
  const fleet = { captainId: "captain", ships: [
    ship("captain", { yardId: home, sails: true }),
    ship("stays", { yardId: home, sails: false }),
    ship("remote", { yardId: away, sails: false }),
    ship("wreck", { yardId: home, wreck: true, sails: false }),
  ] };
  const arrived = fleetModel.reconcileCaptainPosition(fleet, { x: 4600, y: 0 });
  assert.deepEqual(arrived.ships.map((s) => s.yardId), [away, home, away, home]);
  assert.deepEqual(fleet.ships.map((s) => s.yardId), [home, home, away, home]);
  assert.deepEqual(fleetModel.shipsAtYard(arrived, away).map((s) => s.id), ["captain", "remote"]);
  const sailing = fleetModel.reconcileCaptainPosition(arrived, { x: 1000, y: 1000 });
  assert.deepEqual(sailing.ships.map((s) => s.yardId), [null, home, away, home]);
  assert.deepEqual(fleetModel.shipsAtYard(sailing, away).map((s) => s.id), ["remote"]);
});

test("S130 preserve: absent or invalid sea positions do not move a fleet", () => {
  const fleet = { captainId: "captain", ships: [ship("captain", { yardId: home }), ship("stays", { yardId: away, sails: false })] };
  for (const position of [null, {}, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    assert.deepEqual(fleetModel.reconcileCaptainPosition(fleet, position), fleet);
  }
});
