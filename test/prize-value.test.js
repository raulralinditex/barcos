/**
 * S177: a prize is worth gold, not weight.
 *
 * The player reported it (verbatim): "creo que las mercancias encontradas se descontrolan,
 * porque llego al astillero con mercancia por valor de 13 millones de doblones". Measured:
 * one prize in the abyss carrying 805 diamonds was worth 3.6 M doblones, and one with 1,411
 * was worth 6.3 M. A coastal prize of the same weight was worth 522.
 *
 * The cause was that `enemyHoldFor` aimed at a **weight**: 12 tonnes of whatever the dice
 * picked. Twelve tonnes of timber is 18 loads at 9 doblones; twelve tonnes of diamonds is
 * 3,000 stones at 1,400. The same prize was worth 522 or 13,440,000 by pure lottery, and
 * the weight limit was never a value limit.
 *
 * The rule now: a prize aims at a value, scaled by her hull and her water, and the goods
 * are only the form that value takes. A rich good arrives in small quantity because it is
 * worth more per kilo, which is both the fix and the realistic answer.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { enemyHoldFor, defeatedHold, HOLD_VALUE } from "../src/model/commerce.js";
import { COMMODITIES, commodityById, hullById } from "../src/data/naval-data.js";

/** What one hold would sell for in a zone, which is what the player actually gets. */
const valueOf = (hold, multiplier = 1.8) =>
  hold.manifest.reduce((sum, entry) => sum + entry.units * Math.round(commodityById(entry.commodityId).baseGold * multiplier), 0);

/** Every prize of a hull in a zone, for the whole id range a sea hands out. */
const prizes = (hullId, zoneId, count = 200) =>
  Array.from({ length: count }, (_, i) => enemyHoldFor({ id: i + 1, hullId, zoneId })).filter(Boolean);

test("S177: a prize of the same hull and water is worth a comparable amount, whatever she carries", () => {
  const all = prizes("galeon-guerra", "abierto");
  const values = all.map((hold) => valueOf(hold));
  const min = Math.min(...values);
  const max = Math.max(...values);
  // The lottery used to span 522 to millions. Now the spread is the declared band, not the
  // price of the good that happened to come up.
  assert.ok(min > 0, `a prize must be worth something, got ${min}`);
  // Measured band after the fix: 2.4x for a war galleon in open water. The old rule spanned
  // four orders of magnitude, so a factor of six is the assertion that the lottery is gone.
  assert.ok(
    max / min < 6,
    `the spread between the poorest and richest prize must stay narrow: ${min} to ${max}`,
  );
});

test("S177: no single prize is worth millions any more", () => {
  for (const hullId of ["patache", "galeon-pequeno", "galeon-guerra", "gran-galeon"]) {
    for (const zoneId of ["costera", "abierto", "abismo"]) {
      for (const hold of prizes(hullId, zoneId, 120)) {
        // The richest water, sold at its best multiplier. The prize is generated at the
        // good's base price and sold at the yard's, so the ceiling has to carry that
        // multiplier too; what matters is the order, not the exact rounding.
        const value = valueOf(hold, 3.2);
        const ceiling = HOLD_VALUE.prizeShareOfHull * (hullById(hullId)?.priceGold ?? 0) *
          (HOLD_VALUE.zoneFactor[zoneId] ?? 1) * HOLD_VALUE.maxSpread * 3.2 * 1.2;
        assert.ok(
          value <= ceiling,
          `${hullId} in ${zoneId} paid ${value}, over the declared ceiling ${Math.round(ceiling)}`,
        );
        // And the rule's own promise, independent of the ceiling arithmetic: no prize of any
        // hull or water reaches a million doblones any more.
        assert.ok(value < 1_000_000, `${hullId} in ${zoneId} paid ${value}`);
      }
    }
  }
});

test("S177: deeper water pays more, and the same seed pays the same", () => {
  const coastal = enemyHoldFor({ id: 7, hullId: "galeon-guerra", zoneId: "costera" });
  const abyss = enemyHoldFor({ id: 7, hullId: "galeon-guerra", zoneId: "abismo" });
  assert.ok(valueOf(abyss) > valueOf(coastal), "the abyss must pay better than the coast");
  // Deterministic: the same sail carries the same cargo, so a reload cannot reroll it.
  const again = enemyHoldFor({ id: 7, hullId: "galeon-guerra", zoneId: "abismo" });
  assert.deepEqual(again.manifest, abyss.manifest);
});

test("S177: a rich good arrives in small quantity, a cheap one in bulk", () => {
  // Over the whole catalogue, the units a good is carried in must fall as its price rises:
  // that is what keeps a prize's value flat while its manifest still looks like cargo.
  const unitsByPrice = COMMODITIES
    .map((commodity) => {
      let units = 0;
      for (const hold of prizes("galeon-guerra", "abierto", 200)) {
        units += hold.manifest
          .filter((entry) => entry.commodityId === commodity.id)
          .reduce((sum, entry) => sum + entry.units, 0);
      }
      return { baseGold: commodity.baseGold, units };
    })
    .filter((entry) => entry.units > 0)
    .sort((a, b) => a.baseGold - b.baseGold);
  const cheapest = unitsByPrice[0];
  const dearest = unitsByPrice[unitsByPrice.length - 1];
  assert.ok(cheapest && dearest, "the catalogue must still be reachable by the dice");
  assert.ok(
    cheapest.units > dearest.units * 5,
    `the cheapest good (${cheapest.units} units) must be carried in far more bulk than the dearest (${dearest.units})`,
  );
});

test("S177: a prize still fits a real hold, and still weighs something", () => {
  for (const hold of prizes("galeon-pequeno", "abierto", 60)) {
    assert.ok(hold.cargoKg > 0, "a prize must weigh something");
    assert.ok(hold.cargoKg < 60000, `a prize must fit a hull that can carry it, got ${hold.cargoKg} kg`);
  }
});

test("S177: junk never throws and never invents a prize", () => {
  for (const bad of [null, undefined, {}, { id: "x" }, { id: 1 }, { id: 1, hullId: "no-such-hull" }]) {
    assert.equal(enemyHoldFor(bad), null);
  }
});

test("S177: a sunk prize is still a share of her hold, and a struck one is whole", () => {
  const hold = enemyHoldFor({ id: 3, hullId: "galeon-guerra", zoneId: "abierto" });
  const whole = defeatedHold(hold, "surrendered");
  const salvaged = defeatedHold(hold, "sunk");
  assert.deepEqual(whole.manifest, hold.manifest);
  assert.ok(salvaged.cargoKg < hold.cargoKg, "a sunk hold must lose part of itself");
  assert.deepEqual(defeatedHold(hold, "fighting").manifest, []);
});
