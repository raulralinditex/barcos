import test from "node:test";
import assert from "node:assert/strict";
import {
  OARS,
  effortStep,
  oarSpeedKn,
  oarTurnFactor,
  oarsAboard,
  banksFor,
  hasOarBanks,
  loadPenalty,
  rowingTarget,
  speedUnderOars,
} from "../src/model/oars.js";

/**
 * S159: the oars as a reserve propulsion, not an extra engine.
 *
 * The player asked for it (verbatim): "los remeros los vamos a introducir en la velocidad",
 * with the accepted formula `I_total = max(I_velas, I_remos) − I_penalización carga y fatiga`,
 * and three precisions: "remos automaticos, tambien influyen en la maniobrabilidad, los cascos
 * que no tienen remos no aparecen en la interface esa posibilidad".
 */

/** A hull with banks of oars: the galleass, documented as 300 rowers. */
const galleass = { id: "galeaza", oarBanks: 300, oarMaxKn: 7 };

test("S159-G: only a hull that declares banks of oars carries rowers", () => {
  assert.equal(hasOarBanks(galleass), true);
  assert.equal(hasOarBanks({ id: "galeon-pequeno" }), false);
  assert.equal(hasOarBanks(null), false);
  // A hull that declares no banks, or a broken number, is not an oared hull.
  for (const broken of [{ oarBanks: 0 }, { oarBanks: -3 }, { oarBanks: "muchos" }, { oarBanks: null }]) {
    assert.equal(hasOarBanks({ id: "x", oarMaxKn: 7, ...broken }), false);
  }
  assert.equal(banksFor(galleass), 300);
  assert.equal(banksFor({ id: "x" }), 0);
});

test("S159-G: a hull without banks never makes way under oars, whatever crew it has", () => {
  const galleon = { id: "galeon-pequeno" };
  // The player's rule: where there are no banks, there is no oar propulsion at all.
  assert.equal(oarSpeedKn(galleon, { remero: 300 }, { effort: 1 }), 0);
  assert.equal(oarSpeedKn(galleon, { remero: 300 }, { effort: 1, loadFraction: 0 }), 0);
});

test("S159-A: a hull makes way under oars only while it has rowers aboard", () => {
  // The banks are the ceiling; the men aboard are what actually pulls.
  assert.equal(oarSpeedKn(galleass, { remero: 0 }, { effort: 1 }), 0);
  assert.equal(oarSpeedKn(galleass, {}, { effort: 1 }), 0);
  // 150 of 300 banks: half the pull, not the full speed.
  const half = oarSpeedKn(galleass, { remero: 150 }, { effort: 1 });
  const full = oarSpeedKn(galleass, { remero: 300 }, { effort: 1 });
  assert.ok(half > 0 && half < full, `half the rowers must pull less (${half} vs ${full})`);
  assert.ok(Math.abs(full - galleass.oarMaxKn) < 1e-9, "a full bank at full effort is the hull's own oar speed");
});

test("S159-D: the effort curve reproduces the player's table", () => {
  const crew = { remero: 300 };
  const at = (effort) => oarSpeedKn(galleass, crew, { effort, loadFraction: 0 });
  // The player's table (verbatim): sprint 7 kn, cruise 5-6, sustained 3-4, formation 2.
  assert.ok(Math.abs(at(1) - 7) < 0.01, `sprint must be the hull's oar speed, got ${at(1)}`);
  assert.ok(at(0.75) >= 5 && at(0.75) <= 6, `cruise must land in 5-6 kn, got ${at(0.75)}`);
  assert.ok(at(0.5) >= 3 && at(0.5) <= 4, `sustained must land in 3-4 kn, got ${at(0.5)}`);
  assert.ok(at(0.3) >= 2 && at(0.3) <= 2.2, `formation must land near 2 kn, got ${at(0.3)}`);
});

