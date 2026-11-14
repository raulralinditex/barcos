/**
 * The squadron at sea (S36): the captain plus every escort that put to sea, as one
 * fighting line.
 *
 * These are the rules the sea screen depends on and cannot be seen in a screenshot:
 *   - an enemy shoots at the nearest allied hull, not always at the captain;
 *   - an escort fires on its own, with its own reloads, when a target bears;
 *   - a hull that is sunk or surrendered leaves the line, and a sunk escort leaves
 *     the fleet;
 *   - the battle ends only when the captain is lost, not when an escort is.
 */

import test from "node:test";
import assert from "node:assert/strict";

import * as squadron from "../src/model/squadron.js";
import { createPlayerCombatant } from "../src/model/combat.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import {
  alliedTargets,
  closestTarget,
  escortFire,
  pruneAllies,
  squadronStatus,
} from "../src/model/squadron.js";

const runtime = (overrides = {}, name = "Golden Hind") =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "galeon-pequeno",
        batteries: [
          { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        ...overrides,
      },
      12000,
    ),
    { name },
  );

const ally = (id, x, y, combat = null) => ({
  id,
  name: id,
  x,
  y,
  heading: 0,
  currentSpeedKn: 0,
  speedKn: 6,
  combat: combat ?? createPlayerCombatant(runtime({}, id)),
});

const rnd = () => 0.5;

/* ---------------------------------------------------------------- who the enemy shoots */

test("S36: the target is the nearest allied hull", () => {
  const captain = ally("captain", 0, 0);
  const near = ally("near", 100, 0);
  const far = ally("far", 900, 0);
  // The enemy sits between them: 90 m from the captain, 10 m from the escort.
  const target = closestTarget([captain, near, far], { x: 90, y: 0 });
  assert.equal(target.id, "near");
});

test("S36: with the fleet strung out the enemy follows whoever is closest", () => {
  const captain = ally("captain", 0, 0);
  const escort = ally("escort", 0, 300);
  assert.equal(closestTarget([captain, escort], { x: 0, y: 260 }).id, "escort");
  assert.equal(closestTarget([captain, escort], { x: 0, y: 20 }).id, "captain");
});

test("S36: a sunken hull is not a target any more", () => {
  const captain = ally("captain", 0, 0);
  const wreck = ally("wreck", 10, 0);
  wreck.combat.status = "sunk";
  assert.equal(closestTarget([captain, wreck], { x: 5, y: 0 }).id, "captain");
});

test("S36: no allies left means no target instead of a crash", () => {
  assert.equal(closestTarget([], { x: 0, y: 0 }), null);
  assert.equal(closestTarget(undefined, { x: 0, y: 0 }), null);
});

test("S36: alliedTargets skips hulls that are out of the fight", () => {
  const a = ally("a", 0, 0);
  const b = ally("b", 10, 0);
  b.combat.status = "surrendered";
  assert.deepEqual(alliedTargets([a, b]).map((t) => t.id), ["a"]);
});

/* ---------------------------------------------------------------- escorts shooting */

test("S36: an escort fires when a target bears on its beam and is in range", () => {
  // Escort at the origin heading east; target due north at 200 m, so it bears to port.
  const escort = ally("escort", 0, 0);
  const volley = escortFire(escort, { x: 0, y: -200 }, rnd);
  assert.ok(volley.volley.length > 0, "the escort did not fire with a target on the beam");
  assert.ok(volley.volley.every((shot) => shot.side === "babor"), "a target to port must be answered to port");
});

test("S36: an escort does not fire with nothing bearing", () => {
  const escort = ally("escort", 0, 0); // heading east, target dead ahead
  const volley = escortFire(escort, { x: 400, y: 0 }, rnd);
  assert.equal(volley.volley.length, 0, "the escort fired dead ahead, where no gun bears");
});

test("S36: an escort does not fire out of range", () => {
  const escort = ally("escort", 0, 0);
  const volley = escortFire(escort, { x: 0, y: -5000 }, rnd);
  assert.equal(volley.volley.length, 0, "the escort fired at a hull beyond its guns");
});

test("S36: an escort that is out of the fight does not fire", () => {
  const escort = ally("escort", 0, 0);
  escort.combat.status = "sunk";
  assert.equal(escortFire(escort, { x: 0, y: -200 }, rnd).volley.length, 0);
});

