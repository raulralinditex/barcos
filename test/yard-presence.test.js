/**
 * S163-E: a captain under way is moored nowhere.
 *
 * The shipyard asked `currentShipyard(position)` and fell back to the home port, so a
 * captain sailing the open sea read as if she were tied up at home. `visitingYard()` then
 * compared the yard on screen against "home" and answered "not a visit", which enabled
 * repairs, refits and market trades on a hull that was not there.
 *
 * These tests pin the two rules the screen needs: a hull at sea belongs to no yard, and a
 * hull whose location was never written belongs to her home yard (the older saves).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { captainYardId, reconcileCaptainPosition, shipsAvailableAtYard } from "../src/model/fleet.js";
import { SHIPYARDS } from "../src/data/naval-data.js";

const HOME = (SHIPYARDS.find((yard) => yard.home) ?? SHIPYARDS[0]).id;
const OTHER = SHIPYARDS.find((yard) => yard.id !== HOME).id;

const fleet = (captainOver = {}) => ({
  captainId: "cap",
  ships: [
    { id: "cap", name: "Capitana", yardId: null, ...captainOver },
    { id: "moored", name: "Atracada", yardId: OTHER },
  ],
});

test("S163-E: a captain sailing belongs to no yard", () => {
  assert.equal(
    captainYardId(fleet()),
    null,
    "a captain with `yardId: null` is at sea and moored nowhere",
  );
});

test("S163-E: a captain whose location was never written still belongs to the home yard", () => {
  // An older save carries no `yardId` at all. That is not "at sea": she is where the game
  // has always put a hull with no recorded location.
  const older = fleet({ yardId: undefined });
  assert.equal(captainYardId(older), HOME, "a hull with no recorded location belongs to home");
});

test("S163-E: a captain moored at a yard belongs to that yard", () => {
  assert.equal(captainYardId(fleet({ yardId: OTHER })), OTHER);
});

test("S163-E: a fleet with no captain has no yard, and does not throw", () => {
  assert.equal(captainYardId({ captainId: "nobody", ships: [] }), null);
  assert.equal(captainYardId(null), null);
});

test("S163-D: visiting a yard shows her own hulls and none of the squadron at sea", () => {
  // The captain is sailing, so a yard on screen shows only what is actually tied up there.
  const visiting = shipsAvailableAtYard(fleet(), OTHER, captainYardId(fleet()));
  assert.deepEqual(
    visiting.map((ship) => ship.id),
    ["moored"],
    `a visiting screen must show only her own hulls, it showed ${JSON.stringify(visiting.map((s) => s.id))}`,
  );
});

test("S163-D: the yard the captain IS moored at also offers her own hull", () => {
  const moored = fleet({ yardId: OTHER });
  const local = shipsAvailableAtYard(moored, OTHER, captainYardId(moored));
  assert.ok(
    local.some((ship) => ship.id === "cap"),
    "the yard she is tied up at must offer the captain's own hull",
  );
});

/* ------------------------------------------- the anchor is a target (S163-G) */

import { nearestShipyard } from "../src/model/world.js";

test("S163-G: a click on the anchor names that shipyard", () => {
  const yard = SHIPYARDS[0];
  const hit = nearestShipyard({ x: yard.x + 40, y: yard.y + 40 }, 120);
  assert.equal(hit?.id, yard.id, "a click near the anchor must name her");
});

test("S163-G: a click on open water names no shipyard", () => {
  // Far from every yard on the chart.
  const yard = SHIPYARDS[0];
  assert.equal(nearestShipyard({ x: yard.x + 4000, y: yard.y + 4000 }, 120), null);
});

test("S163-G: the nearer anchor wins when two are within reach", () => {
  // Deliberately off the midpoint: the yards lie on the x axis, so the exact middle is a
  // tie and a tie would pass for the wrong reason.
  const [a, b] = SHIPYARDS;
  const closerToB = { x: a.x + (b.x - a.x) * 0.75, y: a.y };
  const hit = nearestShipyard(closerToB, Number.MAX_SAFE_INTEGER);
  assert.ok(hit, "some yard must be named");
  const da = Math.hypot(a.x - closerToB.x, a.y - closerToB.y);
  const db = Math.hypot(b.x - closerToB.x, b.y - closerToB.y);
  assert.ok(db < da, "the test point must be nearer to the second yard, or it proves nothing");
  assert.equal(hit.id, b.id, "the nearer anchor must win");
});

test("S163-G: a broken point or radius names nothing, and does not throw", () => {
  assert.equal(nearestShipyard(null, 120), null);
  assert.equal(nearestShipyard({ x: NaN, y: 0 }, 120), null);
  assert.equal(nearestShipyard({ x: 0, y: 0 }, 0), null);
  assert.equal(nearestShipyard({ x: 0, y: 0 }, NaN), null);
});

/* ------------------- a hull bought at a yard is moored there (S163-D) */

test("S163-D: a hull bought at a yard stays moored there, even if she becomes the captain", () => {
  // Buying a hull makes her the fleet's captain (S7), and the shipyard reconciles the
  // captain's yard against the sea save on every screen change. That reconciliation read
  // "the captain is not in any yard" and wrote `yardId: null` over the yard the hull was
  // just bought at, so a hull bought in Cala del abismo was floating in open water.
  const bought = { id: "bought", name: "Recien comprada", yardId: OTHER };
  const withBought = { captainId: "bought", ships: [bought, { id: "cap", name: "Capitana", yardId: null }] };
  // The sea save still holds the OLD captain's position, out on the water.
  const atSea = { x: 1200, y: 300 };
  const after = reconcileCaptainPosition(withBought, atSea, { freshlyBought: "bought" });
  const hull = after.ships.find((ship) => ship.id === "bought");
  assert.equal(
    hull.yardId,
    OTHER,
    `a hull bought at a yard must stay there, her yardId is ${JSON.stringify(hull.yardId)}`,
  );
});

test("S163-E: the captain's yard is still reconciled when she really moved", () => {
  // The rule that reconciliation exists for: a captain who sailed home is moored at home.
  const fleetAtSea = { captainId: "cap", ships: [{ id: "cap", name: "Capitana", yardId: null }] };
  const atHome = reconcileCaptainPosition(fleetAtSea, { x: 0, y: 0 });
  assert.equal(atHome.ships[0].yardId, HOME, "a captain floating at home is moored at home");
});
