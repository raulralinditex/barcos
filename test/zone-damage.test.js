/**
 * S60: the damage a zone's enemies deal is a tuning value, not a hard-coded curve.
 *
 * The rule has to hold in both places that read damage: the real volley that sinks
 * hulls, and the expected volley the damage bars are drawn from. A bar that does not
 * follow the multiplier would tell the player a fight is safer than it is.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ZONE_DAMAGE,
  createEnemyCombatant,
  createPlayerCombatant,
  damageFactorOf,
  fireBroadside,
  readyDamage,
  sideCapacity,
} from "../src/model/combat.js";
import { SETTINGS_FIELDS, applySettings, fieldId, normaliseSettings, resetSettings } from "../src/model/settings.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/** Every test that writes settings restores the shipped values when it is done. */
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

const enemyIn = (zoneId, hullId = "galeon-guerra") =>
  createEnemyCombatant({ id: 7, hullId, zoneId }, { id: zoneId }, 12345);

const starterRuntimeShip = () =>
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

/* ---------------------------------------------------------------- the shipped curve */

test("S60: the three zones ship with no change at all", () => {
  assert.deepEqual({ ...ZONE_DAMAGE }, { costera: 1, abierto: 1, abismo: 1 });
});

test("S60: an enemy knows the water it hunts in", () => {
  for (const zoneId of ["costera", "abierto", "abismo"]) {
    assert.equal(enemyIn(zoneId).zoneId, zoneId, zoneId);
  }
});

test("S60: an unknown or missing zone falls back to the coastal multiplier", () => {
  const unknown = createEnemyCombatant({ id: 7, hullId: "patache" }, { id: "otro-mar" }, 1);
  const missing = createEnemyCombatant({ id: 7, hullId: "patache" }, {}, 1);
  assert.equal(damageFactorOf(unknown), ZONE_DAMAGE.costera);
  assert.equal(damageFactorOf(missing), ZONE_DAMAGE.costera);
});

test("S60: the player is never scaled by a zone", () => {
  // The multiplier exists to make the enemy harsher or gentler; the captain's own guns
  // must not change with the water she sails into.
  assert.equal(damageFactorOf(createPlayerCombatant(starterRuntimeShip())), 1);
});

test("S60: the multiplier is read live, so a change reaches a fight already open", () => {
  // A value frozen when the enemy spawned would need a new voyage to take effect, and
  // the settings screen says its changes enter at the next load of the sea. Reading the
  // zone at firing time is what keeps the two honest.
  withDefaults(() => {
    const enemy = enemyIn("abismo");
    assert.equal(damageFactorOf(enemy), 1);
    applySettings({ "zones.damage-abismo": 2.5 });
    assert.equal(damageFactorOf(enemy), 2.5);
  });
});

/* ---------------------------------------------------------------- it reaches the damage */

test("S60: doubling a zone's multiplier doubles the damage its enemies land", () => {
  const hit = (zoneId) => {
    const enemy = enemyIn(zoneId);
    // every gun loaded, so the volley is the same set of guns in both runs
    for (const p of enemy.pieces) p.reloadTimer = 0;
    const { volley } = fireBroadside(enemy, "estribor", 100, seeded());
    return volley.reduce((sum, shot) => sum + (shot.damage?.hull ?? 0) + (shot.damage?.rigging ?? 0) + (shot.damage?.crew ?? 0), 0);
  };

  withDefaults(() => {
    const base = hit("costera");
    assert.ok(base > 0, "the base volley should land something, or the test proves nothing");
    applySettings({ "zones.damage-costera": 2 });
    const doubled = hit("costera");
    assert.ok(Math.abs(doubled - 2 * base) < 1e-9, `expected ${2 * base}, got ${doubled}`);
  });
});

test("S60: zero silences a zone without breaking the volley", () => {
  withDefaults(() => {
    applySettings({ "zones.damage-abierto": 0 });
    const enemy = enemyIn("abierto");
    for (const p of enemy.pieces) p.reloadTimer = 0;
    const { volley } = fireBroadside(enemy, "estribor", 100, seeded());
    assert.ok(volley.length > 0, "the guns still fire");
    for (const shot of volley) {
      if (!shot.damage) continue;
      assert.equal(shot.damage.hull, 0);
      assert.equal(shot.damage.rigging, 0);
      assert.equal(shot.damage.crew, 0);
    }
  });
});

test("S60: the damage bars follow the multiplier too", () => {
  withDefaults(() => {
    const enemy = enemyIn("abismo");
    const before = sideCapacity(enemy, "estribor", 100);
    assert.ok(before > 0);
    applySettings({ "zones.damage-abismo": 2 });
    const after = sideCapacity(enemy, "estribor", 100);
    assert.ok(Math.abs(after - 2 * before) < 1e-9, `expected ${2 * before}, got ${after}`);
    // `readyDamage` only counts loaded guns, so load the battery to read it at all.
    for (const p of enemy.pieces) p.reloadTimer = 0;
    const ready = readyDamage(enemy, "estribor", 100);
    assert.ok(ready > 0, "a loaded battery should expect some damage");
    assert.ok(ready <= after, "the ready volley is never more than the whole beam");
  });
});

/* ---------------------------------------------------------------- the settings screen */

test("S60: one field per zone, in its own group, each in range", () => {
  const fields = SETTINGS_FIELDS.filter((field) => field.group === "zones");
  assert.deepEqual(
    fields.map((field) => fieldId(field)).sort(),
    ["zones.damage-abierto", "zones.damage-abismo", "zones.damage-costera"],
  );
  for (const field of fields) {
    assert.ok(field.label.startsWith("settings.zones."), `${fieldId(field)} has no label key`);
    assert.ok(field.min < field.max, `${fieldId(field)} has an empty range`);
    assert.ok(field.min >= 0, `${fieldId(field)} must not allow negative damage`);
  }
});

test("S60: a zone multiplier outside its range is clamped, not rejected", () => {
  withDefaults(() => {
    applySettings({ "zones.damage-costera": 99, "zones.damage-abierto": -5 });
    const field = (id) => SETTINGS_FIELDS.find((entry) => fieldId(entry) === id);
    assert.equal(ZONE_DAMAGE.costera, field("zones.damage-costera").max);
    assert.equal(ZONE_DAMAGE.abierto, field("zones.damage-abierto").min);
  });
});

test("S60: a broken multiplier falls back to the shipped value", () => {
  withDefaults(() => {
    for (const broken of [undefined, null, NaN, Infinity, "abc", {}]) {
      const applied = applySettings({ "zones.damage-abismo": broken });
      assert.equal(applied["zones.damage-abismo"], 1, `value ${String(broken)}`);
    }
  });
});

test("S60: a settings blob that predates this field still loads", () => {
  const applied = normaliseSettings({ "wind.maxSpeedBonus": 0.5 });
  assert.equal(applied["zones.damage-costera"], 1);
  assert.equal(applied["zones.damage-abierto"], 1);
  assert.equal(applied["zones.damage-abismo"], 1);
});
