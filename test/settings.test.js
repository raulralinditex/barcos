/**
 * Tuning settings (S33). The screen is only a view over this: the rules that matter
 * are the ones pinned here, because a bad settings value must never break the game.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { COMBAT } from "../src/model/combat.js";
import { REPAIR } from "../src/model/repair.js";
import {
  DESIGN_BLOCKS,
  SETTINGS_BLOCKS,
  SETTINGS_DEFAULTS,
  SETTINGS_FIELDS,
  applySettings,
  currentSettings,
  fieldId,
  fromDisplay,
  normaliseSettings,
  resetSettings,
  toDisplay,
} from "../src/model/settings.js";
import { BAR_SCALE } from "../src/model/sea-hud.js";
import { ESCORT } from "../src/model/formation.js";
import { TRAIL } from "../src/model/damage-trail.js";
import { TURNING } from "../src/model/turning.js";
import { WIND } from "../src/model/wind.js";
import { WORLD } from "../src/model/world.js";

/** Every test that writes settings restores the shipped values when it is done. */
const withDefaults = (body) => {
  try {
    body();
  } finally {
    resetSettings();
  }
};

/* ---------------------------------------------------------------- the shipped defaults */

test("S33: every field has a label, a range and a shipped default", () => {
  for (const field of SETTINGS_FIELDS) {
    assert.ok(field.label.startsWith("settings."), `${fieldId(field)} has no label key`);
    assert.ok(field.min < field.max, `${fieldId(field)} has an empty range`);
    const value = SETTINGS_DEFAULTS[fieldId(field)];
    assert.ok(Number.isFinite(value), `${fieldId(field)} has no default`);
    assert.ok(
      value >= field.min && value <= field.max,
      `${fieldId(field)} default ${value} is outside its own range`,
    );
  }
});

test("S33: the shipped defaults are what the game runs with", () => {
  const current = currentSettings();
  for (const field of SETTINGS_FIELDS) {
    assert.equal(current[fieldId(field)], SETTINGS_DEFAULTS[fieldId(field)], fieldId(field));
  }
  assert.equal(WIND.maxSpeedBonus, 0.6, "the wind bonus should ship at 60 %");
  assert.equal(WIND.maxSpeedPenalty, 0.6, "the wind penalty should ship at 60 %");
});

test("S33: no two fields write the same place", () => {
  const ids = SETTINGS_FIELDS.map(fieldId);
  assert.equal(new Set(ids).size, ids.length, "two fields share an id");
});

/* ---------------------------------------------------------------- clamping */

test("S33: a value outside its range is clamped, not rejected", () => {
  const applied = applySettings({ "wind.maxSpeedBonus": 99, "combat.damageScale": -50 });
  assert.equal(applied["wind.maxSpeedBonus"], 2);
  assert.equal(applied["combat.damageScale"], 1);
  assert.equal(WIND.maxSpeedBonus, 2);
  assert.equal(COMBAT.damageScale, 1);
});

test("S33: a broken value falls back to the shipped default", () => {
  for (const broken of [undefined, null, NaN, Infinity, "abc", {}]) {
    const applied = applySettings({ "repair.shareOfPrice": broken });
    assert.equal(applied["repair.shareOfPrice"], SETTINGS_DEFAULTS["repair.shareOfPrice"], `value ${String(broken)}`);
  }
});

test("S33: a blank input falls back to the shipped default", () => {
  const applied = applySettings({ "wind.segmentS": "", "wind.forecastS": "   " });
  assert.equal(applied["wind.segmentS"], SETTINGS_DEFAULTS["wind.segmentS"]);
  assert.equal(applied["wind.forecastS"], SETTINGS_DEFAULTS["wind.forecastS"]);
});

test("S33: a numeric string is accepted, because that is what an input hands back", () => {
  const applied = applySettings({ "repair.shareOfPrice": "0.75", "wind.driftFactor": "0.5" });
  assert.equal(applied["repair.shareOfPrice"], 0.75);
  assert.equal(applied["wind.driftFactor"], 0.5);
  assert.equal(REPAIR.shareOfPrice, 0.75);
});

/* ---------------------------------------------------------------- never breaks */

