/**
 * S174: the repair button also makes the hull seaworthy.
 *
 * The player asked for it (verbatim): "en el boton de reparar, añadamos tambien la dotacion
 * minima si no la tenemos y en carga, suministro para 25 dias y la carga necesaria". Her
 * decisions (verbatim): the minimum is "el minimo del astillero" (`crewMin` mariners,
 * 2 gunners, 10 soldiers — what `minimumShipPrice` already treats as a seaworthy hull),
 * "la carga necesaria" is ballast to stop her floating too high (the `light-load` warning),
 * and everything "se suma al precio".
 *
 * The three things the button tops up are exactly the three the shipyard already complains
 * about: `crew-below-minimum` is an error, `light-load` is a warning, and provisions run out
 * on their own. This module answers what is missing and what it costs; the screens only
 * render it and apply it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SEAWORTHY,
  seaworthyPlan,
  applySeaworthy,
  seaworthyCost,
} from "../src/model/seaworthy.js";
import { crewHirePrice, provisionsPrice, ballastPrice } from "../src/model/economy.js";
import { computeBudget } from "../src/model/ship-model.js";
import { hullById } from "../src/data/naval-data.js";
import { TURNING } from "../src/model/turning.js";

const hull = hullById("galeon-pequeno");

/** A sound hull of that class, with whatever overrides the case needs. */
const ship = (over = {}) => ({
  id: "s1",
  name: "Perla",
  hullId: hull.id,
  paidGold: 10000,
  capacityKg: hull.displacementKg - hull.lightMassKg,
  batteries: [],
  crew: { marino: 25, artillero: 4, soldado: 6 },
  crewAlive: { marino: 25, artillero: 4, soldado: 6 },
  days: 45,
  cargoKg: 0,
  ballastKg: 0,
  equipmentKg: 0,
  reserveKg: 0,
  condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
  ...over,
});

test("S174: the supply target is 25 days, and a hull with more keeps hers", () => {
  assert.equal(SEAWORTHY.supplyDays, 25);
  // 45 days is more than the target: nothing to buy.
  assert.equal(seaworthyPlan(ship()).days, 0, "a hull with more than 25 days buys none");
  // 10 days is short: she is topped up to the target, not by a fixed amount.
  assert.equal(seaworthyPlan(ship({ days: 10 })).days, 15);
  // No provisions at all is the same case.
  assert.equal(seaworthyPlan(ship({ days: 0 })).days, 25);
});

test("S174: the minimum crew is the shipyard's, role by role", () => {
  const short = ship({ crew: { marino: 5, artillero: 0, soldado: 0 }, crewAlive: { marino: 5 } });
  const plan = seaworthyPlan(short);
  // The shipyard's own minimum: mariners to `crewMin`, 2 gunners, 10 soldiers.
  assert.equal(plan.crew.marino, hull.crewMin - 5);
  assert.equal(plan.crew.artillero, 2);
  assert.equal(plan.crew.soldado, 10);
  // A role already at or above the minimum buys nobody.
  const staffed = ship({ crew: { marino: 40, artillero: 9, soldado: 30 } });
  assert.deepEqual(seaworthyPlan(staffed).crew, { marino: 0, artillero: 0, soldado: 0 });
});

test("S174: a hull that already meets the minimum needs no crew, and pays nothing", () => {
  // `galeon-pequeno` asks for 25 mariners, and this hull has 25 mariners, 4 gunners and 6
  // soldiers — but 6 is under the 10 the shipyard's minimum wants.
  const plan = seaworthyPlan(ship());
  assert.equal(plan.crew.marino, 0);
  assert.equal(plan.crew.artillero, 0);
  assert.equal(plan.crew.soldado, 4, "six soldiers is under the minimum of ten");
});

test("S174: ballast fills the hull up to where she stops floating high", () => {
  // An empty hull floats high: the rudder barely bites (S110). The ballast she needs is
  // exactly what takes her to the shipyard's own `light-load` threshold, no more.
  const light = ship({ days: 0, crew: { marino: 0 }, crewAlive: {} });
  const plan = seaworthyPlan(light);
  assert.ok(plan.ballastKg > 0, "an empty hull must need ballast");

  // With the plan applied she is at the threshold: the warning is gone, and she is not
  // over-ballasted past it.
  const after = applySeaworthy(light, plan);
  const budget = computeBudget({
    hull,
    batteries: after.batteries,
    crew: after.crew,
    days: after.days,
    cargoKg: after.cargoKg,
    ballastKg: after.ballastKg,
    equipmentKg: after.equipmentKg,
    reserveKg: after.reserveKg,
  });
  assert.ok(
    budget.loadFraction >= TURNING.lightLoadThreshold - 1e-9,
    `she still floats high: ${budget.loadFraction} < ${TURNING.lightLoadThreshold}`,
  );
  assert.ok(
    budget.loadFraction < TURNING.lightLoadThreshold + 0.01,
    `she was over-ballasted: ${budget.loadFraction}`,
  );
});

