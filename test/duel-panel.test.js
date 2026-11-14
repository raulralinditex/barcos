/**
 * S73: the duel panel shows every engaged hull, ours and theirs.
 *
 * The panel used to show only the nearest enemy, so the player could watch the hostile's
 * hull fall but not her own. These tests pin the roster: who is in, who is out, in what
 * order, and what happens with broken data.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { conditionShare, duelRoster, duelVisible } from "../src/model/duel-panel.js";

const fighting = (condition) => ({ status: "fighting", condition });
const hull = (id, x, y, condition = { hull: 100, rigging: 100, crew: 100 }, status = "fighting") => ({
  id,
  name: `Hull ${id}`,
  x,
  y,
  combat: { status, condition },
});

const ship = { x: 0, y: 0 };

/* ---------------------------------------------------------------- who is in the roster */

test("S73: our fighting hulls and the engaged enemy are both listed", () => {
  const roster = duelRoster({
    ours: [hull("cap", 0, 0)],
    theirs: [hull("enemy", 0, 300)],
    engageRadiusM: 620,
    ship,
  });
  assert.deepEqual(roster.map((entry) => entry.id), ["cap", "enemy"]);
  assert.deepEqual(roster.map((entry) => entry.side), ["ours", "theirs"]);
});

test("S73: our hulls are listed before theirs", () => {
  // The enemy is nearer than the escort, and still comes second: the player reads her
  // own side first.
  const roster = duelRoster({
    ours: [hull("cap", 0, 0), hull("escort", 0, 400)],
    theirs: [hull("enemy", 0, 50)],
    engageRadiusM: 620,
    ship,
  });
  assert.deepEqual(roster.map((entry) => entry.side), ["ours", "ours", "theirs"]);
  assert.deepEqual(roster.map((entry) => entry.id), ["cap", "escort", "enemy"]);
});

test("S73: each group is ordered nearest first", () => {
  const roster = duelRoster({
    ours: [hull("far", 0, 500), hull("near", 0, 100)],
    theirs: [hull("enemyFar", 0, -400), hull("enemyNear", 0, -100)],
    engageRadiusM: 620,
    ship,
  });
  assert.deepEqual(roster.map((entry) => entry.id), ["near", "far", "enemyNear", "enemyFar"]);
});

test("S73: a sunk or struck hull leaves the roster", () => {
  const roster = duelRoster({
    ours: [hull("cap", 0, 0), hull("lost", 0, 100, { hull: 0, rigging: 0, crew: 0 }, "sunk")],
    theirs: [hull("enemy", 0, 200), hull("taken", 0, 210, { hull: 50, rigging: 50, crew: 20 }, "surrendered")],
    engageRadiusM: 620,
    ship,
  });
  assert.deepEqual(roster.map((entry) => entry.id), ["cap", "enemy"]);
});

test("S73: an enemy outside the engage radius is not in the fight", () => {
  const roster = duelRoster({
    ours: [hull("cap", 0, 0)],
    theirs: [hull("near", 0, 300), hull("far", 0, 900)],
    engageRadiusM: 620,
    ship,
  });
  assert.deepEqual(roster.map((entry) => entry.id), ["cap", "near"]);
});

test("S73: the edge of the engage radius still counts", () => {
  const roster = duelRoster({
    ours: [],
    theirs: [hull("edge", 620, 0)],
    engageRadiusM: 620,
    ship,
  });
  assert.deepEqual(roster.map((entry) => entry.id), ["edge"]);
});

test("S73: the three bars come across as they are", () => {
  const roster = duelRoster({
    ours: [hull("cap", 0, 0, { hull: 80, rigging: 45, crew: 92 })],
    theirs: [],
    ship,
  });
  assert.deepEqual(
    { hull: roster[0].hull, rigging: roster[0].rigging, crew: roster[0].crew },
    { hull: 80, rigging: 45, crew: 92 },
  );
});

test("S73: a broken condition reads as zero instead of NaN", () => {
  const roster = duelRoster({
    ours: [{ id: "cap", x: 0, y: 0, combat: { status: "fighting", condition: { hull: NaN } } }],
    theirs: [],
    ship,
  });
  assert.equal(roster[0].hull, 0);
  assert.equal(roster[0].rigging, 0);
  assert.equal(roster[0].crew, 0);
});

test("S73: a broken roster never throws", () => {
  for (const broken of [undefined, null, {}, { ours: null, theirs: null }, { ours: [null, {}] }]) {
    const roster = duelRoster(broken);
    assert.ok(Array.isArray(roster), `input ${JSON.stringify(broken)}`);
  }
});

test("S73: with nobody fighting the panel is empty and hidden", () => {
  const roster = duelRoster({ ours: [], theirs: [], ship });
  assert.deepEqual(roster, []);
  assert.equal(duelVisible(roster), false);
  assert.equal(duelVisible(null), false);
});

test("S85: the panel needs an enemy, not just our own hulls", () => {
  // The captain is `fighting` from the moment she puts to sea, so counting her alone kept
  // the panel on screen over an empty sea (S85). A battle panel needs a battle.
  const alone = duelRoster({ ours: [hull("cap", 0, 0)], theirs: [], ship });
  assert.equal(duelVisible(alone), false, "our own hulls alone must not open the panel");

  const engaged = duelRoster({
    ours: [hull("cap", 0, 0)],
    theirs: [hull("enemy", 0, 200)],
    engageRadiusM: 620,
    ship,
  });
  assert.equal(duelVisible(engaged), true, "an enemy in the fight must open the panel");
  // And both sides are listed together, which is what S73 asked for.
  assert.deepEqual(engaged.map((entry) => entry.side), ["ours", "theirs"]);
});

test("S73: a hull with no position is listed last, not dropped", () => {
  const roster = duelRoster({
    ours: [hull("nowhere", NaN, NaN), hull("near", 0, 100)],
    theirs: [],
    ship,
  });
  assert.deepEqual(roster.map((entry) => entry.id), ["near", "nowhere"]);
});

/* ---------------------------------------------------------------- the bar shares */

test("S73: a condition of 50 is half the bar", () => {
  assert.equal(conditionShare(50), 0.5);
  assert.equal(conditionShare(100), 1);
  assert.equal(conditionShare(0), 0);
});

test("S73: a broken share is clamped instead of painting a broken bar", () => {
  for (const broken of [NaN, undefined, null, "abc", -20, 250, Infinity]) {
    const share = conditionShare(broken);
    assert.ok(Number.isFinite(share) && share >= 0 && share <= 1, `value ${String(broken)} gave ${share}`);
  }
});
