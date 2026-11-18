/**
 * S140: the level curve.
 *
 * The player asked for levels (verbatim): "vamos a hacer niveles, cuando se reinicia,
 * aparecen una serie de enemigos, cuando conseguimos undir o capturar todos, pasamos al
 * siguiente nivel y aparecen mas barcos enemigos que la primera vez, el nivel aparece en
 * el header de los astilleros". His decisions (verbatim): "Sin reposición, el nivel manda
 * (Recomendada)", "Crece 1,5× por nivel", "Más cantidad y algo más duros", "Chip junto al
 * título (Recomendada)".
 *
 * This file pins the numbers only: how many enemies a level owns and how tough they are.
 * The quota on the sea is `test/level-quota.test.js`; the scaling of one hull is
 * `test/enemy-toughness.test.js`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  LEVELS,
  enemiesForLevel,
  levelFromGameSave,
  normaliseLevel,
  toughnessForLevel,
} from "../src/model/levels.js";

test("S140: the level curve is declared in one place", () => {
  assert.equal(LEVELS.baseEnemies, 3);
  assert.equal(LEVELS.growth, 1.5);
  assert.equal(LEVELS.maxEnemies, 60);
  assert.equal(LEVELS.toughnessPerLevel, 0.08);
  assert.equal(LEVELS.maxToughness, 2);
});

test("S140: the quota grows 1.5x per level", () => {
  const quota = [1, 2, 3, 4, 5, 6].map((level) => enemiesForLevel(level));
  assert.deepEqual(quota, [3, 5, 7, 10, 15, 23]);
});

test("S140: the quota is capped at the declared maximum and never below one sail", () => {
  for (const level of [20, 40, 200, 1e6]) {
    assert.ok(enemiesForLevel(level) <= LEVELS.maxEnemies, `level ${level} escaped the cap`);
    assert.ok(enemiesForLevel(level) >= 1, `level ${level} has no enemy at all`);
  }
  assert.equal(enemiesForLevel(1e6), LEVELS.maxEnemies);
  assert.equal(enemiesForLevel(1), LEVELS.baseEnemies);
});

test("S140: toughness grows with the level and is capped", () => {
  assert.equal(toughnessForLevel(1), 1);
  assert.ok(Math.abs(toughnessForLevel(5) - 1.32) < 1e-9, `level 5 is ${toughnessForLevel(5)}`);
  assert.ok(toughnessForLevel(2) > toughnessForLevel(1));
  assert.ok(toughnessForLevel(5) > toughnessForLevel(4));
  assert.ok(toughnessForLevel(20) <= LEVELS.maxToughness);
  assert.equal(toughnessForLevel(1000), LEVELS.maxToughness);
});

test("S140: junk input resolves to level 1, it never throws", () => {
  const junk = [undefined, null, NaN, Infinity, -5, 0, 0.5, "abc", "", {}, [], true, Symbol("x")];
  for (const value of junk) {
    assert.doesNotThrow(() => normaliseLevel(value), `normaliseLevel threw on ${String(value)}`);
    assert.equal(normaliseLevel(value), 1, `normaliseLevel(${String(value)}) is not 1`);
    assert.equal(enemiesForLevel(value), 3, `enemiesForLevel(${String(value)}) is not level 1`);
    assert.equal(toughnessForLevel(value), 1, `toughnessForLevel(${String(value)}) is not level 1`);
  }
  assert.equal(normaliseLevel(4.9), 4);
  assert.equal(normaliseLevel("7"), 7);
});

test("S140: the level of a save is read from the sea record, and junk is level 1", () => {
  assert.equal(levelFromGameSave(null), 1);
  assert.equal(levelFromGameSave(undefined), 1);
  assert.equal(levelFromGameSave({}), 1);
  assert.equal(levelFromGameSave({ world: "not json" }), 1);
  assert.equal(levelFromGameSave({ world: JSON.stringify({ v: 1, level: 4 }) }), 4);
  assert.equal(levelFromGameSave({ world: { level: 3 } }), 3);
  // A save written before levels existed has no level at all.
  assert.equal(levelFromGameSave({ world: JSON.stringify({ v: 1 }) }), 1);
  assert.equal(levelFromGameSave({ world: JSON.stringify({ v: 1, level: 0 }) }), 1);
  assert.equal(levelFromGameSave({ world: JSON.stringify({ v: 1, level: "tres" }) }), 1);
});
