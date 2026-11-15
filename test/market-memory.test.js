import test from "node:test";
import assert from "node:assert/strict";
import { COMMODITIES, SHIPYARDS } from "../src/data/naval-data.js";
import { GAME_TIME } from "../src/model/game-time.js";
import {
  MARKET_MEMORY, stockOf, stockFactor, buyPrice, sellPrice, buyPriceNow, sellPriceNow,
  marketBoardNow, marketOf, normaliseMarkets, withStock, recoverMarkets, bindGameTime, buyCargo, sellCargo, affordableUnits,
} from "../src/model/commerce.js";
import { shipyardZone } from "../src/model/world.js";

const commodity = "sal";
const home = "puerto-casa";
const abyss = "cala-del-abismo";
const at = (units) => ({ stock: { [commodity]: units } });

// A transaction uses the board's quote; only an accepted transaction changes stock.
function voyage(markets, gold = 100000, units = 20) {
  const buy = marketBoardNow("costera", markets[home]).find((row) => row.id === commodity);
  const sell = marketBoardNow("abismo", markets[abyss]).find((row) => row.id === commodity);
  const bought = buyCargo({ manifest: [], capacityKg: 100000, cargoKg: 0, gold }, commodity, units, "costera", { unitPrice: buy.buy, availableStock: buy.stock });
  assert.ok(bought);
  assert.equal(bought.paid, buy.buy * units);
  assert.equal(bought.gold, gold - bought.paid);
  const sold = sellCargo({ manifest: bought.hold.manifest, gold: bought.gold }, commodity, units, "abismo", { unitPrice: sell.sell });
  assert.ok(sold);
  assert.equal(sold.earned, sell.sell * units);
  assert.equal(sold.gold, bought.gold + sold.earned);
  assert.deepEqual(sold.hold.manifest, []);
  return {
    markets: { ...markets, [home]: withStock(markets[home], commodity, -units), [abyss]: withStock(markets[abyss], commodity, units) },
    buy, sell, paid: bought.paid, earned: sold.earned, profit: sold.gold - gold,
  };
}

test("S119: a load bought one unit at a time can be sold as a single transaction", () => {
  let gold = 100000;
  let manifest = [];
  for (let i = 0; i < 40; i++) {
    const bought = buyCargo({ manifest, capacityKg: 100000, gold }, commodity, 1, "costera");
    assert.ok(bought);
    ({ manifest } = bought.hold);
    gold = bought.gold;
  }
  const sold = sellCargo({ manifest, gold }, commodity, 40, "abismo");
  assert.ok(sold);
  assert.equal(sold.earned, 40 * sellPrice(commodity, "abismo"));
  assert.equal(sold.gold, gold + sold.earned);
  assert.deepEqual(sold.hold.manifest, []);
});

test("S119: stock drains on buy and refills on sell, independently and within both caps", () => {
  const first = voyage({}, 100000, 40);
  assert.equal(stockOf(first.markets[home], commodity), 20);
  assert.equal(stockOf(first.markets[abyss], commodity), 100);
  assert.equal(stockOf(first.markets["ensenada-abierta"], commodity), 60);
  assert.equal(stockOf(withStock(first.markets[home], commodity, -1000), commodity), 0);
  assert.equal(stockOf(withStock(first.markets[abyss], commodity, 1000), commodity), 120);
});

test("S119: both sides rise on depletion and fall on glut", () => {
  const full = at(60), drained = withStock(full, commodity, -40), glutted = withStock(full, commodity, 40);
  for (const zone of ["costera", "abismo"]) {
    for (const quote of [buyPriceNow, sellPriceNow]) {
      assert.ok(quote(commodity, zone, drained) > quote(commodity, zone, full));
      assert.ok(quote(commodity, zone, glutted) < quote(commodity, zone, full));
    }
  }
});

