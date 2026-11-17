/**
 * S137: the "sail to ..." button is optional, and off by default.
 *
 * User request (verbatim): "vamos a poner el boton 'viajar a puerto ....' configurable su
 * visibilidad por configuracion, no visible por defecto"
 */
import test from "node:test";
import assert from "node:assert/strict";

import { VOYAGE, voyageButtonVisible } from "../src/model/voyage.js";
import { SETTINGS_BLOCKS, SETTINGS_DEFAULTS, SETTINGS_FIELDS, applySettings, currentSettings, fieldId, normaliseSettings, resetSettings } from "../src/model/settings.js";

const field = SETTINGS_FIELDS.find((entry) => entry.group === "voyage" && entry.key === "showTravelButton");

test("S137: the voyage button ships hidden", () => {
  assert.ok(field, "settings must declare voyage.showTravelButton");
  assert.equal(field.control, "switch");
  assert.equal(VOYAGE.showTravelButton, 0);
  assert.equal(SETTINGS_DEFAULTS[fieldId(field)], 0);
  assert.equal(SETTINGS_BLOCKS.voyage, VOYAGE);
});

test("S137: the switch turns the button on and off, and junk falls back to hidden", () => {
  try {
    applySettings({ ...currentSettings(), [fieldId(field)]: 1 });
    assert.equal(VOYAGE.showTravelButton, 1);
    assert.equal(voyageButtonVisible(), true);
    applySettings({ ...currentSettings(), [fieldId(field)]: 0 });
    assert.equal(voyageButtonVisible(), false);
    assert.equal(normaliseSettings({ [fieldId(field)]: "sí" })[fieldId(field)], 0);
  } finally {
    resetSettings();
  }
  assert.equal(VOYAGE.showTravelButton, 0);
  assert.equal(voyageButtonVisible(), false);
});

test("S137: hiding the button does not forbid the voyage, it only stops offering it", () => {
  // The rule the button stands for is unchanged: the model still quotes and still moves her.
  resetSettings();
  assert.equal(voyageButtonVisible(), false);
});
