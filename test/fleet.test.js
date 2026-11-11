import test from "node:test";
import assert from "node:assert/strict";

import {
  addShip,
  captainShip,
  deserializeFleet,
  fleetUpkeep,
  fleetWorth,
  isEmptyFleet,
  removeShip,
  serializeFleet,
  setCaptain,
} from "../src/model/fleet.js";

const ship = (id, overrides = {}) => ({
  id,
  name: `Ship ${id}`,
  hullId: "zabra",
  hullName: "Zabra",
  speedKn: 5,
  paidGold: 2200,
  upkeep: 12,
  ...overrides,
});

const empty = () => ({ ships: [], captainId: null });

/* ---------------------------------------------------------------- S7 progression */

test("S7: the first ship bought becomes the captain", () => {
  const fleet = addShip(empty(), ship("a"));
  assert.equal(fleet.ships.length, 1);
  assert.equal(captainShip(fleet).id, "a");
});

test("S7: buying another ship adds it and makes it the new captain", () => {
  let fleet = addShip(empty(), ship("a"));
  fleet = addShip(fleet, ship("b"));
  assert.equal(fleet.ships.length, 2);
  assert.equal(captainShip(fleet).id, "b");
  // the first hull is still owned, it just stays in port
  assert.ok(fleet.ships.some((s) => s.id === "a"));
});

test("S7: the player can choose which owned ship to captain", () => {
  let fleet = addShip(addShip(empty(), ship("a")), ship("b"));
  fleet = setCaptain(fleet, "a");
  assert.equal(captainShip(fleet).id, "a");
  assert.equal(fleet.ships.length, 2);
});

test("S7: promoting an unknown ship leaves the fleet untouched", () => {
  const fleet = addShip(empty(), ship("a"));
  const after = setCaptain(fleet, "does-not-exist");
  assert.equal(captainShip(after).id, "a");
  assert.equal(after.ships.length, 1);
});

test("S7: an empty fleet has no captain", () => {
  assert.equal(captainShip(empty()), null);
  assert.equal(isEmptyFleet(empty()), true);
  assert.equal(isEmptyFleet(addShip(empty(), ship("a"))), false);
});

/* ---------------------------------------------------------------- losing hulls */

test("S7: losing the captain hands the fleet to the next hull", () => {
  let fleet = addShip(addShip(empty(), ship("a")), ship("b"));
  fleet = setCaptain(fleet, "b");
  fleet = removeShip(fleet, "b");
  assert.equal(fleet.ships.length, 1);
  assert.equal(captainShip(fleet).id, "a");
});

test("S7: losing a ship in port keeps the captain where it was", () => {
  let fleet = addShip(addShip(empty(), ship("a")), ship("b"));
  fleet = setCaptain(fleet, "a");
  fleet = removeShip(fleet, "b");
  assert.equal(captainShip(fleet).id, "a");
});

test("S7: losing the last ship leaves an empty fleet, not a broken one", () => {
  let fleet = addShip(empty(), ship("a"));
  fleet = removeShip(fleet, "a");
  assert.deepEqual(fleet.ships, []);
  assert.equal(fleet.captainId, null);
  assert.equal(captainShip(fleet), null);
});

test("S7: removing a ship that is not in the fleet changes nothing", () => {
  const fleet = addShip(empty(), ship("a"));
  const after = removeShip(fleet, "ghost");
  assert.equal(after.ships.length, 1);
  assert.equal(after.captainId, "a");
});

/* ---------------------------------------------------------------- fleet worth */

test("S7: fleet worth is what the hulls cost", () => {
  let fleet = addShip(empty(), ship("a", { paidGold: 2200 }));
  fleet = addShip(fleet, ship("b", { paidGold: 7000 }));
  assert.equal(fleetWorth(fleet), 9200);
  assert.equal(fleetUpkeep(fleet), 24);
});

/* ---------------------------------------------------------------- S8 persistence */

test("S8: a fleet round-trips through serialize/deserialize", () => {
  let fleet = addShip(addShip(empty(), ship("a")), ship("b"));
  fleet = setCaptain(fleet, "a");
  const back = deserializeFleet(serializeFleet(fleet));
  assert.equal(back.ships.length, 2);
  assert.equal(captainShip(back).id, "a");
});

test("S8: a corrupted fleet save yields an empty fleet instead of throwing", () => {
  assert.deepEqual(deserializeFleet("{not json"), { ships: [], captainId: null });
  assert.deepEqual(deserializeFleet(null), { ships: [], captainId: null });
  assert.deepEqual(deserializeFleet(JSON.stringify({ v: 1 })), { ships: [], captainId: null });
});

test("S8: a save pointing at a missing captain falls back to the first hull", () => {
  const raw = JSON.stringify({ v: 1, ships: [ship("a"), ship("b")], captainId: "gone" });
  assert.equal(captainShip(deserializeFleet(raw)).id, "a");
});

test("S8: ships with a broken shape are dropped from the fleet", () => {
  const raw = JSON.stringify({
    v: 1,
    ships: [ship("a"), { id: "broken" }, null, ship("c")],
    captainId: "a",
  });
  const fleet = deserializeFleet(raw);
  assert.deepEqual(fleet.ships.map((s) => s.id), ["a", "c"]);
});

test("S8: a save written before fleets existed becomes a one-ship fleet", () => {
  const legacy = ship("legacy");
  const fleet = deserializeFleet(null, legacy);
  assert.equal(fleet.ships.length, 1);
  assert.equal(captainShip(fleet).id, "legacy");
});
