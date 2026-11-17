/**
 * S136: the board also says where a good sells best.
 *
 * User request (verbatim), after the buy-side colours: "agregalo".
 *
 * The two questions are different and must not share one colour: buying wants the lowest
 * ask, selling wants the highest bid. A yard can be the cheapest to buy from and the worst
 * to sell to, so each side gets its own standing.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { COMMODITIES, SHIPYARDS } from "../src/data/naval-data.js";
import { sellPriceNow, sellStanding, tradedHere } from "../src/model/commerce.js";

const yardsOf = (commodityId) => SHIPYARDS.filter((yard) => tradedHere(yard.id, commodityId));

test("S136: the yard that pays the most for a good is the best sale", () => {
  for (const commodity of COMMODITIES) {
    const yards = yardsOf(commodity.id);
    const prices = yards.map((yard) => [yard.id, sellPriceNow(commodity.id, yard.id, {})]);
    const best = Math.max(...prices.map(([, price]) => price));
    const worst = Math.min(...prices.map(([, price]) => price));
    if (best === worst) continue;
    for (const [id, price] of prices) {
      if (price === best) assert.equal(sellStanding(commodity.id, id, {}), "best", `${id}/${commodity.id}`);
      if (price === worst) assert.equal(sellStanding(commodity.id, id, {}), "worst", `${id}/${commodity.id}`);
    }
  }
});

test("S136: the two sides can disagree, which is why they are separate", () => {
  // At least one good must be cheaper to buy in one yard and better to sell in another,
  // or the feature would be a copy of the buy colours and worth nothing.
  const disagreement = COMMODITIES.some((commodity) => {
    const yards = yardsOf(commodity.id);
    if (yards.length < 2) return false;
    const buy = yards.map((yard) => [yard.id, yard.market?.[commodity.id]?.buy ?? 0]);
    const sell = yards.map((yard) => [yard.id, yard.market?.[commodity.id]?.sell ?? 0]);
    const cheapest = buy.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
    const bestPaid = sell.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    return cheapest !== bestPaid;
  });
  assert.ok(disagreement, "no good is cheap in one yard and best sold in another");
});

test("S136: a price in the middle of the band is neither the best nor the worst", () => {
  for (const commodity of COMMODITIES) {
    const yards = yardsOf(commodity.id);
    if (yards.length < 3) continue;
    const prices = yards.map((yard) => sellPriceNow(commodity.id, yard.id, {}));
    if (new Set(prices).size < 3) continue;
    const middle = yards.find((yard) => {
      const price = sellPriceNow(commodity.id, yard.id, {});
      return price > Math.min(...prices) && price < Math.max(...prices);
    });
    if (!middle) continue;
    assert.equal(sellStanding(commodity.id, middle.id, {}), "even");
    return;
  }
});

test("S136: the sale comparison follows the live stock of each market", () => {
  // A commodity two yards trade, so there is a comparison to move.
  const commodity = COMMODITIES.find((c) => yardsOf(c.id).length >= 2);
  const [target, other] = yardsOf(commodity.id);
  const before = sellStanding(commodity.id, target.id, {});
  // Empty the other yard: she pays her ceiling, so the target can only look worse or stay.
  const drained = { [other.id]: { stock: { [commodity.id]: 0 } } };
  const after = sellStanding(commodity.id, target.id, drained);
  assert.ok(["best", "worst", "even"].includes(after));
  // A drained rival never makes our yard better: the ceiling is the highest bid there is.
  assert.notEqual(after, "best", `draining ${other.id} made ${target.id} the best sale`);
  assert.ok(["best", "worst", "even"].includes(before));
});

// A stock that is not a number is not a broken input: the market reads it as her resting
// stock (S119), which is a real price, so that case belongs to the price tests, not here.
test("S136: an unknown good or yard has no standing, and never throws", () => {
  for (const [good, yard, memories] of [
    ["no-existe", "puerto-casa", {}],
    [COMMODITIES[0].id, "no-existe", {}],
    [null, "puerto-casa", {}],
    [undefined, "puerto-casa", {}],
  ]) {
    assert.equal(sellStanding(good, yard, memories), "even");
  }
  // A missing memory is a market at rest, not a broken input: her own price decides, and
  // "worst" is a legitimate answer when she really pays the least.
  for (const commodity of COMMODITIES) {
    for (const yard of yardsOf(commodity.id)) {
      assert.ok(["best", "worst", "even"].includes(sellStanding(commodity.id, yard.id, null)));
    }
  }
});
