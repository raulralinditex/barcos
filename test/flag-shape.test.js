/**
 * The shape of each flag's cross (S72 follow-up).
 *
 * England flies a Latin cross of St George; Spain flies the saltire of Burgundy (an X).
 * Two reds on the same white field are not enough to tell them apart at 26 px, so the
 * shape is the rule: a country with a cross declares which one it is, and the sea draws
 * exactly that shape.
 *
 * User report (verbatim): "cuando al principio de la partida elijo españa, me salen las
 * banderas de inglaterra en vez de la de españa".
 */
import test from "node:test";
import assert from "node:assert/strict";

import { COUNTRIES } from "../src/data/naval-data.js";
import { FLAGS } from "../src/model/flag.js";

test("Spain flies the saltire of Burgundy, not England's Latin cross", () => {
  assert.equal(FLAGS.espana.shape, "saltire");
  assert.equal(FLAGS.inglaterra.shape, "latin");
});

test("every flag with a cross declares its shape, so the sea knows what to draw", () => {
  for (const country of COUNTRIES) {
    if (!FLAGS[country].cross) continue;
    assert.ok(
      ["latin", "saltire"].includes(FLAGS[country].shape),
      `${country} has a cross but no shape (${FLAGS[country].shape})`,
    );
  }
});
