/**
 * S176: a hold never takes more than it can carry.
 *
 * The player reported it (verbatim): "creo que las mercancias encontradas se descontrolan,
 * porque llego al astillero con mercancia por valor de 13 millones de doblones, chequea que
 * no hay algun bugs". Her hunch was right: the merchandise was accumulating.
 *
 * The bug is in `awardHold`. A prize arrives as several lines of goods, and the room was
 * measured once, before the loop, so every line was compared against the space the hold had
 * when the loop began instead of the space left. Three lines of loot fitted three times.
 *
 * Measured before the fix: a 40,000 kg hold took 40,140 kg from three lines, and a hold of
 * 20,000 took 57,600 from the same three. The weight limit had stopped being a limit, which
 * is why a hold could come home worth millions: a rich line of diamonds weighs almost
 * nothing, so nothing stopped it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { awardHold, holdOf, shipHold } from "../src/model/commerce.js";
import { commodityById } from "../src/data/naval-data.js";

/** A hull with a hold and no cargo. */
const ship = (capacityKg) => ({ id: "s1", capacityKg, cargoKg: 0, manifest: [] });

/** A prize of several lines, as `enemyHoldFor` builds one. */
const prize = (lines) => ({ manifest: lines });

test("S176: three lines of loot never exceed the hold", () => {
  const hull = ship(40000);
  const awarded = awardHold(hull, prize([
    { commodityId: "maderas", units: 60 },    // 60 × 640 = 38,400 kg
    { commodityId: "seda", units: 60 },       // 60 ×  25 =  1,500 kg
    { commodityId: "diamantes", units: 60 },  // 60 ×   4 =    240 kg
  ]));
  assert.ok(
    awarded.ship.cargoKg <= 40000,
    `the hold overflowed: ${awarded.ship.cargoKg} kg in a 40,000 kg hold`,
  );
});

test("S176: the room left is measured after every line, not once", () => {
  // The first line fills the hold; the second and third must be refused almost entirely.
  const hull = ship(40000);
  const awarded = awardHold(hull, prize([
    { commodityId: "maderas", units: 60 },   // 38,400 kg: fits
    { commodityId: "seda", units: 60 },      // 1,500 kg: only 1,600 left
    { commodityId: "diamantes", units: 60 }, // 240 kg: whatever is still free
  ]));
  assert.ok(awarded.ship.cargoKg <= 40000, `overflow: ${awarded.ship.cargoKg}`);
  // And what did not fit is reported as left in the water, not silently dropped.
  assert.ok(awarded.leftKg > 0, "the cargo that did not fit must be reported as left");
  const aboard = awarded.ship.manifest.reduce((sum, entry) => sum + entry.units * commodityById(entry.commodityId).kgPerUnit, 0);
  const left = awarded.left.manifest.reduce((sum, entry) => sum + entry.units * commodityById(entry.commodityId).kgPerUnit, 0);
  assert.equal(aboard + left, 38_400 + 1_500 + 240, "every kg must be aboard or reported left");
});

test("S176: an empty hold takes the whole prize when it fits", () => {
  // The rule must not become "refuse everything": a prize that fits is taken whole.
  const hull = ship(100000);
  const awarded = awardHold(hull, prize([
    { commodityId: "tabaco", units: 20 },   // 3,200 kg
    { commodityId: "cobre", units: 10 },    // 1,500 kg
  ]));
  assert.equal(awarded.ship.cargoKg, 4_700);
  assert.equal(awarded.leftKg, 0, "a prize that fits must leave nothing behind");
});

test("S176: a hold already loaded only takes what is still free", () => {
  const loaded = { id: "s1", capacityKg: 40000, cargoKg: 39000, manifest: [{ commodityId: "sal", units: 121 }] };
  const awarded = awardHold(loaded, prize([{ commodityId: "vino", units: 100 }])); // 28,000 kg wanted
  assert.ok(awarded.ship.cargoKg <= 40000, `overflow on a loaded hold: ${awarded.ship.cargoKg}`);
  assert.ok(awarded.leftKg > 0, "what does not fit must be reported");
});

test("S176: a prize of one line still respects the hold", () => {
  const awarded = awardHold(ship(1000), prize([{ commodityId: "maderas", units: 10 }])); // 6,400 kg wanted
  assert.ok(awarded.ship.cargoKg <= 1000, `overflow: ${awarded.ship.cargoKg}`);
  assert.equal(awarded.ship.manifest[0].units, 1, "only one load of timber fits in a tonne");
});

test("S176: the same commodity in two lines is one line, and still fits", () => {
  // A prize may name a good twice; the hold must not treat it as two separate rooms.
  const awarded = awardHold(ship(1000), prize([
    { commodityId: "sal", units: 2 },  // 640 kg
    { commodityId: "sal", units: 2 },  // another 640 kg: only 360 free
  ]));
  assert.ok(awarded.ship.cargoKg <= 1000, `overflow: ${awarded.ship.cargoKg}`);
  const units = awarded.ship.manifest.filter((e) => e.commodityId === "sal").reduce((s, e) => s + e.units, 0);
  assert.equal(units, 3, "three barrels of salt fit in a tonne, and the fourth does not");
});
