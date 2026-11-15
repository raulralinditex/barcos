import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTOFIRE_DEFAULT,
  normaliseAutoFire,
  serialiseAutoFire,
  targetForSide,
} from "../src/model/autofire.js";

/* S47 — the automatic-fire check of the shipyard. */

const ship = { x: 0, y: 0, heading: 0 }; // facing east: starboard is south (+y), port is north (-y)
const enemy = (id, x, y, status = "fighting") => ({
  id,
  type: "enemy",
  x,
  y,
  combat: status ? { status } : undefined,
});

test("S47: automatic fire is on by default", () => {
  assert.equal(AUTOFIRE_DEFAULT, true);
  assert.equal(normaliseAutoFire(undefined), true);
  assert.equal(normaliseAutoFire(null), true);
});

test("S47: only an explicit off turns it off, whatever the stored form", () => {
  for (const off of [false, "0", "false", "off"]) {
    assert.equal(normaliseAutoFire(off), false, String(off));
  }
  for (const on of [true, "1", "true", "on"]) {
    assert.equal(normaliseAutoFire(on), true, String(on));
  }
});

test("S47: a broken stored value never turns it off by accident", () => {
  for (const junk of ["", "maybe", 7, {}, []]) {
    assert.equal(normaliseAutoFire(junk), true, JSON.stringify(junk));
  }
});

test("S47: the value round-trips through its stored form", () => {
  for (const value of [true, false]) {
    assert.equal(normaliseAutoFire(serialiseAutoFire(value)), value);
  }
});

test("S47: the guns answer the side the enemy is on", () => {
  const south = enemy(1, 0, 300); // starboard
  const north = enemy(2, 0, -300); // port
  assert.equal(targetForSide(ship, [south, north], "estribor", 600)?.target.id, 1);
  assert.equal(targetForSide(ship, [south, north], "babor", 600)?.target.id, 2);
});

test("S47: the nearest enemy on that side is the target", () => {
  const far = enemy(1, 0, 500);
  const near = enemy(2, 0, 200);
  const hit = targetForSide(ship, [far, near], "estribor", 600);
  assert.equal(hit.target.id, 2);
  assert.equal(Math.round(hit.distance), 200);
});

test("S47: an enemy out of range is not a target", () => {
  assert.equal(targetForSide(ship, [enemy(1, 0, 700)], "estribor", 600), null);
});

test("S47: an enemy dead ahead or astern bears on no side", () => {
  const ahead = enemy(1, 300, 0);
  const astern = enemy(2, -300, 0);
  for (const side of ["babor", "estribor"]) {
    assert.equal(targetForSide(ship, [ahead, astern], side, 600), null, side);
  }
});

test("S47: a beaten enemy is not a target, an unengaged one is", () => {
  assert.equal(targetForSide(ship, [enemy(1, 0, 200, "sunk")], "estribor", 600), null);
  assert.equal(targetForSide(ship, [enemy(2, 0, 200, "surrendered")], "estribor", 600), null);
  assert.equal(targetForSide(ship, [enemy(3, 0, 200, null)], "estribor", 600)?.target.id, 3);
});

test("S47: treasures and wrecks are never targets", () => {
  const treasure = { id: 1, type: "treasure", x: 0, y: 200 };
  const wreck = { id: 2, type: "wreck", x: 0, y: 220 };
  assert.equal(targetForSide(ship, [treasure, wreck], "estribor", 600), null);
});

test("S47: the heading turns the sides with the ship", () => {
  const facingNorth = { x: 0, y: 0, heading: -Math.PI / 2 }; // starboard is now east
  const east = enemy(1, 300, 0);
  assert.equal(targetForSide(facingNorth, [east], "estribor", 600)?.target.id, 1);
  assert.equal(targetForSide(facingNorth, [east], "babor", 600), null);
});

test("S47: broken inputs give no target instead of throwing", () => {
  assert.equal(targetForSide(ship, undefined, "estribor", 600), null);
  assert.equal(targetForSide(ship, [], "estribor", 600), null);
  assert.equal(targetForSide(undefined, [enemy(1, 0, 200)], "estribor", 600), null);
  assert.equal(targetForSide(ship, [enemy(1, 0, 200)], "estribor", NaN), null);
});

/* S93 — a shipyard in enemy hands is a target like any other. */

const occupiedFort = (x = 0, y = 300, status = "fighting") => ({
  id: "fort",
  type: "fort",
  x,
  y,
  combat: { status },
});

test("S93: the guns bear on a shipyard the enemy holds", () => {
  // The yard is not an encounter: she never drifts, the safe zone does not shove her and
  // she must never become a wreck. She arrives as an extra target instead.
  const hit = targetForSide(ship, [], "estribor", 600, [occupiedFort()]);
  assert.equal(hit?.target.id, "fort");
});

test("S93: a shipyard out of range is not a target", () => {
  assert.equal(targetForSide(ship, [], "estribor", 600, [occupiedFort(0, 900)]), null);
});

test("S93: a shipyard on the other beam is not a target", () => {
  assert.equal(targetForSide(ship, [], "babor", 600, [occupiedFort()]), null);
});

test("S93: a yard already retaken is not a target", () => {
  assert.equal(targetForSide(ship, [], "estribor", 600, [occupiedFort(0, 300, "fighting")])?.target.id, "fort");
  assert.equal(targetForSide(ship, [], "estribor", 600, [occupiedFort(0, 300, "surrendered")]), null);
});

test("S93: the nearest of the two wins, fort or sail", () => {
  const near = enemy(9, 0, 120);
  const hit = targetForSide(ship, [near], "estribor", 600, [occupiedFort(0, 400)]);
  assert.equal(hit?.target.id, 9, "a sail closer in is still the closer threat");
  const other = targetForSide(ship, [], "estribor", 600, [occupiedFort(0, 90)]);
  assert.equal(other?.target.id, "fort");
});

test("S93: no extra targets is the same as before", () => {
  const south = enemy(1, 0, 300);
  assert.equal(targetForSide(ship, [south], "estribor", 600)?.target.id, 1);
});
