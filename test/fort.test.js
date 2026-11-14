/**
 * S74: the shipyard fights as a static hull.
 *
 * The rules that matter here are the ones the player feels: the yard can be worn down,
 * her garrison can break, and while she is in enemy hands the port is closed. All three are
 * pinned through the public functions the sea will call.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  FORT,
  canAssaultFort,
  createFortCombatant,
  damageFort,
  fortCaptured,
  fortDestroyed,
  fortPrize,
  fortReadyGuns,
  portClosed,
} from "../src/model/fort.js";
import { COMBAT } from "../src/model/combat.js";

const seeded = (state = 12345) => {
  let s = state >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), s | 1) + 0x6d2b79f5) >>> 0;
    return ((s ^ (s >>> 13)) >>> 0) / 4294967296;
  };
};

/* ---------------------------------------------------------------- the yard exists */

test("S74: the yard is built as a static hull with a battery and a garrison", () => {
  const fort = createFortCombatant();
  assert.equal(fort.kind, "fort");
  assert.equal(fort.status, "fighting");
  assert.equal(fort.static, true);
  assert.equal(fort.maxSpeedKn, 0, "a fort does not sail");
  assert.ok(fort.pieces.length > 0, "she has guns");
  assert.ok(fort.crew.soldado > 0, "she has a garrison");
  assert.ok(fort.crew.artillero > 0, "and gunners");
});

test("S74: she starts with a hull of her own", () => {
  const fort = createFortCombatant();
  assert.equal(fort.condition.hull, FORT.hull);
  assert.equal(fort.condition.crew, 100);
  assert.ok(fort.hullToughness >= 1, "a fortification is tougher than a hull of the same tonnage");
});

test("S74: the default hull and toughness are configurable", () => {
  const fort = createFortCombatant({ hull: 70, toughness: 9 });
  assert.equal(fort.condition.hull, 70);
  assert.equal(fort.hullToughness, 9);
});

test("S74: a broken hull or toughness falls back instead of producing NaN", () => {
  for (const broken of [NaN, undefined, null, "abc", -5, Infinity]) {
    const fort = createFortCombatant({ hull: broken, toughness: broken });
    assert.ok(Number.isFinite(fort.condition.hull), `hull ${String(broken)}`);
    assert.ok(Number.isFinite(fort.hullToughness) && fort.hullToughness > 0, `toughness ${String(broken)}`);
  }
});

/* ---------------------------------------------------------------- it grows with victories */

test("S74: every five victories add one gun to each broadside", () => {
  const start = createFortCombatant({ victories: 0 });
  const after5 = createFortCombatant({ victories: 5 });
  const after10 = createFortCombatant({ victories: 10 });
  assert.equal(after5.pieces.length, start.pieces.length + 2, "one more gun per broadside");
  assert.equal(after10.pieces.length, start.pieces.length + 4);
});

test("S74: fewer than five victories add nothing", () => {
  const start = createFortCombatant({ victories: 0 }).pieces.length;
  for (const wins of [1, 4]) {
    assert.equal(createFortCombatant({ victories: wins }).pieces.length, start, `${wins} wins`);
  }
});

test("S74: growth is per broadside, not all on one side", () => {
  const fort = createFortCombatant({ victories: 5 });
  const babor = fort.pieces.filter((p) => p.side === "babor").length;
  const estribor = fort.pieces.filter((p) => p.side === "estribor").length;
  assert.equal(babor, estribor);
});

test("S74: a broken victory count grows nothing instead of throwing", () => {
  for (const broken of [NaN, undefined, null, -5, "abc"]) {
    const fort = createFortCombatant({ victories: broken });
    assert.ok(fort.pieces.length > 0, `victories ${String(broken)}`);
  }
});

/* ---------------------------------------------------------------- who may attack */

test("S74: only the abyss sends a squadron at the yard", () => {
  assert.equal(canAssaultFort("abismo"), true);
  assert.equal(canAssaultFort("abierta"), false);
  assert.equal(canAssaultFort("costera"), false);
  assert.equal(canAssaultFort("abierto"), false);
  assert.equal(canAssaultFort(null), false);
  assert.equal(canAssaultFort(undefined), false);
});

/* ---------------------------------------------------------------- taking damage */

test("S74: the yard takes hull damage through the same rule as a ship", () => {
  const fort = createFortCombatant();
  damageFort(fort, { hull: 40, rigging: 0, crew: 0 });
  // Toughness divides the damage, exactly as it does for a hull.
  assert.ok(fort.condition.hull < 100);
  assert.ok(fort.condition.hull > 0);
});

