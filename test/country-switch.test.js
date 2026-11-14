/**
 * Switching country (S26): the catalogue is the country's, so a half-built loadout
 * that used a hull or pieces the new country does not sell has to be repaired
 * instead of left in an illegal state. These tests pin the two pure rules:
 *   - the country may only change with an empty fleet,
 *   - reconciling a loadout keeps it inside the new country's catalogue.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { COUNTRIES } from "../src/data/naval-data.js";
import {
  availableHulls,
  availablePieces,
  canChangeCountry,
  reconcileLoadout,
} from "../src/model/country.js";

const ids = (list) => list.map((entry) => entry.id);

/** The shipyard's opening loadout, the one a player most often switches away from. */
const englishLoadout = () => ({
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "falcon", qty: 2, side: "babor", shotsPerPiece: 30, ammoId: "metralla" },
    { pieceId: "falcon", qty: 2, side: "estribor", shotsPerPiece: 30, ammoId: "metralla" },
  ],
});

const fleetOf = (count) => ({
  ships: Array.from({ length: count }, (_, index) => ({ id: `ship-${index}` })),
  captainId: count > 0 ? "ship-0" : null,
});

/* ---------------------------------------------------------------- the empty-fleet lock */

test("S26: the country may change while the fleet is empty", () => {
  assert.equal(canChangeCountry(fleetOf(0)), true);
});

test("S26: one ship in the fleet locks the country", () => {
  assert.equal(canChangeCountry(fleetOf(1)), false);
  assert.equal(canChangeCountry(fleetOf(3)), false);
});

test("S26: a missing or broken fleet value never throws and counts as empty", () => {
  for (const value of [undefined, null, {}, { ships: null }, { ships: [] }]) {
    assert.equal(canChangeCountry(value), true, `fleet ${JSON.stringify(value)}`);
  }
});

/* ---------------------------------------------------------------- reconciling a loadout */

test("S26: switching to Spain replaces the English hull with the first Spanish one", () => {
  const result = reconcileLoadout(englishLoadout(), "espana");
  assert.equal(result.hullId, "patache");
  assert.ok(ids(availableHulls("espana")).includes(result.hullId));
});

test("S26: pieces the new country does not sell are dropped, the rest survive untouched", () => {
  const result = reconcileLoadout(englishLoadout(), "espana");
  const allowed = ids(availablePieces("espana"));
  for (const entry of result.batteries) {
    assert.ok(allowed.includes(entry.pieceId), `Spain does not sell ${entry.pieceId}`);
  }
  // The minions are English and Dutch only (S29); the falcons stay, both sides.
  assert.deepEqual(result.batteries.map((entry) => entry.pieceId), ["falcon", "falcon"]);
});

test("S26: a reconciled loadout is always buyable in the chosen country", () => {
  for (const country of COUNTRIES) {
    const result = reconcileLoadout(englishLoadout(), country);
    assert.ok(
      ids(availableHulls(country)).includes(result.hullId),
      `${country} does not sell hull ${result.hullId}`,
    );
    const allowed = ids(availablePieces(country));
    for (const entry of result.batteries) {
      assert.ok(allowed.includes(entry.pieceId), `${country} does not sell ${entry.pieceId}`);
    }
  }
});

test("S26: reconciling a loadout that already fits the country changes nothing", () => {
  const loadout = englishLoadout();
  const result = reconcileLoadout(loadout, "inglaterra");
  assert.equal(result.changed, false);
  assert.equal(result.hullId, "galeon-pequeno");
  assert.deepEqual(result.batteries, loadout.batteries);
});

test("S26: the Netherlands keeps the minions and drops the sacre", () => {
  const loadout = {
    hullId: "galeon-pequeno",
    batteries: [
      { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
      { pieceId: "sacre", qty: 2, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
    ],
  };
  const result = reconcileLoadout(loadout, "paises-bajos");
  assert.equal(result.hullId, "jacht");
  assert.deepEqual(result.batteries.map((entry) => entry.pieceId), ["minion"]);
});

test("S26: an unknown country falls back to England instead of throwing", () => {
  const result = reconcileLoadout(englishLoadout(), "atlantida");
  assert.equal(result.changed, false);
  assert.equal(result.hullId, "galeon-pequeno");
});

test("S26: a loadout with a hull the country does not sell keeps its legal pieces", () => {
  const result = reconcileLoadout(
    {
      hullId: "gran-buque-real",
      batteries: [{ pieceId: "verso", qty: 4, side: "swivel", shotsPerPiece: 12, ammoId: "metralla" }],
    },
    "portugal",
  );
  assert.equal(result.hullId, "carabela-latina");
  assert.deepEqual(result.batteries.map((entry) => entry.pieceId), ["verso"]);
});

test("S26: a loadout with no hull and no batteries reconciles without throwing", () => {
  for (const value of [undefined, null, {}, { hullId: "nope", batteries: null }]) {
    const result = reconcileLoadout(value, "espana");
    assert.equal(result.hullId, "patache");
    assert.deepEqual(result.batteries, []);
  }
});