test("S119: piecewise price band is monotonic, clamped and exact at its anchors", () => {
  assert.equal(MARKET_MEMORY.baseStock, 60);
  assert.equal(MARKET_MEMORY.maxStock, 120);
  assert.equal(stockFactor(-10), MARKET_MEMORY.ceilShare);
  assert.equal(stockFactor(0), 1.6);
  assert.equal(stockFactor(60), 1);
  assert.equal(stockFactor(120), 0.45);
  assert.equal(stockFactor(999), MARKET_MEMORY.floorShare);
  for (let n = 0; n < 120; n++) assert.ok(stockFactor(n) >= stockFactor(n + 1));
  for (const c of COMMODITIES) for (const zone of ["costera", "abierto", "abismo"]) {
    for (const [quote, base] of [[buyPriceNow, buyPrice], [sellPriceNow, sellPrice]]) {
      const memory = (units) => ({ stock: { [c.id]: units } });
      const bottom = quote(c.id, zone, memory(120)), top = quote(c.id, zone, memory(0));
      const factor = marketOf(zone)[quote === buyPriceNow ? "buy" : "sell"];
      assert.equal(bottom, Math.round(c.baseGold * factor * MARKET_MEMORY.floorShare));
      assert.equal(top, Math.round(c.baseGold * factor * MARKET_MEMORY.ceilShare));
      assert.ok(bottom >= 0 && top >= bottom && Number.isFinite(top));
      assert.equal(quote(c.id, zone, memory(60)), base(c.id, zone));
      assert.equal(quote(c.id, zone, memory(999)), bottom);
    }
  }
});

test("S119: two identical voyages pay less on both sides and still profit", () => {
  const first = voyage({});
  const second = voyage(first.markets);
  assert.equal(first.buy.stock, 60);
  assert.equal(first.sell.stock, 60);
  assert.equal(second.buy.stock, 40);
  assert.equal(second.sell.stock, 80);
  assert.ok(second.paid > first.paid);
  assert.ok(second.earned < first.earned);
  assert.ok(first.profit > second.profit && second.profit > 0);
});

test("S119: selling 40 salt in a resting abyss drops the price from 58 to 36", () => {
  const trip = voyage({}, 100000, 40);
  assert.equal(trip.sell.stock, 60);
  assert.equal(trip.sell.sell, 58);
  assert.equal(trip.earned, 2320);
  assert.equal(stockOf(trip.markets[abyss], commodity), 100);
  assert.equal(sellPriceNow(commodity, "abismo", trip.markets[abyss]), 36);
});

test("S119: three game days recover drained and glutted yards to base prices", () => {
  bindGameTime(GAME_TIME);
  const first = voyage({});
  const restored = recoverMarkets(first.markets, GAME_TIME.gameSecondsPerDay * MARKET_MEMORY.recoveryDays);
  assert.equal(stockOf(restored[home], commodity), 60);
  assert.equal(stockOf(restored[abyss], commodity), 60);
  assert.equal(buyPriceNow(commodity, "costera", restored[home]), buyPrice(commodity, "costera"));
  assert.equal(sellPriceNow(commodity, "abismo", restored[abyss]), sellPrice(commodity, "abismo"));
});

test("S119: elapsed seconds, live game day and no overshoot", () => {
  const clock = { gameSecondsPerDay: 200 };
  bindGameTime(clock);
  try {
    const memories = { [home]: at(0), [abyss]: at(120) };
    for (const seconds of [0, -1, NaN]) assert.deepEqual(recoverMarkets(memories, seconds), memories);
    const after = recoverMarkets(memories, 200);
    assert.equal(stockOf(after[home], commodity), 20);
    assert.equal(stockOf(after[abyss], commodity), 100);
    const almost = recoverMarkets({ [home]: at(59), [abyss]: at(61) }, 200);
    assert.equal(stockOf(almost[home], commodity), 60);
    assert.equal(stockOf(almost[abyss], commodity), 60);
  } finally { bindGameTime(GAME_TIME); }
});

test("S119: missing and corrupt stock defaults to rest and unknown yards are ignored", () => {
  for (const value of [undefined, null, "junk", -1, NaN, Infinity, {}, true]) {
    const memory = { stock: { [commodity]: value } };
    assert.equal(stockOf(memory, commodity), 60, String(value));
    assert.equal(buyPriceNow(commodity, "costera", memory), buyPrice(commodity, "costera"));
    assert.equal(sellPriceNow(commodity, "abismo", memory), sellPrice(commodity, "abismo"));
  }
  assert.equal(stockOf({ stock: { sal: 999 } }, commodity), 120);
  assert.deepEqual(recoverMarkets({ unknown: at(0) }, 1), {});
  const saved = normaliseMarkets({ [home]: { stock: { sal: -5, vino: 100, bogus: 1 } }, unknown: at(0) });
  assert.equal(stockOf(saved[home], "sal"), 60);
  assert.equal(stockOf(saved[home], "vino"), 100);
  assert.equal(Object.hasOwn(saved, "unknown"), false);
  assert.equal(Object.hasOwn(saved[home].stock, "bogus"), false);
  assert.equal(stockOf(undefined, "unknown"), 60);
});

