import test from "node:test";
import assert from "node:assert/strict";
import { PIECES, hullById, pieceById } from "../src/data/naval-data.js";
import { validateShip } from "../src/model/ship-model.js";
import { GUNNERY, crewedPieces, gunnersRequired, reloadBonus } from "../src/model/gunnery.js";
import { COMBAT, applyDamage, createEnemyCombatant, createPlayerCombatant, firingPieces, fireBroadside, loadedShare, readyDamage, reloadFactor, sideCapacity, sidePieces } from "../src/model/combat.js";
import { applySettings, fromDisplay, resetSettings, SETTINGS_DEFAULTS, SETTINGS_FIELDS } from "../src/model/settings.js";

const gun = (side, pieceId = "minion") => ({ side, pieceId, ammoId: "bala-hierro", reloadTimer: 0, shotsLeft: 10 });
const combatant = (gunners = 2) => ({
  pieces: [gun("babor"), gun("babor"), gun("babor"), gun("estribor"), gun("estribor"), gun("estribor"), gun("swivel", "verso")],
  crew: { artillero: gunners, marino: 100, soldado: 100 }, initialCrew: 202, crewMin: 1,
  condition: { hull: 100, rigging: 100, crew: 100, morale: 100 }, hullToughness: 1, crewDamagePool: 0, status: "fighting",
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("S53: every piece has the shipped crewing requirement and bonus cap", () => {
  assert.equal(GUNNERY.maxBonus, 1.3);
  assert.deepEqual(Object.keys(GUNNERY.gunnersPerGun).sort(), PIECES.map(p => p.id).sort());
  for (const piece of PIECES) assert.equal(GUNNERY.gunnersPerGun[piece.id], 0.5);
});

test("S53: crewing interleaves port, starboard and swivels with exact, short and extra crews", () => {
  const c = combatant();
  assert.deepEqual(crewedPieces(c.pieces, 2).map(p => p.side), ["babor", "estribor", "swivel", "babor"]);
  assert.equal(crewedPieces(c.pieces, 3.5).length, 7);
  assert.equal(crewedPieces(c.pieces, 20).length, 7);
  assert.deepEqual(crewedPieces(c.pieces, 0), []);
  assert.equal(gunnersRequired(c.pieces), 3.5);
});

test("S53: per-type requirements are spent and cheaper guns can use the remainder", () => {
  try {
    GUNNERY.gunnersPerGun.minion = 1.5;
    GUNNERY.gunnersPerGun.verso = 0.5;
    const pieces = [gun("babor"), gun("babor"), gun("estribor"), gun("swivel", "verso")];
    assert.deepEqual(crewedPieces(pieces, 2).map(p => p.side), ["babor", "swivel"]);
    assert.equal(gunnersRequired(pieces), 5);
  } finally { resetSettings(); }
});

test("S53/S56: the bonus is measured against the crewed battery, with a cap", () => {
  const c = combatant(3.5);
  for (const p of c.pieces) p.reloadTimer = 1;
  close(reloadFactor(c), 1);
  // One clock running or none makes no difference: the denominator is the battery (S56).
  c.pieces.forEach(p => { p.reloadTimer = 0; });
  c.pieces[0].reloadTimer = 1;
  close(reloadFactor(c), 1);
  close(reloadBonus([c.pieces[0]], 3.5), 1.3);
  close(reloadBonus(c.pieces, 4), 4 / 3.5);
  c.crew.artillero = 0;
  assert.equal(firingPieces(c, "babor", 100).length, 0);
  assert.equal(sidePieces(c, "babor").length, 0);
  assert.equal(readyDamage(c, "babor", 100), 0);
  assert.equal(sideCapacity(c, "babor", 100), 0);
  assert.equal(loadedShare(c, "babor"), 0);
});

test("S53/S56: one firing side does not earn a faster reload; clocks already running are untouched", () => {
  const c = combatant(3.5);
  const first = fireBroadside(c, "babor", 100, () => 0);
  assert.equal(first.volley.length, 4);
  // 3.5 gunners for a 3.5-gunner battery: no acceleration, whichever side fires (S56).
  for (const p of c.pieces.filter(p => p.reloadTimer > 0)) close(p.reloadTimer, pieceById(p.pieceId).reloadS / COMBAT.timeScale);
  const before = c.pieces[0].reloadTimer;
  const second = fireBroadside(c, "estribor", 100, () => 0);
  assert.equal(second.volley.length, 3);
  for (const p of c.pieces.filter(p => p.side === "estribor")) close(p.reloadTimer, pieceById(p.pieceId).reloadS / COMBAT.timeScale);
  assert.equal(c.pieces[0].reloadTimer, before);
});

test("S53: shortage removes guns from firing, damage and bars; casualties remove more", () => {
  const c = combatant(2);
  const available = sidePieces(c, "babor");
  assert.equal(available.length, 3);
  assert.equal(firingPieces(c, "babor", 100).length, 3);
  const ready = readyDamage(c, "babor", 100);
  close(ready, sideCapacity(c, "babor", 100));
  const full = combatant(4);
  assert.ok(ready < readyDamage(full, "babor", 100));
  const volley = fireBroadside(c, "babor", 100, () => 0).volley;
  assert.equal(volley.length, 3);
  assert.equal(loadedShare(c, "babor"), 0);
  close(sideCapacity(c, "babor", 100), ready);
  const before = sidePieces(c, "babor").length;
  applyDamage(c, { hull: 0, rigging: 0, crew: COMBAT.casualtyPoints * 2 });
  assert.ok(c.crew.artillero < 2);
  assert.ok(sidePieces(c, "babor").length < before);
});

test("S53/S56: enemy and player combatants use the same reload rule", () => {
  const enemy = createEnemyCombatant({ id: 8, hullId: "patache", zoneId: "costera" }, { id: "costera" }, 42);
  enemy.pieces.forEach(p => { p.reloadTimer = 0; });
  const volley = fireBroadside(enemy, "babor", 10, () => 0).volley;
  assert.ok(volley.length > 0);
  // A coastal corsair sails with its just complement, so it earns no bonus (S56).
  for (const p of enemy.pieces.filter(p => p.reloadTimer > 0)) close(p.reloadTimer, pieceById(p.pieceId).reloadS / COMBAT.timeScale);
  const player = createPlayerCombatant({ hullId: "patache", crew: { artillero: 1 }, batteries: [{ pieceId: "minion", side: "babor", qty: 2, shotsPerPiece: 4, ammoId: "bala-hierro" }] });
  assert.equal(firingPieces(player, "babor", 10).length, 2);
});

test("S53: the shipyard warning uses the live per-type requirement", () => {
  const input = { hull: hullById("galeon-pequeno"), batteries: [{ pieceId: "minion", qty: 4, side: "babor", shotsPerPiece: 10 }], crew: { marino: 34, artillero: 2, soldado: 10 }, days: 30 };
  const warning = () => validateShip(input).warnings.find(w => w.code.startsWith("under-gunned-crew"));
  try {
    assert.equal(warning(), undefined);
    applySettings({ "combat.gunners-minion": 1 });
    assert.equal(warning().params.needed, 4);
    assert.equal(warning().params.have, 2);
    resetSettings();
    assert.equal(warning(), undefined);
  } finally { resetSettings(); }
});

test("S33/S53: settings clamp, fall back and reset every gunnery field", () => {
  try {
    const entries = PIECES.map(p => [`combat.gunners-${p.id}`, 9]);
    let applied = applySettings({ "combat.maxBonus": 9, ...Object.fromEntries(entries) });
    assert.equal(applied["combat.maxBonus"], 3);
    assert.equal(GUNNERY.maxBonus, 3);
    for (const p of PIECES) assert.equal(GUNNERY.gunnersPerGun[p.id], 4);
    applied = applySettings({ "combat.maxBonus": -2, ...Object.fromEntries(entries.map(([id]) => [id, -2])) });
    assert.equal(applied["combat.maxBonus"], 1);
    for (const p of PIECES) assert.equal(GUNNERY.gunnersPerGun[p.id], 0.1);
    applied = applySettings({ "combat.maxBonus": "broken", ...Object.fromEntries(entries.map(([id]) => [id, null])) });
    assert.equal(applied["combat.maxBonus"], 1.3);
    for (const p of PIECES) assert.equal(GUNNERY.gunnersPerGun[p.id], 0.5);
    for (const field of SETTINGS_FIELDS.filter(f => f.target === "gunnery" || f.target === "gunners")) {
      assert.equal(fromDisplay(field, ""), SETTINGS_DEFAULTS[`combat.${field.key}`]);
    }
    applySettings({ "combat.maxBonus": 2, "combat.gunners-minion": 2 });
    resetSettings();
    assert.equal(GUNNERY.maxBonus, SETTINGS_DEFAULTS["combat.maxBonus"]);
    assert.equal(GUNNERY.gunnersPerGun.minion, 0.5);
  } finally { resetSettings(); }
});

/* S56 — the bonus is measured against the whole crewed battery, not the guns reloading now. */

test("S56: firing one side does not hand the whole battery's gunners to that side", () => {
  // Six guns, three per side, crewed with exactly what they ask (0.5 each = 3).
  const c = combatant(3);
  c.pieces.forEach(p => { p.reloadTimer = 0; });
  fireBroadside(c, "babor", 100, () => 0);
  const reloading = c.pieces.filter(p => p.reloadTimer > 0);
  assert.equal(reloading.length, 4, "the port guns plus the swivel that answers for it");
  // Exactly the gunners the battery asks: no acceleration, whichever side fired.
  close(reloadFactor(c), 1);
  for (const p of reloading) close(p.reloadTimer, pieceById(p.pieceId).reloadS / COMBAT.timeScale);
});

test("S56: spare gunners still accelerate, up to the configured cap", () => {
  const c = combatant(7);
  c.pieces.forEach(p => { p.reloadTimer = 0; });
  fireBroadside(c, "babor", 100, () => 0);
  close(reloadFactor(c), 1 / 1.3);
  const plenty = combatant(21);
  close(reloadFactor(plenty), 1 / GUNNERY.maxBonus);
});

test("S56: the denominator never exceeds the crewed battery, so a lean crew is never rewarded", () => {
  // Two gunners for seven guns: only the crewed guns count, and they ask for 2.
  const c = combatant(2);
  c.pieces.forEach(p => { p.reloadTimer = 0; });
  fireBroadside(c, "babor", 100, () => 0);
  close(reloadFactor(c), 1);
});

test("S56: an enemy with its just complement no longer reloads faster for firing one side", () => {
  const enemy = createEnemyCombatant({ id: 8, hullId: "patache", zoneId: "abierto" }, { id: "abierto" }, 42);
  enemy.pieces.forEach(p => { p.reloadTimer = 0; });
  const { volley } = fireBroadside(enemy, "babor", 100, () => 0);
  assert.ok(volley.length > 0);
  close(reloadFactor(enemy), 1);
  for (const p of enemy.pieces.filter(p => p.reloadTimer > 0)) {
    close(p.reloadTimer, pieceById(p.pieceId).reloadS / COMBAT.timeScale);
  }
});