test("S159-C: a loaded hull rows worse, and a light one rows whole", () => {
  const crew = { remero: 300 };
  const light = oarSpeedKn(galleass, crew, { effort: 1, loadFraction: 0.2 });
  const half = oarSpeedKn(galleass, crew, { effort: 1, loadFraction: 0.5 });
  const laden = oarSpeedKn(galleass, crew, { effort: 1, loadFraction: 1 });

  assert.equal(loadPenalty(0.2), 1, "up to half load the oars are not punished");
  assert.equal(loadPenalty(0.5), 1);
  assert.ok(loadPenalty(1) < 0.5, `a hull loaded to the brim rows at less than half, got ${loadPenalty(1)}`);
  assert.equal(light, half, "half load rows exactly as a light hull");
  assert.ok(laden < half, "a loaded hull must row worse");
  // A broken load fraction is treated as light, so a save with no record rows as it did.
  for (const broken of [undefined, null, NaN, "mucho"]) {
    assert.equal(loadPenalty(broken), 1);
  }
});

test("S159-A: the sea takes the greater of sail and oars, never their sum", () => {
  // The player's rule: "un barco no obtiene la suma de ambas velocidades".
  const wind = { speedFactor: 1.6 };
  assert.equal(speedUnderOars(10, 7), 10, "a strong following wind leaves the oars with nothing to add");
  assert.equal(speedUnderOars(4, 7), 7, "a head wind is what the oars are for");
  assert.equal(speedUnderOars(7, 7), 7);
  // Never the sum, whatever the inputs.
  assert.ok(speedUnderOars(10, 7) < 17, "sail and oars must not add up");
  // Broken inputs never invent way.
  assert.equal(speedUnderOars(NaN, 7), 7);
  assert.equal(speedUnderOars(5, NaN), 5);
  assert.equal(speedUnderOars(undefined, undefined), 0);
});

test("S159-D: effort is spent by rowing and recovered by resting", () => {
  const spent = effortStep(1, { rowing: true, dt: OARS.sprintS });
  assert.ok(Math.abs(spent - 0.5) < 1e-6, `a full sprint of ${OARS.sprintS}s must halve the effort, got ${spent}`);

  const rested = effortStep(0.5, { rowing: false, dt: OARS.recoverS });
  assert.ok(Math.abs(rested - 1) < 1e-6, `a full rest of ${OARS.recoverS}s must restore it, got ${rested}`);

  // It never goes out of its range, and a broken value starts fresh.
  assert.equal(effortStep(1, { rowing: true, dt: 1e6 }), 0);
  assert.equal(effortStep(0, { rowing: false, dt: 1e6 }), 1);
  assert.equal(effortStep(NaN, { rowing: false, dt: 1 }), 1);
  // A broken step changes nothing.
  assert.equal(effortStep(0.7, { rowing: true, dt: 0 }), 0.7);
});

test("S159-E: whether the oars are pulling is decided by the sea, not by a key", () => {
  // Automatic: the oars are in use exactly while they are the faster way to move.
  assert.equal(rowingTarget({ sailKn: 4, oarKn: 7 }), true, "a head wind must put the oars to work");
  assert.equal(rowingTarget({ sailKn: 12, oarKn: 7 }), false, "a strong wind must let the oars rest");
  // A hull with no oars never rows, so it never spends effort.
  assert.equal(rowingTarget({ sailKn: 1, oarKn: 0 }), false);
});

test("S159-F: oars help the helm, in proportion to the effort", () => {
  const fresh = oarTurnFactor({ effort: 1, rowing: true });
  const tired = oarTurnFactor({ effort: 0.4, rowing: true });
  const resting = oarTurnFactor({ effort: 1, rowing: false });

  assert.equal(resting, 1, "a hull that is not rowing turns exactly as it did");
  assert.ok(fresh > 1, "rowing must help the helm");
  assert.ok(fresh <= 1 + OARS.turnBonus + 1e-9, "the bonus has a declared ceiling");
  assert.ok(tired > 1 && tired < fresh, "a tired crew helps less");
  // A hull without oars, or a broken record, is not helped at all.
  assert.equal(oarTurnFactor(null), 1);
  assert.equal(oarTurnFactor({ effort: NaN, rowing: true }), 1);
});

test("S159-G: the rowers aboard are read from the crew, never invented", () => {
  assert.equal(oarsAboard({ remero: 120 }), 120);
  assert.equal(oarsAboard({}), 0);
  assert.equal(oarsAboard(null), 0);
  // A broken count is no rowers, and a fractional one is a whole man.
  assert.equal(oarsAboard({ remero: "muchos" }), 0);
  assert.equal(oarsAboard({ remero: -5 }), 0);
  assert.equal(oarsAboard({ remero: 12.7 }), 12);
});

