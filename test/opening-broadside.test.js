/**
 * S69-S70: the opening broadside, and what changing ammunition costs.
 *
 * Two rules that both live in the reload clock:
 *
 *  - the first time a beam fires at an enemy it has just engaged, that volley is more
 *    accurate and hits harder: the reward for opening the fight prepared (S69);
 *  - changing the round mid-fight costs reload time, so a captain cannot flip between
 *    chain shot and iron for free whenever the range changes (S70).
 *
 * Both are checked through the public firing path, because that is what the sea runs.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  COMBAT,
  createEnemyCombatant,
  createPlayerCombatant,
  fireBroadside,
  hitProbability,
  markEngaged,
  openingBonus,
  setBroadsideAmmo,
  setSideAmmo,
} from "../src/model/combat.js";
import { SETTINGS_FIELDS, applySettings, fieldId, resetSettings } from "../src/model/settings.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

const withDefaults = (body) => {
  try {
    body();
  } finally {
    resetSettings();
  }
};

const seeded = (state = 12345) => {
  let s = state >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), s | 1) + 0x6d2b79f5) >>> 0;
    return ((s ^ (s >>> 13)) >>> 0) / 4294967296;
  };
};

const runtime = () =>
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
        cargoKg: 6000,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      12000,
    ),
    { name: "Golden Hind" },
  );

const fresh = () => createPlayerCombatant(runtime());

/** Damage a full volley lands at a distance, with every gun loaded. */
const volleyDamage = (combatant, side, distance, seed = 1) => {
  for (const p of combatant.pieces) {
    p.reloadTimer = 0;
    p.shotsLeft = 25;
  }
  const { volley } = fireBroadside(combatant, side, distance, seeded(seed));
  return volley.reduce(
    (sum, shot) => sum + (shot.damage ? shot.damage.hull + shot.damage.rigging + shot.damage.crew : 0),
    0,
  );
};

/* ---------------------------------------------------------------- the opening broadside (S69) */

test("S69: a fresh combatant has not opened fire yet", () => {
  const combatant = fresh();
  assert.deepEqual(openingBonus(combatant, "babor"), { damage: 1, accuracy: 1 });
  assert.deepEqual(openingBonus(combatant, "estribor"), { damage: 1, accuracy: 1 });
});

test("S69: once a beam has fired at an engaged enemy, its bonus is spent", () => {
  const combatant = fresh();
  markEngaged(combatant);
  volleyDamage(combatant, "babor", 100);
  // Port has opened fire: no more bonus there, but starboard still has hers.
  assert.equal(openingBonus(combatant, "babor").damage, 1);
  assert.equal(openingBonus(combatant, "estribor").damage, COMBAT.openingDamageBonus);
});

test("S69: the bonus is per beam, so the second one still gets it", () => {
  const combatant = fresh();
  markEngaged(combatant);
  volleyDamage(combatant, "babor", 100);
  assert.ok(openingBonus(combatant, "estribor").damage > 1);
  volleyDamage(combatant, "estribor", 100);
  assert.equal(openingBonus(combatant, "estribor").damage, 1, "and it is spent once it fires");
});

test("S69: the opening volley lands more damage than the next one", () => {
  const combatant = fresh();
  markEngaged(combatant);
  const opening = volleyDamage(combatant, "babor", 100, 7);
  const later = volleyDamage(combatant, "babor", 100, 7);
  assert.ok(opening > later, `the opening volley ${opening} should beat the next ${later}`);
});

test("S69: the opening volley is more accurate, not only harder hitting", () => {
  const combatant = fresh();
  markEngaged(combatant);
  const bonus = openingBonus(combatant, "babor");
  assert.ok(bonus.accuracy > 1, "accuracy has to move too");
  // The accuracy bonus is a multiplier on the base chance, capped where a roll is a roll.
  const piece = { shotKg: 2, rangeM: 300, reloadS: 60 };
  assert.ok(hitProbability(piece, 100, bonus.accuracy) > hitProbability(piece, 100, 1));
});

test("S69: an enemy that is not engaged yet gives no bonus", () => {
  const combatant = fresh();
  // No markEngaged: the fight has not started, so there is no opening to reward.
  assert.equal(openingBonus(combatant, "babor").damage, 1);
});

test("S69: engaging again reopens the bonus, because it is a new fight", () => {
  const combatant = fresh();
  markEngaged(combatant);
  volleyDamage(combatant, "babor", 100);
  assert.equal(openingBonus(combatant, "babor").damage, 1);
  markEngaged(combatant);
  assert.ok(openingBonus(combatant, "babor").damage > 1, "a new engagement is a new opening");
});

test("S69: the bonus is configurable, and shipping values keep the game playable", () => {
  const damageField = SETTINGS_FIELDS.find((entry) => fieldId(entry) === "combat.openingDamage");
  const accuracyField = SETTINGS_FIELDS.find((entry) => fieldId(entry) === "combat.openingAccuracy");
  assert.ok(damageField, "the damage bonus must be configurable");
  assert.ok(accuracyField, "the accuracy bonus must be configurable");
  withDefaults(() => {
    applySettings({ "combat.openingDamage": 2, "combat.openingAccuracy": 1.5 });
    const combatant = fresh();
    markEngaged(combatant);
    assert.equal(openingBonus(combatant, "babor").damage, 2);
    assert.equal(openingBonus(combatant, "babor").accuracy, 1.5);
  });
});

test("S69: a bonus below 1 is clamped away, never a penalty", () => {
  withDefaults(() => {
    applySettings({ "combat.openingDamage": 0.2, "combat.openingAccuracy": 0.1 });
    const combatant = fresh();
    markEngaged(combatant);
    // The field's own minimum is what protects this, not luck.
    assert.ok(openingBonus(combatant, "babor").damage >= 1);
    assert.ok(openingBonus(combatant, "babor").accuracy >= 1);
  });
});

