/**
 * S183: a captain per yard sails from her own yard, and her squadron is placed at it.
 *
 * The player reported it (verbatim, in Spanish): with a captain bought in ensenada-abierta
 * (renamed "aguas costeras") and another in cala-del-abismo ("mar abierto"), buying a second
 * hull in the first yard must show her as that yard's capitana, and setting sail with her must
 * take her out of that yard and leave her next to its quay — not next to the other ships.
 *
 * Measured causes, the model halves of them:
 *   C. `departYard` sailed `fleet.captainId`, not the captain of the yard on screen, so a
 *      captain who is not the fleet's own could never put to sea from her own yard.
 *   D. a command the sea has never seen afloat was placed on a ring 420 m from the leading
 *      captain, and never at the anchor of the yard she had just sailed from.
 *
 * The screen halves (the yard entered by hash, the capitana tag) live in
 * `scripts/smoke-yard-captains.mjs`, because they are rendering, not rules.
 */

import test from "node:test";
import assert from "node:assert/strict";

import * as fleetModel from "../src/model/fleet.js";
import * as worldModel from "../src/model/world.js";
import { SHIPYARDS } from "../src/data/naval-data.js";

const A = "ensenada-abierta";
const B = "cala-del-abismo";
const hull = (id, fields = {}) => ({ id, name: id, speedKn: 5, ...fields });
const yardOf = (id) => SHIPYARDS.find((yard) => yard.id === id);
const yardAt = (world, id) => (world.squadrons ?? []).find((squadron) => squadron.id === id) ?? null;

/** The rule under test, or the identity while the model has no such seam yet (RED). */
const withAfloatSquadrons = worldModel.withAfloatSquadrons ?? ((world) => world);

/** The fleet of the report: one captain at sea, one per yard, the last one bought in A. */
const reported = () => ({
  captainId: "ship1",
  ships: [
    hull("ship1", { commandId: "ship1", yardId: null }),
    hull("ship2", { commandId: "ship2", yardId: A }),
    hull("ship3", { commandId: "ship3", yardId: B }),
  ],
});

/* ------------------------------------------------------- C: who sets sail */

test("S183: setting sail from a yard sails that yard's captain, not the fleet's captain", () => {
  const after = fleetModel.departYard(reported(), A, "ship2");
  const at = Object.fromEntries(after.ships.map((ship) => [ship.id, ship.yardId]));
  assert.equal(at.ship2, null, "the captain the player picked must leave her own yard");
  assert.equal(at.ship1, null, "the fleet's captain was already at sea and is left alone");
  assert.equal(at.ship3, B, "another yard's captain stays moored until she sails herself");
  assert.equal(after.captainId, "ship1", "sailing a yard's captain does not move the fleet's helm");
});

test("S183: the captain who sailed remembers which yard she sailed from", () => {
  const after = fleetModel.departYard(reported(), A, "ship2");
  assert.deepEqual(after.departure, { captainId: "ship2", yardId: A });
  // The sea places her with this: it is the anchor she has to appear at.
  assert.equal(after.ships.find((ship) => ship.id === "ship2").stationYardId, A);
  assert.equal(after.ships.find((ship) => ship.id === "ship1").stationYardId, undefined,
    "the fleet's captain did not sail from anywhere, she was already under way");
});

test("S183: without a named captain the yard's own captain is still the fleet's", () => {
  // S182 keeps its rule: a yard holding two captains sails the one under the fleet's helm.
  const fleet = {
    captainId: "alfa",
    ships: [
      hull("alfa", { commandId: "alfa", yardId: A }),
      hull("gamma", { commandId: "alfa", yardId: A, sails: true }),
      hull("beta", { commandId: "beta", yardId: A }),
    ],
  };
  const after = fleetModel.departYard(fleet, A);
  const at = Object.fromEntries(after.ships.map((ship) => [ship.id, ship.yardId]));
  assert.equal(at.alfa, null);
  assert.equal(at.gamma, null);
  assert.equal(at.beta, A, "another captain's hulls are never sent to sea by her neighbour");
  assert.deepEqual(after.departure, { captainId: "alfa", yardId: A });
});

test("S183: a named hull that is not a captain of that yard is refused, not sailed", () => {
  const after = fleetModel.departYard(reported(), A, "ship1");
  const at = Object.fromEntries(after.ships.map((ship) => [ship.id, ship.yardId]));
  assert.equal(at.ship2, A, "the yard's own captain stays: the named hull is not hers to sail");
  assert.equal(at.ship1, null);
  assert.equal(after.departure, null);
});

