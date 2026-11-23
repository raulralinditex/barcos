/**
 * S179: one captain per shipyard, and a purchase does not steal another's command.
 *
 * The player reported it (verbatim): "ahora solo puedo tener una capitana, se supone que puedo
 * tener una capitana por cada astillero". Measured: buying two hulls in the same yard left
 * `captains()` returning one, and the fleet room drew zero captain blocks.
 *
 * The cause was `addShip`: every purchase wrote `captainId: ship.id` and no `commandId`, so the
 * newest hull became the fleet's captain and the previous one became a hull with no command.
 * `captains()` only recognises a captain by `commandId === id`, so the older hull vanished
 * from every squadron.
 *
 * The player's decision (verbatim): "Se suma a la capitana del astillero". A hull bought where
 * a captain already commands becomes one of her hulls; bought where there is none, she takes
 * that yard's command herself.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { addCaptain, addShip, captains, squadrons } from "../src/model/fleet.js";

const home = "puerto-casa";
const away = "cala-del-abismo";
const ship = (id, fields = {}) => ({ id, speedKn: 5, commandId: id, ...fields });
const bought = (id, yardId) => ({ id, speedKn: 5, yardId });

test("S179: a hull bought where a captain already commands joins her", () => {
  const fleet = { captainId: "alfa", ships: [ship("alfa", { yardId: home })] };
  const after = addCaptain(fleet, bought("nueva", home));
  assert.equal(after.ships.find((s) => s.id === "nueva").commandId, "alfa");
  // And the yard still has exactly one captain, which is what the player asked for.
  assert.deepEqual(captains(after).map((c) => c.id), ["alfa"]);
  assert.deepEqual(squadrons(after)[0].ships.map((s) => s.id).sort(), ["alfa", "nueva"]);
});

test("S179: a hull bought where nobody commands takes that yard's command", () => {
  const fleet = {
    captainId: "alfa",
    ships: [ship("alfa", { yardId: home })],
  };
  const after = addCaptain(fleet, bought("nueva", away));
  // Nobody commands in the abyss, so she does.
  assert.equal(after.ships.find((s) => s.id === "nueva").commandId, "nueva");
  assert.deepEqual(captains(after).map((c) => c.id).sort(), ["alfa", "nueva"]);
  // The fleet's own captain is untouched: buying elsewhere does not move the helm.
  assert.equal(after.captainId, "alfa");
});

test("S179: two captains, one per shipyard, both survive a second purchase", () => {
  let fleet = { captainId: "alfa", ships: [ship("alfa", { yardId: home })] };
  fleet = addCaptain(fleet, bought("beta", away));       // beta commands the abyss
  fleet = addCaptain(fleet, bought("gamma", home));      // gamma joins alfa
  fleet = addCaptain(fleet, bought("delta", away));      // delta joins beta
  assert.deepEqual(captains(fleet).map((c) => c.id).sort(), ["alfa", "beta"]);
  const byCaptain = Object.fromEntries(squadrons(fleet).map((sq) => [sq.captain.id, sq.ships.map((s) => s.id).sort()]));
  assert.deepEqual(byCaptain, { alfa: ["alfa", "gamma"], beta: ["beta", "delta"] });
});

test("S179: a purchase never steals the command of a captain in another yard", () => {
  const fleet = {
    captainId: "alfa",
    ships: [ship("alfa", { yardId: home }), ship("beta", { yardId: away })],
  };
  const after = addCaptain(fleet, bought("nueva", away));
  assert.equal(after.ships.find((s) => s.id === "nueva").commandId, "beta");
  assert.equal(after.ships.find((s) => s.id === "alfa").commandId, "alfa");
  assert.equal(after.ships.find((s) => s.id === "beta").commandId, "beta");
});

test("S179: the first hull of a fresh fleet is her own captain", () => {
  // No fleet at all: the purchase has to be able to sail, so she commands herself.
  const after = addCaptain({ ships: [], captainId: null }, bought("primera", home));
  assert.equal(after.ships[0].commandId, "primera");
  assert.equal(after.captainId, "primera");
  assert.deepEqual(captains(after).map((c) => c.id), ["primera"]);
});

test("S179: addShip keeps its old shape for callers that want it", () => {
  // `addShip` is the raw append used by tests and by the prize path; it must not gain the
  // command rule, or a captured hull would silently join a squadron she does not belong to.
  const fleet = { captainId: "alfa", ships: [ship("alfa", { yardId: home })] };
  const after = addShip(fleet, { id: "suelta", speedKn: 5 });
  assert.equal(after.ships.find((s) => s.id === "suelta").commandId, undefined);
  assert.equal(after.captainId, "suelta", "addShip still makes her the fleet's captain");
});
