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

test("S130 D / S182: a departure sails the captain's own hulls and leaves the rest", () => {
  // S182 changed the rule this case measures. A set-sail used to move every hull moored at
  // the yard, whatever command she answered to, so a yard with two captains sent both
  // squadrons to sea with one button. Now a departure is one command's business, so the
  // assertion says what each hull does and why, instead of one flat list of yard ids.
  // Updated with the player's explicit approval.
  const fleet = {
    captainId: "captain",
    ships: [
      ship("captain", { yardId: home, commandId: "captain" }),
      ship("escort", { yardId: home, commandId: "captain", sails: true }),
      ship("stays", { yardId: home, commandId: "captain", sails: false }),
      ship("remote", { yardId: away, commandId: "captain", sails: true }),
      ship("traveler", { yardId: null, commandId: "captain", sails: false }),
      ship("other", { yardId: home, commandId: "other", sails: true }),
    ],
  };
  const result = fleetModel.departYard(fleet, home);
  const byId = Object.fromEntries(result.ships.map((s) => [s.id, s.yardId]));
  // Her own command: the captain and her marked hull sail, an unmarked one stays, a hull
  // at another yard is not hers to move, and one already at sea is left alone.
  assert.equal(byId.captain, null, "the sailing captain leaves");
  assert.equal(byId.escort, null, "her marked hull sails with her");
  assert.equal(byId.stays, home, "her unmarked hull stays moored");
  assert.equal(byId.remote, away, "a hull at another yard is not moved from here");
  assert.equal(byId.traveler, null, "a hull already at sea is left where she is");
  // S182: another captain's hull is not hers to send to sea.
  assert.equal(byId.other, home, "another captain's hull stays until she sails herself");
  assert.equal(fleet.ships[0].yardId, home, "the input fleet is not mutated");
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
