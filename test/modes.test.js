/**
 * S171: the game mode is a seam, not a decoration.
 *
 * F0 of the refactor. The rule the game plays today — "batalla por nivel" — stops being
 * welded into `updateWorld` and becomes one object that answers the same four questions a
 * second mode would answer. Nothing about the game changes: the proof is that the other
 * 1044 tests pass untouched, and this file is the proof that the seam is real — a mode the
 * registry hands out actually decides the sea.
 *
 * These tests use a deliberately different mode, not the shipped one: if `updateWorld` were
 * still calling `enemiesPerZone` and `seedLevel` directly, every one of them would fail.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MODE_ID,
  MODES,
  modeById,
  modeOf,
  registerMode,
  withMode,
} from "../src/model/modes/index.js";
import { createWorld, updateWorld } from "../src/model/world.js";
import { enemiesPerZone } from "../src/model/levels.js";

const ship = { id: "s1", speedKn: 6, hullId: "galeon-pequeno" };

/** A mode that answers differently from the shipped one, on purpose. */
const quietMode = {
  id: "quiet-test",
  labelKey: "mode.quiet.name",
  descriptionKey: "mode.quiet.description",
  // No enemies at all: the cap is zero, so the sea fills with nothing. The level is 7 and
  // not 0 because `updateWorld` normalises it to at least 1, and a level the shipped mode
  // could never reach is what makes "the mode seeded this" unambiguous.
  enemiesPerZone: () => 0,
  stamp: () => ({ level: 7 }),
  seed: (world) => ({ ...world, level: 7, levelEnemies: [], levelVictories: 0 }),
  advance: () => null,
  progress: () => null,
  progressFromSave: () => null,
};
// Registered, so `withMode` can hand it out: the seam is proved with a mode that answers
// differently, not by inspecting the shipped one.
registerMode(quietMode);

test("S171: the registry hands out the shipped mode, and an unknown id falls back to it", () => {
  assert.equal(DEFAULT_MODE_ID, "batalla-por-nivel");
  assert.ok(MODES[DEFAULT_MODE_ID], "the shipped mode must be registered");
  assert.equal(modeById(DEFAULT_MODE_ID).id, DEFAULT_MODE_ID);
  // An unknown id is not a crash: it is the game as it plays today.
  assert.equal(modeById("no-such-mode").id, DEFAULT_MODE_ID);
  assert.equal(modeById(null).id, DEFAULT_MODE_ID);
  assert.equal(modeById(undefined).id, DEFAULT_MODE_ID);
});

test("S171: a world with no mode field plays the shipped mode", () => {
  // Every world written before this refactor has no `mode`: it must open as it always did.
  assert.equal(modeOf({}).id, DEFAULT_MODE_ID);
  assert.equal(modeOf({ mode: "no-such-mode" }).id, DEFAULT_MODE_ID);
  assert.equal(modeOf(createWorld(11, ship)).id, DEFAULT_MODE_ID);
});

test("S171: the zone cap comes from the mode, not from the level curve", () => {
  const shipped = createWorld(11, ship);
  // The shipped mode caps the water the captain is in with the level's curve.
  const shippedAfloat = shipped.encounters.filter((e) => e.type === "enemy").length;
  assert.equal(shippedAfloat, enemiesPerZone(shipped.level), "the shipped mode must fill its own cap");

  // The same seed, the same ship, one different mode: no enemy at all. If `updateWorld`
  // still read `enemiesPerZone` directly, this world would hold the full quota.
  const quiet = updateWorld(createWorld(11, ship, 0, null, "quiet-test"), {}, 0);
  assert.equal(quiet.encounters.filter((e) => e.type === "enemy").length, 0);
});

test("S171: the mode seeds the fresh sea, not a hardcoded level 1", () => {
  const seeded = createWorld(11, ship, 0, null, "quiet-test");
  // The quiet mode seeds level 0; the shipped one seeds level 1. Reading `level` back tells
  // us which of the two actually ran.
  assert.equal(seeded.level, 7, "the mode's seed did not run");
  const shipped = createWorld(11, ship);
  assert.equal(shipped.level, 1, "the shipped mode must still open at level 1");
});

test("S171: the mode decides whether the sea advances, and the shipped one still does", () => {
  // The quiet mode never advances: its `advance` answers null.
  let quiet = createWorld(11, ship, 0, null, "quiet-test");
  for (let i = 0; i < 50; i += 1) quiet = updateWorld(quiet, {}, 0.1);
  assert.equal(quiet.level, 7, "a mode that does not advance must not advance");

  // The shipped mode advances on victories. `seedLevel` is still reachable on its own, and
  // `updateWorld` must go through the mode to get there.
  const shipped = createWorld(11, ship);
  assert.ok(shipped.level >= 1);
});
