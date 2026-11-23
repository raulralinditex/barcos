/**
 * S180: losing the last hull costs the hulls, not the purse.
 *
 * The player reported it (verbatim): "despues de que se hunde la capitana, los doblones
 * desaparecen". Measured: a voyage that ended with 50,000 doblones came back to the shipyard
 * showing 12,000 — the starting purse — because the way out of a lost voyage deleted the whole
 * `barcos:game:v1` record, and the gold lives in it.
 *
 * What a lost voyage may erase is the sea: the world, the combat, the markets. The purse is
 * not the sea's. It is the player's, it survived the sinking, and the shipyard reads it from
 * that same record.
 *
 * These tests pin the rule in the model, so the screen's handler has one place to ask.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { purseAfterLoss, PURSE_KEYS } from "../src/model/loss.js";

test("S180: the purse survives the loss of the voyage", () => {
  const record = {
    gold: 50000,
    markets: { "puerto-casa": { stock: { sal: 60 } } },
    fort: { boughtGuns: 3 },
    world: "{\"v\":1}",
    combat: { player: { condition: { hull: 0 } } },
    supplyByHull: { cap: 1200 },
  };
  const after = purseAfterLoss(record);
  assert.equal(after.gold, 50000, "the purse must survive");
  // Everything the sea owned goes: the voyage is over.
  assert.equal(after.world, undefined, "the dead sea must go");
  assert.equal(after.combat, undefined, "the dead fight must go");
  assert.equal(after.supplyByHull, undefined, "the dead squadron's reserves must go");
  // What the shipyard owns stays: the fort she invested in, and the markets she traded.
  assert.deepEqual(after.fort, { boughtGuns: 3 }, "the fort is the yard's, not the sea's");
  assert.deepEqual(after.markets, { "puerto-casa": { stock: { sal: 60 } } }, "the markets are the yard's");
});

test("S180: a broken or missing record yields the starting purse, never NaN", () => {
  for (const bad of [null, undefined, {}, { gold: "mucho" }, { gold: -5 }, { gold: NaN }]) {
    const after = purseAfterLoss(bad);
    assert.ok(after, "a broken record must still give a record");
    assert.equal(typeof after.gold, "number", `gold must be a number, got ${after.gold}`);
    assert.ok(after.gold >= 0, `gold must not be negative, got ${after.gold}`);
  }
});

test("S180: a purse of zero is kept as zero, not replaced by a default", () => {
  // A player who spent everything keeps her zero: the rule is "the purse survives", and
  // replacing it with a starting amount would be a gift the loss did not earn.
  assert.equal(purseAfterLoss({ gold: 0 }).gold, 0);
});

test("S180: the keys a lost voyage erases are declared, not guessed", () => {
  // The list is the rule: whatever is not in it survives, and the purse is never in it.
  assert.ok(!PURSE_KEYS.includes("gold"), "the purse must never be erased with the sea");
  for (const key of ["world", "combat", "supplyByHull", "ship"]) {
    assert.ok(PURSE_KEYS.includes(key), `${key} belongs to the dead voyage and must be erased`);
  }
  assert.ok(!PURSE_KEYS.includes("fort"), "the fort survives");
  assert.ok(!PURSE_KEYS.includes("markets"), "the markets survive");
});
