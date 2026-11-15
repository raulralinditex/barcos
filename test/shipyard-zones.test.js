/**
 * S112: the shipyards are data, and their zone comes from where they lie.
 *
 * The player asked for a shipyard in every zone and for the list to grow later. So a
 * shipyard is an entry in a table, never a branch in the code: adding a fourth one is
 * adding a row. Her zone is not written down either — it is read from her position, so
 * a new yard cannot lie about which market she belongs to.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SHIPYARDS,
  SHIPYARD_MOORING_M,
  shipyardAt,
  shipyardById,
} from "../src/data/naval-data.js";
import { ZONE_BANDS, currentShipyard, shipyardZone } from "../src/model/world.js";

test("every zone in the sea has a shipyard, and the home port comes first", () => {
  assert.ok(SHIPYARDS.length >= 3);
  assert.equal(SHIPYARDS[0].id, "puerto-casa");
  const zones = new Set(SHIPYARDS.map((yard) => shipyardZone(yard).id));
  for (const band of ZONE_BANDS) {
    assert.ok(zones.has(band.id), `no shipyard in the ${band.id} band`);
  }
});

test("a shipyard's zone is derived from her position, never declared", () => {
  for (const yard of SHIPYARDS) {
    // A declared zone is exactly the kind of duplicate truth that goes stale.
    assert.equal(yard.zoneId, undefined, `${yard.id} declares a zone`);
  }
  // The home port sits at the yard itself: coastal water.
  assert.equal(shipyardZone(SHIPYARDS[0]).id, "costera");
  const outer = SHIPYARDS[SHIPYARDS.length - 1];
  assert.equal(shipyardZone(outer).id, "abismo");
});

test("the home port keeps her own mooring radius, and the others have one too", () => {
  const home = shipyardById("puerto-casa");
  assert.equal(home.mooringM, SHIPYARD_MOORING_M);
  for (const yard of SHIPYARDS) {
    assert.ok(yard.mooringM > 0, `${yard.id} has no mooring radius`);
    assert.ok(Number.isFinite(yard.x) && Number.isFinite(yard.y), `${yard.id} has no position`);
  }
});

test("a hull in a yard's water resolves to that yard, and open water to none", () => {
  const home = shipyardById("puerto-casa");
  assert.equal(shipyardAt({ x: 0, y: 0 })?.id, "puerto-casa");
  // The edge of the mooring counts as inside, so a hull cannot sit on the line.
  assert.equal(shipyardAt({ x: home.mooringM, y: 0 })?.id, "puerto-casa");
  // Far from every yard there is no market to trade in.
  assert.equal(shipyardAt({ x: 0, y: home.mooringM + 1 }), null);
});

test("a broken position buys nothing", () => {
  assert.equal(shipyardAt(null), null);
  assert.equal(shipyardAt({}), null);
  assert.equal(shipyardAt({ x: Number.NaN, y: 0 }), null);
  assert.equal(shipyardAt({ x: "0", y: "0" }), null);
});

test("an unknown id is not a shipyard", () => {
  assert.equal(shipyardById("puerto-fantasma"), null);
});
