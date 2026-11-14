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
  withLiveCondition,
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

/* ---------------------------------------------------------------- S90: escorts keep their damage */

test("S90: a live escort's damage reaches the fleet sheet, not only the sea save", () => {
  // The sea wrote the captain's condition into the fleet sheet but never the escorts', so
  // an escort at 30 % hull came back to the shipyard at whatever the sheet last said and
  // the repair price followed that stale number.
  const captain = { id: "a", name: "Captain", condition: { hull: 100, rigging: 100, crew: 100, morale: 100 } };
  const escort = { id: "b", name: "Escort", condition: { hull: 80, rigging: 90, crew: 100, morale: 100 } };
  const fleet = { ships: [captain, escort], captainId: "a" };

  const live = [
    { id: "a", combat: { condition: { hull: 100, rigging: 100, crew: 100, morale: 100 }, crew: { marino: 10 } } },
    { id: "b", combat: { condition: { hull: 30, rigging: 55, crew: 70, morale: 60 }, crew: { marino: 6 } } },
  ];

  const merged = withLiveCondition(fleet, live);
  const saved = merged.ships.find((ship) => ship.id === "b");
  assert.equal(saved.condition.hull, 30, "the escort's hull did not reach the fleet sheet");
  assert.equal(saved.condition.rigging, 55, "the escort's rigging did not reach the fleet sheet");
  assert.deepEqual(saved.crewAlive, { marino: 6 }, "the escort's crew did not reach the fleet sheet");
  // The captain keeps working exactly as before.
  assert.equal(merged.ships.find((ship) => ship.id === "a").condition.hull, 100);
});

test("S90: a hull with no live combat keeps the condition it had", () => {
  const fleet = {
    ships: [{ id: "a", condition: { hull: 44, rigging: 44, crew: 44, morale: 44 } }],
    captainId: "a",
  };
  const merged = withLiveCondition(fleet, [{ id: "a" }, { id: "ghost", combat: { condition: { hull: 1 } } }]);
  assert.equal(merged.ships[0].condition.hull, 44, "a hull with no combat must keep its saved condition");
  assert.equal(merged.ships.length, 1, "a live hull that is not in the fleet must not be added");
});

test("S90: a broken live list never throws and never loses the fleet", () => {
  const fleet = { ships: [{ id: "a", condition: { hull: 10 } }], captainId: "a" };
  for (const broken of [null, undefined, "x", 42, [null], [{ id: "a", combat: null }]]) {
    const merged = withLiveCondition(fleet, broken);
    assert.equal(merged.ships.length, 1, `broke on ${JSON.stringify(broken)}`);
  }
});
