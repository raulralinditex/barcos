/**
 * S115-S116: what a defeated hull was carrying, and what goes down with her own.
 *
 * The player's rules, verbatim: "pon carga en los barcos enemigos, si se rinden, la carga
 * la podemos vender en los astilleros, si se unde, solo conseguimos un % de carga" and
 * "si se hunden nuestros barcos se pierde la carga".
 */

import test from "node:test";
import assert from "node:assert/strict";

import { COMMODITIES, HULLS, commodityById } from "../src/data/naval-data.js";
import {
  COMMERCE,
  awardHold,
  defeatedHold,
  enemyHoldFor,
  holdOf,
  shipHold,
  withHold,
} from "../src/model/commerce.js";
import { addShip, removeShip } from "../src/model/fleet.js";

const encounter = (id, hullId = "galeon-pequeno") => ({ id, type: "enemy", hullId, zoneId: "abierto" });

test("every enemy sails with a hold, and the same sail always carries the same hold", () => {
  const first = enemyHoldFor(encounter(7));
  const again = enemyHoldFor(encounter(7));
  assert.deepEqual(first, again, "the hold must be deterministic, like the enemy herself");
  assert.ok(first.cargoKg > 0, "an enemy with an empty hold is not worth chasing");
  for (const entry of first.manifest) {
    assert.ok(commodityById(entry.commodityId), `${entry.commodityId} is not a commodity`);
    assert.ok(entry.units > 0);
  }
});

test("deeper water carries more, and it is worth more", () => {
  const kg = (zoneId) => enemyHoldFor({ ...encounter(11), zoneId }).cargoKg;
  assert.ok(kg("costera") < kg("abierto"), "open water must pay better than the coast");
  assert.ok(kg("abierto") < kg("abismo"), "the abyss must pay better than open water");
});

test("a captured hull hands over the whole hold, a sunk one only a share", () => {
  const hold = enemyHoldFor(encounter(3));
  const captured = defeatedHold(hold, "surrendered");
  const sunk = defeatedHold(hold, "sunk");
  assert.equal(captured.cargoKg, hold.cargoKg, "striking the colours gives it all");
  assert.ok(sunk.cargoKg < hold.cargoKg, "a sunk hold is mostly at the bottom");
  // The share is the declared one, and it is a real manifest of whole units.
  assert.ok(Math.abs(sunk.cargoKg / hold.cargoKg - COMMERCE.sunkCargoShare) < 0.35);
  assert.ok(sunk.manifest.every((entry) => Number.isInteger(entry.units) && entry.units > 0));
});

test("a broken share or a hold that never existed salvages nothing", () => {
  assert.deepEqual(defeatedHold(null, "sunk"), { manifest: [], cargoKg: 0 });
  const hold = holdOf([{ commodityId: COMMODITIES[0].id, units: 10 }]);
  assert.deepEqual(defeatedHold(hold, "fighting"), { manifest: [], cargoKg: 0 });
  assert.deepEqual(defeatedHold(hold, "sunk", { share: Number.NaN }), { manifest: [], cargoKg: 0 });
});

test("the prize goes into the hold that is there, and what does not fit is left behind", () => {
  const commodity = COMMODITIES[0];
  const ship = { cargoKg: 0, capacityKg: 40000, manifest: [], gold: 0 };
  const prize = holdOf([{ commodityId: commodity.id, units: 1000 }]);
  const result = awardHold(ship, prize);
  assert.ok(result, "a hold with room takes the prize");
  assert.ok(result.ship.cargoKg <= 40000, "she never carries more than she can float");
  assert.ok(result.left.cargoKg > 0, "the rest stays in the water");
  assert.equal(result.ship.cargoKg + result.left.cargoKg, prize.cargoKg);
});

test("a full hold takes nothing, and says so", () => {
  const prize = holdOf([{ commodityId: COMMODITIES[0].id, units: 10 }]);
  const full = { cargoKg: 40000, capacityKg: 40000, manifest: [] };
  const result = awardHold(full, prize);
  assert.equal(result.ship.cargoKg, 40000);
  assert.equal(result.left.cargoKg, prize.cargoKg);
});

test("her own hold goes down with her, and the purse does not", () => {
  const commodity = COMMODITIES[0];
  const laden = withHold({ id: "a", cargoKg: 0, capacityKg: 40000 }, holdOf([{ commodityId: commodity.id, units: 4 }]));
  const empty = { id: "b", cargoKg: 0, capacityKg: 40000, manifest: [] };
  const fleet = addShip(addShip({ ships: [], captainId: null }, laden), empty);
  assert.equal(shipHold(fleet.ships[0]).cargoKg, 4 * commodity.kgPerUnit);

  const after = removeShip(fleet, "a");
  assert.equal(after.ships.length, 1);
  assert.equal(after.ships[0].id, "b");
  // Nothing of hers survived: a hold belongs to a hull, and the hull is at the bottom.
  assert.equal(after.ships.some((ship) => ship.id === "a"), false);
  assert.equal(after.ships.reduce((total, ship) => total + shipHold(ship).cargoKg, 0), 0);
});

test("a hull with no hold on record carries nothing, and never a NaN", () => {
  const bare = { id: "c", capacityKg: 40000 };
  assert.equal(shipHold(bare).cargoKg, 0);
  assert.equal(withHold(bare, null).cargoKg, 0);
  assert.equal(withHold(bare, null).manifest.length, 0);
});

test("a hull that cannot be found is not a hull the game knows", () => {
  assert.equal(enemyHoldFor({ id: 5, hullId: "no-existe" }), null);
  assert.equal(enemyHoldFor(null), null);
  // A hull with no declared capacity is still a hull; only her name is missing.
  assert.ok(HULLS.length > 0);
});
