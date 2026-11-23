/**
 * S178: the "hand her to" list offers only the captains she can actually be handed to.
 *
 * The player reported it (verbatim): "en flota, el boton que tengo en cada name 'pasar a' no
 * funciona". Measured: it worked when both captains were in the same shipyard, and it did
 * nothing at all when the target captain was at sea — the select showed her, the player
 * picked her, the model refused the move because the two were not in the same place, and the
 * handler put the select back to its placeholder without a word.
 *
 * The rule the model enforces is right: a hull does not cross the sea by herself (S155-B).
 * What was wrong is that the screen offered moves the model would refuse, so the player's
 * only feedback was a control that reset itself.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { handoverTargets, withShipCommand } from "../src/model/fleet.js";

const home = "puerto-casa";
const away = "cala-del-abismo";
const ship = (id, fields = {}) => ({ id, speedKn: 5, commandId: id, ...fields });

/** Two captains and an escort: one at home, one wherever the case needs her. */
const fleetWith = (targetFields) => ({
  captainId: "capA",
  ships: [
    ship("capA", { yardId: home }),
    ship("capB", targetFields),
    ship("esc", { yardId: home, commandId: "capA", sails: false }),
  ],
});

test("S178: a captain in the same shipyard can take the hull", () => {
  const fleet = fleetWith({ yardId: home });
  const targets = handoverTargets(fleet, "esc");
  assert.deepEqual(targets.map((captain) => captain.id), ["capB"]);
  // And the move the list offers is one the model accepts.
  assert.equal(withShipCommand(fleet, "esc", "capB").ships.find((s) => s.id === "esc").commandId, "capB");
});

test("S178: a captain at sea is not offered, because the model would refuse her", () => {
  const fleet = fleetWith({ yardId: null });
  // This is the case the player hit: the button appeared, the choice was taken, nothing moved.
  assert.deepEqual(handoverTargets(fleet, "esc").map((captain) => captain.id), []);
  assert.equal(withShipCommand(fleet, "esc", "capB"), fleet, "the model still refuses the move");
});

test("S178: a captain at another shipyard is not offered", () => {
  const fleet = fleetWith({ yardId: away });
  assert.deepEqual(handoverTargets(fleet, "esc", home).map((captain) => captain.id), []);
});

test("S178: a hull is never offered her own captain, nor herself", () => {
  const fleet = fleetWith({ yardId: home });
  const targets = handoverTargets(fleet, "esc", home).map((captain) => captain.id);
  assert.ok(!targets.includes("capA"), "the hull's own captain is not a move");
  assert.ok(!targets.includes("esc"), "a hull is never handed to herself");
});

test("S178: an unknown hull has no targets", () => {
  const fleet = fleetWith({ yardId: home });
  assert.deepEqual(handoverTargets(fleet, "no-such-hull"), []);
  assert.deepEqual(handoverTargets(null, "esc"), []);
});

test("S178: every offered target is a move the model really accepts", () => {
  // The invariant that makes the screen honest: offer nothing that would be refused.
  for (const targetFields of [{ yardId: home }, { yardId: null }, { yardId: away }, {}]) {
    const fleet = fleetWith(targetFields);
    for (const captain of handoverTargets(fleet, "esc")) {
      const moved = withShipCommand(fleet, "esc", captain.id);
      assert.notEqual(moved, fleet, `the list offered ${captain.id} and the model refused it`);
      assert.equal(moved.ships.find((s) => s.id === "esc").commandId, captain.id);
    }
  }
});
