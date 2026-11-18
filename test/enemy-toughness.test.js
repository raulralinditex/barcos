/**
 * S140: a tougher enemy per level.
 *
 * User decision (verbatim): "Más cantidad y algo más duros". The fourth argument of
 * `createEnemyCombatant` is the toughness factor of the level the hull belongs to; the
 * default is 1, so every caller written before levels keeps the enemy it always had.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createEnemyCombatant, COMBAT } from "../src/model/combat.js";
import { LEVELS, toughnessForLevel } from "../src/model/levels.js";

const encounter = (overrides = {}) => ({
  id: 7,
  type: "enemy",
  hullId: "galeon-guerra",
  zoneId: "abierto",
  ...overrides,
});
const zone = { id: "abierto" };

test("S140: the toughness factor defaults to 1, so every current caller is unchanged", () => {
  const plain = createEnemyCombatant(encounter(), zone, 12345);
  const explicitOne = createEnemyCombatant(encounter(), zone, 12345, 1);
  assert.deepEqual(explicitOne, plain, "an explicit 1 is not the same enemy as no factor");
  assert.equal(plain.hullToughness, plain.hullToughness);
  // The guns are untouched by the level: only hull and crew grow.
  assert.deepEqual(explicitOne.pieces, plain.pieces);
});

test("S140: a tougher level gives the same hull more hull condition and more crew", () => {
  const easy = createEnemyCombatant(encounter(), zone, 12345, toughnessForLevel(1));
  const hard = createEnemyCombatant(encounter(), zone, 12345, toughnessForLevel(5));
  assert.ok(
    hard.hullToughness > easy.hullToughness,
    `level 5 is not tougher (${easy.hullToughness} -> ${hard.hullToughness})`,
  );
  assert.ok(
    Math.abs(hard.hullToughness - easy.hullToughness * 1.32) < 1e-9,
    `level 5 must scale the hull by 1.32, got ${hard.hullToughness} from ${easy.hullToughness}`,
  );
  // Crew scales with the hull, and the initial count follows, so the crew bar reads 100.
  for (const role of ["marino", "artillero", "soldado"]) {
    assert.ok(hard.crew[role] > easy.crew[role], `${role} did not grow with the level`);
  }
  assert.ok(hard.initialCrew > easy.initialCrew);
  assert.equal(hard.condition.crew, 100);
  assert.equal(hard.condition.hull, 100);
});

test("S140: the scaling is capped at the declared maximum", () => {
  const capped = createEnemyCombatant(encounter(), zone, 12345, LEVELS.maxToughness);
  const over = createEnemyCombatant(encounter(), zone, 12345, LEVELS.maxToughness * 10);
  assert.deepEqual(over, capped, "a factor past the cap was applied anyway");
});

test("S140: junk and hostile factors never break an enemy", () => {
  const plain = createEnemyCombatant(encounter(), zone, 12345);
  for (const junk of [undefined, null, NaN, "abc", -3, 0, {}, []]) {
    const made = createEnemyCombatant(encounter(), zone, 12345, junk);
    assert.deepEqual(made, plain, `a factor of ${String(junk)} changed the enemy`);
  }
  assert.ok(plain.hullToughness > 0);
  assert.ok(COMBAT.referenceArqueo > 0);
});
