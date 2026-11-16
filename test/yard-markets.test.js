/**
 * Every shipyard has her own market: her own goods and her own prices.
 *
 * User request (verbatim): "cada astillero tendra su propio mercado con sus propias
 * mercancias y sus propios precios". Decisions the user took: a yard lists the goods she
 * trades (she buys and sells only those), her prices are her own multipliers rather than
 * her zone's, and those prices are editable in the settings.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { COMMODITIES, SHIPYARDS } from "../src/data/naval-data.js";
import {
  affordableUnits, buyCargo, buyPrice, marketBoard, marketBoardNow, sellCargo, sellPrice, tradedHere,
} from "../src/model/commerce.js";
import { SETTINGS_FIELDS, applySettings, currentSettings, fieldId, resetSettings } from "../src/model/settings.js";

const goodsOf = (yard) => COMMODITIES.filter((c) => yard.market?.[c.id]).map((c) => c.id);

test("every yard declares a market of her own, and the yards do not trade the same goods", () => {
  for (const yard of SHIPYARDS) assert.ok(goodsOf(yard).length >= 2, `${yard.id} trades too little`);
  const lists = SHIPYARDS.map((yard) => goodsOf(yard).join(","));
  assert.equal(new Set(lists).size, SHIPYARDS.length, `two yards trade the same goods: ${lists.join(" | ")}`);
});

test("every good is traded in at least two yards, so a cargo always has somewhere to go", () => {
  for (const commodity of COMMODITIES) {
    const where = SHIPYARDS.filter((yard) => yard.market?.[commodity.id]);
    assert.ok(where.length >= 2, `${commodity.id} is traded in ${where.length} yard(s)`);
  }
});

test("a yard pays less than she asks, so one yard alone is never a money machine", () => {
  for (const yard of SHIPYARDS) {
    for (const id of goodsOf(yard)) {
      assert.ok(sellPrice(id, yard.id) > buyPrice(id, yard.id), `${yard.id}/${id}`);
    }
  }
});

test("prices are the yard's own: a shared good does not cost the same everywhere", () => {
  for (const commodity of COMMODITIES) {
    const prices = SHIPYARDS.filter((yard) => yard.market?.[commodity.id]).map((yard) => buyPrice(commodity.id, yard.id));
    assert.ok(new Set(prices).size > 1, `${commodity.id} costs the same in every yard: ${prices}`);
  }
});

test("every good has a profitable route between two yards", () => {
  for (const commodity of COMMODITIES) {
    const yards = SHIPYARDS.filter((yard) => yard.market?.[commodity.id]);
    const best = Math.max(...yards.flatMap((from) => yards.filter((to) => to !== from)
      .map((to) => sellPrice(commodity.id, to.id) - buyPrice(commodity.id, from.id))));
    assert.ok(best > 0, `${commodity.id} has no profitable route`);
  }
});

test("a yard's board lists exactly her goods, at her prices", () => {
  for (const yard of SHIPYARDS) {
    const board = marketBoardNow(yard.id, {});
    assert.deepEqual(board.map((row) => row.id), goodsOf(yard));
    for (const row of board) {
      const base = COMMODITIES.find((c) => c.id === row.id).baseGold;
      assert.equal(row.buy, Math.round(base * yard.market[row.id].buy));
      assert.equal(row.sell, Math.round(base * yard.market[row.id].sell));
    }
    assert.deepEqual(marketBoard(yard.id).map((row) => row.id), goodsOf(yard));
  }
});

test("a good the yard does not trade has no price, cannot be bought, sold or afforded there", () => {
  const yard = SHIPYARDS.find((entry) => goodsOf(entry).length < COMMODITIES.length);
  const missing = COMMODITIES.find((c) => !yard.market[c.id]).id;
  assert.equal(tradedHere(yard.id, missing), false);
  assert.equal(buyPrice(missing, yard.id), 0);
  assert.equal(sellPrice(missing, yard.id), 0);
  const hold = { manifest: [{ commodityId: missing, units: 3 }], capacityKg: 1e6, cargoKg: 0, gold: 1e6 };
  assert.equal(buyCargo(hold, missing, 1, yard.id), null);
  assert.equal(sellCargo(hold, missing, 1, yard.id), null);
  assert.equal(affordableUnits(hold, missing, yard.id), 0);
});

test("a market with no list of its own (a zone) still trades everything, as before", () => {
  for (const commodity of COMMODITIES) assert.equal(tradedHere("costera", commodity.id), true);
});

test("the prices of every yard and good are settings, and a change reaches the price", () => {
  const yard = SHIPYARDS[0];
  const good = goodsOf(yard)[0];
  const buyField = SETTINGS_FIELDS.find((f) => f.group === "yardMarkets" && f.key === `${yard.id}-${good}-buy`);
  assert.ok(buyField, "the buy multiplier of the first yard/good must be a setting");
  for (const y of SHIPYARDS) for (const id of goodsOf(y)) for (const side of ["buy", "sell"]) {
    assert.ok(SETTINGS_FIELDS.some((f) => f.group === "yardMarkets" && f.key === `${y.id}-${id}-${side}`), `${y.id}/${id}/${side}`);
  }
  try {
    applySettings({ ...currentSettings(), [fieldId(buyField)]: 2 });
    const base = COMMODITIES.find((c) => c.id === good).baseGold;
    assert.equal(buyPrice(good, yard.id), Math.round(base * 2));
  } finally {
    resetSettings();
  }
  const base = COMMODITIES.find((c) => c.id === good).baseGold;
  assert.equal(buyPrice(good, yard.id), Math.round(base * yard.market[good].buy));
});
