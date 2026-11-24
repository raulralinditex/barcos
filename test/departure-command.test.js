/**
 * S182: the set-sail button takes the captain who sails, not the whole yard.
 *
 * The player reported it (verbatim): "cuando estoy de visita en un astillero, puedo dar a
 * zarpar a la flota que ese en ese astillero". Measured: `departYard` moved every hull moored
 * at that yard, whatever command she answered to. With two captains in the same shipyard, one
 * set-sail sent both squadrons to sea — the other captain's hulls left a yard she never
 * sailed from.
 *
 * The rule: a yard departure moves the captain who is sailing and the hulls of her own
 * command. Another captain's hulls stay where they are until their own captain sails.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { departYard, shipsSailingAtSea } from "../src/model/fleet.js";

const home = "puerto-casa";
const away = "cala-del-abismo";
const hull = (id, commandId, fields = {}) => ({ id, speedKn: 5, commandId, yardId: home, ...fields });

/** Two captains in the same yard, each with her own hulls. */
const twoCommands = () => ({
  captainId: "alfa",
  ships: [
    hull("alfa", "alfa"),
    hull("gamma", "alfa", { sails: true }),
    hull("beta", "beta"),
    hull("delta", "beta", { sails: true }),
  ],
});

test("S182: setting sail moves the captain who sails and her own hulls", () => {
  const after = departYard(twoCommands(), home);
  const byId = Object.fromEntries(after.ships.map((s) => [s.id, s.yardId]));
  assert.equal(byId.alfa, null, "the sailing captain leaves the yard");
  assert.equal(byId.gamma, null, "her marked hull sails with her");
});

test("S182: another captain's hulls stay in the yard", () => {
  const after = departYard(twoCommands(), home);
  const byId = Object.fromEntries(after.ships.map((s) => [s.id, s.yardId]));
  assert.equal(byId.beta, home, `the other captain must not be sent to sea, she is at ${byId.beta}`);
  assert.equal(byId.delta, home, `her hull must not be sent to sea, she is at ${byId.delta}`);
});

test("S182: only one command is at sea after the departure", () => {
  const after = departYard(twoCommands(), home);
  // This is the rule the screen shows: the sea holds the squadron that sailed, not the yard.
  assert.deepEqual(shipsSailingAtSea(after).map((s) => s.id).sort(), ["alfa", "gamma"]);
});

test("S182: a hull of the sailing command that is not marked stays", () => {
  const fleet = {
    captainId: "alfa",
    ships: [hull("alfa", "alfa"), hull("stays", "alfa", { sails: false }), hull("beta", "beta")],
  };
  const after = departYard(fleet, home);
  const byId = Object.fromEntries(after.ships.map((s) => [s.id, s.yardId]));
  assert.equal(byId.alfa, null);
  assert.equal(byId.stays, home, "a hull of her command that is not marked stays moored");
  assert.equal(byId.beta, home, "and another command is untouched");
});

test("S182: a captain visiting another yard does not drag her own hulls out of it", () => {
  // The captain is moored at home but the screen shows the abyss: nothing departs the abyss.
  const fleet = {
    captainId: "alfa",
    ships: [hull("alfa", "alfa", { yardId: home }), hull("beta", "beta", { yardId: away })],
  };
  const after = departYard(fleet, away);
  const byId = Object.fromEntries(after.ships.map((s) => [s.id, s.yardId]));
  // The captain is not at the abyss, so the abyss departure does not move her...
  assert.equal(byId.alfa, home, "a captain elsewhere does not sail from a yard she is not in");
  // ...and beta, who is there, is not the fleet's captain, so she stays too.
  assert.equal(byId.beta, away, "another captain stays until she sails herself");
});

test("S182: a hull already at sea is left alone", () => {
  const fleet = {
    captainId: "alfa",
    ships: [hull("alfa", "alfa"), hull("out", "alfa", { yardId: null })],
  };
  const after = departYard(fleet, home);
  assert.equal(after.ships.find((s) => s.id === "out").yardId, null, "a hull already sailing is untouched");
});
