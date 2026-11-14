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
