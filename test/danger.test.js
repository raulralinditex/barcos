/**
 * S142: every vessel has an informational danger number, so the player can compare ships.
 *
 * The player asked for it (verbatim): "vamos a valorar los buques a la hora de la batalla
 * para poderlos comparar, calcularemos un valor segun sus propiedades que cuando comparemos
 * ese valor entre dos buques, el mayor tendra mas probabilida...". His decisions (verbatim):
 * "Sólo informativo: se muestra y no cambia el combate"; the properties are "Estado vivo
 * (casco, aparejo, tripulación)", "Artillería y munición" and "Tamaño, velocidad y maniobra".
 *
 * These tests pin the pure number only. Where it is painted is the sea's business, and
 * that it changes nothing in the fight is proven by every combat test staying green.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { DANGER, dangerValue, dangerValueFor } from "../src/model/danger.js";
import { createEnemyCombatant, createPlayerCombatant } from "../src/model/combat.js";
import * as LEVELS_MODULE from "../src/model/levels.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { SETTINGS_FIELDS, fieldId } from "../src/model/settings.js";

const runtime = (hullId, batteries, crew = { marino: 34, artillero: 10, soldado: 26 }) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries,
        crew,
        days: 45,
        cargoKg: 6_000,
        ballastKg: 3_000,
        equipmentKg: 2_500,
        reserveKg: 1_500,
      },
      12_000,
    ),
    { name: hullId },
  );

/** A small galleon with a real battery on both beams. */
const galleon = (shotsPerPiece = 25) =>
  createPlayerCombatant(
    runtime("galeon-pequeno", [
      { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece, ammoId: "bala-hierro" },
      { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece, ammoId: "bala-hierro" },
      { pieceId: "falcon", qty: 2, side: "babor", shotsPerPiece, ammoId: "bala-hierro" },
      { pieceId: "falcon", qty: 2, side: "estribor", shotsPerPiece, ammoId: "bala-hierro" },
    ]),
  );

/** The same hull, damaged the way a fight damages her. */
const withCondition = (combatant, condition) => ({
  ...combatant,
  condition: { ...combatant.condition, ...condition },
});

/* ---------------------------------------------------------------- S142-A: a number, not a rule */

test("S142-A: a whole ship has a danger number, and it is a whole number", () => {
  const value = dangerValue(galleon());
  assert.ok(Number.isInteger(value), `danger must be an integer, got ${value}`);
  assert.ok(value > 0, `a fighting ship must be worth something, got ${value}`);
});

test("S142-A: the number is a weighted sum of three declared groups", () => {
  // A hull with nothing but her live condition is worth exactly the condition weights:
  // that is what "the weights are declared" means, and it keeps the groups separable.
  const bare = {
    status: "fighting",
    condition: { hull: 100, rigging: 100, crew: 100 },
    pieces: [],
    maxSpeedKn: 0,
    hullToughness: 0,
  };
  assert.equal(dangerValue(bare), DANGER.hull + DANGER.rigging + DANGER.crew);
  // And the gunnery and hull groups are declared too, so the screen can move them (S79).
  for (const key of ["hull", "rigging", "crew", "gun", "calibre", "rounds", "displacement", "speed", "manoeuvre"]) {
    assert.equal(typeof DANGER[key], "number", `DANGER.${key} must be declared`);
  }
});

test("S142-A: damage lowers the value", () => {
  const whole = dangerValue(galleon());
  const hurt = dangerValue(withCondition(galleon(), { hull: 50 }));
  const battered = dangerValue(withCondition(galleon(), { hull: 50, rigging: 40, crew: 45 }));
  assert.ok(hurt < whole, `half a hull must be worth less (${hurt} vs ${whole})`);
  assert.ok(battered < hurt, `a beaten crew and rig must be worth less still (${battered} vs ${hurt})`);
});

test("S142-A: a heavier armed ship outranks a patache", () => {
  const warship = dangerValue(galleon());
  const patache = createEnemyCombatant({ id: 901, hullId: "patache" }, { id: "costera" }, 7);
  const small = dangerValue(patache);
  assert.ok(small > 0, `the patache must be worth something, got ${small}`);
  assert.ok(warship > small, `the galleon must outrank the patache (${warship} vs ${small})`);
});

test("S142-A: rounds left matter", () => {
  const loaded = dangerValue(galleon(25));
  const dry = dangerValue(galleon(0));
  assert.ok(dry < loaded, `a ship out of rounds must be worth less (${dry} vs ${loaded})`);
});

test("S142-A: a sunk or struck hull is worth nothing", () => {
  const sunk = { ...galleon(), status: "sunk" };
  const struck = { ...galleon(), status: "surrendered" };
  assert.equal(dangerValue(sunk), 0);
  assert.equal(dangerValue(struck), 0);
  assert.equal(dangerValue(withCondition(galleon(), { hull: 0 })), 0);
});

test("S142-A: garbage is 0 and never throws", () => {
  const junk = [
    undefined,
    null,
    0,
    "",
    "patache",
    [],
    {},
    { condition: null },
    { condition: { hull: "x", rigging: {}, crew: [] } },
    { condition: { hull: "x" }, pieces: "babor", maxSpeedKn: NaN, hullToughness: Infinity },
  ];
  for (const value of junk) {
    assert.equal(dangerValue(value), 0, `input ${JSON.stringify(value)} must be 0`);
  }
});

