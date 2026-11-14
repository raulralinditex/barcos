import test from "node:test";
import assert from "node:assert/strict";

import { ammoById, pieceById } from "../src/data/naval-data.js";
import {
  COMBAT,
  createEnemyCombatant,
  createPlayerCombatant,
  damageDealt,
  effectiveRangeM,
  fireBroadside,
  loadedShare,
  readyDamage,
  sideCapacity,
  tickCombatant,
} from "../src/model/combat.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { mulberry32 } from "../src/model/world.js";

/**
 * S21: what the floating bars over a hull have to say. These are the pure parts;
 * the drawing lives in the sea screen and is covered by the browser smoke.
 */

const seededRnd = (seed) => {
  let state = seed >>> 0;
  return () => {
    const r = mulberry32(state);
    state = r.state;
    return r.value;
  };
};

const runtimeShip = () => {
  const ship = buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "falcon", qty: 2, side: "babor", shotsPerPiece: 30, ammoId: "metralla" },
        { pieceId: "falcon", qty: 2, side: "estribor", shotsPerPiece: 30, ammoId: "metralla" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 6_000,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  );
  return toRuntimeShip(ship, { name: "Golden Hind" });
};

/* ---------------------------------------------------------------- loaded share */

test("S21: every gun loaded means a full reload bar", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  assert.equal(loadedShare(combatant, "babor"), 1);
  assert.equal(loadedShare(combatant, "estribor"), 1);
});

test("S21: the reload bar is the share of that side's guns that are ready", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  // five guns per side: three minions and two falcons. Fired at 100 m, inside the
  // hailshot range, so the whole beam fires and its reload bar is the one being read (S68).
  fireBroadside(combatant, "babor", 100, seededRnd(1));
  assert.equal(loadedShare(combatant, "babor"), 0);
  // the other beam is untouched
  assert.equal(loadedShare(combatant, "estribor"), 1);

  // The crew is ample (ten gunners for five guns reloading), so every gun on the beam reloads
  // with the same 1.3 bonus (S53). The falcons still reload faster than the minions: part of
  // the side comes back first, and the rest follows.
  const bonus = 1.3;
  const falcon = pieceById("falcon").reloadS / bonus / COMBAT.timeScale;
  const minion = pieceById("minion").reloadS / bonus / COMBAT.timeScale;
  tickCombatant(combatant, falcon + 0.01);
  assert.equal(loadedShare(combatant, "babor"), 2 / 5);
  tickCombatant(combatant, minion - falcon + 0.01);
  assert.equal(loadedShare(combatant, "babor"), 1);
});

test("S21: a side with no guns reports nothing rather than a divide by zero", () => {
  const bare = createPlayerCombatant({ ...runtimeShip(), batteries: [] });
  assert.equal(loadedShare(bare, "babor"), 0);
});

test("S21: a gun with no rounds left never counts as loaded", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  for (const p of combatant.pieces) {
    if (p.side === "babor") p.shotsLeft = 0;
  }
  assert.equal(loadedShare(combatant, "babor"), 0);
});

/* ---------------------------------------------------------------- ready damage */

test("S21: the damage a side is about to deal counts only loaded, in-range guns", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  const near = readyDamage(combatant, "babor", 200);
  const far = readyDamage(combatant, "babor", 335);

  // at 200 m the whole port battery bears; at 335 m only the minions reach
  assert.ok(near > 0);
  assert.ok(far > 0);
  assert.ok(far < near);
});

test("S21: a reloading side has no ready damage until its guns come back", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  fireBroadside(combatant, "babor", 200, seededRnd(1));
  assert.equal(readyDamage(combatant, "babor", 200), 0);
  assert.ok(readyDamage(combatant, "estribor", 200) > 0);
});

