import test from "node:test";
import assert from "node:assert/strict";

import { AMMO, COMMODITIES, CREW_ROLES, HULLS, PIECES, SHIPYARDS, ZONES } from "../src/data/naval-data.js";
import { COLLECTION, en, es } from "../src/i18n/index.js";
import { LANGUAGES, interpolate } from "../src/i18n/core.js";

const keysOf = (catalogue) => Object.keys(catalogue).sort();
const PLACEHOLDER = /\{(\w+)\}/g;
const placeholdersOf = (value) => [...String(value).matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

/* ---------------------------------------------------------------- S11 completeness */

test("S11: both languages expose exactly the same keys", () => {
  const esKeys = keysOf(es);
  const enKeys = keysOf(en);
  const missingInEn = esKeys.filter((key) => !enKeys.includes(key));
  const missingInEs = enKeys.filter((key) => !esKeys.includes(key));
  assert.deepEqual(missingInEn, [], "keys present in Spanish but missing in English");
  assert.deepEqual(missingInEs, [], "keys present in English but missing in Spanish");
});

test("S11: no translated value is empty", () => {
  for (const language of LANGUAGES) {
    for (const [key, value] of Object.entries(COLLECTION[language])) {
      assert.equal(typeof value, "string", `${language}/${key} is not a string`);
      assert.ok(value.trim().length > 0, `${language}/${key} is empty`);
    }
  }
});

test("S11: every key has the same placeholders in both languages", () => {
  for (const key of keysOf(es)) {
    assert.deepEqual(
      placeholdersOf(en[key]),
      placeholdersOf(es[key]),
      `placeholders differ for ${key}`,
    );
  }
});

/* ---------------------------------------------------------------- S11 dataset coverage */

test("S11: every hull has a name, type, country and note in both languages", () => {
  for (const hull of HULLS) {
    for (const field of ["name", "type", "country", "note"]) {
      const key = `hull.${hull.id}.${field}`;
      for (const language of LANGUAGES) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(COLLECTION[language], key),
          `${language} is missing ${key}`,
        );
      }
    }
  }
});

test("S11: every gun has a name in both languages", () => {
  for (const piece of PIECES) {
    const key = `piece.${piece.id}.name`;
    for (const language of LANGUAGES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(COLLECTION[language], key),
        `${language} is missing ${key}`,
      );
    }
  }
});

test("S11: every piece note in the data has a translation", () => {
  for (const piece of PIECES.filter((p) => p.note !== undefined)) {
    const key = `piece.${piece.id}.note`;
    for (const language of LANGUAGES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(COLLECTION[language], key),
        `${language} is missing ${key}`,
      );
    }
  }
});

test("S11: every ammunition, zone and crew role is translated", () => {
  const keys = [
    ...AMMO.map((a) => `ammo.${a.id}.name`),
    ...ZONES.flatMap((z) => [`zone.${z.id}.name`, `zone.${z.id}.description`]),
    ...CREW_ROLES.flatMap((c) => [`crew.${c.id}.name`, `crew.${c.id}.description`]),
  ];
  for (const key of keys) {
    for (const language of LANGUAGES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(COLLECTION[language], key),
        `${language} is missing ${key}`,
      );
    }
  }
});

test("S11: every hull has a default ship name in both languages", () => {
  for (const hull of HULLS) {
    const key = `shipName.${hull.id}`;
    for (const language of LANGUAGES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(COLLECTION[language], key),
        `${language} is missing ${key}`,
      );
    }
  }
});

/* ---------------------------------------------------------------- S11 catalogue hygiene */

test("S11: no catalogue key is orphaned (every key is used by the app or the data)", () => {
  const dataKeys = new Set([
    ...HULLS.flatMap((h) => ["name", "type", "country", "note"].map((f) => `hull.${h.id}.${f}`)),
    ...PIECES.map((p) => `piece.${p.id}.name`),
    ...PIECES.filter((p) => p.note !== undefined).map((p) => `piece.${p.id}.note`),
    ...AMMO.map((a) => `ammo.${a.id}.name`),
    ...ZONES.flatMap((z) => [`zone.${z.id}.name`, `zone.${z.id}.description`]),
    ...CREW_ROLES.flatMap((c) => [`crew.${c.id}.name`, `crew.${c.id}.description`]),
    ...HULLS.map((h) => `shipName.${h.id}`),
    // S113: every commodity names itself in the market board.
    ...COMMODITIES.map((c) => c.nameKey),
    // S112: every shipyard names herself.
    ...SHIPYARDS.map((y) => y.nameKey),
  ]);
  // Keys the UI resolves at runtime are prefixed with these families.
  const uiPrefixes = [
    "app.",
    "fleet.",
    "shipyard.",
    "supply.",
    "mass.",
    "sail.",
    "erase.",
    "sea.",
    "issue.",
    // S33: the settings screen resolves its labels by field id, so the family is
    // `settings.` plus one sub-family per block (settings.wind.bonus, ...).
    "settings.",
    // S80-S82: the catalogue editor on that same screen has its own family, because a
    // hull or a piece is not a tuning field and must not read as one.
    "catalogue.",
    // S118: the market tab names its own goods and its own verbs.
    "market.",
    // S171-S173: the mode registry names the games the restart screen offers, and every
    // mode resolves her own name and description through this family.
    "mode.",
    "commodity.",
    "shipyard.",
  ];
  for (const key of keysOf(es)) {
    const isData = dataKeys.has(key);
    const isUi = uiPrefixes.some((prefix) => key.startsWith(prefix));
    assert.ok(isData || isUi, `orphan catalogue key: ${key}`);
  }
});

test("S11: every validation issue code the model can emit has a message", () => {
  // Codes come from ship-model.js and shipyard.js; a new one must bring its text.
  const codes = [
    "mass-exceeded",
    "no-cargo-room",
    "deep-draft",
    "crew-below-minimum",
    "too-many-pieces",
    "under-gunned-crew.one",
    "under-gunned-crew.many",
    "one-sided-battery.babor",
    "one-sided-battery.estribor",
    "rowers-without-galley",
    "no-provisions",
    "short-provisions",
    "no-soldiers",
    "unaffordable",
  ];
  for (const code of codes) {
    const key = `issue.${code}`;
    for (const language of LANGUAGES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(COLLECTION[language], key),
        `${language} is missing ${key}`,
      );
    }
  }
});

/* ---------------------------------------------------------------- S11 content sanity */

test("S11: English and Spanish actually differ where it matters", () => {
  const differing = ["app.brand", "sea.hull", "shipyard.launch", "zone.costera.name"];
  for (const key of differing) {
    assert.notEqual(es[key], en[key], `${key} was not translated`);
  }
});

test("S11: translated messages interpolate cleanly with real values", () => {
  for (const language of LANGUAGES) {
    const catalogue = COLLECTION[language];
    for (const [key, value] of Object.entries(catalogue)) {
      if (!value.includes("{")) continue;
      const params = Object.fromEntries(placeholdersOf(value).map((name) => [name, "X"]));
      const filled = interpolate(value, params);
      assert.ok(!filled.includes("{"), `${language}/${key} left a placeholder unfilled: ${filled}`);
    }
  }
});
