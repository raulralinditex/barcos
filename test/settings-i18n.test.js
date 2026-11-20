/**
 * Every setting on screen has a name in both languages.
 *
 * The player reported it (verbatim): "en configuracion, tenemos varios items sin label,
 * muesta la key". Three fields of the yard-investment block were declared with a `label`
 * that no catalogue carried, so the screen printed `settings.fortUpgrade.gunCost` where a
 * human label belonged. A raw key on screen is worse than a wrong one: it tells the player
 * the screen is broken, and it hides which number she is actually moving.
 *
 * The rule: a field's label, its group's name and the units it is shown in all resolve in
 * es and in en. Nothing on the settings screen may fall through to a key.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { SETTINGS_FIELDS } from "../src/model/settings.js";
import { es } from "../src/i18n/es.js";
import { en } from "../src/i18n/en.js";

const missing = (dict) => SETTINGS_FIELDS.filter((field) => !dict[field.label]).map((f) => f.label);

test("settings: every field has a label in Spanish and in English", () => {
  assert.deepEqual(
    missing(es),
    [],
    `these labels print as raw keys in Spanish: ${JSON.stringify(missing(es))}`,
  );
  assert.deepEqual(
    missing(en),
    [],
    `these labels print as raw keys in English: ${JSON.stringify(missing(en))}`,
  );
});

test("settings: every group on screen has a name in both languages", () => {
  const groups = [...new Set(SETTINGS_FIELDS.map((field) => field.group))];
  for (const group of groups) {
    const key = `settings.group.${group}`;
    assert.ok(es[key], `the group "${group}" has no Spanish name (${key})`);
    assert.ok(en[key], `the group "${group}" has no English name (${key})`);
  }
});

test("settings: every unit the screen prints resolves in both languages", () => {
  // The units `settings-tab.js` asks for, by scale. A missing one shows a raw key next to
  // the number, which is the same defect in a different place.
  const units = ["km", "m", "s", "kn", "gold", "radS", "deg"];
  for (const unit of units) {
    const key = `settings.unit.${unit}`;
    assert.ok(es[key], `the unit "${unit}" has no Spanish label (${key})`);
    assert.ok(en[key], `the unit "${unit}" has no English label (${key})`);
  }
});