/* ------------------------------------------------- the sea obeys the same rule (S159) */

import { createWorld, deserializeWorld, normaliseEffort, serializeWorld, stepHull } from "../src/model/world.js";

test("S159-A: the hull makes way at the greater of sail and oars, never the sum", () => {
  const base = { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: 10 };
  // No wind, no oars: exactly the speed she always had.
  const plain = stepHull({ ...base }, { throttle: 1, wind: null }, 10);
  assert.ok(Math.abs(plain.currentSpeedKn - 10) < 1e-9);

  // A strong head wind holds her back...
  const head = { direction: Math.PI, strengthKn: 22 };
  const held = stepHull({ ...base }, { throttle: 1, wind: head }, 10);
  assert.ok(held.currentSpeedKn < 10, "a head wind must slow her");

  // ...and her oars are what saves her, without being added on top.
  const rowed = stepHull({ ...base }, { throttle: 1, wind: head, oars: { speedKn: 7 } }, 10);
  assert.ok(rowed.currentSpeedKn > held.currentSpeedKn, "the oars must beat the head wind");
  assert.ok(Math.abs(rowed.currentSpeedKn - 7) < 0.5, `the oars set the pace, got ${rowed.currentSpeedKn}`);

  // With a following wind the sail wins and the oars add nothing at all.
  const astern = { direction: 0, strengthKn: 22 };
  const sailed = stepHull({ ...base }, { throttle: 1, wind: astern, oars: { speedKn: 7 } }, 10);
  const sailedAlone = stepHull({ ...base }, { throttle: 1, wind: astern }, 10);
  assert.ok(Math.abs(sailed.currentSpeedKn - sailedAlone.currentSpeedKn) < 1e-9, "the oars must add nothing to a good wind");
});

test("S159-F: a crew at the oars sharpens the helm, and a resting one does not", () => {
  const base = { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: 10, turnFactor: 1 };
  const plain = stepHull({ ...base }, { turn: 1, throttle: 0, wind: null }, 1);
  const rowed = stepHull({ ...base }, { turn: 1, throttle: 0, wind: null, oars: { speedKn: 7, effort: 1, rowing: true } }, 1);
  assert.ok(rowed.heading > plain.heading, "the oars must turn her faster");
  // A hull that is not rowing keeps exactly the helm she had.
  const resting = stepHull({ ...base }, { turn: 1, throttle: 0, wind: null, oars: { speedKn: 0, effort: 1, rowing: false } }, 1);
  assert.ok(Math.abs(resting.heading - plain.heading) < 1e-12);
});

test("S159-I: a hull with no oars sails exactly as it did before the rule existed", () => {
  const base = { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: 10 };
  const head = { direction: Math.PI, strengthKn: 15 };
  const before = stepHull({ ...base }, { throttle: 1, wind: head }, 10);
  const withRecord = stepHull({ ...base }, { throttle: 1, wind: head, oars: { speedKn: 0, effort: 0.2, rowing: false } }, 10);
  assert.ok(Math.abs(before.currentSpeedKn - withRecord.currentSpeedKn) < 1e-12);
  assert.ok(Math.abs(before.heading - withRecord.heading) < 1e-12);
});

test("S159-D: the crew's effort survives the autosave", () => {
  const world = createWorld(3, { speedKn: 6 }, 0);
  const tired = { ...world, oarEffort: { galeaza: 0.35, otra: 1 } };
  const back = deserializeWorld(serializeWorld(tired));
  assert.deepEqual(back.oarEffort, { galeaza: 0.35, otra: 1 });

  // A save written before the oars existed opens with rested crews.
  const old = JSON.parse(serializeWorld(world));
  delete old.oarEffort;
  assert.deepEqual(deserializeWorld(JSON.stringify(old)).oarEffort, {});
});

test("S159-D: a broken effort record reads as fresh, and never throws", () => {
  assert.deepEqual(normaliseEffort(null), {});
  assert.deepEqual(normaliseEffort("dos"), {});
  assert.deepEqual(normaliseEffort([1, 2]), {});
  // Out of range values are clamped, and broken ones dropped.
  assert.deepEqual(normaliseEffort({ a: 2, b: -1, c: "mucho", d: 0.5 }), { a: 1, b: 0, d: 0.5 });
});