test("S119: withStock handles broken deltas and clamps both ends", () => {
  assert.equal(stockOf(withStock(at(60), commodity, -999), commodity), 0);
  assert.equal(stockOf(withStock(at(60), commodity, 999), commodity), 120);
  assert.equal(stockOf(withStock(at(60), commodity, NaN), commodity), 60);
  assert.equal(stockOf(withStock(at(60), commodity, Infinity), commodity), 60);
});

test("S119: legacy sea save without markets leaves every yard at rest", () => {
  const legacy = JSON.parse('{"gold":12000}');
  for (const yard of SHIPYARDS) {
    const zone = shipyardZone(yard).id;
    for (const row of marketBoardNow(zone, legacy.markets?.[yard.id])) {
      assert.equal(row.stock, 60);
      assert.equal(row.buy, buyPrice(row.id, zone));
      assert.equal(row.sell, sellPrice(row.id, zone));
    }
  }
});

test("S119: a rejected quoted trade leaves purse, hold and market unchanged", () => {
  const markets = { [home]: at(20) };
  const state = { manifest: [], capacityKg: 0, cargoKg: 0, gold: 1000 };
  const before = structuredClone({ markets, state });
  const quote = marketBoardNow("costera", markets[home]).find((row) => row.id === commodity).buy;
  assert.equal(affordableUnits(state, commodity, "costera", { unitPrice: quote }), 0);
  assert.equal(buyCargo(state, commodity, 1, "costera", { unitPrice: quote }), null);
  assert.equal(sellCargo(state, commodity, 1, "costera", { unitPrice: quote }), null);
  assert.deepEqual({ markets, state }, before);
});

test("S119: buying more than available stock is refused without any change", () => {
  const markets = { [home]: at(20) };
  const state = { manifest: [{ commodityId: "vino", units: 2 }], capacityKg: 100000, cargoKg: 560, gold: 100000 };
  const before = structuredClone({ markets, state });
  const board = marketBoardNow("costera", markets[home]).find((row) => row.id === commodity);
  assert.equal(buyCargo(state, commodity, 40, "costera", { unitPrice: board.buy, availableStock: board.stock }), null);
  assert.deepEqual({ markets, state }, before);
  assert.equal(stockOf(markets[home], commodity), 20);
  assert.equal(state.gold, 100000);
  assert.deepEqual(state.manifest, [{ commodityId: "vino", units: 2 }]);
  assert.equal(buyCargo(state, commodity, 1, "costera", { availableStock: 0 }), null);
  assert.ok(buyCargo(state, commodity, 20, "costera", { availableStock: 20 }));
});

test("S119: affordable units never exceed whole units at the yard", () => {
  const state = { capacityKg: 100000, cargoKg: 0, gold: 100000 };
  assert.equal(affordableUnits(state, commodity, "costera", { availableStock: 20 }), 20);
  assert.equal(affordableUnits(state, commodity, "costera", { availableStock: 20.9 }), 20);
  assert.equal(affordableUnits(state, commodity, "costera", { availableStock: 0.9 }), 0);
  assert.equal(affordableUnits(state, commodity, "costera", { availableStock: 0 }), 0);
});

test("S114 preserved: trades without a memory quote retain zone prices and refusals", () => {
  const initial = { manifest: [], capacityKg: 100000, cargoKg: 0, gold: 1000 };
  const bought = buyCargo(initial, commodity, 1, "costera");
  assert.equal(bought.paid, buyPrice(commodity, "costera"));
  assert.equal(bought.gold, initial.gold - bought.paid);
  assert.equal(buyCargo({ ...initial, gold: 0 }, commodity, 1, "costera"), null);
  const sold = sellCargo({ manifest: bought.hold.manifest, gold: bought.gold }, commodity, 1, "abismo");
  assert.equal(sold.earned, sellPrice(commodity, "abismo"));
  assert.equal(sellCargo({ manifest: [], gold: 0 }, commodity, 1, "abismo"), null);
});