test("S21: ready damage is the expected value of the volley, not a lucky roll", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  // Measured at 100 m, inside the hailshot range, so the whole beam counts (S68). Each
  // gun is read against the range its own round carries.
  const distance = 100;
  const expected = combatant.pieces
    .filter((p) => p.side === "babor")
    .reduce((sum, p) => {
      const piece = pieceById(p.pieceId);
      const ammo = ammoById(p.ammoId);
      const range = effectiveRangeM(piece, p.ammoId);
      const falloff = 1 - 0.5 * (distance / range);
      const total = piece.shotKg * ammo.massFactor * COMBAT.damageScale * falloff;
      const p0 = COMBAT.baseAccuracy * (1 - Math.pow(distance / range, 1.6));
      return sum + p0 * total;
    }, 0);
  assert.ok(Math.abs(readyDamage(combatant, "babor", distance) - expected) < 1e-9);
});

test("S21: damage dealt is remembered per side and adds up", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  assert.equal(damageDealt(combatant, "babor"), 0);
  assert.equal(damageDealt(combatant, "estribor"), 0);

  const { volley } = fireBroadside(combatant, "babor", 200, seededRnd(7));
  const landed = volley.reduce(
    (sum, shot) =>
      sum + (shot.hit ? shot.damage.hull + shot.damage.rigging + shot.damage.crew : 0),
    0,
  );
  assert.ok(landed > 0);
  assert.ok(Math.abs(damageDealt(combatant, "babor") - landed) < 1e-9);
  // nothing was fired to starboard, so nothing is recorded there
  assert.equal(damageDealt(combatant, "estribor"), 0);
});

test("S21: a swivel answers for the side that fires it, so its damage lands there", () => {
  const ship = buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 20, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 6_000,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  );
  const combatant = createPlayerCombatant(toRuntimeShip(ship, { name: "Swivel" }));
  const { volley } = fireBroadside(combatant, "estribor", 150, seededRnd(8));
  assert.equal(volley.length, 2);
  assert.ok(damageDealt(combatant, "estribor") > 0);
  assert.equal(damageDealt(combatant, "babor"), 0);
});

/* ---------------------------------------------------------------- one scale for every hull */

test("S21: capacity is the damage the whole battery could deal, whether or not it is reloaded", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  const fresh = readyDamage(combatant, "babor", 200);
  assert.ok(fresh > 0);
  assert.ok(Math.abs(sideCapacity(combatant, "babor", 200) - fresh) < 1e-9);

  // after the broadside the guns are empty of ready damage but the battery is the same
  fireBroadside(combatant, "babor", 200, seededRnd(1));
  assert.equal(readyDamage(combatant, "babor", 200), 0);
  assert.ok(Math.abs(sideCapacity(combatant, "babor", 200) - fresh) < 1e-9);
});

test("S21: capacity leaves out the guns that cannot reach the target", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  const near = sideCapacity(combatant, "babor", 200);
  const far = sideCapacity(combatant, "babor", 335);
  assert.ok(far > 0);
  assert.ok(far < near, "at 335 m the falcons fall out of range");
});

test("S21: a battery out of rounds has no capacity left", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  for (const p of combatant.pieces) {
    if (p.side === "babor") p.shotsLeft = 0;
  }
  assert.equal(sideCapacity(combatant, "babor", 200), 0);
});

test("S21: a bigger ship has more capacity than a smaller one, so their bars can be compared", () => {
  const zone = { id: "abierto", danger: 2 };
  const small = createEnemyCombatant({ id: 3, hullId: "patache", type: "enemy" }, zone, 11);
  const big = createEnemyCombatant({ id: 3, hullId: "galeon-guerra", type: "enemy" }, zone, 11);
  const smallCap = Math.max(sideCapacity(small, "babor", 200), sideCapacity(small, "estribor", 200));
  const bigCap = Math.max(sideCapacity(big, "babor", 200), sideCapacity(big, "estribor", 200));
  assert.ok(smallCap > 0);
  assert.ok(bigCap > smallCap, `galeon (${bigCap}) should out-gun the patache (${smallCap})`);
});

test("S21: a gunless crew has no capacity, matching its silent guns", () => {
  const combatant = createPlayerCombatant(runtimeShip());
  combatant.crew.artillero = 0;
  assert.equal(sideCapacity(combatant, "babor", 200), 0);
});
