/**
 * S153: the market has twelve more goods, spread by origin and by demand.
 *
 * The player asked for it (verbatim): "añade 10 o 12 mercancias mas al mercado". The rule
 * that matters is not the count: it is that the twelve cover the whole scale, that every
 * yard gains goods of her own without listing the catalogue, and that the voyage still
 * pays at least three times for every single one of them.
 *
 * These are the specs of S153 read as tests: A the twelve entries, B the scale, C the yards,
 * D the voyage, E the margin in range, F the names.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { COMMODITIES, SHIPYARDS, commodityById } from "../src/data/naval-data.js";
import { buyPrice, sellPrice } from "../src/model/commerce.js";
import { COLLECTION } from "../src/i18n/index.js";
import { LANGUAGES } from "../src/i18n/core.js";

/** The five goods the market already had, and the twelve S153 adds. */
const ORIGINAL = ["sal", "vino", "tabaco", "especias", "plata"];

const goodsOf = (yard) => COMMODITIES.filter((c) => yard.market?.[c.id]).map((c) => c.id);

/** What a voyage pays, as the multiple the player gets back on the purchase price. */
const voyage = (id) => sellPrice(id, "abismo") / buyPrice(id, "costera");

test("S153-A: the catalogue grows from five goods to seventeen", () => {
  assert.equal(COMMODITIES.length, 17, `the catalogue must hold 17 goods, it holds ${COMMODITIES.length}`);
  for (const id of ORIGINAL) assert.ok(commodityById(id), `the good ${id} that already existed must survive`);
  const ids = COMMODITIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, `two goods share an id: ${ids.join(",")}`);
  for (const commodity of COMMODITIES) {
    assert.ok(commodity.nameKey, `${commodity.id} has no name`);
    assert.ok(commodity.kgPerUnit > 0, `${commodity.id} weighs nothing`);
    assert.ok(commodity.baseGold > 0, `${commodity.id} is free`);
  }
});

test("S153-B: the twelve cover the whole scale, ordered by value density", () => {
  // From a bulky, cheap good to a small, very dear one: the player chooses between hold and
  // purse, never between two goods that are the same thing.
  const woods = commodityById("maderas");
  const diamonds = commodityById("diamantes");
  assert.ok(woods, "the bulky cheap good (maderas) must exist");
  assert.ok(diamonds, "the small dear good (diamantes) must exist");
  assert.ok(woods.kgPerUnit >= 600, `maderas must be bulky, it is ${woods.kgPerUnit} kg`);
  assert.ok(woods.baseGold <= 15, `maderas must be cheap, it is ${woods.baseGold} doblones`);
  assert.ok(diamonds.kgPerUnit <= 10, `diamantes must be small, they are ${diamonds.kgPerUnit} kg`);
  assert.ok(diamonds.baseGold >= 1000, `diamantes must be dear, they are ${diamonds.baseGold} doblones`);

  // The whole catalogue, ordered by value per kg, has no two neighbours of the same density:
  // every step is a real choice.
  const density = COMMODITIES.map((c) => c.baseGold / c.kgPerUnit);
  const sorted = [...density].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i] > sorted[i - 1], `two goods share a value density: ${sorted[i - 1]}`);
  }
  assert.equal(new Set(density.map((d) => d.toFixed(4))).size, density.length, "two goods are equivalent by kg and gold");
});

test("S153-C: every yard gains goods of her own, and none lists the catalogue", () => {
  for (const yard of SHIPYARDS) {
    const goods = goodsOf(yard);
    assert.ok(goods.length >= 7, `${yard.id} must trade at least seven goods, she trades ${goods.length}`);
    assert.ok(goods.length < COMMODITIES.length, `${yard.id} must not list the whole catalogue`);
  }
  // Every yard's list is still her own: no two yards trade exactly the same goods.
  const lists = SHIPYARDS.map((yard) => goodsOf(yard).join(","));
  assert.equal(new Set(lists).size, SHIPYARDS.length, `two yards trade the same goods: ${lists.join(" | ")}`);
  // And every good has somewhere to go: at least two yards trade it.
  for (const commodity of COMMODITIES) {
    const where = SHIPYARDS.filter((yard) => yard.market?.[commodity.id]);
    assert.ok(where.length >= 2, `${commodity.id} is traded in ${where.length} yard(s)`);
  }
});

test("S153-D: the voyage still pays at least three times for every one of the seventeen", () => {
  for (const commodity of COMMODITIES) {
    const bought = buyPrice(commodity.id, "costera");
    const sold = sellPrice(commodity.id, "abismo");
    assert.ok(sold >= bought * 3, `${commodity.id}: only ${(sold / bought).toFixed(2)}x, the voyage must pay 3x`);
  }
});

test("S153-E: no good pays less than three times nor more than twelve on the long run", () => {
  for (const commodity of COMMODITIES) {
    const multiple = voyage(commodity.id);
    assert.ok(multiple >= 3, `${commodity.id} pays only ${multiple.toFixed(2)}x`);
    assert.ok(multiple <= 12, `${commodity.id} pays ${multiple.toFixed(2)}x, which breaks the balance`);
  }
});

test("S153-F: every good names itself in both languages", () => {
  for (const language of LANGUAGES) {
    const catalogue = COLLECTION[language] ?? {};
    for (const commodity of COMMODITIES) {
      const name = catalogue[commodity.nameKey];
      assert.ok(name && name.length > 0, `${language}: ${commodity.id} has no name (${commodity.nameKey})`);
    }
  }
});