test("S69: a combatant that is not fighting gets no bonus", () => {
  const combatant = fresh();
  markEngaged(combatant);
  combatant.status = "sunk";
  assert.equal(openingBonus(combatant, "babor").damage, 1);
});

/* ---------------------------------------------------------------- switching costs reload (S70) */

test("S70: changing the round lengthens the reload of the guns that changed", () => {
  withDefaults(() => {
    const combatant = fresh();
    for (const p of combatant.pieces) p.reloadTimer = 0;
    fireBroadside(combatant, "babor", 100, seeded());
    const normal = combatant.pieces.find((p) => p.side === "babor").reloadTimer;

    const other = fresh();
    for (const p of other.pieces) p.reloadTimer = 0;
    fireBroadside(other, "babor", 100, seeded());
    setSideAmmo(other, "babor", "cadena");
    for (const p of other.pieces) p.reloadTimer = 0;
    fireBroadside(other, "babor", 100, seeded());
    const afterSwitch = other.pieces.find((p) => p.side === "babor").reloadTimer;

    assert.ok(afterSwitch > normal, `switched reload ${afterSwitch} should exceed ${normal}`);
  });
});

test("S70: the cost is only paid by the guns whose round actually changed", () => {
  withDefaults(() => {
    const combatant = fresh();
    // Only port changes.
    setSideAmmo(combatant, "babor", "cadena");
    const babor = combatant.pieces.filter((p) => p.side === "babor");
    const estribor = combatant.pieces.filter((p) => p.side === "estribor");
    assert.ok(babor.every((p) => p.ammoId === "cadena"));
    assert.ok(estribor.every((p) => p.ammoId === "bala-hierro"), "starboard did not change");
  });
});

test("S70: a gun that cannot take the round pays nothing, because it did not change", () => {
  const combatant = createPlayerCombatant(
    toRuntimeShip(
      buildShip(
        {
          hullId: "galeon-pequeno",
          batteries: [
            { pieceId: "medio-canon-32", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
          ],
          crew: { marino: 34, artillero: 10, soldado: 26 },
          days: 45,
          cargoKg: 6000,
          ballastKg: 3000,
          equipmentKg: 2500,
          reserveKg: 1500,
        },
        12000,
      ),
      { name: "Golden Hind" },
    ),
  );
  const before = combatant.pieces[0].ammoId;
  const result = setBroadsideAmmo(combatant, "cadena");
  assert.equal(result.switched, 0, "the big gun cannot take chain shot");
  assert.equal(combatant.pieces[0].ammoId, before);
  assert.equal(combatant.pieces[0].ammoPenalty ?? 0, 0, "and pays no penalty for a change it did not make");
});

test("S70: switching back to the same round is free", () => {
  const combatant = fresh();
  setBroadsideAmmo(combatant, "cadena");
  const after = combatant.pieces.map((p) => p.ammoPenalty ?? 0);
  const again = setBroadsideAmmo(combatant, "cadena");
  assert.equal(again.switched, 0);
  assert.deepEqual(combatant.pieces.map((p) => p.ammoPenalty ?? 0), after);
});

test("S70: the cost is a setting, and zero means switching is free", () => {
  const field = SETTINGS_FIELDS.find((entry) => fieldId(entry) === "combat.ammoReloadPenalty");
  assert.ok(field, "the switching cost must be configurable");
  withDefaults(() => {
    applySettings({ "combat.ammoReloadPenalty": 0 });
    const combatant = fresh();
    for (const p of combatant.pieces) p.reloadTimer = 0;
    fireBroadside(combatant, "babor", 100, seeded());
    const normal = combatant.pieces.find((p) => p.side === "babor").reloadTimer;

    setSideAmmo(combatant, "babor", "cadena");
    for (const p of combatant.pieces) p.reloadTimer = 0;
    fireBroadside(combatant, "babor", 100, seeded());
    const afterSwitch = combatant.pieces.find((p) => p.side === "babor").reloadTimer;
    assert.ok(Math.abs(afterSwitch - normal) < 1e-9, `free switching should cost nothing: ${afterSwitch} vs ${normal}`);
  });
});

test("S70: the penalty is spent by the reload it lengthens, not kept forever", () => {
  withDefaults(() => {
    const combatant = fresh();
    setSideAmmo(combatant, "babor", "cadena");
    const penalised = combatant.pieces.filter((p) => p.side === "babor").map((p) => p.ammoPenalty ?? 0);
    assert.ok(penalised.every((p) => p > 0), "the guns carry the penalty");

    // Firing applies it to that reload and clears it: the gun paid once, not forever.
    for (const p of combatant.pieces) p.reloadTimer = 0;
    fireBroadside(combatant, "babor", 100, seeded());
    assert.deepEqual(
      combatant.pieces.filter((p) => p.side === "babor").map((p) => p.ammoPenalty ?? 0),
      penalised.map(() => 0),
      "the penalty is spent by the reload it lengthened",
    );
  });
});

test("S70: the enemy pays the same cost, so the rule is not a player advantage", () => {
  const enemy = createEnemyCombatant({ id: 7, hullId: "galeon-guerra" }, { id: "abierto" }, 12345);
  const before = enemy.pieces.map((p) => p.ammoId);
  setSideAmmo(enemy, "estribor", "bala-hierro");
  const changed = enemy.pieces.filter((p, i) => p.side === "estribor" && p.ammoId !== before[i]);
  for (const p of changed) {
    assert.ok((p.ammoPenalty ?? 0) > 0, `${p.pieceId} changed round and should pay the cost`);
  }
});