test("S33: a corrupted settings blob leaves the game on its defaults", () => {
  for (const broken of [undefined, null, "not an object", 42, []]) {
    const settings = normaliseSettings(broken);
    for (const field of SETTINGS_FIELDS) {
      assert.equal(settings[fieldId(field)], SETTINGS_DEFAULTS[fieldId(field)], fieldId(field));
    }
  }
});

test("S33: a partial settings blob only moves the fields it names", () => {
  const settings = normaliseSettings({ "repair.shareOfPrice": 0.5 });
  assert.equal(settings["repair.shareOfPrice"], 0.5);
  assert.equal(settings["wind.maxSpeedBonus"], SETTINGS_DEFAULTS["wind.maxSpeedBonus"]);
});

test("S33: unknown keys are dropped instead of written anywhere", () => {
  const settings = normaliseSettings({ "nope.nothing": 5, "wind.maxSpeedBonus": 0.3 });
  assert.equal(settings["nope.nothing"], undefined);
  assert.equal(Object.keys(settings).length, SETTINGS_FIELDS.length);
  assert.equal(settings["wind.maxSpeedBonus"], 0.3);
});

test("S33: a wind minimum above the maximum is refused", () => {
  const settings = normaliseSettings({ "wind.minStrengthKn": 30, "wind.maxStrengthKn": 10 });
  assert.ok(
    settings["wind.minStrengthKn"] < settings["wind.maxStrengthKn"],
    "the wind range inverted",
  );
  assert.equal(settings["wind.minStrengthKn"], SETTINGS_DEFAULTS["wind.minStrengthKn"]);
});

test("S33: applying settings always leaves a playable world", () => {
  // The nastiest legal combination: everything at its most extreme.
  const extremes = {};
  for (const field of SETTINGS_FIELDS) extremes[fieldId(field)] = field.max;
  applySettings(extremes);
  assert.ok(WORLD.radiusM > 0 && Number.isFinite(WORLD.radiusM));
  assert.ok(WIND.segmentS > 0);
  assert.ok(WIND.maxStrengthKn > WIND.minStrengthKn);
  assert.ok(COMBAT.timeScale >= 1, "a reload clock of zero would never finish");
  assert.ok(REPAIR.shareOfPrice >= 0);
  for (const field of SETTINGS_FIELDS) {
    const value = SETTINGS_FIELDS.find((f) => fieldId(f) === fieldId(field));
    assert.ok(Number.isFinite(value.min));
  }
});

/* ---------------------------------------------------------------- reset */

test("S33: reset restores the shipped values, whatever was applied before", () => {
  applySettings({ "wind.maxSpeedBonus": 0.1, "repair.shareOfPrice": 0.9, "world.arcadeScale": 3 });
  const restored = resetSettings();
  for (const field of SETTINGS_FIELDS) {
    assert.equal(restored[fieldId(field)], SETTINGS_DEFAULTS[fieldId(field)], fieldId(field));
  }
  assert.equal(WIND.maxSpeedBonus, SETTINGS_DEFAULTS["wind.maxSpeedBonus"]);
  assert.equal(REPAIR.shareOfPrice, SETTINGS_DEFAULTS["repair.shareOfPrice"]);
});

/* ---------------------------------------------------------------- display units */

test("S33: a fraction is shown as a percentage and comes back as a fraction", () => {
  withDefaults(() => {
    const bonus = SETTINGS_FIELDS.find((f) => fieldId(f) === "wind.maxSpeedBonus");
    assert.equal(toDisplay(bonus, 0.6), 60);
    assert.equal(fromDisplay(bonus, 60), 0.6);
    assert.equal(fromDisplay(bonus, "45"), 0.45);
  });
});

test("S33: a distance is shown in kilometres and comes back in metres", () => {
  withDefaults(() => {
    const radius = SETTINGS_FIELDS.find((f) => fieldId(f) === "world.radiusM");
    assert.equal(toDisplay(radius, 5200), 5.2);
    assert.equal(fromDisplay(radius, 5.2), 5200);
  });
});

