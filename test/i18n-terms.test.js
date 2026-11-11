import test from "node:test";
import assert from "node:assert/strict";

import { ZONES } from "../src/data/naval-data.js";
import { COLLECTION } from "../src/i18n/index.js";
import { createTranslator } from "../src/i18n/core.js";
import {
  defaultShipNameFor,
  issueMessage,
  localisedAmmo,
  localisedCrewRole,
  localisedHull,
  localisedPiece,
  localisedZone,
} from "../src/i18n/terms.js";

const tr = (language) => createTranslator(COLLECTION, language).t;

/* ---------------------------------------------------------------- S11 entity views */

test("S11: a hull is rendered in the active language", () => {
  assert.equal(localisedHull("galeon-pequeno", tr("es")).name, "Galeón pequeño");
  assert.equal(localisedHull("galeon-pequeno", tr("en")).name, "Small galleon");
});

test("S11: hull type, country and note are translated too", () => {
  const es = localisedHull("patache", tr("es"));
  const en = localisedHull("patache", tr("en"));
  assert.equal(es.country, "España");
  assert.equal(en.country, "Spain");
  assert.notEqual(es.type, en.type);
  assert.notEqual(es.note, en.note);
});

test("S11: a gun name is translated and its numbers survive", () => {
  const es = localisedPiece("canon-40", tr("es"));
  const en = localisedPiece("canon-40", tr("en"));
  assert.equal(es.name, "Cañón de 40 libras");
  assert.equal(en.name, "40-pounder cannon");
  // the localised copy keeps the data fields the UI renders
  assert.equal(en.shotKg, es.shotKg);
  assert.equal(en.rangeM, es.rangeM);
});

test("S11: a piece without a note does not gain one", () => {
  const piece = localisedPiece("canon-40", tr("en"));
  assert.equal(piece.note, undefined);
});

test("S11: a piece with a note gets it translated", () => {
  assert.match(localisedPiece("pedrero", tr("es")).note, /San Diego/);
  assert.match(localisedPiece("pedrero", tr("en")).note, /San Diego/);
  assert.notEqual(
    localisedPiece("pedrero", tr("es")).note,
    localisedPiece("pedrero", tr("en")).note,
  );
});

test("S11: ammunition, zone and crew role are translated", () => {
  assert.equal(localisedAmmo("cadena", tr("en")).name, "Chain shot");
  assert.equal(localisedZone(ZONES[0], tr("en")).name, "Coastal waters");
  assert.equal(localisedCrewRole("marino", tr("en")).name, "Sailor");
});

test("S11: an unknown id yields null instead of throwing", () => {
  assert.equal(localisedHull("not-a-hull", tr("es")), null);
  assert.equal(localisedPiece("not-a-piece", tr("en")), null);
});

test("S11: a missing catalogue key falls back to the dataset text, not the key", () => {
  const bare = createTranslator({ es: {}, en: {} }, "es").t;
  const hull = localisedHull("patache", bare);
  // the raw Spanish field from naval-data.js is the last line of defence
  assert.equal(hull.name, "Patache");
  assert.equal(hull.country, "España");
});

/* ---------------------------------------------------------------- S11/S14 issue text */

test("S14: an issue is rendered from its code and params", () => {
  const issue = { code: "unaffordable", params: { missing: 5, total: 100, gold: 95 } };
  assert.equal(
    issueMessage(issue, tr("es")),
    "Faltan 5 doblones: el barco cuesta 100 y tenés 95.",
  );
  assert.equal(
    issueMessage(issue, tr("en")),
    "5 doubloons short: the ship costs 100 and you have 95.",
  );
});

test("S14: an issue with no params still renders", () => {
  assert.equal(
    issueMessage({ code: "no-provisions", params: {} }, tr("en")),
    "With no days of provisions the ship cannot sail.",
  );
});

test("S14: a missing issue is an empty string, not a crash", () => {
  assert.equal(issueMessage(null, tr("es")), "");
  assert.equal(issueMessage({}, tr("es")), "");
});

/* ---------------------------------------------------------------- default names */

test("S11: the default ship name follows the language", () => {
  assert.equal(defaultShipNameFor("patache", tr("es")), "Avispa");
  assert.equal(defaultShipNameFor("patache", tr("en")), "Wasp");
  // proper names stay proper names
  assert.equal(defaultShipNameFor("galeon-pequeno", tr("es")), "Golden Hind");
  assert.equal(defaultShipNameFor("galeon-pequeno", tr("en")), "Golden Hind");
});
