/**
 * The editable catalogue (S80, S81, S82, S83).
 *
 * Two ideas carry the whole feature and both are pinned here:
 *   - a historical record keeps its identity and may only move inside its own
 *     historical margin, taken from the range the datum itself declares;
 *   - a new record is free, because there is no datum to respect.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { HULLS, PIECES } from "../src/data/naval-data.js";
import {
  CONVENTION_MARGIN,
  catalogueIdFrom,
  deriveHull,
  historicalMargin,
  isIdentityField,
  mergeCatalogue,
  newHull,
  newPiece,
  normaliseCatalogue,
  withinMargin,
} from "../src/model/catalogue.js";

/* ---------------------------------------------------------------- margins (S82) */

test("S82: the margin of a hull comes from its own measured range", () => {
  // galeon-guerra is [400, 500]: half width 50 over a mid of 450 is 11.1 %.
  const hull = HULLS.find((entry) => entry.id === "galeon-guerra");
  const margin = historicalMargin(hull, "arqueo");
  assert.ok(Math.abs(margin - 0.111) < 0.001, `expected about 11.1 %, got ${margin}`);
});

test("S82: a hull with a degenerate range falls back to the convention margin", () => {
  // zabra is [166, 166]: a 0 % margin would make the record untouchable.
  for (const id of ["zabra", "jacht", "gran-galeon", "pinaza"]) {
    const hull = HULLS.find((entry) => entry.id === id);
    assert.equal(hull.arqueo[0], hull.arqueo[1], `${id} is not degenerate any more`);
    assert.equal(
      historicalMargin(hull, "arqueo"),
      CONVENTION_MARGIN,
      `${id} should fall back to the convention margin`,
    );
  }
});

test("S82: a field with no measured range uses the convention margin", () => {
  const hull = HULLS.find((entry) => entry.id === "galeon-guerra");
  for (const key of ["lengthM", "beamM", "priceGold", "crewMin", "maxPiecesPerSide"]) {
    assert.equal(historicalMargin(hull, key), CONVENTION_MARGIN, key);
  }
});

test("S82: a new record has no historical margin", () => {
  const hull = newHull({ name: "Bergantín de prueba", arqueo: [120, 140] });
  assert.equal(historicalMargin(hull, "arqueo"), null);
  assert.equal(historicalMargin(hull, "lengthM"), null);
});

test("S82: a value inside the margin is accepted, one outside is pulled back", () => {
  const hull = HULLS.find((entry) => entry.id === "galeon-guerra");
  const margin = historicalMargin(hull, "arqueo");
  const mid = (hull.arqueo[0] + hull.arqueo[1]) / 2;
  assert.ok(withinMargin(hull, "arqueo", mid * (1 + margin * 0.5)));
  assert.equal(withinMargin(hull, "arqueo", mid * (1 + margin * 2)), false);
  assert.equal(withinMargin(hull, "arqueo", mid * (1 - margin * 2)), false);
});

/* ---------------------------------------------------------------- identity (S82) */

test("S82: the identity of a historical record is read-only", () => {
  for (const key of ["id", "name", "type", "country", "date", "provenance", "note"]) {
    assert.ok(isIdentityField(key), `${key} should be read-only`);
  }
  for (const key of ["lengthM", "beamM", "priceGold", "crewMin", "arqueo", "maxPiecesPerSide", "draftRefM"]) {
    assert.equal(isIdentityField(key), false, `${key} should be editable`);
  }
});

/* ---------------------------------------------------------------- a new hull (S80) */

test("S80: a new hull derives its numbers the same way a shipped one does", () => {
  const hull = newHull({
    name: "Bergantín de prueba",
    arqueo: [100, 200],
    lengthM: 20,
    beamM: 6,
    draftRefM: 2.4,
    maxPiecesPerSide: 8,
    crewMin: 12,
    priceGold: 1000,
    countries: ["espana"],
  });
  assert.equal(hull.arqueoMid, 150);
  assert.equal(hull.displacementKg, 300_000);
  assert.equal(hull.lightMassKg, 165_000);
  assert.ok(Math.abs(hull.waterplaneM2 - 86.4) < 0.05, `waterplane ${hull.waterplaneM2}`);
  assert.equal(hull.draftRefFraction, 0.75);
  assert.equal(hull.provenance, "nueva");
});

test("S80: deriveHull recomputes the derived fields and never trusts them", () => {
  const hull = deriveHull({
    name: "Casco", arqueo: [100, 100], lengthM: 10, beamM: 5,
    displacementKg: 999_999, arqueoMid: 42, lightMassKg: 1,
  });
  assert.equal(hull.arqueoMid, 100, "arqueoMid must come from arqueo");
  assert.equal(hull.displacementKg, 200_000, "displacement must come from arqueo");
});

test("S80: an id is derived from the name and cannot collide", () => {
  assert.equal(catalogueIdFrom("Bergantín de Prueba"), "bergantin-de-prueba");
  assert.equal(catalogueIdFrom("  Naô  del Rey  "), "nao-del-rey");
  // A name that collides with an existing id gets a suffix, never a silent overwrite.
  const taken = catalogueIdFrom("Galeaza", new Set(["galeaza"]));
  assert.equal(taken, "galeaza-2");
  assert.equal(catalogueIdFrom("Galeaza", new Set(["galeaza", "galeaza-2"])), "galeaza-3");
});

test("S80: a new hull needs a name and a positive range", () => {
  assert.equal(newHull({}), null);
  assert.equal(newHull({ name: "   " }), null);
  assert.equal(newHull({ name: "Casco", arqueo: [0, 0] }), null);
  assert.equal(newHull({ name: "Casco", arqueo: [200, 100] }), null);
  assert.ok(newHull({ name: "Casco", arqueo: [100, 200] }));
});

