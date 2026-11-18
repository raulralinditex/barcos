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

import { DANGER, dangerValue } from "../src/model/danger.js";
import { createEnemyCombatant, createPlayerCombatant } from "../src/model/combat.js";
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
