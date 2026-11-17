/**
 * S135: the market board says where a good is cheap and where it is dear.
 *
 * User request (verbatim): "cuando repintas el mercado, los valores de las materias, los
 * comparas con los valores del resto de mercados de los diferentes astilleros nuestros, y
 * si estan mas barratos pones el nombre de la mercancia (Sal, vino, ect) en verde, y si
 * esta mas caro lo pones en rojo"
 */
import test from "node:test";
import assert from "node:assert/strict";

import { SHIPYARDS, COMMODITIES, shipyardById } from "../src/data/naval-data.js";
import { buyPriceNow, priceStanding, tradedHere } from "../src/model/commerce.js";

const goodsOf = (yard) => COMMODITIES.filter((c) => tradedHere(yard.id, c.id)).map((c) => c.id);
const shared = COMMODITIES.find((c) => SHIPYARDS.every((yard) => tradedHere(yard.id, c.id))).id;

test("S135: the yard with the lowest buy price of a good is green on it", () => {
  for (const commodity of COMMODITIES) {
    const yards = SHIPYARDS.filter((yard) => tradedHere(yard.id, commodity.id));
    const prices = yards.map((yard) => [yard.id, buyPriceNow(commodity.id, yard.id, {})]);
    const lowest = Math.min(...prices.map(([, price]) => price));
    for (const [id, price] of prices) {
      const standing = priceStanding(commodity.id, id, {});
      if (price === lowest) assert.equal(standing, "cheaper", `${id}/${commodity.id} at ${price} is the cheapest`);
    }
  }
});

test("S135: the yard with the highest buy price of a good is red on it", () => {
  for (const commodity of COMMODITIES) {
    const yards = SHIPYARDS.filter((yard) => tradedHere(yard.id, commodity.id));
    const prices = yards.map((yard) => [yard.id, buyPriceNow(commodity.id, yard.id, {})]);
    const highest = Math.max(...prices.map(([, price]) => price));
    for (const [id, price] of prices) {
      const standing = priceStanding(commodity.id, id, {});
      if (price === highest && highest !== Math.min(...prices.map(([, p]) => p))) {
        assert.equal(standing, "dearer", `${id}/${commodity.id} at ${price} is the dearest`);
      }
    }
  }
});

test("S135: a price in the middle is neither green nor red", () => {
  const middle = SHIPYARDS.find((yard) => {
    const prices = SHIPYARDS.filter((other) => tradedHere(other.id, shared))
      .map((other) => buyPriceNow(shared, other.id, {}));
    const mine = buyPriceNow(shared, yard.id, {});
    return mine > Math.min(...prices) && mine < Math.max(...prices);
  });
  assert.ok(middle, "the data must have a yard in the middle for this rule to mean anything");
  assert.equal(priceStanding(shared, middle.id, {}), "even");
});

test("S135: a good only one yard trades has nothing to compare and stays neutral", () => {
  const solo = COMMODITIES.find((c) => SHIPYARDS.filter((yard) => tradedHere(yard.id, c.id)).length === 1);
  if (!solo) return; // the shipped data trades every good in two yards or more
  const yard = SHIPYARDS.find((entry) => tradedHere(entry.id, solo.id));
  assert.equal(priceStanding(solo.id, yard.id, {}), "even");
});

test("S135: the comparison follows the live stock of each market", () => {
  const home = "puerto-casa";
  const cala = "cala-del-abismo";
  // Drain one yard of the good: her price climbs to her empty-market ceiling, so she must
  // read dearer than a yard that did not move. Two yards drained alike would tie, and a
  // tie is neither cheaper nor dearer, which is why only one is moved here.
  const drained = { [cala]: { stock: { [shared]: 0 } } };
  const untouched = buyPriceNow(shared, home, {});
  const emptied = buyPriceNow(shared, cala, drained[cala]);
  assert.notEqual(untouched, emptied, "the fixture must actually move the price");
  assert.equal(priceStanding(shared, cala, drained), emptied > untouched ? "dearer" : "cheaper");
  // The yard nobody touched answers from the same live board, so she is never the drained
  // one's colour by accident: her standing is whatever her own price earns.
  const expected = ["cheaper", "dearer", "even"].includes(priceStanding(shared, home, drained));
  assert.ok(expected);
});

test("S135: a broken or missing yard, good or memory never throws", () => {
  for (const [good, yard, memories] of [
    ["no-existe", "puerto-casa", {}],
    [shared, "no-existe", {}],
    [shared, "puerto-casa", null],
    [shared, "puerto-casa", { "puerto-casa": { stock: { [shared]: "x" } } }],
  ]) {
    assert.equal(priceStanding(good, yard, memories), "even");
  }
});