test("S174: a hull already heavy enough buys no ballast", () => {
  // A hull loaded with cargo is well above the threshold: nothing to add.
  const loaded = ship({ cargoKg: 40000 });
  assert.equal(seaworthyPlan(loaded).ballastKg, 0);
});

test("S174: ballast never eats the room the hold needs", () => {
  // A hull whose hold is already full cannot take ballast without pushing cargo out, and
  // the plan must not make her invalid: it stops at what still fits.
  const full = ship({ cargoKg: 60_000, days: 0 });
  const plan = seaworthyPlan(full);
  const after = applySeaworthy(full, plan);
  const budget = computeBudget({
    hull,
    batteries: after.batteries,
    crew: after.crew,
    days: after.days,
    cargoKg: after.cargoKg,
    ballastKg: after.ballastKg,
    equipmentKg: after.equipmentKg,
    reserveKg: after.reserveKg,
  });
  assert.ok(budget.cargoMaxKg >= 0, `the plan overfilled the hull: ${budget.cargoMaxKg}`);
});

test("S174: the price is the sum of what is bought, with the shipyard's own prices", () => {
  const short = ship({ crew: { marino: 5, artillero: 0, soldado: 0 }, crewAlive: { marino: 5 }, days: 10 });
  const plan = seaworthyPlan(short);
  const expected =
    crewHirePrice(plan.crew) +
    provisionsPrice(plan.people, plan.days) +
    ballastPrice(plan.ballastKg);
  assert.equal(plan.cost, Math.ceil(expected - 1e-9));
  assert.equal(seaworthyCost(short), plan.cost);
});

test("S174: a seaworthy hull costs nothing, so the button is just a repair", () => {
  const ready = ship({ crew: { marino: 30, artillero: 5, soldado: 15 }, days: 30, cargoKg: 40000 });
  const plan = seaworthyPlan(ready);
  assert.equal(plan.cost, 0, `a seaworthy hull must cost nothing, got ${plan.cost}`);
  assert.deepEqual(plan.crew, { marino: 0, artillero: 0, soldado: 0 });
  assert.equal(plan.days, 0);
  assert.equal(plan.ballastKg, 0);
});

test("S174: applying the plan buys exactly what it quoted, and nothing else", () => {
  const short = ship({ crew: { marino: 5, artillero: 0, soldado: 0 }, crewAlive: { marino: 5 }, days: 10 });
  const plan = seaworthyPlan(short);
  const after = applySeaworthy(short, plan);

  assert.equal(after.crew.marino, hull.crewMin, "the mariners must reach the minimum");
  assert.equal(after.crew.artillero, 2);
  assert.equal(after.crew.soldado, 10);
  assert.equal(after.crewAlive.marino, hull.crewMin, "the living crew is the bought one");
  assert.equal(after.days, 25, "the supply must reach the target");
  assert.ok(after.ballastKg > 0);

  // Everything the plan did not touch is exactly as it was.
  assert.equal(after.hullId, short.hullId);
  assert.equal(after.paidGold, short.paidGold);
  assert.equal(after.cargoKg, short.cargoKg);
  assert.deepEqual(after.condition, short.condition);
});

test("S174: a role above the minimum is never cut down to it", () => {
  // The button tops up; it never takes a man off a hull that carries more than the minimum.
  const generous = ship({ crew: { marino: 80, artillero: 12, soldado: 40 }, days: 60, cargoKg: 50000 });
  const after = applySeaworthy(generous, seaworthyPlan(generous));
  assert.equal(after.crew.marino, 80);
  assert.equal(after.crew.artillero, 12);
  assert.equal(after.crew.soldado, 40);
  assert.equal(after.days, 60);
});

test("S174: junk never throws and never invents a purchase", () => {
  for (const bad of [null, undefined, {}, { hullId: "no-such-hull" }]) {
    const plan = seaworthyPlan(bad);
    assert.equal(plan.cost, 0, `junk must cost nothing: ${JSON.stringify(bad)}`);
  }
});
