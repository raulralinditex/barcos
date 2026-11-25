/**
 * Whether an enemy fires at the yard (the player's decision, verbatim): "el enemigo dispara
 * al astillero o no, si dispara, lo hace por area exactamente como si fuera un barco nuestro".
 *
 * One switch decides it, and it ships OFF ("valor por defecto apagado"): until the player
 * turns it on, no enemy ever aims at the yard, exactly as the game plays today. Turned on,
 * the yard is a target of the same nearest-target selection as one of our hulls, and her
 * damage still goes through her own rule (`damageFort`).
 *
 * What is pinned here is the switch itself and the fact that the sea reads it instead of a
 * hardcoded branch. The behaviour is proven in `scripts/smoke-enemy-yard-fire.mjs`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SETTINGS_BLOCKS,
  SETTINGS_DEFAULTS,
  SETTINGS_FIELDS,
  YARD_FIRE,
  applySettings,
  currentSettings,
  enemyFiresAtYard,
  fieldId,
  resetSettings,
} from "../src/model/settings.js";
import { es } from "../src/i18n/es.js";
import { en } from "../src/i18n/en.js";

const ID = "combat.enemyFiresAtYard";
const field = () => SETTINGS_FIELDS.find((entry) => fieldId(entry) === ID);

/** Every test that writes settings restores the shipped values when it is done. */
const withDefaults = (body) => {
  try {
    body();
  } finally {
    resetSettings();
  }
};

/* ------------------------------------------------- the switch, on the settings screen */

test("yard fire: the switch lives in the combat block as a check", () => {
  const entry = field();
  assert.ok(entry, `${ID} is not declared in SETTINGS_FIELDS`);
  assert.equal(entry.group, "combat", `${ID} belongs to the combat block`);
  assert.equal(entry.control, "switch", `${ID} is a yes/no the player sets, so it is a check`);
  assert.equal(entry.min, 0, `${ID} must accept off`);
  assert.equal(entry.max, 1, `${ID} must accept on`);
  assert.equal(entry.step, 1, `${ID} is yes/no, not a fraction`);
  assert.equal(entry.label, "settings.combat.enemyFiresAtYard", `${ID} needs its own label key`);
  assert.ok(SETTINGS_BLOCKS[entry.target ?? entry.group], `${ID} must resolve to a live block`);
});

test("yard fire: the switch ships OFF", () => {
  // "valor por defecto apagado": the game plays as it did until the player says otherwise.
  assert.equal(SETTINGS_DEFAULTS[ID], 0, `${ID} must ship off`);
  assert.equal(currentSettings()[ID], 0, `${ID} must be off in the settings in force`);
  assert.equal(YARD_FIRE.enabled, 0, "the live block must ship off");
  assert.equal(enemyFiresAtYard(), false, "no enemy may fire at the yard until the player says so");
});

/* ------------------------------------------------- the choice the sea reads */

test("yard fire: turning the switch on lets the sea aim at the yard", () => {
  withDefaults(() => {
    applySettings({ [ID]: 1 });
    assert.equal(YARD_FIRE.enabled, 1, "on must reach the live block the sea reads");
    assert.equal(enemyFiresAtYard(), true, "on must let an enemy treat the yard as a target");
    applySettings({ [ID]: 0 });
    assert.equal(YARD_FIRE.enabled, 0, "off must reach the live block again");
    assert.equal(enemyFiresAtYard(), false, "off must take the yard out of the enemies' aim");
  });
});

test("yard fire: a broken value falls back to off, never to a random side", () => {
  withDefaults(() => {
    for (const broken of [undefined, null, NaN, "si", {}, "  "]) {
      applySettings({ [ID]: broken });
      assert.equal(YARD_FIRE.enabled, 0, `«${String(broken)}» must fall back to off`);
      assert.equal(enemyFiresAtYard(), false, `«${String(broken)}» must not arm the yard as a target`);
    }
  });
});

test("yard fire: the sea reads the switch instead of a hardcoded branch", () => {
  // The decision has to reach the screen that fights: `sea.js` asks the model, it does not
  // decide on its own. Without this the switch would be a label that changes nothing.
  const source = readFileSync(new URL("../src/ui/sea.js", import.meta.url), "utf8");
  assert.match(
    source,
    /import\s*\{[^}]*enemyFiresAtYard[^}]*\}\s*from\s*"\.\.\/model\/settings\.js"/,
    "sea.js must import enemyFiresAtYard from the settings model",
  );
  assert.match(source, /enemyFiresAtYard\(\)/, "sea.js must call enemyFiresAtYard() to pick the yard as a target");
});

/* ------------------------------------------------- the label and its hint, both languages */

test("yard fire: the switch and its hint are named in Spanish and in English", () => {
  for (const [language, catalogue] of [["es", es], ["en", en]]) {
    for (const key of ["settings.combat.enemyFiresAtYard", "settings.combat.enemyFiresAtYardHint"]) {
      const value = catalogue[key];
      assert.equal(typeof value, "string", `${language} is missing ${key}`);
      assert.ok(value.trim().length > 0, `${language}/${key} is empty`);
    }
  }
  assert.notEqual(
    es["settings.combat.enemyFiresAtYardHint"],
    en["settings.combat.enemyFiresAtYardHint"],
    "the hint must actually be translated",
  );
});