test("S183 preserve: a departure still refuses an unknown yard", () => {
  const fleet = reported();
  const after = fleetModel.departYard(fleet, "puerto-inexistente", "ship2");
  assert.deepEqual(after.ships, fleet.ships);
  assert.equal(after.departure, null);
});

/* ------------------------------------- D: where a departed squadron is placed */

test("S183: a captain the sea has never held is placed at the anchor she sailed from", () => {
  const world = worldModel.createWorld(7, { speedKn: 8 }, 0, {
    captainId: "ship1",
    ships: [hull("ship1", { commandId: "ship1", yardId: null })],
  });
  const sailed = fleetModel.departYard(reported(), A, "ship2");
  const placed = withAfloatSquadrons(world, sailed);
  const squadron = yardAt(placed, "ship2");
  assert.ok(squadron, "the sea must show the captain who just put to sea");
  const yard = yardOf(A);
  assert.deepEqual({ x: squadron.ship.x, y: squadron.ship.y }, { x: yard.x, y: yard.y });
  assert.deepEqual(squadron.escorts, [], "she sailed alone");
});

test("S183: a fresh sea places a command at its own yard, not on a ring from the leader", () => {
  const fleet = fleetModel.departYard(reported(), B, "ship3");
  const world = worldModel.createWorld(7, { speedKn: 8 }, 0, fleet);
  const squadron = yardAt(world, "ship3");
  assert.ok(squadron, "a fresh sea must hold every captain afloat");
  const yard = yardOf(B);
  assert.deepEqual({ x: squadron.ship.x, y: squadron.ship.y }, { x: yard.x, y: yard.y });
});

test("S183: her escort keeps station at the yard, not at the water she left", () => {
  const fleet = {
    captainId: "ship1",
    ships: [
      hull("ship1", { commandId: "ship1", yardId: B }),
      hull("ship1-escort", { commandId: "ship1", yardId: B, sails: true }),
    ],
  };
  const sailed = fleetModel.departYard(fleet, B, "ship1");
  // The sea boots from the fleet it is handed: the escort is formed at the home port, which
  // is exactly the placement this rule has to correct.
  const world = worldModel.createWorld(7, { speedKn: 8 }, 0, sailed);
  const placed = withAfloatSquadrons(world, sailed);
  const yard = yardOf(B);
  assert.deepEqual({ x: placed.ship.x, y: placed.ship.y }, { x: yard.x, y: yard.y });
  assert.equal(placed.escorts.length, 1);
  assert.ok(
    Math.hypot(placed.escorts[0].x - yard.x, placed.escorts[0].y - yard.y) < 200,
    `her escort must hold her station at the quay, she is ${Math.round(
      Math.hypot(placed.escorts[0].x - yard.x, placed.escorts[0].y - yard.y))} m away`,
  );
});

test("S183: a squadron the sea already holds keeps her station", () => {
  const afloat = {
    captainId: "ship1",
    ships: [
      hull("ship1", { commandId: "ship1", yardId: null }),
      hull("ship3", { commandId: "ship3", yardId: null, stationYardId: B }),
      hull("ship2", { commandId: "ship2", yardId: A }),
    ],
  };
  const world = worldModel.createWorld(7, { speedKn: 8 }, 0, afloat);
  const before = yardAt(world, "ship3");
  assert.ok(before, "the sea opens with the captain who was already afloat");
  const sailed = fleetModel.departYard(afloat, A, "ship2");
  const placed = withAfloatSquadrons(world, sailed);
  const after = yardAt(placed, "ship3");
  assert.deepEqual({ x: after.ship.x, y: after.ship.y }, { x: before.ship.x, y: before.ship.y });
  assert.equal(placed.activeId, "ship1", "the helm does not move because another captain sailed");
  assert.ok(yardAt(placed, "ship2"), "and the captain who sailed joins her");
});

test("S183: with nobody to place the sea is left exactly as it was", () => {
  const world = worldModel.createWorld(7, { speedKn: 8 }, 0, reported());
  assert.equal(withAfloatSquadrons(world, reported()), world);
});

test("S183: a departure for a captain the fleet no longer has changes nothing", () => {
  const world = worldModel.createWorld(7, { speedKn: 8 }, 0, reported());
  const sailed = fleetModel.departYard(reported(), A, "ship2");
  const gone = { ...sailed, ships: sailed.ships.filter((ship) => ship.id !== "ship2") };
  assert.equal(withAfloatSquadrons(world, gone), world);
});
