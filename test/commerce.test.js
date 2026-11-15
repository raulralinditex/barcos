/**
 * S113-S114: the trade. Buy where a thing is made, sell where it is missed.
 *
 * The player's rule, verbatim: "comprar barato, vender caso segun tipos de zonas de los
 * astilleros", and "compramos y vendemos en astilleros". So every price is a zone's
 * price, and no trade happens away from a yard.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { COMMODITIES } from "../src/data/naval-data.js";
import {
  affordableUnits,
  buyCargo,
  buyPrice,
  holdOf,
  marketBoard,
  salvageHold,
  sellCargo,
  sellPrice,
  shipHold,
  withHold,
} from "../src/model/commerce.js";

const hull = (over = {}) => ({ capacityKg: 40000, cargoKg: 0, gold: 10000, manifest: [], ...over });

test("every commodity is declared once, in kg and in gold", () => {
  assert.ok(COMMODITIES.length >= 3);
  const ids = new Set(COMMODITIES.map((c) => c.id));
  assert.equal(ids.size, COMMODITIES.length);
  for (const commodity of COMMODITIES) {
    assert.ok(commodity.kgPerUnit > 0, `${commodity.id} weighs nothing`);
    assert.ok(commodity.baseGold > 0, `${commodity.id} is free`);
    assert.ok(commodity.nameKey, `${commodity.id} has no name`);
  }
});

test("the same thing is cheaper where it is made and dearer where it is missed", () => {
  const id = COMMODITIES[0].id;
  assert.ok(buyPrice(id, "costera") < buyPrice(id, "abierto"));
  assert.ok(buyPrice(id, "abierto") < buyPrice(id, "abismo"));
  assert.ok(sellPrice(id, "costera") < sellPrice(id, "abierto"));
  assert.ok(sellPrice(id, "abierto") < sellPrice(id, "abismo"));
});

test("a coastal-to-abyssal run pays, and pays more than it costs", () => {
  for (const commodity of COMMODITIES) {
    const bought = buyPrice(commodity.id, "costera");
    const sold = sellPrice(commodity.id, "abismo");
    assert.ok(sold > bought, `${commodity.id}: sells for ${sold} but costs ${bought}`);
    // The trip has to be worth it: at least a 3x return, or nobody would sail it.
    assert.ok(sold >= bought * 3, `${commodity.id}: only ${sold / bought}x`);
  }
});

test("an unknown zone or commodity has no price, never a free one", () => {
  assert.equal(buyPrice("no-existe", "costera"), 0);
  assert.equal(sellPrice("no-existe", "costera"), 0);
  // An unknown zone falls back to coastal water rather than becoming free.
  assert.equal(buyPrice(COMMODITIES[0].id, "marte"), buyPrice(COMMODITIES[0].id, "costera"));
});

test("the board lists the whole catalogue priced for one yard", () => {
  const board = marketBoard("abierto");
  assert.equal(board.length, COMMODITIES.length);
  for (const row of board) {
    assert.ok(row.buy > 0 && row.sell > 0);
    assert.ok(row.nameKey);
  }
});

test("the hold is the manifest, and its kg is never stored twice", () => {
  const first = COMMODITIES[0];
  const hold = holdOf([{ commodityId: first.id, units: 2 }]);
  assert.equal(hold.manifest.length, 1);
  assert.equal(hold.cargoKg, 2 * first.kgPerUnit);
  // Junk and negative units are dropped instead of producing NaN kg.
  assert.deepEqual(holdOf([{ commodityId: "no-existe", units: 5 }, { commodityId: first.id, units: -1 }]), {
    manifest: [],
    cargoKg: 0,
  });
  assert.deepEqual(shipHold({}), { manifest: [], cargoKg: 0 });
});

test("buying pays the yard and loads the hold", () => {
  const commodity = COMMODITIES[0];
  const trade = buyCargo(hull(), commodity.id, 10, "costera");
  assert.ok(trade);
  assert.equal(trade.units, 10);
  assert.equal(trade.paid, buyPrice(commodity.id, "costera") * 10);
  assert.equal(trade.gold, 10000 - trade.paid);
  assert.equal(trade.hold.cargoKg, 10 * commodity.kgPerUnit);
});

test("a trade that does not fit, or cannot be paid, changes nothing at all", () => {
  const commodity = COMMODITIES[0];
  const units = Math.ceil(40000 / commodity.kgPerUnit) + 1;
  assert.equal(buyCargo(hull(), commodity.id, units, "costera"), null);
  assert.equal(buyCargo(hull({ gold: 0 }), commodity.id, 1, "costera"), null);
  assert.equal(buyCargo(hull(), commodity.id, 0, "costera"), null);
  assert.equal(buyCargo(hull(), commodity.id, -3, "costera"), null);
  assert.equal(buyCargo(hull(), "no-existe", 1, "costera"), null);
});

test("what is not in the hold cannot be sold", () => {
  const commodity = COMMODITIES[0];
  const hold = holdOf([{ commodityId: commodity.id, units: 3 }]);
  assert.equal(sellCargo({ manifest: hold.manifest, gold: 0 }, commodity.id, 4, "abismo"), null);
  assert.equal(sellCargo({ manifest: [], gold: 0 }, commodity.id, 1, "abismo"), null);
});

test("selling empties the hold and pays for it, and selling all of it leaves nothing", () => {
  const commodity = COMMODITIES[0];
  const hold = holdOf([{ commodityId: commodity.id, units: 3 }]);
  const trade = sellCargo({ manifest: hold.manifest, gold: 100 }, commodity.id, 3, "abismo");
  assert.ok(trade);
  assert.equal(trade.earned, sellPrice(commodity.id, "abismo") * 3);
  assert.equal(trade.gold, 100 + trade.earned);
  assert.deepEqual(trade.hold, { manifest: [], cargoKg: 0 });
});

test("a full voyage from the coast to the abyss earns more than it spent", () => {
  const commodity = COMMODITIES[0];
  const bought = buyCargo(hull({ gold: 5000 }), commodity.id, 20, "costera");
  assert.ok(bought);
  const sold = sellCargo({ manifest: bought.hold.manifest, gold: bought.gold }, commodity.id, 20, "abismo");
  assert.ok(sold);
  assert.ok(sold.gold > 5000, `${sold.gold} must beat the 5000 she started with`);
});

test("the market shows how much a hull can still take", () => {
  const commodity = COMMODITIES[0];
  // Space limits: 40000 kg of room, and one unit weighs less than that.
  const bySpace = affordableUnits(hull(), commodity.id, "costera");
  assert.ok(bySpace > 0);
  assert.ok(bySpace * commodity.kgPerUnit <= 40000);
  // A purse of zero buys nothing, and a full hold takes nothing more.
  assert.equal(affordableUnits(hull({ gold: 0 }), commodity.id, "costera"), 0);
  assert.equal(affordableUnits(hull({ cargoKg: 40000 }), commodity.id, "costera"), 0);
});

test("a sunk hold is mostly lost, and what survives is a real manifest", () => {
  const commodity = COMMODITIES[0];
  const hold = holdOf([{ commodityId: commodity.id, units: 10 }]);
  const salvaged = salvageHold(hold.manifest, 0.35);
  assert.equal(salvaged.manifest[0].units, 3);
  assert.equal(salvaged.cargoKg, 3 * commodity.kgPerUnit);
  // A share of one is nothing, and a broken share salvages nothing.
  assert.deepEqual(salvageHold(holdOf([{ commodityId: commodity.id, units: 1 }]).manifest, 0.35).manifest, []);
  assert.deepEqual(salvageHold(hold.manifest, Number.NaN).manifest, []);
});

test("loading a hold keeps the generic cargo, which weighs but does not sell", () => {
  const commodity = COMMODITIES[0];
  // The player hand-loaded 1000 kg of generic cargo in the builder (S114).
  const ship = { cargoKg: 1000, capacityKg: 40000, manifest: [], gold: 5000 };
  const trade = buyCargo(ship, commodity.id, 5, "costera");
  const loaded = withHold(ship, trade.hold);
  assert.equal(loaded.cargoKg, 1000 + 5 * commodity.kgPerUnit);
  assert.equal(shipHold(loaded).cargoKg, 5 * commodity.kgPerUnit);
  // Selling the merchandise leaves the generic cargo aboard, still weighing.
  const sold = sellCargo({ manifest: loaded.manifest, gold: 0 }, commodity.id, 5, "abismo");
  const emptied = withHold(loaded, sold.hold);
  assert.equal(emptied.cargoKg, 1000);
  assert.deepEqual(emptied.manifest, []);
});

test("S113: a market price is a setting like any other, and the spread stays a spread", async () => {
  const { applySettings, currentSettings, normaliseSettings, resetSettings } = await import("../src/model/settings.js");
  resetSettings();
  try {
    const shipped = currentSettings();
    assert.equal(shipped["commerce.sell-abismo"], 3.2);
    // A price outside its range is clamped, not rejected.
    applySettings({ "commerce.sell-abismo": 99 });
    assert.equal(currentSettings()["commerce.sell-abismo"], 8);
    // The whole board follows the live value: no stale copy anywhere.
    assert.equal(sellPrice(COMMODITIES[0].id, "abismo"), Math.round(COMMODITIES[0].baseGold * 8));
  } finally {
    resetSettings();
  }
  assert.equal(normaliseSettings({})["commerce.sunkCargoShare"], 0.35);
});
