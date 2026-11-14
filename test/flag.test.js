/**
 * S72: every hull on the sea flies a flag.
 *
 * One fleet, one flag: the captain's. An enemy flies her own hull's colours.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { FLAGS, flagColours, flagFor, hullCountryId } from "../src/model/flag.js";
import { COUNTRIES } from "../src/data/naval-data.js";

/* ---------------------------------------------------------------- the rule */

test("S72: a hull knows the country it was built in", () => {
  assert.equal(hullCountryId("patache"), "espana");
  assert.equal(hullCountryId("galeon-pequeno"), "inglaterra");
  assert.equal(hullCountryId("carabela-latina"), "portugal");
  assert.equal(hullCountryId("jacht"), "paises-bajos");
});

test("S72: an unknown hull has no country instead of a wrong one", () => {
  assert.equal(hullCountryId("no-existe"), null);
  assert.equal(hullCountryId(null), null);
});

test("S72: the captain's flag is the fleet's flag", () => {
  // A Spanish prize in an English fleet flies English colours: the user's decision.
  assert.equal(flagFor({ hullId: "patache", isFleet: true, captainHullId: "galeon-pequeno" }), "inglaterra");
});

test("S72: the captain herself flies her own country", () => {
  assert.equal(flagFor({ hullId: "galeon-pequeno", isFleet: true, captainHullId: "galeon-pequeno" }), "inglaterra");
  assert.equal(flagFor({ hullId: "zabra", isFleet: true, captainHullId: "zabra" }), "espana");
});

test("S72: an enemy flies her own colours, not the captain's", () => {
  assert.equal(flagFor({ hullId: "patache", isFleet: false, captainHullId: "galeon-pequeno" }), "espana");
  assert.equal(flagFor({ hullId: "galeon-guerra", isFleet: false, captainHullId: "zabra" }), "inglaterra");
});

test("S72: a fleet with no resolvable captain still flies something", () => {
  const flag = flagFor({ hullId: "patache", isFleet: true, captainHullId: null });
  assert.ok(COUNTRIES.includes(flag), `got ${flag}`);
  assert.equal(flag, "espana", "with no captain, the hull's own nation is the honest answer");
});

test("S72: an unknown hull in a known fleet flies the captain's flag", () => {
  assert.equal(flagFor({ hullId: "no-existe", isFleet: true, captainHullId: "zabra" }), "espana");
});

test("S72: nothing resolvable falls back to the default country, never to nothing", () => {
  const flag = flagFor({ hullId: "no-existe", isFleet: false });
  assert.equal(flag, COUNTRIES[0]);
  assert.ok(COUNTRIES.includes(flag));
});

test("S72: a broken call does not throw", () => {
  for (const broken of [undefined, null, {}, { hullId: 42 }, { isFleet: "yes" }]) {
    const flag = flagFor(broken);
    assert.ok(COUNTRIES.includes(flag), `${JSON.stringify(broken)} gave ${flag}`);
  }
});

/* ---------------------------------------------------------------- the colours */

test("S72: every country has colours to paint", () => {
  for (const country of COUNTRIES) {
    const colours = flagColours(country);
    assert.ok(colours, `${country} has no flag`);
    assert.equal(colours.bands.length, 3, `${country} should have three bands`);
    for (const band of colours.bands) {
      assert.match(band, /^#[0-9a-f]{6}$/i, `${country} band ${band} is not a colour`);
    }
  }
});

test("S72: the four nations do not share one identical flag", () => {
  const painted = COUNTRIES.map((country) => JSON.stringify(flagColours(country)));
  assert.equal(new Set(painted).size, COUNTRIES.length, "two nations are flying the same colours");
});

test("S72: an unknown country falls back to the default flag", () => {
  assert.deepEqual(flagColours("no-existe"), FLAGS[COUNTRIES[0]]);
});
