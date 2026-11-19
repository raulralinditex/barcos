import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captains,
  deserializeFleet,
  serializeFleet,
  squadronOf,
  squadrons,
  withShipCommand,
  addCaptain,
  captainAt,
  addShip,
  setCaptain,
} from "../src/model/fleet.js";

/**
 * S155: several captains, one per shipyard, each with the hulls under her command.
 *
 * The player asked for captains per shipyard, each with a fleet of her own, all of them
 * visible at sea. The fleet record stays `{ ships, captainId }` so an old save opens
 * without a migration: a hull with no `commandId` serves the fleet's captain, which is
 * exactly what the game did when there was only one.
 */

const hull = (id, extra = {}) => ({
  id,
  name: id,
  hullId: "galeon-pequeno",
  speedKn: 8,
  capacityKg: 112500,
  days: 45,
  condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
  crewAlive: { marino: 34 },
  yardId: "puerto-casa",
  ...extra,
});

/** A captain serves herself; every other hull names the captain she serves. */
const captain = (id, extra = {}) => hull(id, { commandId: id, ...extra });
const under = (id, commandId, extra = {}) => hull(id, { commandId, ...extra });

test("S155-A: an old save has one captain and every hull serves her", () => {
  // Written before captains existed: no `commandId` anywhere.
  const stored = JSON.stringify({
    v: 1,
    captainId: "a",
    ships: [hull("a"), hull("b"), hull("c")],
  });

  const fleet = deserializeFleet(stored);

  assert.deepEqual(
    fleet.ships.map((ship) => ship.commandId),
    ["a", "a", "a"],
    "every hull must serve the fleet's captain",
  );
  assert.equal(fleet.captainId, "a");
  assert.equal(squadrons(fleet).length, 1, "one captain means one squadron");
  assert.deepEqual(squadrons(fleet)[0].ships.map((ship) => ship.id).sort(), ["a", "b", "c"]);
});

test("S155-A: a saved captain keeps her own command", () => {
  const fleet = deserializeFleet(
    JSON.stringify({
      v: 1,
      captainId: "a",
      ships: [captain("a"), under("b", "a"), captain("x", { yardId: "cala-del-abismo" }), under("y", "x", { yardId: "cala-del-abismo" })],
    }),
  );

  assert.equal(captains(fleet).length, 2);
  assert.deepEqual(squadronOf(fleet, "x").ships.map((ship) => ship.id).sort(), ["x", "y"]);
  assert.deepEqual(squadronOf(fleet, "a").ships.map((ship) => ship.id).sort(), ["a", "b"]);
});

test("S155-A: a hull that names a captain nobody has falls back to the fleet's captain", () => {
  // A hand-edited or half-written save: the orphan must not vanish from every squadron.
  const fleet = deserializeFleet(
    JSON.stringify({ v: 1, captainId: "a", ships: [captain("a"), under("b", "ghost")] }),
  );

  assert.equal(fleet.ships.find((ship) => ship.id === "b").commandId, "a");
  assert.deepEqual(squadronOf(fleet, "a").ships.map((ship) => ship.id).sort(), ["a", "b"]);
});

test("S155-B: a hull moves to another captain when both are in the same shipyard", () => {
  const fleet = deserializeFleet(
    JSON.stringify({
      v: 1,
      captainId: "a",
      ships: [captain("a"), under("b", "a"), captain("x"), under("y", "x")],
    }),
  );

  const moved = withShipCommand(fleet, "b", "x");

  assert.equal(moved.ships.find((ship) => ship.id === "b").commandId, "x");
  assert.deepEqual(squadronOf(moved, "x").ships.map((ship) => ship.id).sort(), ["b", "x", "y"]);
  assert.deepEqual(squadronOf(moved, "a").ships.map((ship) => ship.id), ["a"]);
});

test("S155-B: a hull does not cross the sea to change captain", () => {
  // A hull cannot sail itself between yards, so a cross-yard transfer is refused whole.
  const fleet = deserializeFleet(
    JSON.stringify({
      v: 1,
      captainId: "a",
      ships: [captain("a"), under("b", "a"), captain("x", { yardId: "cala-del-abismo" })],
    }),
  );

  const moved = withShipCommand(fleet, "b", "x");

  assert.equal(moved, fleet, "the fleet must come back untouched");
  assert.equal(fleet.ships.find((ship) => ship.id === "b").commandId, "a");
});

test("S155-B: a captain never serves another captain", () => {
  const fleet = deserializeFleet(
    JSON.stringify({ v: 1, captainId: "a", ships: [captain("a"), captain("x")] }),
  );

  assert.equal(withShipCommand(fleet, "a", "x"), fleet, "a captain cannot be transferred");
});