test("S142-A: a half-readable ship is a number, never a throw", () => {
  // The fields the number cannot read are skipped; the ones it can read still count.
  const partial = dangerValue({
    condition: { hull: 100 },
    pieces: "babor",
    maxSpeedKn: NaN,
    hullToughness: Infinity,
  });
  assert.equal(partial, DANGER.hull, `only the hull condition is readable here, got ${partial}`);
});

test("S142-A: the function never mutates the ship it reads", () => {
  const combatant = withCondition(galleon(), { hull: 63, rigging: 41, crew: 77 });
  const before = JSON.stringify(combatant);
  dangerValue(combatant);
  assert.equal(JSON.stringify(combatant), before, "dangerValue wrote on the combatant");
});

/* ---------------------------------------------------------------- S142-D: it is a setting */

test("S142-D: the danger number is visible by default and its weights are on the screen", () => {
  assert.equal(DANGER.show, 1, "the number must ship visible");
  for (const key of Object.keys(DANGER)) {
    assert.ok(
      SETTINGS_FIELDS.some((field) => fieldId(field) === `danger.${key}`),
      `DANGER.${key} is not on the settings screen (S79)`,
    );
  }
});

/* ---------------------------------------------------------------- S144: the level is worth points */

/** An enemy of the abyss, the water where the player met the 5.000-point hull. */
const abyssEnemy = (hullId, level) => {
  const { toughnessForLevel } = LEVELS_MODULE;
  // The level is stamped on the encounter by `seedLevel`, exactly as the sea does it: the
  // combatant is built from that encounter, so this is the real path, not a shortcut.
  return createEnemyCombatant(
    { id: 901, hullId, zoneId: "abismo", level },
    { id: "abismo" },
    7,
    toughnessForLevel(level),
  );
};

test("S144: a higher level is worth more danger, not the same", () => {
  // The player's report: at level 6 the abyss showed a hull worth ~5.000 points, and the
  // level barely moved the number. The level makes an enemy harder to sink, so a number
  // that compares hulls has to say so.
  for (const hullId of ["galeon-guerra", "gran-buque-real"]) {
    const one = dangerValue(abyssEnemy(hullId, 1));
    const six = dangerValue(abyssEnemy(hullId, 6));
    const twelve = dangerValue(abyssEnemy(hullId, 12));
    assert.ok(one > 0, `${hullId} at level 1 must be worth something, got ${one}`);
    assert.ok(six > one, `${hullId}: level 6 (${six}) must be worth more than level 1 (${one})`);
    assert.ok(twelve > six, `${hullId}: level 12 (${twelve}) must be worth more than level 6 (${six})`);
  }
});

test("S144: the climb is gradual, and its weight is what moves it", () => {
  // "que sea modificable como va aumentando los puntos de batalla en la configuracion": the
  // weight is one declared number, so the climb is a straight line the player can tune.
  const hullId = "galeon-guerra";
  const climb = [1, 2, 3, 4, 5, 6].map((level) => dangerValue(abyssEnemy(hullId, level)));
  for (let i = 1; i < climb.length; i += 1) {
    assert.ok(climb[i] >= climb[i - 1], `the climb must never fall: ${climb.join(" -> ")}`);
  }
  // Strictly higher at the end, so "gradual" is not "flat".
  assert.ok(climb[5] > climb[0], `six levels must be worth more: ${climb.join(" -> ")}`);

  // The factor itself, isolated: one combatant, the level handed in. With a weight of zero
  // the level adds nothing to the number, whatever her own hardness does to it.
  const combatant = abyssEnemy(hullId, 1);
  const saved = DANGER.level;
  try {
    DANGER.level = 0;
    assert.equal(
      dangerValueFor(combatant, 12),
      dangerValueFor(combatant, 1),
      "with a weight of zero the level must not scale the number",
    );
    // And a heavier weight climbs harder: that is what tunable means.
    DANGER.level = 0.2;
    const heavy = dangerValueFor(combatant, 6);
    DANGER.level = 0.08;
    const shipped = dangerValueFor(combatant, 6);
    assert.ok(heavy > shipped, `a heavier weight must climb harder (${heavy} vs ${shipped})`);
  } finally {
    DANGER.level = saved;
  }
});

test("S144: the level weight is a design number on the settings screen", () => {
  // S79: every design number is configurable. The climb the player asked to tune is one.
  const field = SETTINGS_FIELDS.find((entry) => fieldId(entry) === "danger.level");
  assert.ok(field, "the level weight must be on the settings screen");
  assert.equal(field.group, "danger");
  assert.equal(field.target, "danger");
  assert.equal(field.targetKey, "level");
  assert.ok(field.max > 0, "the weight must be able to grow");
});

test("S144: a hull with no level on record is read as level 1", () => {
  // The badge and the panel read a combatant, and a combatant built before levels existed
  // — or by a caller that never set one — must not be worth less than level 1.
  const combatant = abyssEnemy("galeon-guerra", 1);
  delete combatant.level;
  assert.equal(combatant.level, undefined, "this fixture carries no level, which is the point");
  const plain = dangerValue(combatant);
  assert.equal(plain, dangerValueFor(combatant, 1), "no level must read as level 1");
  assert.ok(dangerValueFor(combatant, 6) > plain, "a level handed in must still count");
});

test("S144: a broken level is level 1, never a NaN", () => {
  const combatant = abyssEnemy("galeon-guerra", 1);
  const plain = dangerValue(combatant);
  for (const broken of [undefined, null, NaN, "abc", {}, [], -3, 0, 0.4]) {
    assert.equal(
      dangerValueFor(combatant, broken),
      plain,
      `level ${String(broken)} must read as level 1, not as a broken number`,
    );
  }
});