test("S74: enough damage sinks the yard", () => {
  const fort = createFortCombatant();
  damageFort(fort, { hull: 10_000, rigging: 0, crew: 0 });
  assert.equal(fort.condition.hull, 0);
  assert.equal(fort.status, "sunk");
  assert.equal(fortDestroyed(fort), true);
});

test("S74: breaking the garrison makes the yard strike", () => {
  const fort = createFortCombatant();
  // Crew damage is pooled and converted at the ship rate; enough of it empties the garrison.
  damageFort(fort, { hull: 0, rigging: 0, crew: 100_000 });
  assert.ok(fort.condition.crew <= COMBAT.surrenderCrewPct, `crew at ${fort.condition.crew}`);
  assert.equal(fort.status, "surrendered");
  assert.equal(fortCaptured(fort), true);
});

test("S74: a sunk or struck yard takes no more damage", () => {
  const fort = createFortCombatant();
  damageFort(fort, { hull: 10_000, rigging: 0, crew: 0 });
  const before = fort.condition.hull;
  const result = damageFort(fort, { hull: 50, rigging: 0, crew: 0 });
  assert.equal(fort.condition.hull, before);
  assert.equal(result.casualties, 0);
});

test("S74: damaging a missing yard does not throw", () => {
  for (const broken of [null, undefined, {}]) {
    const result = damageFort(broken, { hull: 10, rigging: 0, crew: 0 });
    assert.equal(result.casualties, 0);
  }
});

/* ---------------------------------------------------------------- the port */

test("S74: a fighting yard keeps the port open", () => {
  const fort = createFortCombatant();
  assert.equal(portClosed(fort), false);
  assert.equal(fortCaptured(fort), false);
  assert.equal(fortDestroyed(fort), false);
});

test("S74: a captured yard closes the port", () => {
  const fort = createFortCombatant();
  damageFort(fort, { hull: 0, rigging: 0, crew: 100_000 });
  assert.equal(portClosed(fort), true, "a captured yard takes the repairs and the sailing");
});

test("S74: a destroyed yard closes the port too", () => {
  const fort = createFortCombatant();
  damageFort(fort, { hull: 10_000, rigging: 0, crew: 0 });
  assert.equal(portClosed(fort), true);
});

test("S74: a missing yard never closes the port by accident", () => {
  // Fail open: a save without a fort must not lock the player out of her own harbour.
  for (const broken of [null, undefined, {}]) {
    assert.equal(portClosed(broken), false);
  }
});

/* ---------------------------------------------------------------- her guns */

test("S74: the yard's guns are crewed and can fire", () => {
  const fort = createFortCombatant();
  const ready = fortReadyGuns(fort, "babor");
  assert.ok(ready.length > 0, "a manned yard has guns ready");
});

test("S74: a yard with no gunners cannot shoot", () => {
  const fort = createFortCombatant();
  fort.crew.artillero = 0;
  assert.deepEqual(fortReadyGuns(fort, "babor"), []);
});

test("S74: a struck yard does not shoot", () => {
  const fort = createFortCombatant();
  fort.status = "surrendered";
  assert.deepEqual(fortReadyGuns(fort, "babor"), []);
});

test("S74: firing spends rounds and starts the reload", () => {
  const fort = createFortCombatant();
  const { volley } = fireAt(fort, "babor", 100);
  assert.ok(volley.length > 0);
  for (const p of fort.pieces) {
    if (p.side !== "babor") continue;
    assert.ok(p.reloadTimer > 0);
    assert.equal(p.shotsLeft, FORT.shotsPerGun - 1);
  }
});

test("S74: the yard's guns respect their own range", () => {
  const fort = createFortCombatant();
  const far = 10_000;
  const { volley } = fireAt(fort, "babor", far);
  assert.equal(volley.length, 0, "nothing reaches that far");
});

test("S74: the yard is worth something as a prize", () => {
  const small = createFortCombatant({ victories: 0 });
  const large = createFortCombatant({ victories: 20 });
  assert.ok(fortPrize(small) > 0);
  assert.ok(fortPrize(large) > fortPrize(small), "a bigger yard is a bigger prize");
  assert.equal(fortPrize(null), 0);
});

/* ---------------------------------------------------------------- helpers */

import { fortFire } from "../src/model/fort.js";

function fireAt(fort, side, distanceM) {
  return fortFire(fort, side, distanceM, seeded());
}
