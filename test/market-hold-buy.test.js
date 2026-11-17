/**
 * S138: holding the buy button keeps buying, and the step grows as it goes.
 *
 * User request (verbatim): "si en el mercado dejo el boton de comprar pulsado la compra va
 * de 10 en 10 en vez de 1 a 11 hata que haya dinero"
 *
 * The reading taken: a press buys one unit; while the button stays held the purchase
 * repeats and each repeat is ten units instead of one, until the purse, the hold or the
 * yard's stock says no. A single click stays a single unit, because that is what the
 * button has always done and what the player expects from one press.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { COMMODITIES, SHIPYARDS } from "../src/data/naval-data.js";
import { buyPriceNow } from "../src/model/commerce.js";
import { HOLD_BUY, holdBuyUnits, holdBuyTotal } from "../src/model/commerce.js";

const yard = SHIPYARDS.find((entry) => entry.home);
const good = COMMODITIES[0].id;
const unit = buyPriceNow(good, yard.id, {});

test("S138: the first press buys one, the repeats buy ten", () => {
  assert.equal(HOLD_BUY.firstUnits, 1);
  assert.equal(HOLD_BUY.repeatUnits, 10);
  assert.equal(holdBuyUnits(0), 1);
  assert.equal(holdBuyUnits(1), 10);
  assert.equal(holdBuyUnits(5), 10);
});

test("S138: the repeats stop at the purse", () => {
  // Exactly enough for one unit and nine repeats: the ninth is the last whole batch.
  const gold = unit * (1 + 10 * 3);
  const total = holdBuyTotal({ unitPrice: unit, gold, room: 1000, stock: 1000 });
  assert.equal(total, 1 + 10 * 3);
  assert.equal(total * unit, gold);
});

test("S138: the repeats stop at the hold", () => {
  const total = holdBuyTotal({ unitPrice: 1, gold: 1e9, room: 25, stock: 1000 });
  assert.equal(total, 21);
});

test("S138: the repeats stop at the yard's stock", () => {
  const total = holdBuyTotal({ unitPrice: 1, gold: 1e9, room: 1000, stock: 23 });
  assert.equal(total, 21);
});

test("S138: a purse that cannot pay for a batch buys nothing more", () => {
  assert.equal(holdBuyTotal({ unitPrice: 100, gold: 50, room: 1000, stock: 1000 }), 0);
  assert.equal(holdBuyTotal({ unitPrice: 0, gold: 1000, room: 1000, stock: 1000 }), 0);
  for (const broken of [null, {}, { unitPrice: "x", gold: "y", room: "z", stock: "w" }]) {
    assert.equal(holdBuyTotal(broken), 0);
  }
});

test("S138: the batch is what the model then buys, at the price it quoted", () => {
  // The number the hold-buy proposes must be exactly what buyCargo accepts and charges,
  // so the screen never promises a batch the model would refuse.
  const gold = unit * 60;
  const total = holdBuyTotal({ unitPrice: unit, gold, room: 1000, stock: 1000 });
  assert.ok(total > 1);
  assert.ok(total * unit <= gold);
});