/* ---------------------------------------------------------------- a new piece (S81) */

test("S81: a new piece is marked as new and carries its numbers", () => {
  const piece = newPiece({
    name: "Cañón de prueba", family: "cañón", shotKg: 10, rangeM: 350,
    reloadS: 150, mountKg: 1500, priceGold: 400, countries: ["espana"],
  });
  assert.equal(piece.provenance, "nueva");
  assert.equal(piece.id, "canon-de-prueba");
  assert.equal(piece.shotKg, 10);
  assert.deepEqual(piece.ammo, ["bala-hierro"], "a new piece loads round shot by default");
});

test("S81: a new piece needs a name and positive numbers", () => {
  assert.equal(newPiece({}), null);
  assert.equal(newPiece({ name: "Pieza", shotKg: 0 }), null);
  assert.equal(newPiece({ name: "Pieza", shotKg: 5, rangeM: 0 }), null);
});

/* ---------------------------------------------------------------- storage rules (S83) */

test("S83: a stored record can never replace a shipped one", () => {
  const shipped = HULLS.map((hull) => hull.id);
  const hostile = {
    hulls: [{ ...newHull({ name: "Galeaza falsa", arqueo: [1, 2] }), id: "galeaza" }],
    pieces: [],
  };
  const merged = mergeCatalogue(HULLS, PIECES, hostile);
  const galeaza = merged.hulls.find((hull) => hull.id === "galeaza");
  assert.notEqual(galeaza.name, "Galeaza falsa", "a stored record overwrote a shipped one");
  assert.equal(merged.hulls.length, shipped.length, "the hostile record should be dropped");
});

test("S83: a stored new record is added next to the shipped ones", () => {
  const added = { ...newHull({ name: "Bergantín de prueba", arqueo: [100, 200] }) };
  const merged = mergeCatalogue(HULLS, PIECES, { hulls: [added], pieces: [] });
  assert.equal(merged.hulls.length, HULLS.length + 1);
  assert.ok(merged.hulls.some((hull) => hull.id === added.id));
});

test("S83: a corrupted catalogue leaves the shipped one intact", () => {
  for (const broken of [null, "basura", 42, { hulls: "no", pieces: 7 }, { hulls: [null, 3] }]) {
    const merged = mergeCatalogue(HULLS, PIECES, broken);
    assert.equal(merged.hulls.length, HULLS.length, `broke on ${JSON.stringify(broken)}`);
    assert.equal(merged.pieces.length, PIECES.length, `broke on ${JSON.stringify(broken)}`);
  }
});

test("S83: a shipped record edited inside its margin is kept, outside it is pulled back", () => {
  const galeon = HULLS.find((hull) => hull.id === "galeon-guerra");
  const margin = historicalMargin(galeon, "priceGold");
  const stored = {
    hulls: [{ id: "galeon-guerra", priceGold: Math.round(galeon.priceGold * (1 + margin * 0.5)) }],
    pieces: [],
  };
  const kept = mergeCatalogue(HULLS, PIECES, stored).hulls.find((h) => h.id === "galeon-guerra");
  assert.equal(kept.priceGold, Math.round(galeon.priceGold * (1 + margin * 0.5)));

  const wild = { hulls: [{ id: "galeon-guerra", priceGold: galeon.priceGold * 50 }], pieces: [] };
  const pulled = mergeCatalogue(HULLS, PIECES, wild).hulls.find((h) => h.id === "galeon-guerra");
  assert.ok(
    pulled.priceGold <= Math.round(galeon.priceGold * (1 + margin)),
    `${pulled.priceGold} escaped the margin`,
  );
});

test("S83: normalising a catalogue never throws and never returns a partial list", () => {
  const result = normaliseCatalogue(undefined);
  assert.ok(Array.isArray(result.hulls) && Array.isArray(result.pieces));
});

/* ---------------------------------------------------------------- applying it (S83) */

test("S83: applying a catalogue pushes a new hull into the live list", async () => {
  const { HULLS: live } = await import("../src/data/naval-data.js");
  const { applyCatalogue } = await import("../src/model/catalogue-storage.js");
  const before = live.length;
  const created = newHull({ name: "Casco de prueba aplicado", arqueo: [100, 200] });
  try {
    applyCatalogue({ hulls: [created], pieces: [] });
    assert.equal(live.length, before + 1, "the new hull did not reach the live list");
    assert.ok(live.some((hull) => hull.id === created.id));
  } finally {
    const at = live.findIndex((hull) => hull.id === created.id);
    if (at >= 0) live.splice(at, 1);
  }
  assert.equal(live.length, before, "the test did not clean up after itself");
});

test("S83: applying a catalogue edits a shipped hull in place, keeping its identity", async () => {
  const { HULLS: live } = await import("../src/data/naval-data.js");
  const { applyCatalogue } = await import("../src/model/catalogue-storage.js");
  const galeon = live.find((hull) => hull.id === "galeon-guerra");
  const original = { priceGold: galeon.priceGold, name: galeon.name };
  try {
    applyCatalogue({
      hulls: [{ id: "galeon-guerra", priceGold: Math.round(original.priceGold * 1.05), name: "Robado" }],
      pieces: [],
    });
    assert.equal(galeon.name, original.name, "a stored blob renamed a shipped hull");
    assert.ok(galeon.priceGold > original.priceGold, "the edit did not land");
  } finally {
    galeon.priceGold = original.priceGold;
  }
  assert.equal(galeon.priceGold, original.priceGold);
});