test("S155-B: a captain with no hulls still exists", () => {
  const fleet = deserializeFleet(JSON.stringify({ v: 1, captainId: "a", ships: [captain("a")] }));

  const solo = withShipCommand(fleet, "a", "a");

  assert.equal(solo, fleet);
  assert.equal(squadronOf(fleet, "a").ships.length, 1, "her own hull is her squadron's first entry");
  assert.deepEqual(squadronOf(fleet, "a").ships.map((s) => s.id), ["a"]);
});

test("S155: a new captain joins empty at her shipyard", () => {
  const fleet = deserializeFleet(JSON.stringify({ v: 1, captainId: "a", ships: [captain("a")] }));

  const added = addCaptain(fleet, hull("x", { name: "Capitana del abismo", yardId: "cala-del-abismo" }));

  assert.equal(captains(added).length, 2);
  assert.equal(captainAt(added, "cala-del-abismo").id, "x");
  assert.deepEqual(squadronOf(added, "x").ships.map((ship) => ship.id), ["x"]);
});

test("S155: the captain of a shipyard is the one moored there", () => {
  const fleet = deserializeFleet(
    JSON.stringify({
      v: 1,
      captainId: "a",
      ships: [captain("a"), captain("x", { yardId: "cala-del-abismo" }), captain("z", { yardId: null })],
    }),
  );

  assert.equal(captainAt(fleet, "cala-del-abismo").id, "x");
  assert.equal(captainAt(fleet, "ensenada-abierta"), null, "a yard with no captain has none");
});

test("S155: the squadron of an unknown captain is empty, never a throw", () => {
  const fleet = deserializeFleet(JSON.stringify({ v: 1, captainId: "a", ships: [captain("a")] }));

  assert.equal(squadronOf(fleet, "nadie"), null);
  assert.deepEqual(squadrons(null), []);
  assert.deepEqual(squadrons({}), []);
  assert.equal(captainAt(null, "puerto-casa"), null);
});

test("S155: the command survives a save and a load", () => {
  const fleet = deserializeFleet(
    JSON.stringify({ v: 1, captainId: "a", ships: [captain("a"), captain("x"), under("y", "x")] }),
  );

  const round = deserializeFleet(serializeFleet(fleet));

  assert.deepEqual(
    round.ships.map((ship) => `${ship.id}:${ship.commandId}`).sort(),
    ["a:a", "x:x", "y:x"],
  );
});

test("S155-A: a promoted hull becomes a captain of her own command", () => {
  // S50's "make captain" is the promotion path. Under S155 the promoted hull is a captain,
  // so her command is her own id; otherwise `captains()` would keep ignoring her and her
  // squadron would answer to the hull she used to serve.
  const fleet = deserializeFleet(
    JSON.stringify({ v: 1, captainId: "a", ships: [captain("a"), under("b", "a")] }),
  );

  const promoted = setCaptain(fleet, "b");

  assert.deepEqual(captains(promoted).map((ship) => ship.id).sort(), ["a", "b"]);
  assert.equal(promoted.ships.find((ship) => ship.id === "b").commandId, "b");
  assert.deepEqual(squadronOf(promoted, "b").ships.map((ship) => ship.id), ["b"]);
});

test("S155-A: a hull bought in a shipyard is a captain, without rewriting her hull", () => {
  // Buying a hull is how a captain moves up (S7). `addShip` must NOT stamp a `commandId`
  // on the hull it was handed: the fleet's captain is recognised by the `captainId`
  // fallback, and rewriting the caller's object is what breaks the repair tests that
  // compare an untouched hull against the one they passed in.
  const fleet = deserializeFleet(JSON.stringify({ v: 1, captainId: "a", ships: [captain("a")] }));
  const fresh = hull("nueva", { name: "Nueva" });

  const bought = addShip(fleet, fresh);

  assert.equal(fresh.commandId, undefined, "the caller's hull must not be rewritten");
  assert.equal(bought.captainId, "nueva");
  assert.deepEqual(captains(bought).map((ship) => ship.id).sort(), ["a", "nueva"]);
  assert.deepEqual(squadronOf(bought, "nueva").ships.map((ship) => ship.id), ["nueva"]);
  // And it survives the save, because the fleet's captain is the fallback for her hulls.
  const round = deserializeFleet(serializeFleet(bought));
  assert.deepEqual(captains(round).map((ship) => ship.id).sort(), ["a", "nueva"]);
});
