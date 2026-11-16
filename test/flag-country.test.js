/**
 * The flag the player's ships fly is the country the player selected, and every shipyard
 * flies it too.
 *
 * User request (verbatim): "la bandera que mostramos en los barcos es la del pais
 * seleccionado, tambien colocamos una bandera en cada astillero."
 */
import test from "node:test";
import assert from "node:assert/strict";

import { COUNTRIES } from "../src/data/naval-data.js";
import { flagFor, yardFlag } from "../src/model/flag.js";

test("a hull of the fleet flies the selected country, whatever her own nation", () => {
  // A Spanish prize in an English fleet: the player chose Portugal, so Portugal it is.
  assert.equal(flagFor({ hullId: "zabra", isFleet: true, captainHullId: "zabra", country: "portugal" }), "portugal");
  assert.equal(flagFor({ hullId: "patache", isFleet: true, captainHullId: "galeon-pequeno", country: "paises-bajos" }), "paises-bajos");
});

test("an enemy keeps her own hull's flag, the selected country does not touch her", () => {
  assert.equal(flagFor({ hullId: "patache", isFleet: false, country: "portugal" }), flagFor({ hullId: "patache", isFleet: false }));
});

test("an unknown or missing country falls back to the captain's flag as before", () => {
  const before = flagFor({ hullId: "zabra", isFleet: true, captainHullId: "zabra" });
  for (const country of [undefined, null, "", "no-existe", 7]) {
    assert.equal(flagFor({ hullId: "zabra", isFleet: true, captainHullId: "zabra", country }), before);
  }
});

test("a shipyard flies the selected country", () => {
  for (const country of COUNTRIES) assert.equal(yardFlag(country), country);
});

test("a shipyard with no valid country still flies a known flag", () => {
  for (const country of [undefined, null, "no-existe", 7]) assert.ok(COUNTRIES.includes(yardFlag(country)));
});
