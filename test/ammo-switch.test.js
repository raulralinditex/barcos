/**
 * S65: changing ammunition in the middle of a fight.
 *
 * The rule has one hard requirement, and it is the reason this is a model function and
 * not a few lines in the key handler: a piece that cannot carry the chosen ammunition
 * must keep the rounds it already had. Switching must never be a way to feed a gun a
 * shot it was never able to fire.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  AMMO_KEYS,
  AMMO_SWITCH,
  ammoKeyAmmoId,
  chooseAmmo,
  createPlayerCombatant,
  describeAmmo,
  fireBroadside as fireVolley,
  setBroadsideAmmo,
  setSideAmmo,
} from "../src/model/combat.js";
import { pieceById } from "../src/data/naval-data.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

const runtime = (batteries) =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "galeon-pequeno",
        batteries,
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

/** A hull whose guns do not all take the same rounds, so the rule has work to do. */
const mixed = () =>
  createPlayerCombatant(
    runtime([
      { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      // A big gun: iron or hailshot, never chain shot.
      { pieceId: "medio-canon-32", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
      // A swivel, which is not bolted to a beam and answers for either.
      { pieceId: "verso", qty: 2, side: "swivel", shotsPerPiece: 40, ammoId: "metralla" },
    ]),
  );

const ammoOf = (combatant, pieceId) =>
  combatant.pieces.filter((p) => p.pieceId === pieceId).map((p) => p.ammoId);

/* ---------------------------------------------------------------- the keys */

test("S65: three keys choose iron, chain and hailshot", () => {
  assert.deepEqual(Object.keys(AMMO_KEYS).sort(), ["1", "2", "3"]);
  assert.equal(ammoKeyAmmoId("1"), "bala-hierro");
  assert.equal(ammoKeyAmmoId("2"), "cadena");
  assert.equal(ammoKeyAmmoId("3"), "metralla");
});

test("S65: an unknown key chooses nothing", () => {
  for (const key of ["4", "0", "x", "", null, undefined, "bala-hierro"]) {
    assert.equal(ammoKeyAmmoId(key), null, `key ${String(key)}`);
  }
});

test("S65: choosing says which pieces take the round and which keep theirs", () => {
  const combatant = mixed();
  const choice = chooseAmmo(combatant, "cadena");
  assert.equal(choice.ammoId, "cadena");
  assert.ok(choice.switched > 0, "some guns should be able to take chain shot");
  assert.ok(choice.kept > 0, "the 32-pounder cannot take chain shot, so something must be kept");
});

/* ---------------------------------------------------------------- switching */

test("S65: only the guns that carry the round are switched", () => {
  const combatant = mixed();
  setBroadsideAmmo(combatant, "cadena");

  // The minions take chain shot. The 32-pounder cannot, and neither can the swivel: a
  // verso fires hailshot and iron only, so both keep what they had.
  assert.deepEqual(ammoOf(combatant, "minion"), ["cadena", "cadena", "cadena", "cadena"]);
  assert.deepEqual(ammoOf(combatant, "medio-canon-32"), ["bala-hierro"], "the big gun keeps her iron");
  assert.deepEqual(ammoOf(combatant, "verso"), ["metralla", "metralla"], "a verso cannot fire chain shot");
});

test("S65: a gun that cannot take the round keeps exactly what it had", () => {
  const combatant = mixed();
  // Start the big gun on hailshot, which it can fire, then ask for chain shot.
  setBroadsideAmmo(combatant, "metralla");
  assert.deepEqual(ammoOf(combatant, "medio-canon-32"), ["metralla"]);
  setBroadsideAmmo(combatant, "cadena");
  assert.deepEqual(ammoOf(combatant, "medio-canon-32"), ["metralla"], "not iron, not chain: what she had");
});

test("S65: switching is by beam, so one side can hold chain shot while the other holds iron", () => {
  const combatant = mixed();
  setSideAmmo(combatant, "babor", "cadena");
  const babor = combatant.pieces.filter((p) => p.side === "babor").map((p) => p.ammoId);
  const estribor = combatant.pieces.filter((p) => p.side === "estribor").map((p) => p.ammoId);
  assert.ok(babor.includes("cadena"), "port should take the chain shot");
  assert.ok(estribor.every((ammo) => ammo === "bala-hierro"), `starboard should keep her iron, got ${estribor}`);
});

test("S65: the swivels answer for the beam that was chosen", () => {
  const combatant = mixed();
  // A swivel is not bolted to a beam (S20), so it follows whichever beam was chosen.
  setSideAmmo(combatant, "estribor", "bala-hierro");
  assert.deepEqual(ammoOf(combatant, "verso"), ["bala-hierro", "bala-hierro"], "a swivel follows the beam");
  // And when the round is one the swivel cannot fire, she keeps hers.
  setSideAmmo(combatant, "estribor", "cadena");
  assert.deepEqual(ammoOf(combatant, "verso"), ["bala-hierro", "bala-hierro"]);
});

test("S65: switching never touches the reload clock or the rounds left", () => {
  const combatant = mixed();
  for (const p of combatant.pieces) {
    p.reloadTimer = 3.5;
    p.shotsLeft = 7;
  }
  setBroadsideAmmo(combatant, "cadena");
  for (const p of combatant.pieces) {
    assert.equal(p.reloadTimer, 3.5, `${p.pieceId} lost her reload`);
    assert.equal(p.shotsLeft, 7, `${p.pieceId} lost her rounds`);
  }
});

test("S65: switching to the round a gun already has changes nothing", () => {
  const combatant = mixed();
  // Everything is already on iron except the swivels, which take hailshot. Asking for
  // iron again must only move the swivels, and a second time must move nothing.
  setBroadsideAmmo(combatant, "bala-hierro");
  const before = combatant.pieces.map((p) => p.ammoId);
  const result = setBroadsideAmmo(combatant, "bala-hierro");
  assert.deepEqual(combatant.pieces.map((p) => p.ammoId), before);
  assert.equal(result.switched, 0, "nothing needed switching the second time");
});

test("S65: an unknown ammunition switches nothing", () => {
  const combatant = mixed();
  const before = combatant.pieces.map((p) => p.ammoId);
  for (const broken of [null, undefined, "", "no-existe", 42]) {
    const result = setBroadsideAmmo(combatant, broken);
    assert.deepEqual(combatant.pieces.map((p) => p.ammoId), before, `ammo ${String(broken)}`);
    assert.equal(result.switched, 0);
  }
});

test("S65: a hull that cannot fire at all survives the switch", () => {
  assert.equal(setBroadsideAmmo(null, "cadena").switched, 0);
  assert.equal(setBroadsideAmmo({}, "cadena").switched, 0);
  assert.equal(setBroadsideAmmo({ pieces: null }, "cadena").switched, 0);
  assert.equal(chooseAmmo(null, "cadena").switched, 0);
});

/* ---------------------------------------------------------------- reading it back */

test("S65: the HUD can say what each beam is loaded with", () => {
  const combatant = mixed();
  setSideAmmo(combatant, "babor", "cadena");
  const described = describeAmmo(combatant);
  assert.equal(described.babor.id, "cadena");
  assert.equal(described.estribor.id, "bala-hierro");
  assert.ok(described.babor.name.length > 0);
});

test("S65: a beam with more than one round reads as mixed, not as the last one", () => {
  const combatant = mixed();
  setSideAmmo(combatant, "babor", "cadena");
  // The 32-pounder kept her iron, so port is no longer uniform.
  const described = describeAmmo(combatant);
  assert.equal(described.babor.mixed, true);
  assert.equal(described.babor.id, "cadena", "the round most of the beam carries");
});

test("S65: an empty beam describes itself without throwing", () => {
  const combatant = mixed();
  combatant.pieces = [];
  const described = describeAmmo(combatant);
  assert.equal(described.babor.mixed, false);
  assert.equal(described.estribor.id, null);
});

/* ---------------------------------------------------------------- it is a real round */

test("S65: chain shot chosen in a fight is what the next volley fires", () => {
  const combatant = mixed();
  setBroadsideAmmo(combatant, "cadena");
  for (const p of combatant.pieces) p.reloadTimer = 0;
  let state = 99;
  const rnd = () => {
    state = (Math.imul(state ^ (state >>> 15), state | 1) + 0x6d2b79f5) >>> 0;
    return ((state ^ (state >>> 13)) >>> 0) / 4294967296;
  };
  const { volley } = fireVolley(combatant, "estribor", 100, rnd);
  assert.ok(volley.length > 0, "the beam should fire");
  for (const shot of volley) {
    // The minions fire the chain shot that was just chosen; the swivel cannot, so she
    // fires what she can carry. No gun ever fires a round it does not declare.
    if (shot.pieceId === "minion") assert.equal(shot.ammoId, "cadena", `${shot.pieceId} fired ${shot.ammoId}`);
    assert.ok(pieceById(shot.pieceId).ammo.includes(shot.ammoId), `${shot.pieceId} fired ${shot.ammoId}`);
  }
});

test("S65: a switched gun keeps firing the round it can carry, not the chosen one", () => {
  const combatant = mixed();
  setBroadsideAmmo(combatant, "cadena");
  for (const p of combatant.pieces) p.reloadTimer = 0;
  let state = 5;
  const rnd = () => {
    state = (Math.imul(state ^ (state >>> 15), state | 1) + 0x6d2b79f5) >>> 0;
    return ((state ^ (state >>> 13)) >>> 0) / 4294967296;
  };
  const { volley } = fireVolley(combatant, "babor", 100, rnd);
  const big = volley.filter((shot) => shot.pieceId === "medio-canon-32");
  assert.ok(big.length > 0, "the 32-pounder should be in the volley");
  for (const shot of big) {
    assert.equal(shot.ammoId, "bala-hierro", "she can only fire iron");
    assert.ok(pieceById("medio-canon-32").ammo.includes(shot.ammoId));
  }
});

test("S65: the switch is bounded by what each piece declares", () => {
  // Whatever the player presses, no gun ever ends up holding a round it cannot fire.
  const combatant = mixed();
  for (const ammoId of ["bala-hierro", "cadena", "metralla", "bala-piedra"]) {
    setBroadsideAmmo(combatant, ammoId);
    for (const piece of combatant.pieces) {
      assert.ok(
        pieceById(piece.pieceId).ammo.includes(piece.ammoId),
        `${piece.pieceId} ended up with ${piece.ammoId}, which it cannot fire`,
      );
    }
  }
});

test("S65: the switch does not cost gold or ammunition", () => {
  const combatant = mixed();
  const rounds = combatant.pieces.map((p) => p.shotsLeft);
  setBroadsideAmmo(combatant, "cadena");
  assert.deepEqual(combatant.pieces.map((p) => p.shotsLeft), rounds);
});

test("S65: AMMO_SWITCH names the three rounds the keys cycle", () => {
  assert.deepEqual(AMMO_SWITCH, ["bala-hierro", "cadena", "metralla"]);
});
