import test from "node:test";
import assert from "node:assert/strict";
import * as fleetModel from "../src/model/fleet.js";

const home = "puerto-casa";
const away = "cala-del-abismo";
const ship = (id, fields = {}) => ({ id, name: id, speedKn: 5, ...fields });
const ids = (ships) => ships.map((entry) => entry.id);

test("S130 A: yard locations are pure, reject a captain ashore and resolve old or unknown yards home", () => {
  const fleet = { captainId: "captain", ships: [ship("captain", { yardId: null }), ship("old"), ship("bad", { yardId: "unknown" }), ship("away", { yardId: away })] };
  assert.deepEqual(ids(fleetModel.shipsAtYard(fleet, home)), ["old", "bad"]);
  assert.deepEqual(ids(fleetModel.shipsAtYard(fleet, away)), ["away"]);
  assert.deepEqual(ids(fleetModel.shipsAtYard(fleet, "unknown")), []);
  assert.deepEqual(fleetModel.withShipYard(fleet, "captain", home), fleet);
  assert.deepEqual(fleetModel.withShipYard(fleet, "missing", away), fleet);
  const moved = fleetModel.withShipYard(fleet, "old", away);
  assert.equal(moved.ships[1].yardId, away);
  assert.equal(fleet.ships[1].yardId, undefined);
  assert.equal(fleetModel.withShipYard(moved, "old", null).ships[1].yardId, null);
});

test("S130 B: fleet persistence keeps yard IDs and old and unknown locations become home", () => {
  const fleet = { captainId: "captain", ships: [ship("captain", { yardId: null }), ship("home", { yardId: home }), ship("away", { yardId: away })] };
  const saved = JSON.parse(fleetModel.serializeFleet(fleet));
  assert.deepEqual(saved.ships.map((entry) => entry.yardId), [null, home, away]);
  assert.deepEqual(fleetModel.deserializeFleet(JSON.stringify(saved)).ships.map((entry) => entry.yardId), [null, home, away]);
  const old = fleetModel.deserializeFleet(JSON.stringify({ ships: [ship("a"), ship("b", { yardId: "gone" })], captainId: "a" }));
  assert.deepEqual(old.ships.map((entry) => entry.yardId), [home, home]);
});

test("S130 D: departure moves only the local marked and traveling hulls, not another yard", () => {
  const fleet = { captainId: "captain", ships: [ship("captain", { yardId: home }), ship("escort", { yardId: home, sails: true }), ship("stays", { yardId: home, sails: false }), ship("remote", { yardId: away, sails: true }), ship("traveler", { yardId: null, sails: false })] };
  const result = fleetModel.departYard(fleet, home);
  assert.deepEqual(result.ships.map((s) => s.yardId), [null, null, home, away, home]);
  assert.equal(fleet.ships[0].yardId, home);
});

test("S130 F/G: only local or visiting traveling hulls are available, and a remote selection cannot trade", () => {
  const fleet = { captainId: "captain", ships: [ship("captain", { yardId: null }), ship("escort", { yardId: null, sails: true }), ship("home", { yardId: home, sails: false }), ship("remote", { yardId: away, sails: true })] };
  const local = fleetModel.shipsAvailableAtYard(fleet, home, home);
  assert.deepEqual(ids(local), ["captain", "escort", "home"]);
  assert.deepEqual(ids(fleetModel.shipsAvailableAtYard(fleet, home, away)), ["home"]);
  const scoped = { ...fleet, ships: local };
  assert.equal(fleetModel.tradingShip(scoped, "remote").id, "captain");
  assert.equal(fleetModel.tradingShip(scoped, "home").id, "home");
});

test("S35/S7 preserve: marked escorts and a new captain retain their existing behavior", () => {
  let fleet = fleetModel.addShip({ ships: [], captainId: null }, ship("a"));
  fleet = fleetModel.addShip(fleet, ship("b"));
  fleet = fleetModel.withShipSailing(fleet, "a", false);
  assert.equal(fleetModel.captainShip(fleet).id, "b");
  assert.deepEqual(ids(fleetModel.sailingShips(fleet)), ["b"]);
});
