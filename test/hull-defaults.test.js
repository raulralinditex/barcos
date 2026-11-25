/**
 * Every hull in the catalogue carries her own default loadout.
 *
 * The player reported that picking a hull on the buy screen kept the previous hull's rig,
 * so a barca costera opened with a galleon's four battery rows and 34/10/26 men, and the
 * verdict panel filled up with mass-exceeded, no-cargo-room and too-many-pieces. The rig
 * panel must show the defaults of the hull the player just selected, which means the data
 * has to declare one per hull and it has to be a ship the model accepts.
 *
 * These tests read the data through the public model (`buildShip`, `validateShip`) and the
 * country catalogue, never through a private copy of the numbers.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { HULLS, pieceById } from "../src/data/naval-data.js";
import { availablePieces } from "../src/model/country.js";
import { buildShip, normaliseConfig } from "../src/model/shipyard.js";
import { computeBudget, validateShip } from "../src/model/ship-model.js";

/** The config the shipyard builds from a hull's own defaults. */
const configOf = (hull) => ({ hullId: hull.id, ...hull.defaultLoadout });

/** The hull's defaults as the model normalises them. */
const cleanOf = (hull) => normaliseConfig(configOf(hull));

test("every hull declares a default loadout", () => {
  for (const hull of HULLS) {
    assert.ok(hull.defaultLoadout, `${hull.id}: no defaultLoadout`);
    assert.ok(Array.isArray(hull.defaultLoadout.batteries), `${hull.id}: batteries is not a list`);
    assert.ok(hull.defaultLoadout.crew, `${hull.id}: no crew`);
  }
});

test("every hull's default loadout builds a ship", () => {
  for (const hull of HULLS) {
    const ship = buildShip(configOf(hull));
    assert.ok(ship, `${hull.id}: buildShip returned null`);
    assert.equal(ship.hull.id, hull.id, `${hull.id}: the ship has another hull`);
  }
});

test("every hull's default loadout is a ship the model does not complain about", () => {
  for (const hull of HULLS) {
    const clean = cleanOf(hull);
    const hullEntry = HULLS.find((entry) => entry.id === hull.id);
    const modelInput = { hull: hullEntry, ...clean, hullId: undefined };
    const budget = computeBudget(modelInput);
    const verdict = validateShip(modelInput, budget);
    assert.deepEqual(
      verdict.issues,
      [],
      `${hull.id}: the default loadout is not clean (${verdict.issues
        .map((issue) => `${issue.level}:${issue.code}`)
        .join(", ")})`,
    );
  }
});

test("every piece of a default loadout is sold in every country of its hull", () => {
  for (const hull of HULLS) {
    const countries = hull.countries ?? [];
    assert.ok(countries.length > 0, `${hull.id}: the hull declares no country`);
    for (const country of countries) {
      const sold = availablePieces(country).map((piece) => piece.id);
      for (const entry of cleanOf(hull).batteries) {
        assert.ok(
          sold.includes(entry.pieceId),
          `${hull.id}: ${entry.pieceId} is not sold in ${country}`,
        );
      }
    }
  }
});

test("every ammo of a default loadout belongs to its piece", () => {
  for (const hull of HULLS) {
    for (const entry of cleanOf(hull).batteries) {
      const piece = pieceById(entry.pieceId);
      assert.ok(piece, `${hull.id}: unknown piece ${entry.pieceId}`);
      assert.ok(
        piece.ammo.includes(entry.ammoId),
        `${hull.id}: ${entry.pieceId} cannot fire ${entry.ammoId}`,
      );
    }
  }
});

test("the galleon the screen opens with keeps the default it always had", () => {
  // The buy screen boots on this hull with this exact rig (src/ui/app.js DEFAULT_LOADOUT).
  // Moving the numbers into the data must not change what the player sees on opening.
  const hull = HULLS.find((entry) => entry.id === "galeon-pequeno");
  const clean = cleanOf(hull);
  assert.deepEqual(clean.batteries, [
    { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "falcon", qty: 2, side: "babor", shotsPerPiece: 30, ammoId: "metralla" },
    { pieceId: "falcon", qty: 2, side: "estribor", shotsPerPiece: 30, ammoId: "metralla" },
  ]);
  assert.deepEqual(clean.crew, { marino: 34, artillero: 10, soldado: 26 });
  assert.equal(clean.days, 45);
  assert.equal(clean.cargoKg, 6000);
  assert.equal(clean.ballastKg, 3000);
  assert.equal(clean.equipmentKg, 2500);
  assert.equal(clean.reserveKg, 1500);
});