test("S33: a round trip through the display unit does not drift", () => {
  withDefaults(() => {
    for (const field of SETTINGS_FIELDS) {
      const shipped = SETTINGS_DEFAULTS[fieldId(field)];
      const back = fromDisplay(field, toDisplay(field, shipped));
      assert.ok(
        Math.abs(back - shipped) < 1e-9,
        `${fieldId(field)} drifted: ${shipped} -> ${toDisplay(field, shipped)} -> ${back}`,
      );
    }
  });
});

/* ---------------------------------------------------------------- S79: the whole tuning */

test("S79: every design constant block is on the settings screen", () => {
  // The point of S79 is that no design number stays hardcoded. A block that ships a
  // numeric field the screen cannot reach is a design decision the player cannot touch,
  // so the check walks the live objects, not a hand-written list.
  for (const [blockName, block] of Object.entries(DESIGN_BLOCKS)) {
    for (const [key, value] of Object.entries(block)) {
      if (typeof value !== "number") continue;
      const exposed = SETTINGS_FIELDS.some((field) => {
        const target = SETTINGS_BLOCKS[field.target ?? field.group];
        return target === block && (field.targetKey ?? field.key) === key;
      });
      assert.ok(
        exposed,
        `${blockName}.${key} = ${value} is not on the settings screen`,
      );
    }
  }
});

test("S79: a new block's field is applied to the live object it names", () => {
  withDefaults(() => {
    // One field per block that S79 adds, so the mapping is proven and not just listed.
    const cases = [
      ["turning", "referenceKg", TURNING, 250_000, 500_000],
      ["escort", "stationM", ESCORT, 120, 240],
      ["trail", "drainS", TRAIL, 1.2, 2.4],
      ["bars", "minShare", BAR_SCALE, 0, 0.5],
    ];
    for (const [group, key, live, shipped, moved] of cases) {
      assert.equal(live[key], shipped, `${group}.${key} should ship at ${shipped}`);
      applySettings({ [`${group}.${key}`]: moved });
      assert.equal(live[key], moved, `${group}.${key} did not reach the live block`);
    }
  });
});

test("S79: a new block's field is clamped to its own range", () => {
  withDefaults(() => {
    const applied = applySettings({
      "turning.exponent": -5,
      "escort.catchUpSpeed": 99,
      "trail.minPx": 0,
      "bars.minShare": 4,
    });
    const field = (id) => SETTINGS_FIELDS.find((f) => fieldId(f) === id);
    for (const id of ["turning.exponent", "escort.catchUpSpeed", "trail.minPx", "bars.minShare"]) {
      const spec = field(id);
      assert.ok(
        applied[id] >= spec.min && applied[id] <= spec.max,
        `${id} escaped its range: ${applied[id]} not in [${spec.min}, ${spec.max}]`,
      );
    }
    assert.equal(TURNING.exponent, field("turning.exponent").min);
    assert.equal(ESCORT.catchUpSpeed, field("escort.catchUpSpeed").max);
  });
});

/* S117: the wreck switch is a checkbox on the screen and a number in the model. */
test("S117: the wreck switch round-trips 1 and 0 like every other setting", async () => {
  const { applySettings, currentSettings, normaliseSettings, resetSettings } = await import("../src/model/settings.js");
  const { SINKING } = await import("../src/model/sinking.js");
  resetSettings();
  try {
    assert.equal(normaliseSettings({ "sinking.keepWreck": 1 })["sinking.keepWreck"], 1);
    applySettings({ "sinking.keepWreck": 1 });
    assert.equal(SINKING.keepWreck, 1);
    assert.equal(currentSettings()["sinking.keepWreck"], 1);
    applySettings({ "sinking.keepWreck": 0 });
    assert.equal(SINKING.keepWreck, 0);
    // Junk still falls back to the shipped default, which is off.
    assert.equal(normaliseSettings({ "sinking.keepWreck": "si" })["sinking.keepWreck"], 0);
  } finally {
    resetSettings();
  }
  // The screen draws a checkbox only for a field that says so, never by guessing.
  const { SETTINGS_FIELDS, fieldId } = await import("../src/model/settings.js");
  const switches = SETTINGS_FIELDS.filter((field) => field.control === "switch").map(fieldId);
  assert.deepEqual(switches, ["sinking.keepWreck", "refit.autoSave", "voyage.showTravelButton"]);
});
