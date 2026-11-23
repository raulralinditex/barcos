/**
 * S172: the mode travels with the game.
 *
 * F1 of the refactor. F0 made the rule a mode; this carries the choice across a reload, so a
 * game opened tomorrow plays the mode it was started with instead of the shipped one.
 *
 * The format rule is the one the rest of this file obeys: the field is **additive** and `v`
 * does not move. `deserializeWorld` refuses anything whose `v` is not 1, so raising it would
 * turn every saved voyage into "no save" — the whole sea would be re-seeded for everybody.
 * A save written before this refactor has no `mode`, and it must open exactly as it played.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_MODE_ID, modeOf, registerMode } from "../src/model/modes/index.js";
import { createWorld, deserializeWorld, serializeWorld } from "../src/model/world.js";

const ship = { id: "s1", speedKn: 6, hullId: "galeon-pequeno" };

/** A second mode, so "the save kept my choice" cannot be confused with "it fell back". */
const otherMode = {
  id: "test-other",
  labelKey: "mode.other.name",
  descriptionKey: "mode.other.description",
  enemiesPerZone: () => 1,
  stamp: () => ({ level: 1 }),
  seed: (world) => ({ ...world, level: 1 }),
  advance: () => null,
  progress: () => null,
  progressFromSave: () => null,
};
registerMode(otherMode);

test("S172: the mode survives a save and a load", () => {
  const world = createWorld(11, ship, 0, null, "test-other");
  assert.equal(world.mode, "test-other");
  const loaded = deserializeWorld(serializeWorld(world));
  assert.equal(loaded.mode, "test-other", "the save did not carry the mode");
  assert.equal(modeOf(loaded).id, "test-other");
});

test("S172: the shipped mode is written too, so a save never depends on a default", () => {
  const world = createWorld(11, ship);
  const raw = JSON.parse(serializeWorld(world));
  assert.equal(raw.mode, DEFAULT_MODE_ID, "the mode must be in the save, not implied");
  assert.equal(deserializeWorld(JSON.stringify(raw)).mode, DEFAULT_MODE_ID);
});

test("S172: a save written before modes existed opens as it was played", () => {
  const world = createWorld(11, ship);
  const raw = JSON.parse(serializeWorld(world));
  // Exactly the shape an old save has: no `mode` field at all.
  delete raw.mode;
  const loaded = deserializeWorld(JSON.stringify(raw));
  assert.ok(loaded, "an old save must still open");
  assert.equal(loaded.mode, DEFAULT_MODE_ID, "an old save plays the shipped mode");
  assert.equal(modeOf(loaded).id, DEFAULT_MODE_ID);
});

test("S172: the version stays 1, so an old save is never rejected", () => {
  const world = createWorld(11, ship);
  const raw = JSON.parse(serializeWorld(world));
  assert.equal(raw.v, 1, "raising `v` would reject every saved voyage");
});

test("S172: a broken or unknown mode in the save falls back, it does not throw", () => {
  const world = createWorld(11, ship);
  for (const mode of ["no-such-mode", 42, null, {}, "", []]) {
    const raw = JSON.parse(serializeWorld(world));
    raw.mode = mode;
    const loaded = deserializeWorld(JSON.stringify(raw));
    assert.ok(loaded, `a save with mode ${JSON.stringify(mode)} must still open`);
    assert.equal(loaded.mode, DEFAULT_MODE_ID, `mode ${JSON.stringify(mode)} must fall back`);
  }
});

test("S172: the mode does not leak into the rest of the record", () => {
  const world = createWorld(11, ship, 0, null, "test-other");
  const loaded = deserializeWorld(serializeWorld(world));
  // Everything else round-trips as it did before F1: the field is additive and nothing else.
  assert.equal(loaded.gold, world.gold);
  assert.equal(loaded.seed, world.seed);
  assert.equal(loaded.ship.id, world.ship.id);
  assert.equal(loaded.level, world.level);
});

test("S172: a saved sea's own mode wins over the choice for the next voyage", () => {
  // The two authorities, in the order `sea.js` applies them: `savedWorld` first, and the
  // chosen key only when there is no saved sea. This is that rule, without a browser.
  const saved = createWorld(11, ship, 0, null, "test-other");
  const chosen = "no-such-choice";
  const world = deserializeWorld(serializeWorld(saved)) ?? createWorld(11, ship, 0, null, chosen);
  assert.equal(world.mode, "test-other", "the saved sea must keep her own mode");

  const fresh = null ?? createWorld(11, ship, 0, null, chosen);
  assert.equal(fresh.mode, DEFAULT_MODE_ID, "an unknown choice falls back to the shipped mode");
});
