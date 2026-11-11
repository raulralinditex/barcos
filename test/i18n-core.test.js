import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  createTranslator,
  detectLanguage,
  interpolate,
  loadLanguage,
  normalizeLanguage,
  resolveLanguage,
  saveLanguage,
} from "../src/i18n/core.js";

/** Minimal in-memory Storage, so the tests never touch a browser. */
const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
    dump: () => ({ ...data }),
  };
};

const CATALOGUE = {
  es: {
    "app.title": "Astillero",
    "ship.greeting": "Zarpa el {name}.",
    "only.es": "Solo español",
  },
  en: {
    "app.title": "Shipyard",
    "ship.greeting": "The {name} sets sail.",
  },
};

/* ---------------------------------------------------------------- S12 detection */

test("S12: an English browser starts in English", () => {
  assert.equal(detectLanguage("en-US"), "en");
  assert.equal(detectLanguage("en"), "en");
  assert.equal(detectLanguage("EN-gb"), "en");
});

test("S12: a Spanish browser starts in Spanish", () => {
  assert.equal(detectLanguage("es-AR"), "es");
  assert.equal(detectLanguage("es"), "es");
});

test("S12: any other locale falls back to Spanish", () => {
  assert.equal(detectLanguage("fr-FR"), "es");
  assert.equal(detectLanguage("de"), "es");
  assert.equal(detectLanguage(undefined), "es");
  assert.equal(detectLanguage(""), "es");
});

test("S12: the stored choice wins over the browser locale", () => {
  const storage = fakeStorage({ "barcos:lang:v1": "en" });
  assert.equal(resolveLanguage(storage, "es-AR"), "en");
});

test("S12: with nothing stored, the browser decides", () => {
  assert.equal(resolveLanguage(fakeStorage(), "en-GB"), "en");
  assert.equal(resolveLanguage(fakeStorage(), "es-ES"), "es");
});

/* ---------------------------------------------------------------- S12 persistence */

test("S12: the choice round-trips through storage", () => {
  const storage = fakeStorage();
  assert.equal(loadLanguage(storage), null);
  saveLanguage(storage, "en");
  assert.equal(loadLanguage(storage), "en");
  saveLanguage(storage, "es");
  assert.equal(loadLanguage(storage), "es");
});

test("S12: a corrupted stored language is ignored", () => {
  const storage = fakeStorage({ "barcos:lang:v1": "klingon" });
  assert.equal(loadLanguage(storage), null);
  assert.equal(resolveLanguage(storage, "en-US"), "en");
});

test("S12: storage failures never break the game", () => {
  const broken = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  assert.equal(loadLanguage(broken), null);
  assert.equal(saveLanguage(broken, "en"), "en");
  assert.equal(resolveLanguage(broken, "en-US"), "en");
});

/* ---------------------------------------------------------------- S11 lookup */

test("S11: the translator resolves keys in the active language", () => {
  const translator = createTranslator(CATALOGUE, "es");
  assert.equal(translator.t("app.title"), "Astillero");
  translator.setLanguage("en");
  assert.equal(translator.t("app.title"), "Shipyard");
});

test("S11: every supported language has a catalogue", () => {
  for (const language of LANGUAGES) {
    assert.ok(CATALOGUE[language], `missing catalogue for ${language}`);
  }
  assert.equal(DEFAULT_LANGUAGE, "es");
});

test("S11: a key missing in the active language falls back to the default one", () => {
  const translator = createTranslator(CATALOGUE, "en");
  assert.equal(translator.t("only.es"), "Solo español");
});

test("S11: an unknown key returns the key itself instead of throwing", () => {
  const translator = createTranslator(CATALOGUE, "es");
  assert.equal(translator.t("does.not.exist"), "does.not.exist");
});

test("S11: an unsupported language is refused and the current one stays", () => {
  const translator = createTranslator(CATALOGUE, "es");
  assert.equal(translator.setLanguage("fr"), "es");
  assert.equal(translator.language, "es");
  assert.equal(translator.setLanguage("en"), "en");
});

/* ---------------------------------------------------------------- S14 interpolation */

test("S14: placeholders are filled from the params", () => {
  const translator = createTranslator(CATALOGUE, "es");
  assert.equal(translator.t("ship.greeting", { name: "Golden Hind" }), "Zarpa el Golden Hind.");
  translator.setLanguage("en");
  assert.equal(translator.t("ship.greeting", { name: "Golden Hind" }), "The Golden Hind sets sail.");
});

test("S14: each language keeps its own word order", () => {
  const order = {
    es: { msg: "Faltan {missing} doblones de {total}." },
    en: { msg: "{missing} doubloons short of {total}." },
  };
  const translator = createTranslator(order, "es");
  assert.equal(translator.t("msg", { missing: 5, total: 100 }), "Faltan 5 doblones de 100.");
  translator.setLanguage("en");
  assert.equal(translator.t("msg", { missing: 5, total: 100 }), "5 doubloons short of 100.");
});

test("S14: a missing placeholder is left visible instead of vanishing", () => {
  assert.equal(interpolate("Hola {name}", {}), "Hola {name}");
  assert.equal(interpolate("Hola {name}", { name: "Ana" }), "Hola Ana");
});

test("S14: numbers and zeros are interpolated like any other value", () => {
  assert.equal(interpolate("{n} piezas", { n: 0 }), "0 piezas");
  assert.equal(interpolate("{n}", { n: 12 }), "12");
});

test("S14: a template with no placeholders is returned unchanged", () => {
  assert.equal(interpolate("Sin cambios", { name: "x" }), "Sin cambios");
});

/* ---------------------------------------------------------------- normalization */

test("normalizeLanguage accepts only supported tags", () => {
  assert.equal(normalizeLanguage("es"), "es");
  assert.equal(normalizeLanguage("EN"), "en");
  assert.equal(normalizeLanguage("en-US"), null);
  assert.equal(normalizeLanguage(null), null);
  assert.equal(normalizeLanguage(""), null);
});