test("S36: an escort fires again only after reloading", () => {
  const escort = ally("escort", 0, 0);
  const target = { x: 0, y: -200 };
  const first = escortFire(escort, target, rnd);
  assert.ok(first.volley.length > 0);
  const second = escortFire(escort, target, rnd);
  assert.equal(second.volley.length, 0, "the escort fired twice without reloading");
});

/* ---------------------------------------------------------------- the line */

test("S36: a sunk escort leaves the line and the fleet", () => {
  const captain = ally("captain", 0, 0);
  const doomed = ally("doomed", 100, 0);
  doomed.combat.status = "sunk";
  const alive = ally("alive", 200, 0);
  const { survivors, lost } = pruneAllies([captain, doomed, alive]);
  assert.deepEqual(survivors.map((a) => a.id), ["captain", "alive"]);
  assert.deepEqual(lost.map((a) => a.id), ["doomed"]);
});

test("S36: a surrendered escort is lost too, it does not keep sailing", () => {
  const captain = ally("captain", 0, 0);
  const taken = ally("taken", 100, 0);
  taken.combat.status = "surrendered";
  const { lost } = pruneAllies([captain, taken]);
  assert.deepEqual(lost.map((a) => a.id), ["taken"]);
});

test("S36: the battle is over when the captain is lost, not before", () => {
  const captain = ally("captain", 0, 0);
  const escort = ally("escort", 100, 0);
  escort.combat.status = "sunk";
  assert.equal(squadronStatus([captain, escort]).over, false);

  captain.combat.status = "sunk";
  const end = squadronStatus([captain, escort]);
  assert.equal(end.over, true);
  assert.equal(end.reason, "sunk");
});

test("S87: losing the captain is not the end while an escort still floats", () => {
  const captain = ally("captain", 0, 0);
  const escort = ally("escort", 100, 0);
  captain.combat.status = "sunk";
  // The flagship is gone, but the line is not: the voyage continues (S87).
  const still = squadronStatus([captain, escort]);
  assert.equal(still.over, false, "the voyage must go on while a hull still floats");
  assert.equal(still.reason, null);

  // Only when nothing is left does the voyage end, and it says why.
  escort.combat.status = "sunk";
  const end = squadronStatus([captain, escort]);
  assert.equal(end.over, true);
  assert.equal(end.reason, "sunk");
});

test("S87: a surrendered escort counts as lost, like a sunk one", () => {
  const captain = ally("captain", 0, 0);
  const escort = ally("escort", 100, 0);
  captain.combat.status = "surrendered";
  assert.equal(squadronStatus([captain, escort]).over, false, "a live escort must keep the voyage going");
  escort.combat.status = "surrendered";
  const end = squadronStatus([captain, escort]);
  assert.equal(end.over, true);
  assert.equal(end.reason, "surrendered", "the reason follows the flagship");
});

test("S87: command passes to the first fighting escort when the captain is lost", () => {
  const captain = ally("captain", 0, 0);
  const sunk = ally("sunk", 10, 0);
  const surrendered = ally("surrendered", 20, 0);
  const first = ally("first", 30, 0);
  const second = ally("second", 40, 0);
  sunk.combat.status = "sunk";
  surrendered.combat.status = "surrendered";
  for (const status of ["sunk", "surrendered"]) {
    captain.combat.status = status;
    assert.equal(squadron.nextCommandShip([captain, sunk, surrendered, first, second]), first);
  }
});

test("S87: there is no handover when no escort is fighting", () => {
  const captain = ally("captain", 0, 0);
  const escort = ally("escort", 10, 0);
  captain.combat.status = "sunk";
  for (const status of ["sunk", "surrendered"]) {
    escort.combat.status = status;
    assert.equal(squadron.nextCommandShip([captain, escort]), null);
  }
  assert.equal(squadron.nextCommandShip([captain]), null);
});

test("S87: a fighting captain keeps command", () => {
  const captain = ally("captain", 0, 0);
  const escort = ally("escort", 10, 0);
  assert.equal(squadron.nextCommandShip([captain, escort]), null);
  assert.equal(squadron.nextCommandShip([]), null);
});

test("S36: the captain can also be forced to surrender", () => {
  const captain = ally("captain", 0, 0);
  captain.combat.status = "surrendered";
  const end = squadronStatus([captain]);
  assert.equal(end.over, true);
  assert.equal(end.reason, "surrendered");
});
