/**
 * Binary settings are checks, not numbers.
 *
 * The player asked for it (verbatim): "vamos a trabajar en los editores de la configuracion,
 * los editores binarios, hazlos con un check". Eight fields of the settings screen are yes/no
 * by shape (a range of 0 to 1 in steps of 1). Six of them already drew a checkbox, but
 * `combat.autofire` and `combat.showRange` were left as numeric inputs on purpose (S117: "a
 * control the player already knows"), so the screen mixed two ways of answering the same kind
 * of question.
 *
 * The control is declared on the field and never guessed from its range (S117), so what this
 * file pins is the rule that keeps the declaration honest in both directions: a binary field
 * cannot slip through as a number, and a check cannot be put on a field that is not binary.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { SETTINGS_FIELDS, fieldId, normaliseSettings } from "../src/model/settings.js";

const isBinary = (field) => field.min === 0 && field.max === 1 && field.step === 1;

test("controls: every yes/no field declares a check", () => {
  const numeric = SETTINGS_FIELDS.filter((field) => isBinary(field) && field.control !== "switch").map(fieldId);
  assert.deepEqual(
    numeric,
    [],
    `these fields are yes/no but would be drawn as number inputs: ${JSON.stringify(numeric)}`,
  );
});

test("controls: a check is only ever put on a field that really is yes/no", () => {
  // A checkbox can only say 0 or 1, so on a field that takes 0.35 it would silently throw the
  // number away. The declaration has to be rejected there, not trusted.
  const wrong = SETTINGS_FIELDS.filter((field) => field.control === "switch" && !isBinary(field)).map(fieldId);
  assert.deepEqual(wrong, [], `these fields are drawn as checks but take more than yes/no: ${JSON.stringify(wrong)}`);
});

test("controls: a fraction between 0 and 1 stays a number, it is not a yes/no", () => {
  // The look-alikes: 0..1 in steps of 0.05 are percentages and shares, and must keep their
  // input. This is what stops a "make every 0..1 field a check" shortcut from eating them.
  const shares = SETTINGS_FIELDS.filter((field) => field.min === 0 && field.max === 1 && field.step < 1);
  assert.ok(shares.length > 5, "the settings must still carry fractional 0..1 fields for this to mean anything");
  for (const field of shares) {
    assert.notEqual(field.control, "switch", `${fieldId(field)} is a fraction and must stay a number`);
  }
});

test("controls: the two fields that were numbers keep the 1 and 0 the model reads", () => {
  // Only the control changes: the stored value is still the number the model reads.
  for (const key of ["combat.autofire", "combat.showRange"]) {
    assert.equal(normaliseSettings({ [key]: 1 })[key], 1, `${key} on must still be 1`);
    assert.equal(normaliseSettings({ [key]: 0 })[key], 0, `${key} off must still be 0`);
    assert.equal(normaliseSettings({ [key]: "si" })[key], normaliseSettings({})[key], `${key} junk falls back to the shipped value`);
  }
});
